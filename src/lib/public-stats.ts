import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { humanStats } from "@/lib/results";

/** Aggregate human results, shared by everyone and refreshed every few minutes. */
export async function getHumanStats() {
  "use cache";
  cacheLife("minutes");
  cacheTag("human-stats");
  return humanStats();
}
