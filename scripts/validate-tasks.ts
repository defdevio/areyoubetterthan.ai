/**
 * Runs task validation on GitHub-hosted runners via the submissions repo's
 * validate.yml workflow, and collects the results into data/validation.json.
 *
 *   pnpm data:validate dispatch [--ids a,b] [--batch 100] [--only-missing]
 *   pnpm data:validate collect  [--run <id>]
 *   pnpm data:validate status
 *
 * Requires the GitHub CLI (`gh`) authenticated with access to the submissions repo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  CandidatesFile,
  ValidationFile,
  ValidationRecord,
} from "../src/lib/data-types";
import { HARNESS_VERSION } from "./select-tasks";
import { DATA_DIR, arg, flag, readJson, writeJson } from "./lib/util";

const REPO = process.env.SUBMISSIONS_REPO ?? "defdevio/areyoutbetterthan.ai-submissions";
const WORKFLOW = "validate.yml";
const VALIDATION = path.join(DATA_DIR, "validation.json");

function gh(args: string[]): string {
  return execFileSync("gh", args, { maxBuffer: 64 * 1024 * 1024 }).toString();
}

async function loadValidation(): Promise<ValidationFile> {
  if (existsSync(VALIDATION)) return readJson<ValidationFile>(VALIDATION);
  return { harness_version: HARNESS_VERSION, updated_at: new Date().toISOString(), records: {} };
}

async function dispatch() {
  const candidates = (await readJson<CandidatesFile>(path.join(DATA_DIR, "candidates.json"))).candidates;
  let ids = arg("ids")?.split(",").filter(Boolean) ?? candidates.map((c) => c.instance_id);
  if (flag("only-missing")) {
    const existing = (await loadValidation()).records;
    ids = ids.filter((id) => !existing[id] || existing[id].gold.outcome === "infra_error" || existing[id].noop.outcome === "infra_error");
  }
  const batch = Number(arg("batch") ?? 100);
  for (let i = 0; i < ids.length; i += batch) {
    const chunk = ids.slice(i, i + batch);
    gh([
      "workflow", "run", WORKFLOW, "-R", REPO,
      "-f", `instance_ids=${JSON.stringify(chunk)}`,
      "-f", `harness_version=${HARNESS_VERSION}`,
    ]);
    console.log(`dispatched ${chunk.length} tasks (${i + chunk.length}/${ids.length})`);
  }
}

interface Run {
  databaseId: number;
  status: string;
  conclusion: string;
  createdAt: string;
}

function listRuns(): Run[] {
  return JSON.parse(
    gh(["run", "list", "-R", REPO, "--workflow", WORKFLOW, "--limit", "50",
      "--json", "databaseId,status,conclusion,createdAt"]),
  ) as Run[];
}

async function collect() {
  const only = arg("run");
  const runs = listRuns().filter((r) => (only ? String(r.databaseId) === only : true));
  const validation = await loadValidation();
  let merged = 0;
  for (const run of runs.reverse()) {
    const dir = mkdtempSync(path.join(tmpdir(), "abt-validation-"));
    try {
      gh(["run", "download", String(run.databaseId), "-R", REPO, "-p", "validation-*", "-D", dir]);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      continue; // run still in progress or produced no artifacts yet
    }
    for (const sub of readdirSync(dir)) {
      const file = path.join(dir, sub, "validation.json");
      if (!existsSync(file)) continue;
      const rec = JSON.parse(readFileSync(file, "utf8")) as ValidationRecord;
      const prev = validation.records[rec.instance_id];
      if (!prev || prev.validated_at < rec.validated_at) {
        validation.records[rec.instance_id] = rec;
        merged++;
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
  validation.updated_at = new Date().toISOString();
  validation.records = Object.fromEntries(
    Object.entries(validation.records).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeJson(VALIDATION, validation);
  summarize(validation);
  console.log(`merged ${merged} records from ${runs.length} runs`);
}

function summarize(v: ValidationFile) {
  const recs = Object.values(v.records);
  const ok = recs.filter((r) => r.gold.outcome === "resolved" && r.noop.outcome === "unresolved");
  const infra = recs.filter((r) => r.gold.outcome === "infra_error" || r.noop.outcome === "infra_error");
  console.log(`${recs.length} validated: ${ok.length} pass, ${recs.length - ok.length} fail (${infra.length} infra errors)`);
  for (const r of recs.filter((x) => !ok.includes(x))) {
    console.log(`  ${r.instance_id}: gold=${r.gold.outcome}${r.gold.reason ? `(${r.gold.reason})` : ""} noop=${r.noop.outcome}${r.noop.reason ? `(${r.noop.reason})` : ""}`);
  }
}

async function status() {
  for (const r of listRuns().slice(0, 10)) {
    console.log(`${r.databaseId}  ${r.createdAt}  ${r.status}  ${r.conclusion ?? ""}`);
  }
  if (existsSync(VALIDATION)) summarize(await loadValidation());
}

const cmd = process.argv[2];
const commands: Record<string, () => Promise<void>> = { dispatch, collect, status };
if (!commands[cmd]) {
  console.error("usage: validate-tasks.ts dispatch|collect|status");
  process.exit(1);
}
commands[cmd]().catch((err) => {
  console.error(err);
  process.exit(1);
});
