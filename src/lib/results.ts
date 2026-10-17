import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attempts, shares, submissions, users, type Attempt, type Submission } from "@/lib/db/schema";
import { finalizeExpiredAttempts, recentAttempts } from "@/lib/game";
import { getBackend } from "@/lib/github";
import { metricsOf } from "@/lib/attempt-metrics";
import { summarize, type AttemptMetrics, type Category } from "@/lib/metrics";
import { modelRatesOn, solversOf, type ComparisonMode } from "@/lib/models";
import { queuePositions, reconcile, runUrl } from "@/lib/scoring/service";
import { rate } from "@/lib/stats";
import { debrief, getTask, repoShort, taskIds } from "@/lib/tasks";

export type Phase =
  | "in_progress"
  | "queued"
  | "waiting"
  | "running"
  | "delayed"
  | "attention"
  | "resolved"
  | "unresolved";

export function phaseOf(a: Attempt, s: Submission | null): Phase {
  if (a.status === "in_progress") return "in_progress";
  if (a.outcome === "resolved") return "resolved";
  if (a.outcome === "unresolved") return "unresolved";
  if (!s) return "unresolved";
  switch (s.status) {
    case "queued":
      return "queued";
    case "dispatching":
    case "dispatched":
      return "waiting";
    case "running":
      return "running";
    case "retrying":
      return "delayed";
    case "needs_attention":
      return "attention";
    case "resolved":
      return "resolved";
    case "unresolved":
      return "unresolved";
  }
}

export const PENDING_PHASES: Phase[] = ["queued", "waiting", "running", "delayed"];

export interface ResultItem {
  attempt_id: string;
  instance_id: string;
  repo: string;
  title: string;
  phase: Phase;
  reason: string | null;
  started_at: string;
  deadline_at: string | null;
  ended_at: string | null;
  elapsed_ms: number | null;
  auto_submitted: boolean;
  flagged: boolean;
  flag_reasons: string[];
  queue_position: number | null;
  retries: number;
  patch: { files: number; added: number; removed: number } | null;
  pr_url: string | null;
  run_url: string | null;
  tests: { f2p_passed: number; f2p_total: number; p2p_failed: number } | null;
}

function toItem(a: Attempt, s: Submission | null, positions: Map<string, number>): ResultItem {
  const task = getTask(a.instanceId);
  const backend = getBackend();
  const t = s?.result?.tests;
  return {
    attempt_id: a.id,
    instance_id: a.instanceId,
    repo: task?.repo ?? "",
    title: task?.title ?? a.instanceId,
    phase: phaseOf(a, s),
    reason: a.outcomeReason ?? s?.reason ?? null,
    started_at: a.startedAt.toISOString(),
    deadline_at: a.status === "in_progress" ? a.deadlineAt.toISOString() : null,
    ended_at: a.endedAt?.toISOString() ?? null,
    elapsed_ms: a.elapsedMs,
    auto_submitted: a.autoSubmitted,
    flagged: a.flagged,
    flag_reasons: a.flagReasons,
    queue_position: s ? (positions.get(s.id) ?? null) : null,
    retries: s?.retries ?? 0,
    patch: s ? { files: s.filesChanged, added: s.linesAdded, removed: s.linesRemoved } : null,
    pr_url: s ? backend.prUrl(s) : null,
    run_url: s && backend.kind === "app" ? runUrl(s) : null,
    tests: t
      ? {
          f2p_passed: t.fail_to_pass.passed_count,
          f2p_total: t.fail_to_pass.passed_count + t.fail_to_pass.failed_count,
          p2p_failed: t.pass_to_pass.failed_count,
        }
      : null,
  };
}

/** The user's attempts, newest first. Also nudges any stalled scoring along. */
export async function userResults(userId: string): Promise<ResultItem[]> {
  await finalizeExpiredAttempts(userId);
  await reconcile({ userId });
  const rows = await recentAttempts(userId);
  const positions = rows.some((r) => r.submission?.status === "queued") ? await queuePositions() : new Map();
  return rows.map((r) => toItem(r.attempt, r.submission, positions));
}

export interface TaskRow {
  instance_id: string;
  repo: string;
  title: string;
  you: "resolved" | "unresolved";
  elapsed_ms: number | null;
  models_solved: number;
  models_total: number;
  category: Category | null;
  f2p_passed: number | null;
  f2p_total: number | null;
  /** Did the patch change a file the reference fix changed? null when no patch. */
  right_file: boolean | null;
  patch_lines: number | null;
  gold_lines: number | null;
}

/** vals.ai models on exactly these tasks, with their average time and cost per task. */
function speedTable(ids: string[]) {
  return modelRatesOn(ids, "vals").map((m) => ({
    id: m.row.id,
    model: m.row.model,
    org: m.row.org,
    rate: m.rate,
    published_pct: m.row.publishedPct,
    published_stderr: m.row.publishedStderr,
    latency_s: m.row.latencyS,
    cost_usd: m.row.costUsd,
  }));
}

