import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MetricTiles, OutcomeBar, SolveCurve } from "@/components/metrics";
import { SiteFooter } from "@/components/site-footer";
import { GlobalLeaderboard } from "@/components/stats/global-leaderboard";
import { Card, cx, LinkButton, RateBar } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { speedMarkers } from "@/lib/metrics";
import { getHumanStats } from "@/lib/public-stats";
import type { BoardRow, HumanStats } from "@/lib/results";
import { pct } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Humans vs AI",
  description:
    "Every human attempt, pooled, against every AI model on the same SWE-bench Verified tasks: resolve rate, time and cost.",
};

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

function best(rows: BoardRow[], key: "h2h" | "all") {
  return [...rows].sort(
    (a, b) => ((key === "h2h" ? b.h2h?.p : b.all.p) ?? 0) - ((key === "h2h" ? a.h2h?.p : a.all.p) ?? 0) || (b.published_pct ?? 0) - (a.published_pct ?? 0),
  )[0];
}

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub: ReactNode; tone?: "human" | "ai" }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="text-[11px] text-faint">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold tracking-tight sm:text-3xl", tone === "human" && "text-human", tone === "ai" && "text-ai")}>
        {value}
      </div>
      <div className="mt-1 text-xs leading-snug text-muted">{sub}</div>
    </Card>
  );
}

