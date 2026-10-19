import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { attempts, submissions, type Attempt, type PasteEvent, type User } from "@/lib/db/schema";
import { validateDiff } from "@/lib/diff-validate";
import { computeFlags, sanitizePasteEvents } from "@/lib/flags";
import { newId } from "@/lib/ids";
import { nextTask } from "@/lib/order";
import { metricsFor } from "@/lib/attempt-metrics";
import { HttpError } from "@/lib/errors";
import { briefing, getTask, taskIds, teaser } from "@/lib/tasks";

const { attemptMs, submitGraceMs } = config.limits;

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

async function attemptedIds(userId: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.select({ id: attempts.instanceId }).from(attempts).where(eq(attempts.userId, userId));
  return new Set(rows.map((r) => r.id));
}

/**
 * Turns an attempt into a queued submission. The submission row is inserted first; the
 * unique attempt_id makes this idempotent, and a crash between the two writes heals the
 * next time the attempt is looked at.
 */
async function createSubmission(
  attempt: Attempt,
  diff: string,
  opts: { auto: boolean; elapsedMs: number; endedAt: Date; pasteEvents: PasteEvent[] },
) {
  const db = await getDb();
  const v = validateDiff(diff, { maxBytes: config.limits.maxDiffBytes, maxFiles: config.limits.maxDiffFiles });
  if (!v.ok) throw new HttpError(400, `Your patch could not be submitted: ${v.error}`, "invalid_diff");

  await db
    .insert(submissions)
    .values({
      id: newId(16),
      attemptId: attempt.id,
      userId: attempt.userId,
      instanceId: attempt.instanceId,
      diff,
      diffSha: sha256(diff),
      filesChanged: v.files.length,
      linesAdded: v.added,
      linesRemoved: v.removed,
      status: "queued",
    })
    .onConflictDoNothing({ target: submissions.attemptId });

  const flags = computeFlags({
    pasteEvents: opts.pasteEvents,
    elapsedMs: opts.elapsedMs,
    linesChanged: v.added + v.removed,
  });
  await db
    .update(attempts)
    .set({
      status: "submitted",
      endedAt: opts.endedAt,
      elapsedMs: opts.elapsedMs,
      pasteEvents: opts.pasteEvents,
      flagged: flags.length > 0,
      flagReasons: flags,
      autoSubmitted: opts.auto,
      draftDiff: null,
    })
    .where(and(eq(attempts.id, attempt.id), eq(attempts.status, "in_progress")));

  const [sub] = await db.select().from(submissions).where(eq(submissions.attemptId, attempt.id));
  return sub;
}

async function closeWithoutPatch(attempt: Attempt, status: "submitted" | "expired", endedAt: Date, elapsedMs: number, pasteEvents?: PasteEvent[]) {
  const db = await getDb();
  const outcomeReason = status === "expired" ? "timed_out_no_patch" : "no_patch";
  await db
    .update(attempts)
    .set({
      status,
      endedAt,
      elapsedMs,
      outcome: "unresolved",
      outcomeReason,
      metrics: metricsFor({ ...attempt, elapsedMs, outcome: "unresolved", outcomeReason }, null),
      draftDiff: null,
      ...(pasteEvents ? { pasteEvents } : {}),
    })
    .where(and(eq(attempts.id, attempt.id), eq(attempts.status, "in_progress")));
}

/**
 * Attempts whose clock ran out without a submission (tab closed, network died). The last
 * autosaved draft is submitted on the user's behalf; with no draft it counts as unresolved.
 */
async function finalizeExpired(attempt: Attempt) {
  const endedAt = new Date(attempt.deadlineAt);
  const draft = attempt.draftDiff?.trim() ? attempt.draftDiff : null;
  if (draft && validateDiff(draft, { maxBytes: config.limits.maxDiffBytes, maxFiles: config.limits.maxDiffFiles }).ok) {
    await createSubmission(attempt, draft, {
      auto: true,
      elapsedMs: attemptMs,
      endedAt,
      pasteEvents: attempt.pasteEvents,
    });
  } else {
    await closeWithoutPatch(attempt, "expired", endedAt, attemptMs);
  }
}

export async function finalizeExpiredAttempts(userId?: string): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - submitGraceMs);
  const expired = await db
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.status, "in_progress"),
        lt(attempts.deadlineAt, cutoff),
        userId ? eq(attempts.userId, userId) : undefined,
      ),
    );
  for (const a of expired) await finalizeExpired(a);
  return expired.length;
}

async function activeAttempt(userId: string) {
  const db = await getDb();
  const [a] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "in_progress")))
    .limit(1);
  return a ?? null;
}

function attemptView(a: Attempt) {
  const task = getTask(a.instanceId);
  return {
    id: a.id,
    instance_id: a.instanceId,
    started_at: a.startedAt.toISOString(),
    deadline_at: a.deadlineAt.toISOString(),
    draft_diff: a.draftDiff,
    paste_events: a.pasteEvents,
    task: task ? briefing(task) : null,
  };
}

export async function getPlayState(user: User) {
  await finalizeExpiredAttempts(user.id);
  const active = await activeAttempt(user.id);
  const done = await attemptedIds(user.id);
  const progress = { done: done.size - (active ? 1 : 0), total: taskIds.length };
  if (active) {
    return { server_now: new Date().toISOString(), progress, active: attemptView(active), next: null };
  }
  const nextId = nextTask(taskIds, user.seed, done);
  const task = nextId ? getTask(nextId) : undefined;
  return {
    server_now: new Date().toISOString(),
    progress,
    active: null,
    next: task ? { ...teaser(task), position: done.size + 1 } : null,
  };
}

