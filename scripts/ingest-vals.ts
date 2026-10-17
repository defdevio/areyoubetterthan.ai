/**
 * Ingests the vals.ai SWE-bench Verified leaderboard into data/vals.json.
 *
 * vals.ai runs every model with the same bash-only mini-SWE-agent harness and publishes,
 * per model: accuracy, average wall-clock seconds per task ("latency", measured from the
 * model's first step) and average cost per task, overall and per difficulty band, plus
 * the list of tasks each model resolved. There is no API; the numbers are embedded as
 * Astro island props in the page, which this script decodes. It fails loudly if the
 * page format changes rather than writing partial data.
 *
 *   pnpm data:vals
 */
import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { CandidatesFile, ValsEntry, ValsFile, ValsStats } from "../src/lib/data-types";
import { DATA_DIR, readJson } from "./lib/util";

export const VALS_URL = "https://www.vals.ai/benchmarks/swebench";
const BAND = "<15 min fix";
const VERIFIED_SIZE = 500;
const MAX_RATE_DRIFT = 2;
const MIN_MODELS = 20;

export function unescapeHtml(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Astro serializes island props as [type, value] pairs: 0 = plain/object, 1 = array. */
export function decodeAstro(v: unknown): unknown {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== "number") return v;
  const [type, value] = v as [number, unknown];
  if (type === 1 && Array.isArray(value)) return value.map(decodeAstro);
  if (type === 0 && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, decodeAstro(x)]));
  }
  return value;
}

export function islandProps(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<astro-island[^>]*?\sprops="([^"]*)"/g)) {
    try {
      const raw = JSON.parse(unescapeHtml(m[1])) as Record<string, unknown>;
      out.push(Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, decodeAstro(x)])));
    } catch {
      // Not every island has JSON props.
    }
  }
  return out;
}

const UPPER = new Set(["gpt", "glm", "gpt-oss", "ai", "llm", "oss"]);
const BRANDS: Record<string, string> = {
  deepseek: "DeepSeek",
  minimax: "MiniMax",
  openai: "OpenAI",
  qwen: "Qwen",
  xai: "xAI",
  mimo: "MiMo",
};

/** "anthropic/claude-opus-5" -> "Claude Opus 5", "openai/gpt-5.6-sol" -> "GPT 5.6 Sol". */
export function displayName(valsId: string): string {
  const slug = valsId.slice(valsId.indexOf("/") + 1);
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((t) => {
      const lower = t.toLowerCase();
      if (UPPER.has(lower)) return lower.toUpperCase();
      for (const [k, v] of Object.entries(BRANDS)) if (lower.startsWith(k)) return v + t.slice(k.length);
      if (/^v\d/.test(lower) || /^k\d/.test(lower) || /^m\d/.test(lower)) return t.toUpperCase();
      if (/^\d/.test(t)) return t;
      return t[0].toUpperCase() + t.slice(1);
    })
    .join(" ");
}

interface RawStats {
  accuracy?: number | null;
  latency?: number | null;
  cost_per_test?: number | null;
  stderr?: number | null;
  provider?: string | null;
}

function stats(raw: RawStats | undefined): ValsStats | null {
  if (!raw || typeof raw.accuracy !== "number") return null;
  return {
    accuracy_pct: raw.accuracy,
    stderr_pct: typeof raw.stderr === "number" ? raw.stderr : null,
    // A zero average time means the timing wasn't recorded, not that the model was instant.
    latency_s: typeof raw.latency === "number" && raw.latency > 0 ? raw.latency : null,
    cost_usd: typeof raw.cost_per_test === "number" ? raw.cost_per_test : null,
  };
}

