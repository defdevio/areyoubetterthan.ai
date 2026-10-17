/**
 * Pulls SWE-bench Verified from the Hugging Face datasets-server and keeps the
 * "<15 min fix" pool as data/candidates.json.
 *
 *   pnpm data:tasks
 */
import path from "node:path";
import {
  DATASET_NAME,
  DIFFICULTY_POOL,
  type Candidate,
  type CandidatesFile,
} from "../src/lib/data-types";
import { DATA_DIR, fetchJson, writeJson } from "./lib/util";

interface Row {
  instance_id: string;
  repo: string;
  base_commit: string;
  version: string;
  created_at: string;
  problem_statement: string;
  hints_text: string;
  patch: string;
  FAIL_TO_PASS: string | string[];
  PASS_TO_PASS: string | string[];
  difficulty: string;
  image: string;
}

const PAGE = 100;

// The datasets-server returns these as arrays; older dumps stored JSON strings.
function asList(v: string | string[]): string[] {
  return Array.isArray(v) ? v : (JSON.parse(v) as string[]);
}

export function titleFromProblem(problem: string): string {
  const first = problem
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("<!--"));
  const cleaned = (first ?? "Untitled issue").replace(/^#+\s*/, "").replace(/\s+/g, " ");
  return cleaned.length > 140 ? cleaned.slice(0, 137) + "…" : cleaned;
}

async function main() {
  const meta = await fetchJson<{ sha: string }>(
    `https://huggingface.co/api/datasets/${DATASET_NAME}`,
  );
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(DATASET_NAME)}` +
      `&config=default&split=test&offset=${offset}&length=${PAGE}`;
    const page = await fetchJson<{ rows: { row: Row }[]; num_rows_total: number }>(url);
    rows.push(...page.rows.map((r) => r.row));
    process.stdout.write(`\rfetched ${rows.length}/${page.num_rows_total}`);
    if (rows.length >= page.num_rows_total || page.rows.length === 0) break;
  }
  process.stdout.write("\n");

  const candidates: Candidate[] = rows
    .filter((r) => r.difficulty === DIFFICULTY_POOL)
    .map((r) => ({
      instance_id: r.instance_id,
      repo: r.repo,
      base_commit: r.base_commit,
      version: r.version,
      created_at: r.created_at,
      title: titleFromProblem(r.problem_statement),
      problem_statement: r.problem_statement,
      hints_text: r.hints_text,
      patch: r.patch,
      fail_to_pass: asList(r.FAIL_TO_PASS),
      pass_to_pass_count: asList(r.PASS_TO_PASS).length,
      image: r.image,
    }))
    .sort((a, b) => a.instance_id.localeCompare(b.instance_id));

  const out: CandidatesFile = {
    source: { dataset: DATASET_NAME, revision: meta.sha, fetched_at: new Date().toISOString() },
    difficulty: DIFFICULTY_POOL,
    count: candidates.length,
    candidates,
  };
  await writeJson(path.join(DATA_DIR, "candidates.json"), out);

  const byRepo = new Map<string, number>();
  for (const c of candidates) byRepo.set(c.repo, (byRepo.get(c.repo) ?? 0) + 1);
  console.log(`${rows.length} Verified tasks, ${candidates.length} in "${DIFFICULTY_POOL}" pool`);
  console.log(Object.fromEntries([...byRepo].sort((a, b) => b[1] - a[1])));
}

if (process.argv[1]?.endsWith("ingest-tasks.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
