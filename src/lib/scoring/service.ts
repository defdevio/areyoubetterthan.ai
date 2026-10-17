import "server-only";
import { and, asc, count, eq, inArray, notInArray } from "drizzle-orm";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import {
  attempts,
  submissions,
  users,
  type ScoreResult,
  type Submission,
  type SubmissionStatus,
} from "@/lib/db/schema";
import { getBackend, type RunInfo } from "@/lib/github";

export const ACTIVE_STATUSES: SubmissionStatus[] = ["dispatching", "dispatched", "running", "retrying"];
export const FINAL_STATUSES: SubmissionStatus[] = ["resolved", "unresolved"];
const MAX_DISPATCH_FAILURES = 3;

const log = (...args: unknown[]) => console.log("[scoring]", ...args);

export function runUrl(sub: Pick<Submission, "runId">) {
  return sub.runId ? `https://github.com/${config.github.submissionsRepo}/actions/runs/${sub.runId}` : null;
}

/**
 * Moves queued submissions onto GitHub while respecting a global cap (Actions
 * concurrency on a free public repo is ~20 jobs) and a per-user cap (fairness).
 * Safe to call concurrently: each submission is claimed with a conditional update.
 */
export async function pumpQueue(): Promise<number> {
  const db = await getDb();
  const backend = getBackend();
  const active = await db
    .select({ userId: submissions.userId, n: count() })
    .from(submissions)
    .where(inArray(submissions.status, ACTIVE_STATUSES))
    .groupBy(submissions.userId);
  const perUser = new Map(active.map((r) => [r.userId, Number(r.n)]));
  let slots = config.limits.maxActiveGlobal - active.reduce((a, r) => a + Number(r.n), 0);
  if (slots <= 0) return 0;

  const queued = await db
    .select()
    .from(submissions)
    .where(eq(submissions.status, "queued"))
    .orderBy(asc(submissions.createdAt))
    .limit(100);

  let dispatched = 0;
  for (const sub of queued) {
    if (slots <= 0) break;
    if ((perUser.get(sub.userId) ?? 0) >= config.limits.maxActivePerUser) continue;
    const [claimed] = await db
      .update(submissions)
      .set({ status: "dispatching", lastCheckedAt: new Date() })
      .where(and(eq(submissions.id, sub.id), eq(submissions.status, "queued")))
      .returning();
    if (!claimed) continue;
    slots--;
    perUser.set(sub.userId, (perUser.get(sub.userId) ?? 0) + 1);

    const [user] = await db.select({ login: users.login }).from(users).where(eq(users.id, sub.userId));
    try {
      const { branch, prNumber } = await backend.dispatch(claimed, user ?? { login: "unknown" });
      await db
        .update(submissions)
        .set({ status: "dispatched", branch, prNumber, dispatchedAt: new Date(), error: null })
        .where(eq(submissions.id, sub.id));
      dispatched++;
      log(`dispatched ${sub.id} (${sub.instanceId}) as PR #${prNumber}`);
    } catch (err) {
      const failures = claimed.dispatchFailures + 1;
      const giveUp = failures >= MAX_DISPATCH_FAILURES;
      const error = String((err as Error)?.message ?? err).slice(0, 500);
      await db
        .update(submissions)
        .set({ status: giveUp ? "needs_attention" : "queued", dispatchFailures: failures, error })
        .where(eq(submissions.id, sub.id));
      log(`dispatch failed for ${sub.id} (${failures}/${MAX_DISPATCH_FAILURES}): ${error}`);
      if (giveUp) await reportProblem(claimed, `Could not open the scoring PR: ${error}`);
      // Likely a GitHub-side problem; stop instead of hammering the API.
      break;
    }
  }
  return dispatched;
}

