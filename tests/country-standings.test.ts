import { describe, expect, it } from "vitest";
import { countryStandings } from "@/lib/country-standings";
import type { LeaderboardEntry } from "@/lib/leaderboard";

function entry(name: string, rank: number, country: string | null, skill = 1 - rank / 100) {
  return { name, rank, country, skill } as LeaderboardEntry;
}

describe("countryStandings", () => {
  it("counts ranked humans and averages their skill per country", () => {
    const ranked = [
      entry("a", 1, "KR", 0.9),
      entry("b", 2, "US", 0.8),
      entry("c", 3, "KR", 0.5),
      entry("d", 4, "US", 0.2),
    ];
    const { countries, unplaced } = countryStandings(ranked);

    expect(countries.map((c) => [c.code, c.count])).toEqual([
      ["KR", 2],
      ["US", 2],
    ]);
    expect(countries[0].avgSkill).toBeCloseTo(0.7);
    expect(countries[1].avgSkill).toBeCloseTo(0.5);
    expect(unplaced).toEqual([]);
  });

  it("sends people without a country to unplaced, in rank order", () => {
    const ranked = [entry("a", 1, null), entry("b", 2, "DE"), entry("c", 3, null)];
    const { countries, unplaced } = countryStandings(ranked);

    expect(countries.map((c) => c.code)).toEqual(["DE"]);
    expect(unplaced.map((e) => e.name)).toEqual(["a", "c"]);
  });

  it("orders countries by average skill, highest first", () => {
    const ranked = [entry("a", 1, "FR", 0.6), entry("b", 2, "JP", 0.9), entry("c", 3, "FR", 0.6)];
    expect(countryStandings(ranked).countries.map((c) => c.code)).toEqual(["JP", "FR"]);
  });

  it("breaks average-skill ties by headcount", () => {
    const ranked = [entry("a", 1, "JP", 0.5), entry("b", 2, "FR", 0.5), entry("c", 3, "FR", 0.5)];
    expect(countryStandings(ranked).countries.map((c) => c.code)).toEqual(["FR", "JP"]);
  });

  it("returns nothing for an empty board", () => {
    expect(countryStandings([])).toEqual({ countries: [], unplaced: [] });
  });
});
