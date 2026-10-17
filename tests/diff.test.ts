import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateDiff, verifyRoundTrip, type FileChange } from "@/lib/diff";
import { validateDiff } from "@/lib/diff-validate";

/** Applies a diff with real `git apply` (what the SWE-bench harness tries first). */
function gitApply(files: Record<string, string>, diff: string): Record<string, string | null> {
  const dir = mkdtempSync(path.join(tmpdir(), "abt-diff-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    writeFileSync(path.join(dir, p), content);
  }
  writeFileSync(path.join(dir, "patch.diff"), diff);
  execFileSync("git", ["apply", "--check", "patch.diff"], { cwd: dir });
  execFileSync("git", ["apply", "patch.diff"], { cwd: dir });
  const out: Record<string, string | null> = {};
  for (const p of Object.keys(files)) {
    try {
      out[p] = readFileSync(path.join(dir, p), "utf8");
    } catch {
      out[p] = null;
    }
  }
  return out;
}

const big = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n") + "\n";

describe("generateDiff", () => {
  const cases: [string, FileChange[]][] = [
    ["single-line edit", [{ path: "a.py", original: "x = 1\ny = 2\n", current: "x = 1\ny = 3\n" }]],
    [
      "multiple hunks",
      [{ path: "pkg/m.py", original: big, current: big.replace("line 3\n", "line three\n").replace("line 50\n", "") }],
    ],
    ["no trailing newline (old)", [{ path: "n.txt", original: "a\nb", current: "a\nc\n" }]],
    ["no trailing newline (both)", [{ path: "n.txt", original: "a\nb", current: "a\nc" }]],
    ["CRLF file", [{ path: "w.txt", original: "a\r\nb\r\n", current: "a\r\nB\r\n" }]],
    ["tabs and unicode", [{ path: "u.py", original: "\tx = 'é'\n", current: "\tx = 'ü' # 🚀\n" }]],
    ["new file", [{ path: "new/dir/file.py", original: null, current: "print('hi')\n" }]],
    ["deleted file", [{ path: "old.py", original: "gone\n", current: null }]],
    [
      "several files",
      [
        { path: "b.py", original: "1\n", current: "2\n" },
        { path: "a.py", original: "x\n", current: "y\n" },
        { path: "same.py", original: "same\n", current: "same\n" },
      ],
    ],
  ];

  for (const [name, changes] of cases) {
    it(`${name}: applies with git and round-trips`, () => {
      const { diff, stats } = generateDiff(changes);
      expect(diff.startsWith("diff --git a/")).toBe(true);
      expect(verifyRoundTrip(diff, changes)).toEqual({ ok: true });
      expect(validateDiff(diff, { maxBytes: 1e6, maxFiles: 30 }).ok).toBe(true);

      const before: Record<string, string> = {};
      for (const c of changes) if (c.original !== null) before[c.path] = c.original;
      const after = gitApply(before, diff);
      for (const c of changes) {
        if (c.original === null) continue;
        expect(after[c.path]).toBe(c.current);
      }
      expect(stats.files).toBe(changes.filter((c) => c.original !== c.current).length);
    });
  }

  it("creates new files that git can add", () => {
    const changes = [{ path: "new/dir/file.py", original: null, current: "print('hi')\n" }];
    const { diff } = generateDiff(changes);
    expect(diff).toContain("new file mode 100644");
    expect(diff).toContain("--- /dev/null");
    expect(diff).toContain("+++ b/new/dir/file.py");
  });

  it("returns an empty diff when nothing changed", () => {
    expect(generateDiff([{ path: "a", original: "x", current: "x" }]).diff).toBe("");
  });

  it("detects a tampered diff", () => {
    const changes = [{ path: "a.py", original: "x = 1\n", current: "x = 2\n" }];
    const { diff } = generateDiff(changes);
    expect(verifyRoundTrip(diff.replace("+x = 2", "+x = 3"), changes).ok).toBe(false);
  });
});

describe("validateDiff", () => {
  const limits = { maxBytes: 10_000, maxFiles: 2 };
  const ok = generateDiff([{ path: "a.py", original: "1\n", current: "2\n" }]).diff;

  it("accepts a normal diff", () => {
    expect(validateDiff(ok, limits)).toMatchObject({ ok: true, files: ["a.py"], added: 1, removed: 1 });
  });

  it.each([
    ["empty", ""],
    ["no git header", "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n"],
    ["path traversal", "diff --git a/../etc/passwd b/../etc/passwd\n--- a/../etc/passwd\n+++ b/../etc/passwd\n@@ -1 +1 @@\n-a\n+b\n"],
    ["absolute path", "diff --git a//etc/x b//etc/x\n--- a//etc/x\n+++ b//etc/x\n@@ -1 +1 @@\n-a\n+b\n"],
    [".git dir", "diff --git a/.git/config b/.git/config\n--- a/.git/config\n+++ b/.git/config\n@@ -1 +1 @@\n-a\n+b\n"],
    ["rename", "diff --git a/x b/y\n--- a/x\n+++ b/y\n@@ -1 +1 @@\n-a\n+b\n"],
  ])("rejects %s", (_name, diff) => {
    expect(validateDiff(diff, limits).ok).toBe(false);
  });

  it("rejects too many files and oversized diffs", () => {
    const three = generateDiff([
      { path: "a", original: "1\n", current: "2\n" },
      { path: "b", original: "1\n", current: "2\n" },
      { path: "c", original: "1\n", current: "2\n" },
    ]).diff;
    expect(validateDiff(three, limits).ok).toBe(false);
    expect(validateDiff(ok + "x".repeat(20_000), limits).ok).toBe(false);
  });
});

describe("fixture tasks", () => {
  it("every reference patch applies to its fixture bundle", async () => {
    const tasks = (await import("../e2e/fixtures/tasks.json")).default.tasks;
    for (const t of tasks) {
      const bundle = JSON.parse(readFileSync(`e2e/fixtures/bundles/${t.instance_id}.json`, "utf8"));
      expect(() => gitApply(bundle.files, t.patch)).not.toThrow();
    }
  });
});
