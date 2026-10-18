import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { attempts, shares, users } from "@/lib/db/schema";
import { modelRatesOn, solversOf } from "@/lib/models";
import { difficulty, expectedRate, fitTheta, populationTheta, thetaSd, type Observation } from "@/lib/skill";
import { getTask, taskIds } from "@/lib/tasks";

/** Scored tasks needed before someone gets an official rank. */
export const RANK_MIN_TASKS = Number(process.env.ABT_RANK_MIN_TASKS ?? 5);

export interface LeaderboardEntry {
  /** Internal only; never rendered. */
  user_id: string;
  /** What the public sees: the GitHub login, or the display name the person chose. */
  name: string;
  /** Set only when the person is shown by their GitHub login. */
  login: string | null;
  avatar_url: string | null;
  /** Public share page, if they made one. */
  share_id: string | null;
  /** Estimated share of the whole task set this person would resolve (0–1). */
  skill: number;
  /** ±1 posterior standard deviation, on the same scale. */
  skill_range: [number, number];
  solved: number;
  attempted: number;
  /** Median time on resolved tasks; the tie-breaker. */
  median_solve_ms: number | null;
  /** vals.ai models whose resolve rate on the whole task set is below this skill. */
  beats: number;
  last_at: string | null;
  rank: number | null;
  hidden: boolean;
}

export interface Standing {
  rank: number | null;
  of: number;
  skill: number;
  skill_range: [number, number];
  solved: number;
  attempted: number;
  needed: number;
  beats: number;
  models_total: number;
  hidden: boolean;
}

let difficulties: Map<string, number> | null = null;

/** Task difficulty from vals.ai: one harness, every model, every task. */
function taskDifficulty() {
  if (difficulties) return difficulties;
  difficulties = new Map(
    taskIds.map((id) => {
      const s = solversOf(id, "vals");
      return [id, difficulty(s.solved, s.total)];
    }),
  );
  return difficulties;
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ranked order: skill (as displayed, to 0.1%), then faster median solve, then more solved. */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry) {
  return (
    Math.round(b.skill * 1000) - Math.round(a.skill * 1000) ||
    (a.median_solve_ms ?? Infinity) - (b.median_solve_ms ?? Infinity) ||
    b.solved - a.solved ||
    (a.last_at ?? "").localeCompare(b.last_at ?? "")
  );
}