function outcomeComment(sub: Submission, result: ScoreResult) {
  const icon = result.outcome === "resolved" ? "✅" : "❌";
  const lines = [`${icon} **${result.outcome}**${result.reason ? ` (\`${result.reason}\`)` : ""}`];
  if (result.tests) {
    const { fail_to_pass: f, pass_to_pass: p } = result.tests;
    lines.push("", `FAIL_TO_PASS: ${f.passed_count} passed, ${f.failed_count} failed · PASS_TO_PASS: ${p.passed_count} passed, ${p.failed_count} failed`);
  }
  lines.push("", `Scored by swebench ${result.harness.version ?? "?"}. Closing; submissions are never merged.`);
  return lines.join("\n");
}

async function finalize(sub: Submission, result: ScoreResult, run: RunInfo) {
  const db = await getDb();
  const status: SubmissionStatus = result.outcome === "resolved" ? "resolved" : "unresolved";
  const [done] = await db
    .update(submissions)
    .set({
      status,
      outcome: result.outcome,
      reason: result.reason,
      result,
      runId: run.id,
      completedAt: new Date(),
      lastCheckedAt: new Date(),
      error: null,
    })
    .where(and(eq(submissions.id, sub.id), notInArray(submissions.status, FINAL_STATUSES)))
    .returning();
  if (!done) return; // another worker (webhook vs. poll) already finalized it
  await db
    .update(attempts)
    .set({ outcome: status, outcomeReason: result.reason ?? result.outcome })
    .where(eq(attempts.id, sub.attemptId));
  log(`${sub.id} (${sub.instanceId}) -> ${result.outcome}`);
  try {
    await getBackend().closePr(done, outcomeComment(done, result));
  } catch (err) {
    log(`could not close PR for ${sub.id}: ${(err as Error).message}`);
  }
}

async function reportProblem(sub: Submission, detail: string) {
  try {
    const issue = await getBackend().openIssue(
      `Scoring needs attention: ${sub.instanceId} (${sub.id})`,
      [
        `Submission \`${sub.id}\` for \`${sub.instanceId}\` could not be scored automatically.`,
        "",
        detail,
        "",
        sub.prNumber ? `PR: #${sub.prNumber}` : "",
        runUrl(sub) ? `Run: ${runUrl(sub)}` : "",
        "",
        "Re-running the workflow on the PR will update the result automatically.",
      ].join("\n"),
    );
    if (issue) {
      const db = await getDb();
      await db.update(submissions).set({ issueNumber: issue }).where(eq(submissions.id, sub.id));
    }
  } catch (err) {
    log(`could not open issue for ${sub.id}: ${(err as Error).message}`);
  }
}

/** Applies the latest known state of a submission's workflow run. Idempotent. */
export async function handleRunUpdate(sub: Submission, run: RunInfo) {
  const db = await getDb();
  if (FINAL_STATUSES.includes(sub.status)) return;

  if (run.status !== "completed") {
    // While retrying, an older completed attempt may still be reported; only a new
    // attempt actually starting moves us forward.
    const next: SubmissionStatus =
      run.status === "in_progress" ? "running" : sub.status === "retrying" ? "retrying" : "dispatched";
    await db
      .update(submissions)
      .set({ status: next, runId: run.id, lastCheckedAt: new Date() })
      .where(and(eq(submissions.id, sub.id), notInArray(submissions.status, FINAL_STATUSES)));
    return;
  }

  if (sub.status === "retrying" && run.runAttempt < sub.retries + 1) {
    // The re-run we requested has not been picked up yet.
    await db.update(submissions).set({ lastCheckedAt: new Date() }).where(eq(submissions.id, sub.id));
    return;
  }

  let result: ScoreResult | null = null;
  try {
    result = await getBackend().fetchResult(sub, run);
  } catch (err) {
    log(`fetching result for ${sub.id} failed: ${(err as Error).message}`);
  }
  if (result && result.submission_id && result.submission_id !== sub.id) result = null;

  if (result && result.outcome !== "infra_error") {
    await finalize(sub, result, run);
    await pumpQueue();
    return;
  }

  const reason = result?.reason ?? `run ${run.conclusion ?? "finished"} without a result`;
  if (sub.retries < config.limits.maxInfraRetries) {
    const [claimed] = await db
      .update(submissions)
      .set({
        status: "retrying",
        retries: sub.retries + 1,
        reason,
        runId: run.id,
        dispatchedAt: new Date(),
        lastCheckedAt: new Date(),
      })
      .where(and(eq(submissions.id, sub.id), eq(submissions.status, sub.status), eq(submissions.retries, sub.retries)))
      .returning();
    if (!claimed) return;
    try {
      await getBackend().rerun(claimed, run);
      log(`${sub.id}: infra error (${reason}), re-run ${claimed.retries}/${config.limits.maxInfraRetries}`);
    } catch (err) {
      await db
        .update(submissions)
        .set({ status: "needs_attention", error: `re-run failed: ${(err as Error).message}` })
        .where(eq(submissions.id, sub.id));
      await reportProblem(claimed, `Re-run request failed: ${(err as Error).message}`);
    }
    return;
  }

  const [claimed] = await db
    .update(submissions)
    .set({ status: "needs_attention", reason, runId: run.id, result: result ?? undefined, lastCheckedAt: new Date() })
    .where(and(eq(submissions.id, sub.id), eq(submissions.status, sub.status)))
    .returning();
  if (claimed) {
    log(`${sub.id}: infra errors exhausted retries -> needs_attention`);
    await reportProblem(claimed, `Infrastructure error after ${sub.retries + 1} runs: \`${reason}\`\n\n\`\`\`\n${result?.log_tail ?? ""}\n\`\`\``);
    await pumpQueue();
  }
}