export async function userSummary(userId: string, mode: ComparisonMode) {
  const db = await getDb();
  const joined = await db
    .select({ attempt: attempts, submission: { diff: submissions.diff, result: submissions.result } })
    .from(attempts)
    .leftJoin(submissions, eq(submissions.attemptId, attempts.id))
    .where(and(eq(attempts.userId, userId), inArray(attempts.outcome, ["resolved", "unresolved"])));
  const metricsById = new Map<string, AttemptMetrics | null>();
  for (const r of joined) metricsById.set(r.attempt.id, metricsOf(r.attempt, r.submission));
  const finished = joined.map((r) => r.attempt).filter((a) => getTask(a.instanceId));
  const ids = finished.map((a) => a.instanceId);
  const resolved = finished.filter((a) => a.outcome === "resolved").length;
  const human = rate(resolved, finished.length);
  const models = modelRatesOn(ids, mode);
  const beaten = human.p === null ? 0 : models.filter((m) => (m.rate.p ?? 0) < human.p!).length;
  const tied = human.p === null ? 0 : models.filter((m) => m.rate.p === human.p).length;

  const tasks: TaskRow[] = finished
    .map((a) => {
      const t = getTask(a.instanceId)!;
      const s = solversOf(a.instanceId, mode);
      const m = metricsById.get(a.id) ?? null;
      return {
        instance_id: a.instanceId,
        repo: t.repo,
        title: t.title,
        you: a.outcome as "resolved" | "unresolved",
        elapsed_ms: a.elapsedMs,
        models_solved: s.solved,
        models_total: s.total,
        category: m?.category ?? null,
        f2p_passed: m?.f2p_passed ?? null,
        f2p_total: m?.f2p_total ?? null,
        right_file: m?.localization ? m.localization.hit.length > 0 : null,
        patch_lines: m?.patch_lines ?? null,
        gold_lines: m?.gold_lines ?? null,
      };
    })
    .sort((a, b) => a.models_solved / (a.models_total || 1) - b.models_solved / (b.models_total || 1));

  return {
    mode,
    human,
    models: models.map((m) => ({ ...m.row, rate: m.rate })),
    beaten,
    tied,
    total_models: models.length,
    tasks,
    // Tasks most models failed that you solved, and vice versa.
    human_edge: tasks.filter((t) => t.you === "resolved" && t.models_solved / (t.models_total || 1) <= 0.5),
    ai_edge: tasks.filter((t) => t.you === "unresolved" && t.models_solved / (t.models_total || 1) >= 0.8),
    flagged: finished.filter((a) => a.flagged).length,
    progress: { attempted: finished.length, total: taskIds.length },
    metrics: summarize(finished.map((a) => metricsById.get(a.id)).filter((m): m is AttemptMetrics => Boolean(m))),
    speed: speedTable(ids),
  };
}

export type UserSummary = Awaited<ReturnType<typeof userSummary>>;

/** Everything about one attempt. The reference solution is only revealed once it's over. */
export async function attemptReview(userId: string, instanceId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ attempt: attempts, submission: submissions })
    .from(attempts)
    .leftJoin(submissions, eq(submissions.attemptId, attempts.id))
    .where(and(eq(attempts.userId, userId), eq(attempts.instanceId, instanceId)))
    .limit(1);
  const task = getTask(instanceId);
  if (!row || !task) return null;
  const { attempt: a, submission: s } = row;
  const over = a.status !== "in_progress";
  const solvers = solversOf(instanceId, "default");
  return {
    item: toItem(a, s, new Map()),
    metrics: over ? metricsOf(a, s) : null,
    task: over ? debrief(task) : null,
    diff: s?.diff ?? null,
    result: s?.result ?? null,
    models: solvers,
  };
}

/** Pooled "all humans" numbers. Flagged attempts are excluded. */
export async function humanStats() {
  const db = await getDb();
  const rows = await db
    .select({
      instanceId: attempts.instanceId,
      outcome: attempts.outcome,
      userId: attempts.userId,
      metrics: attempts.metrics,
    })
    .from(attempts)
    .where(and(inArray(attempts.outcome, ["resolved", "unresolved"]), eq(attempts.flagged, false)));
  const valid = rows.filter((r) => getTask(r.instanceId));
  const perTask = new Map<string, { k: number; n: number }>();
  for (const r of valid) {
    const cur = perTask.get(r.instanceId) ?? { k: 0, n: 0 };
    cur.n++;
    if (r.outcome === "resolved") cur.k++;
    perTask.set(r.instanceId, cur);
  }
  const attempted = [...perTask.keys()];
  // Mean of per-task human success rates, so heavy users don't dominate.
  const meanPerTask =
    attempted.length > 0
      ? attempted.reduce((acc, id) => acc + perTask.get(id)!.k / perTask.get(id)!.n, 0) / attempted.length
      : null;
  const models = modelRatesOn(attempted, "default");
  return {
    humans: new Set(valid.map((r) => r.userId)).size,
    attempts: valid.length,
    tasks_covered: attempted.length,
    total_tasks: taskIds.length,
    pooled: rate(valid.filter((r) => r.outcome === "resolved").length, valid.length),
    mean_per_task: meanPerTask,
    models_on_same_tasks: models.slice(0, 12).map((m) => ({ ...m.row, rate: m.rate })),
    metrics: summarize(valid.map((r) => r.metrics).filter((m): m is AttemptMetrics => Boolean(m))),
    speed: speedTable(attempted),
    per_task: attempted
      .map((id) => {
        const t = getTask(id)!;
        const s = solversOf(id, "default");
        const h = perTask.get(id)!;
        return {
          instance_id: id,
          repo: repoShort(t.repo),
          title: t.title,
          humans: rate(h.k, h.n),
          models_solved: s.solved,
          models_total: s.total,
        };
      })
      .sort((a, b) => b.humans.n - a.humans.n || a.instance_id.localeCompare(b.instance_id)),
  };
}

export async function publicShare(shareId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ share: shares, user: users })
    .from(shares)
    .innerJoin(users, eq(users.id, shares.userId))
    .where(and(eq(shares.id, shareId), eq(shares.public, true)))
    .limit(1);
  if (!row) return null;
  const summary = await userSummary(row.user.id, "default");
  return { displayName: row.share.displayName, summary };
}
