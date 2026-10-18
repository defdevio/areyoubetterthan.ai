import { CountryFlag } from "@/components/country-flag";
import { HumanAvatar } from "@/components/human-avatar";
import { CountryMap } from "@/components/leaderboard/country-map";
import { Medal } from "@/components/medal";
import { Card, cx } from "@/components/ui";
import { countryStandings } from "@/lib/country-standings";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import { pct } from "@/lib/stats";

const TOP_COUNTRIES = 10;
const UNPLACED_AVATARS = 8;

export function CountryBoard({ ranked }: { ranked: LeaderboardEntry[] }) {
  const { countries, unplaced } = countryStandings(ranked);
  if (countries.length === 0 && unplaced.length === 0) return null;
  const unplacedAvg = unplaced.reduce((sum, e) => sum + e.skill, 0) / unplaced.length;

  return (
    <section className="space-y-3" data-testid="country-board">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-medium">World Leaderboard</h2>
        <span className="text-[11px] text-faint">ranked by average skill</span>
      </div>

      {countries.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <Card className="flex flex-col p-4 sm:p-6">
            <CountryMap countries={countries} />
          </Card>
          <Card className="overflow-hidden">
            <ol className="divide-y divide-line">
              {countries.slice(0, TOP_COUNTRIES).map((c, i) => (
                <li key={c.code} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex w-7 shrink-0 items-center justify-end font-mono text-xs text-faint">
                    {i < 3 ? <Medal place={(i + 1) as 1 | 2 | 3} /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <CountryFlag code={c.code} className="mr-2 align-middle text-[0.85em]" />
                      {c.name}
                    </div>
                    <div className="truncate text-[11px] text-faint">
                      {c.count} ranked {c.count === 1 ? "human" : "humans"}
                    </div>
                  </div>
                  <span className={cx("font-mono text-xs", i === 0 ? "text-human" : "text-fg")}>
                    {pct(c.avgSkill, 1)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}

      {unplaced.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-xs"
          data-testid="country-unplaced"
        >
          <span className="text-muted">
            No country · {unplaced.length} ranked {unplaced.length === 1 ? "human" : "humans"} · avg {pct(unplacedAvg, 1)}
          </span>
          <div className="flex -space-x-1">
            {unplaced.slice(0, UNPLACED_AVATARS).map((e) => (
              <span key={e.user_id} title={`#${e.rank} ${e.name}`} className="rounded-full ring-2 ring-panel">
                <HumanAvatar name={e.name} url={e.avatar_url} size="size-7" />
              </span>
            ))}
          </div>
          {unplaced.length > UNPLACED_AVATARS && (
            <span className="text-faint">+{unplaced.length - UNPLACED_AVATARS} more</span>
          )}
        </div>
      )}
    </section>
  );
}