/** Handles a `workflow_run` webhook for the score workflow. */
export async function handleWorkflowRunEvent(payload: {
  workflow_run?: {
    id: number;
    head_branch: string | null;
    status: string;
    conclusion: string | null;
    run_attempt?: number;
    html_url: string;
    path?: string;
  };
  repository?: { full_name: string };
}) {
  const run = payload.workflow_run;
  if (!run?.head_branch || payload.repository?.full_name !== config.github.submissionsRepo) return "ignored";
  if (run.path && !run.path.endsWith(config.github.scoreWorkflow)) return "ignored";
  const db = await getDb();
  const [sub] = await db.select().from(submissions).where(eq(submissions.branch, run.head_branch)).limit(1);
  if (!sub) return "unknown-branch";
  await handleRunUpdate(sub, {
    id: run.id,
    status: run.status as RunInfo["status"],
    conclusion: run.conclusion,
    runAttempt: run.run_attempt ?? 1,
    htmlUrl: run.html_url,
  });
  return "ok";
}

function isDue(sub: Submission, now: number) {
  if (getBackend().kind === "mock") return true;
  // Webhooks are the primary signal; polling is a slow safety net for missed deliveries.
  const lastChecked = sub.lastCheckedAt?.getTime() ?? 0;
  const dispatched = sub.dispatchedAt?.getTime() ?? now;
  return now - lastChecked > 60_000 && now - dispatched > 90_000;
}

/** Safety net for missed webhooks and crashed dispatches. Cheap when nothing is pending. */
export async function reconcile(filter?: { userId?: string }) {
  const db = await getDb();
  const now = Date.now();
  const pending = await db
    .select()
    .from(submissions)
    .where(
      and(
        inArray(submissions.status, [...ACTIVE_STATUSES, "queued"]),
        filter?.userId ? eq(submissions.userId, filter.userId) : undefined,
      ),
    );
  if (pending.length === 0) return;

  for (const sub of pending) {
    if (sub.status === "queued") continue;
    if (sub.status === "dispatching") {
      // A dispatcher died mid-flight. Dispatch is idempotent, so just queue it again.
      if (now - (sub.lastCheckedAt?.getTime() ?? 0) > 3 * 60_000) {
        await db
          .update(submissions)
          .set({ status: "queued" })
          .where(and(eq(submissions.id, sub.id), eq(submissions.status, "dispatching")));
      }
      continue;
    }
    if (!isDue(sub, now)) continue;
    try {
      const run = await getBackend().findRun(sub);
      if (run) {
        await handleRunUpdate(sub, run);
      } else {
        await db.update(submissions).set({ lastCheckedAt: new Date() }).where(eq(submissions.id, sub.id));
        if (sub.dispatchedAt && now - sub.dispatchedAt.getTime() > 45 * 60_000) {
          const [claimed] = await db
            .update(submissions)
            .set({ status: "needs_attention", reason: "no_workflow_run" })
            .where(and(eq(submissions.id, sub.id), eq(submissions.status, sub.status)))
            .returning();
          if (claimed) await reportProblem(claimed, "No score workflow run was found for this PR after 45 minutes.");
        }
      }
    } catch (err) {
      log(`reconcile ${sub.id} failed: ${(err as Error).message}`);
    }
  }
  await pumpQueue();
}

/** 1-based position among queued submissions (oldest first), for the results tray. */
export async function queuePositions(): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.status, "queued"))
    .orderBy(asc(submissions.createdAt))
    .limit(500);
  return new Map(rows.map((r, i) => [r.id, i + 1]));
}

export async function activeJobCount() {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(submissions)
    .where(inArray(submissions.status, ACTIVE_STATUSES));
  return Number(row?.n ?? 0);
}

/** Admin helper: put a needs_attention submission back in the queue. */
export async function requeue(id: string) {
  const db = await getDb();
  await db
    .update(submissions)
    .set({ status: "queued", retries: 0, dispatchFailures: 0, error: null })
    .where(and(eq(submissions.id, id), eq(submissions.status, "needs_attention")));
}

