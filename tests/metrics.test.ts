import { describe, expect, it } from "vitest";
import { generateDiff } from "@/lib/diff";
import { categorize, changedLines, computeAttemptMetrics, filesInDiff, localization, summarize, type AttemptMetrics } from "@/lib/metrics";
import { decodeAstro, displayName, parseVals } from "../scripts/ingest-vals";

const gold = generateDiff([
  { path: "pkg/a.py", original: "x = 1\ny = 2\n", current: "x = 1\ny = 3\n" },
  { path: "pkg/b.py", original: "z = 1\n", current: "z = 2\n" },
]).diff;

const tests = (f2pPass: number, f2pFail: number, p2pFail = 0) => ({
  fail_to_pass: { passed: [], failed: [], passed_count: f2pPass, failed_count: f2pFail },
  pass_to_pass: { failed: [], passed_count: 10, failed_count: p2pFail },
});

describe("diff helpers", () => {
  it("lists files and counts changed lines", () => {
    expect(filesInDiff(gold)).toEqual(["pkg/a.py", "pkg/b.py"]);
    expect(changedLines(gold)).toBe(4);
    const created = generateDiff([{ path: "new.py", original: null, current: "a\nb\n" }]).diff;
    expect(filesInDiff(created)).toEqual(["new.py"]);
    expect(changedLines(created)).toBe(2);
  });

  it("scores file-level localization against the reference fix", () => {
    const mine = generateDiff([
      { path: "pkg/a.py", original: "x = 1\n", current: "x = 9\n" },
      { path: "pkg/c.py", original: "q\n", current: "r\n" },
    ]).diff;
    const loc = localization(mine, gold);
    expect(loc.hit).toEqual(["pkg/a.py"]);
    expect(loc.precision).toBe(0.5);
    expect(loc.recall).toBe(0.5);
    expect(loc.f1).toBe(0.5);
  });
});

describe("categorize", () => {
  const base = { resolved: false, reason: "tests_failed", hasPatch: true };
  it.each([
    [{ ...base, resolved: true, tests: tests(2, 0) }, "resolved"],
    [{ ...base, tests: tests(2, 0, 3) }, "regression"],
    [{ ...base, tests: tests(1, 1) }, "partial_fix"],
    [{ ...base, tests: tests(0, 2) }, "wrong_fix"],
    [{ ...base, reason: "patch_apply_failed", tests: null }, "did_not_apply"],
    [{ ...base, reason: "no_patch", hasPatch: false, tests: null }, "no_patch"],
    [{ ...base, reason: "tests_timed_out", tests: null }, "other"],
  ] as const)("%o -> %s", (input, expected) => {
    expect(categorize(input as Parameters<typeof categorize>[0])).toBe(expected);
  });
});

describe("computeAttemptMetrics + summarize", () => {
  const task = { patch: gold, fail_to_pass: ["t1", "t2"] };
  const result = (f2pPass: number, f2pFail: number) => ({
    schema: 1, instance_id: "x", submission_id: null, outcome: "unresolved" as const, resolved: false,
    reason: "tests_failed", tests: tests(f2pPass, f2pFail), harness: { package: "swebench", version: "5", dataset: "d" }, duration_s: 1,
  });
  const solved = computeAttemptMetrics({ elapsedMs: 4 * 60_000, resolved: true, reason: null, diff: gold, result: { ...result(2, 0), outcome: "resolved", resolved: true }, task });
  const partial = computeAttemptMetrics({ elapsedMs: 15 * 60_000, resolved: false, reason: "tests_failed", diff: gold, result: result(1, 1), task });
  const none = computeAttemptMetrics({ elapsedMs: 15 * 60_000, resolved: false, reason: "timed_out_no_patch", diff: null, result: null, task });

  it("computes per-attempt metrics", () => {
    expect(solved).toMatchObject({ category: "resolved", f2p_passed: 2, f2p_total: 2, p2p_failed: 0, patch_lines: 4, gold_lines: 4 });
    expect(solved.localization?.f1).toBe(1);
    expect(none).toMatchObject({ category: "no_patch", f2p_passed: 0, f2p_total: 2, localization: null, patch_lines: null });
  });

  it("summarizes time, partial credit, localization and outcomes", () => {
    const s = summarize([solved, partial, none] as AttemptMetrics[]);
    expect(s.attempts).toBe(3);
    expect(s.median_time_ms).toBe(15 * 60_000);
    expect(s.median_time_resolved_ms).toBe(4 * 60_000);
    expect(s.bug_tests_passed).toBeCloseTo((1 + 0.5 + 0) / 3);
    expect(s.right_file_rate).toBe(1);
    expect(s.categories).toMatchObject({ resolved: 1, partial_fix: 1, no_patch: 1 });
    expect(s.solved_by_minute[2]).toBe(0);
    expect(s.solved_by_minute[3]).toBeCloseTo(1 / 3);
    expect(s.solved_by_minute[14]).toBeCloseTo(1 / 3);
    expect(summarize([]).median_time_ms).toBeNull();
  });
});

