import type { ScoreResult, Submission, User } from "@/lib/db/schema";

export interface RunInfo {
  id: number;
  status: "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending";
  conclusion: string | null;
  runAttempt: number;
  htmlUrl: string;
}

/**
 * Everything the app needs from GitHub to score a submission. Implemented by the real
 * GitHub App client and by an in-process mock used for local dev and e2e tests.
 */
export interface ScoringBackend {
  readonly kind: "app" | "mock";
  /** Pushes the bot branch with the diff + meta and opens the scoring PR. Idempotent. */
  dispatch(sub: Submission, user: Pick<User, "login">): Promise<{ branch: string; prNumber: number }>;
  /** Latest score workflow run for the submission's branch, if any. */
  findRun(sub: Submission): Promise<RunInfo | null>;
  /** Downloads and parses result.json from a completed run; null when missing. */
  fetchResult(sub: Submission, run: RunInfo): Promise<ScoreResult | null>;
  rerun(sub: Submission, run: RunInfo): Promise<void>;
  /** Comments with the outcome, closes the PR, and deletes the branch. */
  closePr(sub: Submission, comment: string): Promise<void>;
  openIssue(title: string, body: string): Promise<number | null>;
  prUrl(sub: Submission): string | null;
}

export function branchName(sub: Pick<Submission, "id" | "instanceId">, login: string) {
  const safeLogin = login.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 39);
  return `feat/${safeLogin}-${sub.instanceId}-${sub.id}`;
}

export function isScoreResult(v: unknown): v is ScoreResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.instance_id === "string" &&
    ["resolved", "unresolved", "patch_apply_failed", "infra_error"].includes(o.outcome as string)
  );
}
