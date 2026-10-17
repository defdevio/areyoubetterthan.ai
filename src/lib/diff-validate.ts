import { parsePatch } from "diff";

export const INSTANCE_ID_RE = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9_.-]*__[A-Za-z0-9][A-Za-z0-9_.-]*-\d+$/;

export type DiffValidation =
  | { ok: true; files: string[]; added: number; removed: number }
  | { ok: false; error: string };

export function isSafeRepoPath(p: string): boolean {
  if (!p || p.length > 400) return false;
  if (p.startsWith("/") || p.includes("\\") || p.includes("\0")) return false;
  const parts = p.split("/");
  if (parts.some((s) => s === "" || s === "." || s === "..")) return false;
  if (parts[0] === ".git" || parts.includes(".git")) return false;
  return true;
}

/**
 * Server-side checks on a submitted diff. The diff is never applied on our side; it is
 * handed to the SWE-bench harness inside its container. These checks keep obviously
 * malformed or abusive payloads out of the scoring queue.
 */
export function validateDiff(
  diff: string,
  limits: { maxBytes: number; maxFiles: number },
): DiffValidation {
  if (typeof diff !== "string" || diff.length === 0) return { ok: false, error: "empty diff" };
  const bytes = new TextEncoder().encode(diff).length;
  if (bytes > limits.maxBytes) return { ok: false, error: `diff is too large (${bytes} bytes)` };
  if (!diff.startsWith("diff --git ")) return { ok: false, error: "diff must start with a git header" };

  let patches;
  try {
    patches = parsePatch(diff);
  } catch (err) {
    return { ok: false, error: `could not parse diff: ${(err as Error).message}` };
  }
  if (patches.length === 0) return { ok: false, error: "diff contains no files" };
  if (patches.length > limits.maxFiles) return { ok: false, error: `diff touches too many files (${patches.length})` };

  const files: string[] = [];
  let added = 0;
  let removed = 0;
  for (const p of patches) {
    const oldName = p.oldFileName ?? "";
    const newName = p.newFileName ?? "";
    for (const name of [oldName, newName]) {
      if (name === "/dev/null") continue;
      if (!/^[ab]\//.test(name)) return { ok: false, error: `bad file name ${name}` };
      if (!isSafeRepoPath(name.slice(2))) return { ok: false, error: `unsafe path ${name}` };
    }
    if (oldName === "/dev/null" && newName === "/dev/null") return { ok: false, error: "bad file header" };
    const oldPath = oldName === "/dev/null" ? null : oldName.slice(2);
    const newPath = newName === "/dev/null" ? null : newName.slice(2);
    if (oldPath && newPath && oldPath !== newPath) return { ok: false, error: "renames are not supported" };
    if (p.hunks.length === 0) return { ok: false, error: `no changes for ${newPath ?? oldPath}` };
    for (const h of p.hunks) {
      for (const l of h.lines) {
        if (l.startsWith("+")) added++;
        else if (l.startsWith("-")) removed++;
      }
    }
    files.push((newPath ?? oldPath)!);
  }
  if (new Set(files).size !== files.length) return { ok: false, error: "duplicate file in diff" };
  return { ok: true, files, added, removed };
}
