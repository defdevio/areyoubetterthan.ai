import { countryName } from "@/lib/countries";
import type { LeaderboardEntry } from "@/lib/leaderboard";

export interface CountryStanding {
  code: string;
  name: string;
  /** Number of ranked humans from this country. */
  count: number;
  /** Mean skill of the country's ranked humans; sets the country's position and color. */
  avgSkill: number;
}

/**
 * Groups ranked humans by country and averages their skill. Countries are ordered by average
 * skill, then by headcount. Humans without a country are returned separately, in rank order.
 */
export function countryStandings(ranked: readonly LeaderboardEntry[]) {
  const byCode = new Map<string, { code: string; count: number; total: number }>();
  const unplaced: LeaderboardEntry[] = [];

  for (const e of ranked) {
    if (!e.country) {
      unplaced.push(e);
      continue;
    }
    const acc = byCode.get(e.country) ?? { code: e.country, count: 0, total: 0 };
    acc.count += 1;
    acc.total += e.skill;
    byCode.set(e.country, acc);
  }

  const countries: CountryStanding[] = [...byCode.values()]
    .map((a) => ({ code: a.code, name: countryName(a.code), count: a.count, avgSkill: a.total / a.count }))
    .sort((a, b) => b.avgSkill - a.avgSkill || b.count - a.count);

  return { countries, unplaced };
}
