import "server-only";
import { connection } from "next/server";
import { humanStats, type HumanStats } from "@/lib/results";

const TTL_MS = Number(process.env.ABT_STATS_TTL_MS ?? 30_000);
let memo: { at: number; value: Promise<HumanStats> } | null = null;

/**
 * Aggregate human results, read at request time so the leaderboard is never stuck on a
 * build-time snapshot. A short per-instance memo keeps the aggregate query off the hot path.
 */
export async function getHumanStats(): Promise<HumanStats> {
  await connection();
  const now = Date.now();
  if (!memo || now - memo.at > TTL_MS) {
    const value = humanStats().catch((err) => {
      memo = null;
      throw err;
    });
    memo = { at: now, value };
  }
  return memo.value;
}
