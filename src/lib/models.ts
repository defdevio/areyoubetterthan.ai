import "server-only";
import modelsJson from "../../data/models.json";
import valsJson from "../../data/vals.json";
import type { ModelEntry, ModelsFile, ValsFile } from "@/lib/data-types";
import { FIXTURES, taskIds } from "@/lib/tasks";
import { rate, type Rate } from "@/lib/stats";

/**
 * default: SWE-bench leaderboard, one row per model (latest, bash-only preferred)
 * all:     every SWE-bench leaderboard submission
 * vals:    vals.ai's uniform bash-only runs, which also report time and cost per task
 */
export type ComparisonMode = "default" | "all" | "vals";

export const COMPARISON_MODES: ComparisonMode[] = ["default", "all", "vals"];

export function parseMode(v: string | null | undefined): ComparisonMode {
  return COMPARISON_MODES.includes(v as ComparisonMode) ? (v as ComparisonMode) : "default";
}

export interface ModelRow {
  id: string;
  name: string;
  model: string;
  org: string | null;
  agent: string;
  bashOnly: boolean;
  date: string;
  verifiedPct: number | null;
  /**
   * The model's published accuracy, used to order ties on small task subsets.
   * vals: "<15 min fix" band (the pool our tasks come from); leaderboard: all 500 tasks.
   */
  publishedPct: number | null;
  publishedStderr: number | null;
  publishedScope: "band" | "verified";
  source: "swe-bench" | "vals";
  /** vals.ai only: average wall-clock seconds per task on the "<15 min fix" band. */
  latencyS: number | null;
  /** vals.ai only: average API cost per task (USD) on the "<15 min fix" band. */
  costUsd: number | null;
}

const file = modelsJson as unknown as ModelsFile;
const vals = valsJson as unknown as ValsFile;

interface Comparable extends ModelEntry {
  published_pct: number | null;
  published_stderr: number | null;
  published_scope: "band" | "verified";
  source: "swe-bench" | "vals";
  latency_s: number | null;
  cost_usd: number | null;
}

const valsEntries: Comparable[] = vals.entries.map((e) => ({
  id: e.id,
  name: e.name,
  model: e.name,
  model_org: e.provider,
  agent: "mini-SWE-agent",
  bash_only: true,
  date: vals.source.date_modified ?? "",
  verified_resolved_pct: e.overall.accuracy_pct,
  resolved: e.resolved.map((i) => vals.pool[i]).map((iid) => file.pool.indexOf(iid)).filter((i) => i >= 0),
  source: "vals",
  latency_s: e.band.latency_s,
  cost_usd: e.band.cost_usd,
  published_pct: e.band.accuracy_pct,
  published_stderr: e.band.stderr_pct,
  published_scope: "band",
}));

const leaderboardEntries: Comparable[] = file.entries.map((e) => ({
  ...e,
  // Some upstream submissions list their org as an array; use the first name.
  model_org: Array.isArray(e.model_org)
    ? (e.model_org[0] ?? null)
    : e.model_org,
  source: "swe-bench",
  latency_s: null,
  published_pct: e.verified_resolved_pct,
  published_stderr: null,
  published_scope: "verified",
  cost_usd: null,
}));

/** instance id -> set of entry ids that resolved it */
let solvedBy: Map<string, Set<string>> | null = null;