export async function leaderboard({ minTasks = RANK_MIN_TASKS }: { minTasks?: number } = {}) {
  const db = await getDb();
  const rows = await db
    .select({
      userId: attempts.userId,
      instanceId: attempts.instanceId,
      outcome: attempts.outcome,
      elapsedMs: attempts.elapsedMs,
      endedAt: attempts.endedAt,
      login: users.login,
      avatarUrl: users.avatarUrl,
      leaderboardName: users.leaderboardName,
      leaderboardHidden: users.leaderboardHidden,
    })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    // Flagged attempts (honor-system checks) don't count toward anyone's score.
    .where(and(inArray(attempts.outcome, ["resolved", "unresolved"]), eq(attempts.flagged, false)));

  const b = taskDifficulty();
  const allB = [...b.values()];
  const valid = rows.filter((r) => b.has(r.instanceId) && getTask(r.instanceId));
  const obsOf = (r: (typeof valid)[number]): Observation => ({ b: b.get(r.instanceId)!, solved: r.outcome === "resolved" });
  const mean = populationTheta(valid.map(obsOf));
  const modelRates = modelRatesOn([...taskIds], "vals").map((m) => m.rate.p ?? 0);

  const byUser = new Map<string, typeof valid>();
  for (const r of valid) {
    const list = byUser.get(r.userId);
    if (list) list.push(r);
    else byUser.set(r.userId, [r]);
  }

  const shareRows = byUser.size
    ? await db
        .select({ userId: shares.userId, id: shares.id })
        .from(shares)
        .where(and(inArray(shares.userId, [...byUser.keys()]), eq(shares.public, true)))
    : [];
  const shareOf = new Map(shareRows.map((s) => [s.userId, s.id]));

  const entries: LeaderboardEntry[] = [...byUser.entries()].map(([userId, list]) => {
    const obs = list.map(obsOf);
    const theta = fitTheta(obs, mean);
    const sd = thetaSd(theta, obs);
    const skill = expectedRate(theta, allB);
    const u = list[0];
    const named = Boolean(u.leaderboardName);
    const last = list.reduce<Date | null>((acc, r) => (r.endedAt && (!acc || r.endedAt > acc) ? r.endedAt : acc), null);
    return {
      user_id: userId,
      name: named ? u.leaderboardName! : u.login,
      login: named ? null : u.login,
      avatar_url: named ? null : u.avatarUrl,
      share_id: shareOf.get(userId) ?? null,
      skill,
      skill_range: [expectedRate(theta - sd, allB), expectedRate(theta + sd, allB)],
      solved: list.filter((r) => r.outcome === "resolved").length,
      attempted: list.length,
      median_solve_ms: median(
        list.filter((r) => r.outcome === "resolved" && r.elapsedMs !== null).map((r) => r.elapsedMs!),
      ),
      beats: modelRates.filter((p) => p < skill).length,
      last_at: last?.toISOString() ?? null,
      rank: null,
      hidden: u.leaderboardHidden,
    };
  });

  const ranked = entries.filter((e) => !e.hidden && e.attempted >= minTasks).sort(compareEntries);
  ranked.forEach((e, i) => (e.rank = i + 1));
  const provisional = entries
    .filter((e) => !e.hidden && e.attempted < minTasks)
    .sort((a, b) => b.attempted - a.attempted || compareEntries(a, b));

  return {
    min_tasks: minTasks,
    models_total: modelRates.length,
    population_skill: expectedRate(mean, allB),
    ranked,
    provisional,
    entries,
  };
}

export type Leaderboard = Awaited<ReturnType<typeof leaderboard>>;

/**
 * One person's place on the board. Hidden people get the rank they would have, so they can
 * decide whether to show up.
 */
export function standingOf(board: Leaderboard, userId: string): Standing | null {
  const me = board.entries.find((e) => e.user_id === userId);
  if (!me) return null;
  const eligible = me.attempted >= board.min_tasks;
  const rank = !eligible ? null : me.hidden ? 1 + board.ranked.filter((e) => compareEntries(e, me) < 0).length : me.rank;
  return {
    rank,
    of: board.ranked.length + (me.hidden && eligible ? 1 : 0),
    skill: me.skill,
    skill_range: me.skill_range,
    solved: me.solved,
    attempted: me.attempted,
    needed: Math.max(0, board.min_tasks - me.attempted),
    beats: me.beats,
    models_total: board.models_total,
    hidden: me.hidden,
  };
}

export type LeaderboardVisibility = "github" | "name" | "hidden";

/** How a user appears on the public board, for their own settings UI. */
export function leaderboardSettings(u: { leaderboardHidden: boolean; leaderboardName: string | null }) {
  return {
    visibility: (u.leaderboardHidden ? "hidden" : u.leaderboardName ? "name" : "github") as LeaderboardVisibility,
    name: u.leaderboardName,
  };
}

const TTL_MS = Number(process.env.ABT_STATS_TTL_MS ?? 30_000);
let memo: { at: number; value: Promise<Leaderboard> } | null = null;

/** The public board, read at request time with a short per-instance memo. */
export async function getLeaderboard(): Promise<Leaderboard> {
  await connection();
  const now = Date.now();
  if (!memo || now - memo.at > TTL_MS) {
    const value = leaderboard().catch((err) => {
      memo = null;
      throw err;
    });
    memo = { at: now, value };
  }
  return memo.value;
}
