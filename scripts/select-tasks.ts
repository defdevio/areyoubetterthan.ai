/**
 * Picks the final task set from the candidate pool and writes data/tasks.json.
 *
 * Only tasks that passed validation on a GitHub-hosted runner are eligible (gold patch
 * resolves, a no-op patch does not). Selection is stratified by repo with
 * largest-remainder apportionment so the set mirrors the pool's repo mix, and is
 * deterministic (sha256 order within each repo) so re-running is stable.
 *
 *   pnpm data:select                      # requires data/validation.json
 *   pnpm data:select --allow-unvalidated  # provisional set before validation finishes
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  Candidate,
  CandidatesFile,
  Task,
  TasksFile,
  ValidationFile,
  ValidationRecord,
} from "../src/lib/data-types";
import { DATA_DIR, arg, flag, readJson, writeJson } from "./lib/util";

export const TARGET = 100;
export const HARNESS_VERSION = "5.0.2";
const SALT = "areyoubetterthan.ai/v1";

/** Hand-excluded tasks, with the reason (shown on the methodology page via tasks.json). */
export const EXCLUDED: Record<string, string> = {
  "psf__requests-2317":
    "Its tests make live network calls; the evaluation hung on GitHub-hosted runners instead of finishing.",
};

export function isValidated(r: ValidationRecord | undefined): boolean {
  return Boolean(r && r.gold.outcome === "resolved" && r.noop.outcome === "unresolved");
}

export function apportion(counts: Record<string, number>, target: number): Record<string, number> {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total <= target) return { ...counts };
  const alloc: Record<string, number> = {};
  const remainders: [string, number][] = [];
  let assigned = 0;
  for (const [repo, n] of Object.entries(counts)) {
    const exact = (n / total) * target;
    // Every repo in the pool gets at least one task so small projects are represented.
    alloc[repo] = Math.min(n, Math.max(1, Math.floor(exact)));
    assigned += alloc[repo];
    remainders.push([repo, exact - Math.floor(exact)]);
  }
  remainders.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  while (assigned < target) {
    let progressed = false;
    for (const [repo] of remainders) {
      if (assigned >= target) break;
      if (alloc[repo] < counts[repo]) {
        alloc[repo]++;
        assigned++;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  while (assigned > target) {
    const [repo] = Object.entries(alloc).sort((a, b) => b[1] - a[1])[0];
    alloc[repo]--;
    assigned--;
  }
  return alloc;
}

function rank(id: string) {
  return createHash("sha256").update(`${SALT}:${id}`).digest("hex");
}

export function selectTasks(eligible: Candidate[], target = TARGET): Candidate[] {
  const byRepo = new Map<string, Candidate[]>();
  for (const c of eligible) byRepo.set(c.repo, [...(byRepo.get(c.repo) ?? []), c]);
  const alloc = apportion(
    Object.fromEntries([...byRepo].map(([repo, list]) => [repo, list.length])),
    target,
  );
  const picked: Candidate[] = [];
  for (const [repo, list] of byRepo) {
    const sorted = [...list].sort((a, b) => rank(a.instance_id).localeCompare(rank(b.instance_id)));
    picked.push(...sorted.slice(0, alloc[repo] ?? 0));
  }
  return picked.sort((a, b) => a.instance_id.localeCompare(b.instance_id));
}

async function main() {
  const allowUnvalidated = flag("allow-unvalidated");
  const target = Number(arg("target") ?? TARGET);
  const candidates = await readJson<CandidatesFile>(path.join(DATA_DIR, "candidates.json"));
  const validationPath = path.join(DATA_DIR, "validation.json");
  const validation = existsSync(validationPath)
    ? await readJson<ValidationFile>(validationPath)
    : null;
  if (!validation && !allowUnvalidated) {
    throw new Error("data/validation.json missing. Run validation first or pass --allow-unvalidated.");
  }

  const records = validation?.records ?? {};
  const validated = candidates.candidates.filter((c) => isValidated(records[c.instance_id]));
  const rejected = candidates.candidates.filter(
    (c) => records[c.instance_id] && !isValidated(records[c.instance_id]),
  );
  const eligible = (
    allowUnvalidated ? candidates.candidates.filter((c) => !rejected.includes(c)) : validated
  ).filter((c) => !(c.instance_id in EXCLUDED));

  const picked = selectTasks(eligible, target);
  const tasks: Task[] = picked.map((c, index) => ({
    ...c,
    index,
    validated: isValidated(records[c.instance_id]),
  }));
  const perRepo: Record<string, number> = {};
  for (const t of tasks) perRepo[t.repo] = (perRepo[t.repo] ?? 0) + 1;

  const out: TasksFile = {
    source: candidates.source,
    harness_version: validation?.harness_version ?? HARNESS_VERSION,
    selected_at: new Date().toISOString(),
    selection: {
      method: allowUnvalidated
        ? "provisional: repo-stratified (largest remainder) over unrejected pool"
        : "repo-stratified (largest remainder) over validated pool",
      pool_size: candidates.count,
      validated_pool_size: validated.length,
      per_repo: perRepo,
      excluded: EXCLUDED,
      rejected: Object.fromEntries(
        rejected.map((c) => [c.instance_id, `gold=${records[c.instance_id].gold.outcome}, no-op=${records[c.instance_id].noop.outcome}`]),
      ),
    },
    tasks,
  };
  await writeJson(path.join(DATA_DIR, "tasks.json"), out);
  console.log(
    `selected ${tasks.length} tasks (${tasks.filter((t) => t.validated).length} validated, ` +
      `${rejected.length} rejected by validation)`,
  );
  console.log(perRepo);
  if (rejected.length) {
    for (const c of rejected) {
      const r = records[c.instance_id];
      console.log(`  rejected ${c.instance_id}: gold=${r.gold.outcome} noop=${r.noop.outcome}`);
    }
  }
}

if (process.argv[1]?.endsWith("select-tasks.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