describe("vals.ai ingestion", () => {
  const enc = (v: unknown): unknown =>
    Array.isArray(v) ? [1, v.map(enc)] : v && typeof v === "object" ? [0, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]))] : [0, v];
  const pool = ["a__a-1", "a__a-2", "a__a-3"];
  const resolvedFor = (n: number) => Array.from({ length: n }, (_, i) => (i < 3 ? pool[i] : `z__z-${i}`));
  const models = Array.from({ length: 25 }, (_, i) => `prov/model-${i}`);
  const stats = (acc: number) => ({ accuracy: acc, latency: 120 + acc, cost_per_test: 0.5, stderr: 1, provider: "Prov" });
  const island = (props: Record<string, unknown>) =>
    `<astro-island uid="x" props="${JSON.stringify(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, enc(v)]))).replace(/"/g, "&quot;")}"></astro-island>`;
  const html = (overrides: Record<string, unknown> = {}) =>
    island({
      benchmarkView: {
        tasks: {
          overall: Object.fromEntries(models.map((m, i) => [m, stats(i === 0 ? 50 : 20)])),
          "<15 min fix": Object.fromEntries(models.map((m) => [m, stats(30)])),
        },
      },
    }) +
    island({ eval_results: Object.fromEntries(models.map((m, i) => [m, resolvedFor(i === 0 ? 250 : 100)])), ...overrides }) +
    '<script>{"dateModified":"2026-09-01"}</script>';

  it("decodes Astro props", () => {
    expect(decodeAstro([0, { a: [1, [[0, "x"], [0, 2]]], b: [0, null] }])).toEqual({ a: ["x", 2], b: null });
  });

  it("parses models, times, costs and resolved tasks", () => {
    const { entries, dateModified } = parseVals(html(), pool);
    expect(entries).toHaveLength(25);
    expect(dateModified).toBe("2026-09-01");
    expect(entries[0]).toMatchObject({ vals_id: "prov/model-0", band: { latency_s: 150, cost_usd: 0.5 }, resolved: [0, 1, 2] });
  });

  it("treats a zero average time as unknown", () => {
    const zero = html().replace(/&quot;latency&quot;:\[0,150\]/, "&quot;latency&quot;:[0,0]");
    const { entries } = parseVals(zero, pool);
    expect(entries.some((e) => e.band.latency_s === null)).toBe(true);
  });

  it("drops models whose resolved list disagrees with their accuracy", () => {
    const bad = html({ eval_results: Object.fromEntries(models.map((m) => [m, resolvedFor(10)])) });
    expect(() => parseVals(bad, pool)).toThrow(/usable models/);
  });

  it("fails loudly when the page format changes", () => {
    expect(() => parseVals("<html></html>", pool)).toThrow(/format changed/);
  });

  it("makes readable names", () => {
    expect(displayName("anthropic/claude-opus-5")).toBe("Claude Opus 5");
    expect(displayName("openai/gpt-5.6-sol")).toBe("GPT 5.6 Sol");
    expect(displayName("deepseek/deepseek-v4-pro-0813")).toBe("DeepSeek V4 Pro 0813");
    expect(displayName("kimi/kimi-k3")).toBe("Kimi K3");
  });
});
