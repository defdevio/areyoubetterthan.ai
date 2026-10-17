import { applyPatch, formatPatch, parsePatch, structuredPatch, type StructuredPatch } from "diff";

export interface FileChange {
  path: string;
  /** null for a file created in the workspace */
  original: string | null;
  /** null for a file deleted in the workspace */
  current: string | null;
}

export interface DiffStats {
  files: number;
  added: number;
  removed: number;
}

export interface GeneratedDiff {
  diff: string;
  stats: DiffStats;
  /** Per-file patch summaries for display. */
  files: { path: string; added: number; removed: number; kind: "modified" | "created" | "deleted" }[];
}

const CONTEXT = 3;

function countLines(patch: StructuredPatch) {
  let added = 0;
  let removed = 0;
  for (const h of patch.hunks) {
    for (const l of h.lines) {
      if (l.startsWith("+")) added++;
      else if (l.startsWith("-")) removed++;
    }
  }
  return { added, removed };
}

/**
 * Builds a `git apply`-compatible unified diff (with `diff --git` headers) for every
 * changed file. Unchanged files are skipped. Paths are repo-relative.
 */
export function generateDiff(changes: FileChange[]): GeneratedDiff {
  const patches: StructuredPatch[] = [];
  const files: GeneratedDiff["files"] = [];
  const sorted = [...changes].sort((a, b) => a.path.localeCompare(b.path));
  for (const c of sorted) {
    if (c.original === c.current) continue;
    let patch: StructuredPatch;
    let kind: "modified" | "created" | "deleted";
    if (c.original === null && c.current !== null) {
      patch = structuredPatch("/dev/null", `b/${c.path}`, "", c.current, undefined, undefined, {
        context: CONTEXT,
      });
      patch.isCreate = true;
      patch.newMode = "100644";
      kind = "created";
    } else if (c.original !== null && c.current === null) {
      patch = structuredPatch(`a/${c.path}`, "/dev/null", c.original, "", undefined, undefined, {
        context: CONTEXT,
      });
      patch.isDelete = true;
      patch.oldMode = "100644";
      kind = "deleted";
    } else {
      patch = structuredPatch(`a/${c.path}`, `b/${c.path}`, c.original!, c.current!, undefined, undefined, {
        context: CONTEXT,
      });
      if (patch.hunks.length === 0) continue;
      kind = "modified";
    }
    patch.isGit = true;
    patches.push(patch);
    files.push({ path: c.path, kind, ...countLines(patch) });
  }
  if (patches.length === 0) {
    return { diff: "", stats: { files: 0, added: 0, removed: 0 }, files: [] };
  }
  let diff = formatPatch(patches);
  if (!diff.endsWith("\n")) diff += "\n";
  return {
    diff,
    stats: {
      files: files.length,
      added: files.reduce((a, f) => a + f.added, 0),
      removed: files.reduce((a, f) => a + f.removed, 0),
    },
    files,
  };
}

function stripPrefix(name: string | undefined): string | null {
  if (!name || name === "/dev/null") return null;
  return name.replace(/^[ab]\//, "");
}

/**
 * Re-parses a generated diff and applies it to the original files, checking the
 * result is byte-identical to what the user sees in the editor. Catches any
 * serialization bug before a patch is sent off to be scored.
 */
export function verifyRoundTrip(diff: string, changes: FileChange[]): { ok: true } | { ok: false; error: string } {
  if (!diff) return { ok: true };
  const byPath = new Map(changes.map((c) => [c.path, c]));
  let parsed: StructuredPatch[];
  try {
    parsed = parsePatch(diff);
  } catch (err) {
    return { ok: false, error: `unparseable diff: ${(err as Error).message}` };
  }
  for (const p of parsed) {
    const path = stripPrefix(p.newFileName) ?? stripPrefix(p.oldFileName);
    if (!path) return { ok: false, error: "patch without file name" };
    const change = byPath.get(path);
    if (!change) return { ok: false, error: `unexpected file in diff: ${path}` };
    const result = applyPatch(change.original ?? "", p);
    if (result === false) return { ok: false, error: `diff does not apply to ${path}` };
    const expected = change.current ?? "";
    if (result !== expected) return { ok: false, error: `round trip mismatch for ${path}` };
  }
  return { ok: true };
}
