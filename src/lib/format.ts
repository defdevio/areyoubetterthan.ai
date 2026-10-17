import type { Phase } from "@/lib/results";

export function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "–";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const PHASE_LABEL: Record<Phase, string> = {
  in_progress: "In progress",
  queued: "Queued",
  waiting: "Waiting for runner",
  running: "Running tests",
  delayed: "Scoring delayed",
  attention: "Scoring delayed",
  resolved: "Resolved",
  unresolved: "Unresolved",
};

export const PHASE_HINT: Record<Phase, string> = {
  in_progress: "You're working on this one.",
  queued: "Waiting for a free scoring slot.",
  waiting: "PR opened; waiting for a GitHub runner.",
  running: "The SWE-bench harness is running the tests.",
  delayed: "An infrastructure hiccup; we're re-running it automatically. This never counts against you.",
  attention: "Infrastructure problem. We've been notified and it won't count until it's fixed.",
  resolved: "All FAIL_TO_PASS and PASS_TO_PASS tests pass.",
  unresolved: "Not all tests pass.",
};

export const REASON_LABEL: Record<string, string> = {
  tests_failed: "Tests failed",
  patch_apply_failed: "Patch didn't apply",
  no_patch: "No changes submitted",
  timed_out_no_patch: "Time ran out with no changes",
  tests_timed_out: "Tests timed out",
  no_test_results: "Tests couldn't run",
};

export function isPending(p: Phase) {
  return p === "queued" || p === "waiting" || p === "running" || p === "delayed";
}

export function shortId(instanceId: string) {
  return instanceId.replace(/^[^_]+__/, "");
}