export async function startAttempt(user: User, instanceId: string) {
  await finalizeExpiredAttempts(user.id);
  const db = await getDb();
  const active = await activeAttempt(user.id);
  if (active) {
    if (active.instanceId === instanceId) return { server_now: new Date().toISOString(), active: attemptView(active) };
    throw new HttpError(409, "You already have a task in progress.", "attempt_in_progress");
  }
  if (!user.tourCompletedAt) throw new HttpError(403, "Finish the practice tour first.", "tour_required");

  const expected = nextTask(taskIds, user.seed, await attemptedIds(user.id));
  if (!expected) throw new HttpError(409, "You have attempted every task. Legend.", "all_done");
  // Tasks come in a fixed per-user order so nobody can cherry-pick easy ones.
  if (expected !== instanceId) throw new HttpError(409, "That is not your next task.", "out_of_order");

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.userId, user.id), gte(attempts.startedAt, dayAgo)));
  if (recent.length >= config.limits.maxAttemptsPerDay) {
    throw new HttpError(429, "That's a lot of tasks for one day. Come back tomorrow!", "daily_limit");
  }

  const now = new Date();
  await db
    .insert(attempts)
    .values({
      id: newId(),
      userId: user.id,
      instanceId,
      startedAt: now,
      deadlineAt: new Date(now.getTime() + attemptMs),
    })
    .onConflictDoNothing();
  const a = await activeAttempt(user.id);
  if (!a) throw new HttpError(409, "Could not start the task.", "start_failed");
  return { server_now: new Date().toISOString(), active: attemptView(a) };
}

async function ownAttempt(user: User, attemptId: string) {
  const db = await getDb();
  const [a] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, user.id)))
    .limit(1);
  if (!a) throw new HttpError(404, "Attempt not found.", "not_found");
  return a;
}

export async function saveDraft(user: User, attemptId: string, diff: unknown, pasteEvents: unknown) {
  const a = await ownAttempt(user, attemptId);
  if (a.status !== "in_progress") throw new HttpError(409, "This attempt is already over.", "attempt_over");
  if (Date.now() > a.deadlineAt.getTime() + submitGraceMs) {
    throw new HttpError(409, "Time is up.", "deadline_passed");
  }
  if (typeof diff !== "string" || diff.length > config.limits.maxDiffBytes) {
    throw new HttpError(413, "Draft is too large to save.", "too_large");
  }
  const db = await getDb();
  await db
    .update(attempts)
    .set({
      draftDiff: diff,
      draftUpdatedAt: new Date(),
      pasteEvents: sanitizePasteEvents(pasteEvents, attemptMs),
    })
    .where(and(eq(attempts.id, a.id), eq(attempts.status, "in_progress")));
  return { saved_at: new Date().toISOString() };
}

export async function submitAttempt(user: User, attemptId: string, diff: unknown, rawPasteEvents: unknown) {
  const a = await ownAttempt(user, attemptId);
  const db = await getDb();
  if (a.status !== "in_progress") {
    // Idempotent: a retried submit after a flaky network gets the same answer.
    const [sub] = await db.select().from(submissions).where(eq(submissions.attemptId, a.id));
    return { attempt_id: a.id, submission_id: sub?.id ?? null, status: a.status };
  }
  const now = Date.now();
  if (now > a.deadlineAt.getTime() + submitGraceMs) {
    await finalizeExpired(a);
    throw new HttpError(
      409,
      "Time ran out before your submission arrived. Your last autosaved draft was submitted instead.",
      "deadline_passed",
    );
  }
  if (typeof diff !== "string") throw new HttpError(400, "Missing diff.", "bad_request");
  const pasteEvents = sanitizePasteEvents(rawPasteEvents, attemptMs);
  const elapsedMs = Math.min(attemptMs, Math.max(0, now - a.startedAt.getTime()));
  const endedAt = new Date(Math.min(now, a.deadlineAt.getTime()));

  if (!diff.trim()) {
    await closeWithoutPatch(a, "submitted", endedAt, elapsedMs, pasteEvents);
    return { attempt_id: a.id, submission_id: null, status: "submitted" };
  }
  const sub = await createSubmission(a, diff, { auto: false, elapsedMs, endedAt, pasteEvents });
  return { attempt_id: a.id, submission_id: sub?.id ?? null, status: "submitted" };
}

export async function recentAttempts(userId: string, limit = 200) {
  const db = await getDb();
  return db
    .select({ attempt: attempts, submission: submissions })
    .from(attempts)
    .leftJoin(submissions, eq(submissions.attemptId, attempts.id))
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.startedAt))
    .limit(limit);
}

export async function attemptsFor(userId: string, instanceIds: string[]) {
  const db = await getDb();
  if (instanceIds.length === 0) return [];
  return db
    .select({ attempt: attempts, submission: submissions })
    .from(attempts)
    .leftJoin(submissions, eq(submissions.attemptId, attempts.id))
    .where(and(eq(attempts.userId, userId), inArray(attempts.instanceId, instanceIds)));
}