function Scoreboard({ s }: { s: HumanStats }) {
  const vals = s.boards.vals;
  const medianModelTimeS = median(vals.map((r) => r.latency_s).filter((t): t is number => t !== null));
  const top = best(vals, s.unlocked ? "h2h" : "all");
  const medianModelH2h = s.unlocked ? median(vals.map((r) => r.h2h?.p ?? 0)) : null;
  const beaten = s.unlocked ? vals.filter((r) => (r.h2h?.p ?? 0) < (s.pooled.p ?? 0)).length : 0;
  return (
    <div className="space-y-4">
      {s.unlocked && (
        <p className="text-lg text-muted" data-testid="verdict">
          On the same attempts, humans resolve <span className="font-semibold text-human">{pct(s.pooled.p)}</span>, the median
          model <span className="font-semibold text-ai">{pct(medianModelH2h)}</span>. Humans beat{" "}
          <span className="font-semibold text-fg">
            {beaten} of {vals.length}
          </span>{" "}
          models.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Humans, pooled"
          tone="human"
          value={s.unlocked ? pct(s.pooled.p) : "?"}
          sub={
            s.unlocked ? (
              <>
                {s.pooled.k}/{s.pooled.n} attempts resolved · 95% CI {pct(s.pooled.ci?.[0])}–{pct(s.pooled.ci?.[1])}
              </>
            ) : (
              <>
                Published after {s.min_attempts} scored attempts. {s.attempts} so far.{" "}
                <Link href="/play" className="text-human hover:underline">
                  Add yours →
                </Link>
              </>
            )
          }
        />
        <Stat
          label={s.unlocked ? "Best model, head-to-head" : `Best model, all ${s.total_tasks} tasks`}
          tone="ai"
          value={pct(s.unlocked ? top?.h2h?.p : top?.all.p)}
          sub={
            <>
              {top?.model} · {top?.published_pct?.toFixed(1)}% published
              {top?.latency_s ? ` · ${formatDuration(top.latency_s * 1000)}/task` : ""}
            </>
          }
        />
        <Stat
          label="Time per task"
          value={s.unlocked && s.metrics.mean_time_ms !== null ? formatDuration(s.metrics.mean_time_ms) : formatDuration(medianModelTimeS === null ? null : medianModelTimeS * 1000)}
          tone={s.unlocked ? "human" : "ai"}
          sub={
            s.unlocked ? (
              <>Humans on average, vs {formatDuration(medianModelTimeS === null ? null : medianModelTimeS * 1000)} for the median model (vals.ai)</>
            ) : (
              <>Median model average on the “&lt;15 min fix” band (vals.ai). Humans get 15 minutes.</>
            )
          }
        />
        <Stat
          label="Participation"
          value={String(s.humans)}
          sub={
            <>
              {s.humans === 1 ? "human" : "humans"} · {s.attempts} scored {s.attempts === 1 ? "attempt" : "attempts"} ·{" "}
              {s.tasks_covered}/{s.total_tasks} tasks covered
            </>
          }
        />
      </div>
    </div>
  );
}

function PerTask({ s }: { s: HumanStats }) {
  if (!s.per_task.length) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
        <div className="text-sm font-medium">Task by task</div>
        <div className="text-[11px] text-faint">bars: share of humans / models that solved it</div>
      </div>
      <div className="max-h-[560px] overflow-y-auto">
        <table className="w-full text-sm" data-testid="per-task">
          <thead className="sticky top-0 z-10 bg-panel text-left text-[11px] text-faint">
            <tr className="border-b border-line">
              <th className="px-4 py-2 font-normal sm:px-5">Task</th>
              <th className="hidden px-3 py-2 font-normal lg:table-cell">Humans</th>
              <th className="hidden px-3 py-2 font-normal lg:table-cell">vals.ai models</th>
              <th className="hidden px-5 py-2 font-normal lg:table-cell">Leaderboard models</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.per_task.map((t) => {
              const ai = t.vals_total ? t.vals_solved / t.vals_total : 0;
              const humanEdge = (t.humans.p ?? 0) > ai;
              return (
                <tr key={t.instance_id} className={cx(humanEdge && "bg-human/[0.04]")}>
                  <td className="px-4 py-2.5 sm:px-5 lg:max-w-md">
                    <div className="line-clamp-2 lg:truncate" title={t.title}>
                      {t.title}
                    </div>
                    <div className="font-mono text-[11px] break-all text-faint">{t.instance_id}</div>
                    {/* Phones: the three comparison columns, stacked under the title. */}
                    <div className="mt-2 grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-x-2 gap-y-1.5 text-[11px] lg:hidden">
                      <span className="text-faint">Humans</span>
                      <RateBar p={t.humans.p} ci={null} tone="human" />
                      <span className="text-right font-mono text-human">
                        {t.humans.k}/{t.humans.n}
                      </span>
                      <span className="text-faint">vals.ai models</span>
                      <RateBar p={ai} ci={null} tone="ai" />
                      <span className="text-right font-mono text-muted">
                        {t.vals_solved}/{t.vals_total}
                      </span>
                      <span className="text-faint">Leaderboard</span>
                      <RateBar p={t.models_total ? t.models_solved / t.models_total : 0} ci={null} tone="muted" />
                      <span className="text-right font-mono text-muted">
                        {t.models_solved}/{t.models_total}
                      </span>
                    </div>
                  </td>
                  <td className="hidden w-44 px-3 py-2.5 lg:table-cell">
                    <div className="flex items-center gap-2">
                      <RateBar p={t.humans.p} ci={null} tone="human" className="w-20" />
                      <span className="font-mono text-xs text-human">
                        {t.humans.k}/{t.humans.n}
                      </span>
                    </div>
                  </td>
                  <td className="hidden w-44 px-3 py-2.5 lg:table-cell">
                    <div className="flex items-center gap-2">
                      <RateBar p={ai} ci={null} tone="ai" className="w-20" />
                      <span className="font-mono text-xs text-muted">
                        {t.vals_solved}/{t.vals_total}
                      </span>
                    </div>
                  </td>
                  <td className="hidden w-44 px-5 py-2.5 font-mono text-xs text-muted lg:table-cell">
                    {t.models_solved}/{t.models_total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function StatsBody() {
  const s = await getHumanStats();
  return (
    <div className="space-y-10">
      <Scoreboard s={s} />

      <Card className="overflow-hidden">
        <GlobalLeaderboard
          boards={s.boards}
          totalTasks={s.total_tasks}
          humans={{
            unlocked: s.unlocked,
            attempts: s.attempts,
            minAttempts: s.min_attempts,
            pooled: s.pooled,
            meanTimeMs: s.metrics.mean_time_ms,
          }}
        />
      </Card>

      {s.unlocked ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">How humans work</h2>
          <MetricTiles m={s.metrics} who="humans" />
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <Card className="p-5">
              <div className="text-sm font-medium">How attempts ended</div>
              <p className="mt-1 mb-4 text-xs text-muted">
                Models are only scored pass/fail; for humans we can see how close the misses were.
              </p>
              <OutcomeBar categories={s.metrics.categories} />
            </Card>
            <Card className="p-5">
              <div className="text-sm font-medium">Solved within N minutes</div>
              <p className="mt-1 mb-2 text-xs text-muted">
                Share of human attempts resolved by each minute. Dashed lines: fastest and median model average (vals.ai).
              </p>
              <SolveCurve
                series={[{ label: "Humans", values: s.metrics.solved_by_minute, tone: "human" }]}
                markers={speedMarkers(s.boards.vals)}
              />
            </Card>
          </div>
        </section>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-human/30 bg-human/[0.04] p-6">
          <div>
            <div className="font-medium">The human side of the table is still filling up</div>
            <p className="mt-1 text-sm text-muted">
              Time, partial credit, and where humans find the bug appear here once {s.min_attempts} attempts are scored (
              {s.attempts} so far).
            </p>
          </div>
          <LinkButton href="/play" variant="primary">
            Take a task →
          </LinkButton>
        </Card>
      )}

      <PerTask s={s} />
      <p className="text-xs text-faint">
        Flagged attempts (honor-system checks) are excluded. Updated every few minutes.{" "}
        <Link href="/methodology#models" className="underline-offset-2 hover:underline">
          How models and humans are compared →
        </Link>
      </p>
    </div>
  );
}

export default function StatsPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Humans vs AI</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Every human attempt, pooled, against every model, on the same real GitHub issues graded by the same tests. For who
            the best individual humans are, see the{" "}
            <Link href="/leaderboard" className="text-human hover:underline">
              leaderboard
            </Link>
            .
          </p>
        </div>
        <Suspense fallback={<div className="h-[640px] animate-pulse rounded-xl bg-white/[0.03]" />}>
          <StatsBody />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
