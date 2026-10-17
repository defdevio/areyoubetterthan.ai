import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MetricTiles, OutcomeBar, SolveCurve, SpeedTable } from "@/components/metrics";
import { ComparisonChart, speedMarkers } from "@/components/results/results-client";
import { SiteFooter } from "@/components/site-footer";
import { Card, LinkButton, RateBar } from "@/components/ui";
import { modelRatesOn, modelsSource } from "@/lib/models";
import { getHumanStats } from "@/lib/public-stats";
import { pct } from "@/lib/stats";
import { taskIds } from "@/lib/tasks";

export const metadata: Metadata = {
  title: "Humans vs AI",
  description: "Pooled human results on SWE-bench Verified tasks, compared task-for-task with every AI model.",
};

const MIN_ATTEMPTS = 10;

async function HumanSection() {
  const s = await getHumanStats();
  if (s.attempts < MIN_ATTEMPTS) {
    return (
      <Card className="p-8 text-center">
        <div className="text-lg font-medium">Not enough human data yet</div>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {s.attempts} scored {s.attempts === 1 ? "attempt" : "attempts"} so far. We&apos;ll publish the human baseline once there
          are at least {MIN_ATTEMPTS}, so a couple of lucky (or unlucky) runs don&apos;t become a headline.
        </p>
        <LinkButton href="/play" variant="primary" className="mt-6">
          Add your data point →
        </LinkButton>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Humans", String(s.humans)],
          ["Scored attempts", String(s.attempts)],
          ["Tasks covered", `${s.tasks_covered} / ${s.total_tasks}`],
          ["Pooled resolve rate", pct(s.pooled.p)],
        ].map(([k, v]) => (
          <Card key={k} className="p-5">
            <div className="text-xs text-faint">{k}</div>
            <div className="mt-1 text-2xl font-semibold">{v}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <div className="text-sm font-medium">On the tasks humans have attempted</div>
          <p className="mt-1 mb-4 text-xs text-muted">
            Models are scored on the same {s.tasks_covered} tasks. Human rate is pooled over all attempts (95% CI{" "}
            {s.pooled.ci ? `${pct(s.pooled.ci[0])}–${pct(s.pooled.ci[1])}` : "–"}); the average of per-task human rates is{" "}
            {pct(s.mean_per_task)}.
          </p>
          <ComparisonChart summary={{ human: s.pooled, models: s.models_on_same_tasks }} you="Humans (pooled)" limit={12} />
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-3 text-sm font-medium">Per task</div>
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel text-left text-[11px] text-faint">
                <tr>
                  <th className="px-5 py-2 font-normal">Task</th>
                  <th className="px-3 py-2 font-normal">Humans</th>
                  <th className="px-5 py-2 font-normal">Models</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {s.per_task.map((t) => (
                  <tr key={t.instance_id}>
                    <td className="max-w-48 truncate px-5 py-2 font-mono text-xs text-muted" title={t.title}>
                      {t.instance_id}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-human">
                      {t.humans.k}/{t.humans.n}
                    </td>
                    <td className="px-5 py-2 font-mono text-xs text-ai">
                      {t.models_solved}/{t.models_total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <h2 className="pt-6 text-lg font-semibold">How humans work</h2>
      <MetricTiles m={s.metrics} who="humans" />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-5">
          <div className="mb-4 text-sm font-medium">How attempts ended</div>
          <OutcomeBar categories={s.metrics.categories} />
        </Card>
        <Card className="p-5">
          <div className="text-sm font-medium">Solved within N minutes</div>
          <SolveCurve
            series={[{ label: "Humans", values: s.metrics.solved_by_minute, tone: "human" }]}
            markers={speedMarkers(s.speed)}
          />
        </Card>
      </div>
      <Card className="p-5">
        <div className="mb-3 text-sm font-medium">Speed vs. the machines</div>
        <SpeedTable human={{ label: "Humans (pooled)", rate: s.pooled, meanTimeMs: s.metrics.mean_time_ms }} rows={s.speed} />
      </Card>
      <p className="text-xs text-faint">Flagged attempts (honor-system checks) are excluded. Updated every few minutes.</p>
    </div>
  );
}

export default function StatsPage() {
  const all = modelRatesOn([...taskIds], "default");
  const src = modelsSource();
  return (
    <>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-12 px-4 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Humans vs AI</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Everyone who has taken the test, pooled, against every model, always on the exact same tasks.
          </p>
        </div>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-white/[0.03]" />}>
          <HumanSection />
        </Suspense>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Models on all {taskIds.length} tasks</h2>
              <p className="mt-1 text-xs text-muted">
                Latest result per model, preferring the bash-only mini-SWE-agent scaffold. Source:{" "}
                <a className="underline-offset-2 hover:underline" href={`https://github.com/SWE-bench/experiments/tree/${src.commit}`}>
                  SWE-bench/experiments@{src.commit.slice(0, 7)}
                </a>
                .
              </p>
            </div>
            <Link href="/methodology#models" className="text-xs text-faint hover:text-fg">
              How models are picked →
            </Link>
          </div>
          <Card className="divide-y divide-line">
            {all.map((m, i) => (
              <div key={m.row.id} className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.2fr)_3.5rem] items-center gap-3 px-4 py-2">
                <span className="text-right font-mono text-[11px] text-faint">{i + 1}</span>
                <span className="truncate text-sm">
                  {m.row.model}
                  <span className="ml-2 text-[11px] text-faint">
                    {m.row.bashOnly ? "mini-SWE-agent" : m.row.agent} · {m.row.date}
                  </span>
                </span>
                <RateBar p={m.rate.p} ci={m.rate.ci} tone="ai" />
                <span className="text-right font-mono text-xs text-muted">{pct(m.rate.p)}</span>
              </div>
            ))}
          </Card>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