/** Depth-first search for the first object under `key` that satisfies `ok`. */
function findKey(o: unknown, key: string, ok: (v: Record<string, unknown>) => boolean, depth = 0): Record<string, unknown> | null {
  if (!o || typeof o !== "object" || depth > 8) return null;
  for (const [k, v] of Object.entries(o)) {
    if (k === key && v && typeof v === "object" && !Array.isArray(v) && ok(v as Record<string, unknown>)) {
      return v as Record<string, unknown>;
    }
    const found = findKey(v, key, ok, depth + 1);
    if (found) return found;
  }
  return null;
}

export function parseVals(html: string, pool: string[]) {
  const islands = islandProps(html);
  const tasks = findKey(islands, "tasks", (t) => {
    const overall = t.overall as Record<string, RawStats> | undefined;
    return Boolean(overall && BAND in t && Object.values(overall).some((x) => typeof x?.latency === "number"));
  }) as Record<string, Record<string, RawStats>> | null;
  const results = findKey(islands, "eval_results", (r) => Object.values(r).some(Array.isArray)) as Record<
    string,
    string[]
  > | null;
  if (!tasks) throw new Error("vals.ai page format changed: no tasks.overall / tasks['<15 min fix'] with latency");
  if (!results) throw new Error("vals.ai page format changed: no eval_results");
  const dateModified = /"dateModified":"([^"]+)"/.exec(html)?.[1] ?? null;

  const poolIndex = new Map(pool.map((id, i) => [id, i]));
  const entries: ValsEntry[] = [];
  const skipped: string[] = [];
  for (const [valsId, overallRaw] of Object.entries(tasks.overall)) {
    const overall = stats(overallRaw);
    const band = stats(tasks[BAND]?.[valsId]);
    const resolvedAll = results[valsId];
    if (!overall || !band || !Array.isArray(resolvedAll)) {
      skipped.push(`${valsId} (missing data)`);
      continue;
    }
    if (overall.accuracy_pct === 0) {
      skipped.push(`${valsId} (0% overall: failed run)`);
      continue;
    }
    const recomputed = (100 * new Set(resolvedAll).size) / VERIFIED_SIZE;
    if (Math.abs(recomputed - overall.accuracy_pct) > MAX_RATE_DRIFT) {
      skipped.push(`${valsId} (resolved list gives ${recomputed.toFixed(1)}%, published ${overall.accuracy_pct}%)`);
      continue;
    }
    entries.push({
      id: `vals:${valsId}`,
      vals_id: valsId,
      name: displayName(valsId),
      provider: overallRaw.provider ?? null,
      overall,
      band,
      resolved: [...new Set(resolvedAll)]
        .map((iid) => poolIndex.get(iid))
        .filter((i): i is number => i !== undefined)
        .sort((a, b) => a - b),
    });
  }
  if (entries.length < MIN_MODELS) {
    throw new Error(`vals.ai: only ${entries.length} usable models parsed; refusing to overwrite data/vals.json`);
  }
  entries.sort((a, b) => b.overall.accuracy_pct - a.overall.accuracy_pct || a.id.localeCompare(b.id));
  return { entries, skipped, dateModified };
}

async function main() {
  const candidates = await readJson<CandidatesFile>(path.join(DATA_DIR, "candidates.json"));
  const pool = candidates.candidates.map((c) => c.instance_id);
  const res = await fetch(VALS_URL, { headers: { "user-agent": "areyoubetterthan.ai data refresh (+https://areyoubetterthan.ai)" } });
  if (!res.ok) throw new Error(`vals.ai returned ${res.status}`);
  const { entries, skipped, dateModified } = parseVals(await res.text(), pool);

  const out: ValsFile = {
    source: { url: VALS_URL, fetched_at: new Date().toISOString(), date_modified: dateModified, band: BAND },
    pool,
    entries,
  };
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
  await writeFile(path.join(DATA_DIR, "vals.json"), body);
  console.log(`${entries.length} vals.ai models ingested (page modified ${dateModified ?? "unknown"})`);
  if (skipped.length) console.log(`skipped:\n  ${skipped.join("\n  ")}`);
}

if (process.argv[1]?.endsWith("ingest-vals.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
