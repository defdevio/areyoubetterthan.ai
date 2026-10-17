import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { attempts, submissions, type Attempt, type Submission } from "@/lib/db/schema";
import { computeAttemptMetrics, type AttemptMetrics } from "@/lib/metrics";
import { getTask } from "@/lib/tasks";

/** Metrics for a finished attempt, or null while it's pending/excluded. */
export function metricsFor(a: Attempt, s: Pick<Submission, "diff" | "result"> | null): AttemptMetrics | null {
  if (a.outcome !== "resolved" && a.outcome !== "unresolved") return null;
  const task = getTask(a.instanceId);
  if (!task) return null;
  return computeAttemptMetrics({
    elapsedMs: a.elapsedMs ?? config.limits.attemptMs,
    resolved: a.outcome === "resolved",
    reason: a.outcomeReason,
    diff: s?.diff ?? null,
    result: s?.result ?? null,
    task,
  });
}

/** Stored metrics if present, otherwise computed on the fly. */
export function metricsOf(a: Attempt, s: Pick<Submission, "diff" | "result"> | null): AttemptMetrics | null {
  return a.metrics ?? metricsFor(a, s);
}

/** Fills in metrics for finished attempts recorded before the column existed. */
export async function backfillMetrics(limit = 500): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ attempt: attempts, submission: submissions })
    .from(attempts)
    .leftJoin(submissions, eq(submissions.attemptId, attempts.id))
    .where(and(inArray(attempts.outcome, ["resolved", "unresolved"]), isNull(attempts.metrics)))
    .limit(limit);
  for (const { attempt, submission } of rows) {
    const m = metricsFor(attempt, submission);
    if (m) await db.update(attempts).set({ metrics: m }).where(eq(attempts.id, attempt.id));
  }
  return rows.length;
}
