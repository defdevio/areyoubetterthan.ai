import "server-only";
import { config } from "@/lib/config";
import type { ScoreResult, Submission, User } from "@/lib/db/schema";
import { getTask } from "@/lib/tasks";
import { branchName, type RunInfo, type ScoringBackend } from "./types";

function filesIn(diff: string): Set<string> {
  return new Set([...diff.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]));
}

/**
 * Simulates the GitHub scoring pipeline in-process: a "run" queues, runs, and completes
 * based on time since dispatch. Outcome heuristics (for local play only):
 *   - diff contains MOCK_INFRA       -> infra_error every time
 *   - diff contains MOCK_INFRA_ONCE  -> infra_error on the first run, then normal
 *   - diff contains MOCK_UNRESOLVED  -> unresolved
 *   - diff contains MOCK_APPLY_FAIL  -> patch_apply_failed
 *   - otherwise resolved iff the diff touches a file the reference patch touches
 */
export class MockBackend implements ScoringBackend {
  readonly kind = "mock" as const;

  async dispatch(sub: Submission, user: Pick<User, "login">) {
    return { branch: branchName(sub, user.login), prNumber: 1000 + (parseInt(sub.id.slice(0, 6), 36) % 9000) };
  }

  async findRun(sub: Submission): Promise<RunInfo | null> {
    if (!sub.dispatchedAt) return null;
    const runAttempt = sub.retries + 1;
    // The service resets dispatchedAt when it requests a re-run, restarting the clock.
    const elapsed = Date.now() - sub.dispatchedAt.getTime();
    const id = 5_000_000 + (parseInt(sub.id.slice(0, 6), 36) % 1_000_000);
    const base = { id, runAttempt, htmlUrl: `https://example.invalid/mock/runs/${id}` };
    if (elapsed < config.mockScoreMs / 3) return { ...base, status: "queued", conclusion: null };
    if (elapsed < config.mockScoreMs) return { ...base, status: "in_progress", conclusion: null };
    const infra = this.outcome(sub) === "infra_error";
    return { ...base, status: "completed", conclusion: infra ? "failure" : "success" };
  }

  private outcome(sub: Submission): ScoreResult["outcome"] {
    if (sub.diff.includes("MOCK_INFRA_ONCE")) return sub.retries === 0 ? "infra_error" : "resolved";
    if (sub.diff.includes("MOCK_INFRA")) return "infra_error";
    if (sub.diff.includes("MOCK_UNRESOLVED")) return "unresolved";
    if (sub.diff.includes("MOCK_APPLY_FAIL")) return "patch_apply_failed";
    const gold = getTask(sub.instanceId)?.patch ?? "";
    const goldFiles = filesIn(gold);
    const touched = [...filesIn(sub.diff)].some((f) => goldFiles.has(f));
    return touched ? "resolved" : "unresolved";
  }

  async fetchResult(sub: Submission): Promise<ScoreResult | null> {
    const outcome = this.outcome(sub);
    const task = getTask(sub.instanceId);
    const f2p = task?.fail_to_pass ?? [];
    const resolved = outcome === "resolved";
    return {
      schema: 1,
      instance_id: sub.instanceId,
      submission_id: sub.id,
      outcome,
      resolved,
      reason: outcome === "unresolved" ? "tests_failed" : outcome === "resolved" ? null : outcome,
      tests:
        outcome === "resolved" || outcome === "unresolved"
          ? {
              fail_to_pass: {
                passed: resolved ? f2p : [],
                failed: resolved ? [] : f2p,
                passed_count: resolved ? f2p.length : 0,
                failed_count: resolved ? 0 : f2p.length,
              },
              pass_to_pass: { failed: [], passed_count: task?.pass_to_pass_count ?? 0, failed_count: 0 },
            }
          : null,
      harness: { package: "swebench", version: "mock", dataset: "mock" },
      duration_s: config.mockScoreMs / 1000,
    };
  }

  async rerun() {}
  async closePr() {}
  async openIssue() {
    return null;
  }
  prUrl() {
    return null;
  }
}