function fixtureSolved(entry: ModelEntry, instanceId: string) {
  // Fixture tasks are synthetic; give each entry a deterministic pseudo-result.
  let h = 0;
  for (const c of entry.id + instanceId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 100 < 70;
}

function index() {
  if (solvedBy) return solvedBy;
  solvedBy = new Map();
  for (const id of taskIds) solvedBy.set(id, new Set());
  for (const e of [...leaderboardEntries, ...valsEntries]) {
    if (FIXTURES) {
      for (const id of taskIds) if (fixtureSolved(e, id)) solvedBy.get(id)!.add(e.id);
      continue;
    }
    for (const idx of e.resolved) {
      const iid = file.pool[idx];
      solvedBy.get(iid)?.add(e.id);
    }
  }
  return solvedBy;
}

function toRow(e: Comparable): ModelRow {
  return {
    source: e.source,
    latencyS: e.latency_s,
    costUsd: e.cost_usd,
    id: e.id,
    name: e.name,
    model: e.model,
    org: e.model_org,
    agent: e.agent,
    bashOnly: e.bash_only,
    date: e.date,
    verifiedPct: e.verified_resolved_pct,
    publishedPct: e.published_pct,
    publishedStderr: e.published_stderr,
    publishedScope: e.published_scope,
  };
}

/** "Claude Opus 4.5" and "Claude 4.5 Opus" are the same model: compare sorted tokens. */
export function modelKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .split(" ")
    .sort()
    .join(" ");
}

let defaultEntries: Comparable[] | null = null;

/**
 * Default comparison set: one row per model, its most recent result, preferring the
 * bash-only mini-SWE-agent scaffold (closest to apples-to-apples across models).
 * Multi-model agent systems have no single model, so they only appear in "all".
 */
export function comparisonEntries(mode: ComparisonMode): Comparable[] {
  if (mode === "vals") return valsEntries;
  if (mode === "all") return leaderboardEntries;
  if (defaultEntries) return defaultEntries;
  const best = new Map<string, Comparable>();
  for (const e of leaderboardEntries) {
    if (e.multi_model) continue;
    const key = modelKey(e.model);
    const cur = best.get(key);
    if (
      !cur ||
      (e.bash_only && !cur.bash_only) ||
      (e.bash_only === cur.bash_only && (e.date > cur.date || (e.date === cur.date && e.id > cur.id)))
    ) {
      best.set(key, e);
    }
  }
  defaultEntries = [...best.values()];
  return defaultEntries;
}

export interface ModelSubsetResult {
  row: ModelRow;
  rate: Rate;
}

/** Each model's resolve rate on exactly the given subset of tasks. */
export function modelRatesOn(instanceIds: string[], mode: ComparisonMode): ModelSubsetResult[] {
  const idx = index();
  return comparisonEntries(mode)
    .map((e) => {
      const k = instanceIds.filter((iid) => idx.get(iid)?.has(e.id)).length;
      return { row: toRow(e), rate: rate(k, instanceIds.length) };
    })
    .sort(
      (a, b) =>
        (b.rate.p ?? 0) - (a.rate.p ?? 0) ||
        // Small subsets produce many ties; break them by the published score.
        (b.row.publishedPct ?? 0) - (a.row.publishedPct ?? 0) ||
        a.row.name.localeCompare(b.row.name),
    );
}

/** For one task: which comparison models solved it. */
export function solversOf(instanceId: string, mode: ComparisonMode) {
  const set = index().get(instanceId) ?? new Set<string>();
  const entries = comparisonEntries(mode);
  const solved = entries.filter((e) => set.has(e.id));
  return { solved: solved.length, total: entries.length, names: solved.map((e) => e.model) };
}

/**
 * vals.ai models that solved a task, by their band-average time per task (seconds).
 * vals.ai doesn't publish per-task times, so this is not how long a model took on this task.
 */
export function solverTimes(instanceId: string) {
  const set = index().get(instanceId) ?? new Set<string>();
  const times = valsEntries.flatMap((e) => (set.has(e.id) && e.latency_s !== null ? [e.latency_s] : []));
  if (!times.length) return { avg_s: null, fastest_s: null, timed: 0 };
  return {
    avg_s: times.reduce((a, b) => a + b, 0) / times.length,
    fastest_s: Math.min(...times),
    timed: times.length,
  };
}

export function modelsSource() {
  return { ...file.source, entries: file.entries.length, default_entries: comparisonEntries("default").length };
}

export function valsSource() {
  return { ...vals.source, entries: vals.entries.length };
}

export function bestModelOnTaskSet(mode: ComparisonMode = "default") {
  return modelRatesOn([...taskIds], mode)[0] ?? null;
}
