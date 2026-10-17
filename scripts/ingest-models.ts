/**
 * Ingests per-instance results for every SWE-bench Verified submission in
 * github.com/SWE-bench/experiments and writes data/models.json, restricted to
 * our candidate pool so the file stays small.
 *
 *   pnpm data:models
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { CandidatesFile, ModelEntry, ModelsFile } from "../src/lib/data-types";
import { writeFile } from "node:fs/promises";
import { DATA_DIR, ROOT, readJson } from "./lib/util";

const REPO = "https://github.com/SWE-bench/experiments.git";
const CACHE = path.join(ROOT, ".cache", "experiments");
const SPARSE = [
  "/evaluation/verified/*/metadata.yaml",
  "/evaluation/verified/*/metadata.yml",
  "/evaluation/verified/*/results/results.json",
  "/evaluation/verified/*/per_instance_details.json",
];

function git(args: string[], cwd = CACHE) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();
}

function syncRepo(): string {
  if (!existsSync(path.join(CACHE, ".git"))) {
    execFileSync(
      "git",
      ["clone", "--quiet", "--filter=blob:none", "--no-checkout", "--depth", "1", REPO, CACHE],
      { stdio: "inherit" },
    );
    git(["sparse-checkout", "init", "--no-cone"]);
    git(["sparse-checkout", "set", ...SPARSE]);
  } else {
    git(["fetch", "--quiet", "--depth", "1", "origin", "HEAD"]);
    git(["reset", "--quiet", "--hard", "FETCH_HEAD"]);
  }
  git(["checkout", "--quiet"]);
  return git(["rev-parse", "HEAD"]);
}

interface Metadata {
  info?: {
    name?: string;
    resolved?: number;
    "mini-swe-agent_version"?: string;
  };
  tags?: {
    model?: string[] | string;
    model_display?: string;
    model_org?: string;
    org?: string;
    agent?: string;
  };
}

function loadMetadata(dir: string): Metadata | null {
  for (const name of ["metadata.yaml", "metadata.yml"]) {
    const file = path.join(dir, name);
    if (existsSync(file)) {
      try {
        return (parseYaml(readFileSync(file, "utf8")) ?? {}) as Metadata;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Returns resolved instance ids (over all 500 Verified tasks), or null when the entry
 * has no per-instance data. results.json is preferred: it is what the leaderboard uses.
 */
function loadResolved(dir: string): Set<string> | null {
  const results = path.join(dir, "results", "results.json");
  if (existsSync(results)) {
    const data = JSON.parse(readFileSync(results, "utf8")) as { resolved?: string[] };
    // Only resolved ids are listed; everything else (including "no_generation") is unresolved.
    if (Array.isArray(data.resolved)) return new Set(data.resolved);
  }
  const details = path.join(dir, "per_instance_details.json");
  if (existsSync(details)) {
    const data = JSON.parse(readFileSync(details, "utf8")) as Record<string, { resolved?: boolean }>;
    return new Set(Object.entries(data).filter(([, v]) => v?.resolved).map(([id]) => id));
  }
  return null;
}

const VERIFIED_SIZE = 500;
/** Max gap (percentage points) between reported and recomputed resolve rate before we distrust the data. */
const MAX_RATE_DRIFT = 2;

export function isBashOnly(id: string, meta: Metadata): boolean {
  return (
    meta.tags?.agent?.toLowerCase() === "mini-swe-agent" ||
    Boolean(meta.info?.["mini-swe-agent_version"]) ||
    /_mini-v\d/.test(id)
  );
}

export function isMultiModel(meta: Metadata): boolean {
  const display = meta.tags?.model_display?.trim() ?? "";
  return /^(multiple|various|n\/a)$/i.test(display);
}

function modelName(meta: Metadata, fallback: string): string {
  const display = meta.tags?.model_display;
  // Multi-model systems list "Multiple"; the submission name is more useful.
  if (display && !isMultiModel(meta)) return display;
  if (display) return meta.info?.name ?? fallback;
  const models = meta.tags?.model;
  if (Array.isArray(models) && models.length) return models.join(" + ");
  if (typeof models === "string") return models;
  return meta.info?.name ?? fallback;
}

async function main() {
  const candidates = await readJson<CandidatesFile>(path.join(DATA_DIR, "candidates.json"));
  const pool = candidates.candidates.map((c) => c.instance_id);

  const commit = syncRepo();
  const root = path.join(CACHE, "evaluation", "verified");
  const entries: ModelEntry[] = [];
  const skipped: string[] = [];
  const inconsistent: string[] = [];

  for (const id of readdirSync(root).sort()) {
    const dir = path.join(root, id);
    const meta = loadMetadata(dir);
    const resolvedAll = loadResolved(dir);
    if (!meta || !resolvedAll) {
      skipped.push(id);
      continue;
    }
    const reported = typeof meta.info?.resolved === "number" ? meta.info.resolved : null;
    const recomputed = (100 * resolvedAll.size) / VERIFIED_SIZE;
    if (reported !== null && Math.abs(reported - recomputed) > MAX_RATE_DRIFT) {
      inconsistent.push(`${id} (reported ${reported}%, per-instance data gives ${recomputed.toFixed(1)}%)`);
      continue;
    }
    const dateMatch = /^(\d{4})(\d{2})(\d{2})_/.exec(id);
    entries.push({
      id,
      name: meta.info?.name ?? id,
      model: modelName(meta, id),
      model_org: meta.tags?.model_org ?? meta.tags?.org ?? null,
      agent: meta.tags?.agent ?? "unknown",
      bash_only: isBashOnly(id, meta),
      multi_model: isMultiModel(meta),
      date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "unknown",
      verified_resolved_pct: reported ?? Number(recomputed.toFixed(1)),
      resolved: pool.flatMap((iid, idx) => (resolvedAll.has(iid) ? [idx] : [])),
    });
  }

  const out: ModelsFile = {
    source: { repo: "SWE-bench/experiments", commit, fetched_at: new Date().toISOString() },
    pool,
    entries,
  };
  // One entry per line keeps the weekly refresh PR diffs readable.
  const body = [
    "{",
    `  "source": ${JSON.stringify(out.source)},`,
    `  "pool": ${JSON.stringify(out.pool)},`,
    `  "entries": [`,
    out.entries.map((e) => `    ${JSON.stringify(e)}`).join(",\n"),
    "  ]",
    "}",
    "",
  ].join("\n");
  await writeFile(path.join(DATA_DIR, "models.json"), body);
  console.log(
    `${entries.length} submissions ingested (${entries.filter((e) => e.bash_only).length} bash-only)`,
  );
  if (skipped.length) console.log(`skipped (no per-instance data): ${skipped.join(", ")}`);
  if (inconsistent.length) console.log(`excluded (inconsistent data):\n  ${inconsistent.join("\n  ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
