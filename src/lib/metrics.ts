import type { ScoreResult } from "@/lib/db/schema";

/**
 * Why an attempt ended the way it did, from most to least successful.
 *   resolved       every FAIL_TO_PASS and PASS_TO_PASS test passes
 *   regression     the bug's tests pass, but previously passing tests now fail
 *   partial_fix    some, not all, of the bug's tests pass
 *   wrong_fix      the patch applied but none of the bug's tests pass
 *   did_not_apply  the diff didn't apply to the repository
 *   no_patch       nothing submitted (gave up or ran out of time)
 *   other          tests timed out or couldn't run
 */
export const CATEGORIES = [
  "resolved",
  "regression",
  "partial_fix",
  "wrong_fix",
  "did_not_apply",
  "no_patch",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  resolved: "Resolved",
  regression: "Fixed it, broke other tests",
  partial_fix: "Partly fixed",
  wrong_fix: "Didn't fix it",
  did_not_apply: "Patch didn't apply",
  no_patch: "No patch",
  other: "Tests timed out / errored",
};

export interface Localization {
  /** Files changed by the reference (upstream) fix. */
  gold: string[];
  /** Files changed by the attempt. */
  touched: string[];
  /** Overlap. */
  hit: string[];
  precision: number;
  recall: number;
  f1: number;
}

/** Stored on each finished attempt (attempts.metrics). Version bumps trigger recompute. */
export interface AttemptMetrics {
  v: 1;
  category: Category;
  elapsed_ms: number;
  /** Bug tests: how many of the task's FAIL_TO_PASS tests pass. */
  f2p_passed: number;
  f2p_total: number;
  /** Regression tests that broke; null when tests didn't run. */
  p2p_failed: number | null;
  /** null when no patch was submitted. */
  localization: Localization | null;
  /** Lines added + removed; null when no patch. */
  patch_lines: number | null;
  gold_lines: number;
}

export function filesInDiff(diff: string | null | undefined): string[] {
  if (!diff) return [];
  const files = new Set<string>();
  for (const m of diff.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)) files.add(m[2] === "/dev/null" ? m[1] : m[2]);
  return [...files].sort();
}

export function changedLines(diff: string | null | undefined): number {
  if (!diff) return 0;
  let n = 0;
  for (const line of diff.split("\n")) {
    if ((line.startsWith("+") && !line.startsWith("+++")) || (line.startsWith("-") && !line.startsWith("---"))) n++;
  }
  return n;
}

export function localization(diff: string, goldPatch: string): Localization {
  const gold = filesInDiff(goldPatch);
  const touched = filesInDiff(diff);
  const goldSet = new Set(gold);
  const hit = touched.filter((f) => goldSet.has(f));
  const precision = touched.length ? hit.length / touched.length : 0;
  const recall = gold.length ? hit.length / gold.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { gold, touched, hit, precision, recall, f1 };
}

export function categorize(input: {
  resolved: boolean;
  reason: string | null;
  hasPatch: boolean;
  tests: ScoreResult["tests"];
}): Category {
  if (input.resolved) return "resolved";
  if (!input.hasPatch || input.reason === "no_patch" || input.reason === "timed_out_no_patch") return "no_patch";
  if (input.reason === "patch_apply_failed") return "did_not_apply";
  const t = input.tests;
  if (!t) return "other";
  const f2pTotal = t.fail_to_pass.passed_count + t.fail_to_pass.failed_count;
  if (f2pTotal > 0 && t.fail_to_pass.failed_count === 0) return t.pass_to_pass.failed_count > 0 ? "regression" : "other";
  if (t.fail_to_pass.passed_count > 0) return "partial_fix";
  return "wrong_fix";
}

export function computeAttemptMetrics(input: {
  elapsedMs: number;
  resolved: boolean;
  reason: string | null;
  diff: string | null;
  result: ScoreResult | null;
  task: { patch: string; fail_to_pass: string[] };
}): AttemptMetrics {
  const hasPatch = Boolean(input.diff && input.diff.trim());
  const tests = input.result?.tests ?? null;
  const f2pTotal = tests
    ? tests.fail_to_pass.passed_count + tests.fail_to_pass.failed_count
    : input.task.fail_to_pass.length;
  return {
    v: 1,
    category: categorize({ resolved: input.resolved, reason: input.reason, hasPatch, tests }),
    elapsed_ms: input.elapsedMs,
    f2p_passed: tests ? tests.fail_to_pass.passed_count : input.resolved ? f2pTotal : 0,
    f2p_total: f2pTotal,
    p2p_failed: tests ? tests.pass_to_pass.failed_count : null,
    localization: hasPatch ? localization(input.diff!, input.task.patch) : null,
    patch_lines: hasPatch ? changedLines(input.diff) : null,
    gold_lines: changedLines(input.task.patch),
  };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export interface MetricsSummary {
  attempts: number;
  /** Over every finished attempt (auto-submits count as the full 15 minutes). */
  mean_time_ms: number | null;
  median_time_ms: number | null;
  /** Over resolved attempts only: how long a correct fix took. */
  median_time_resolved_ms: number | null;
  /** Mean share of each task's bug tests (FAIL_TO_PASS) that pass. No patch counts as 0. */
  bug_tests_passed: number | null;
  /** Share of submitted patches that changed at least one file the reference fix changed. */
  right_file_rate: number | null;
  /** Mean file-level F1 against the reference fix, over submitted patches. */
  mean_file_f1: number | null;
  /** Median of (your changed lines / reference changed lines), over submitted patches. */
  median_patch_ratio: number | null;
  /** Count of attempts per outcome category. */
  categories: Record<Category, number>;
  /** solved_by[m] = share of attempts resolved within m+1 minutes (m = 0..14). */
  solved_by_minute: number[];
}

export function summarize(list: AttemptMetrics[]): MetricsSummary {
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const m of list) categories[m.category]++;
  const withPatch = list.filter((m) => m.localization);
  const resolved = list.filter((m) => m.category === "resolved");
  const solvedByMinute = Array.from({ length: 15 }, (_, i) =>
    list.length ? resolved.filter((m) => m.elapsed_ms <= (i + 1) * 60_000).length / list.length : 0,
  );
  return {
    attempts: list.length,
    mean_time_ms: mean(list.map((m) => m.elapsed_ms)),
    median_time_ms: median(list.map((m) => m.elapsed_ms)),
    median_time_resolved_ms: median(resolved.map((m) => m.elapsed_ms)),
    bug_tests_passed: mean(list.map((m) => (m.f2p_total ? m.f2p_passed / m.f2p_total : m.category === "resolved" ? 1 : 0))),
    right_file_rate: withPatch.length ? withPatch.filter((m) => m.localization!.hit.length > 0).length / withPatch.length : null,
    mean_file_f1: mean(withPatch.map((m) => m.localization!.f1)),
    median_patch_ratio: median(
      withPatch.filter((m) => m.gold_lines > 0).map((m) => (m.patch_lines ?? 0) / m.gold_lines),
    ),
    categories,
    solved_by_minute: solvedByMinute,
  };
}

/** Reference lines for the solve curve: fastest and median model average time per task. */
export function speedMarkers(rows: { latency_s: number | null }[]) {
  const times = rows.map((r) => r.latency_s).filter((t): t is number => t !== null).sort((a, b) => a - b);
  if (!times.length) return [];
  return [
    { label: "fastest model avg", minutes: times[0] / 60 },
    { label: "median model avg", minutes: times[Math.floor(times.length / 2)] / 60 },
  ];
}
