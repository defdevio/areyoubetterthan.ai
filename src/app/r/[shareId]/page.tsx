import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CountryFlag } from "@/components/country-flag";
import { MetricTiles } from "@/components/metrics";
import { ComparisonChart } from "@/components/results/results-client";
import { SiteFooter } from "@/components/site-footer";
import { Card, LinkButton, PhaseBadge } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { publicShare } from "@/lib/results";
import { pct } from "@/lib/stats";

export async function generateMetadata({ params }: PageProps<"/r/[shareId]">): Promise<Metadata> {
  const { shareId } = await params;
  await connection();
  const share = await publicShare(shareId);
  if (!share) return { title: "Not found" };
  const s = share.summary;
  const title = `${share.displayName} resolved ${s.human.k}/${s.human.n} real GitHub issues`;
  const description = `On the same SWE-bench Verified tasks, ${share.displayName} beat ${s.beaten} of ${s.total_models} AI models. Are you better than AI?`;
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

async function ShareBody({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  await connection();
  const share = await publicShare(shareId);
  if (!share) notFound();
  const s = share.summary;
  return (
    <>
      <div className="text-sm text-muted">areyoubetterthan.ai results for</div>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight break-words sm:text-4xl">
        {s.standing && !s.standing.hidden && (
          <CountryFlag code={s.standing.country} className="mr-3 align-middle text-[0.6em]" />
        )}
        {share.displayName}
      </h1>
      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="p-4 sm:p-6">
          <div className="text-sm text-muted">Resolved</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-5xl font-semibold text-human">{pct(s.human.p)}</span>
            <span className="font-mono text-sm text-muted">
              {s.human.k} / {s.human.n} tasks
            </span>
          </div>
          {s.human.ci && (
            <div className="mt-2 text-xs text-faint">
              95% interval {pct(s.human.ci[0])}–{pct(s.human.ci[1])}
            </div>
          )}
          <div className="mt-6 border-t border-line pt-5 text-2xl font-semibold">
            Beat {s.beaten} of {s.total_models} AI models
          </div>
          <p className="mt-1 text-sm text-muted">
            on the same {s.human.n} SWE-bench Verified tasks, with 15 minutes each and no code execution.
          </p>
          {s.standing && !s.standing.hidden && (
            <div className="mt-5 border-t border-line pt-5 text-sm text-muted" data-testid="share-standing">
              {s.standing.rank !== null ? (
                <>
                  <span className="text-2xl font-semibold text-human">#{s.standing.rank}</span> of {s.standing.of} humans on
                  the{" "}
                </>
              ) : (
                <>Provisional on the </>
              )}
              <Link href="/leaderboard" className="text-fg hover:underline">
                leaderboard
              </Link>{" "}
              · skill {pct(s.standing.skill, 1)}
            </div>
          )}
        </Card>
        <Card className="p-4 sm:p-6">
          <ComparisonChart summary={s} you={share.displayName} limit={12} />
        </Card>
      </div>
      <div className="mt-4">
        <MetricTiles m={s.metrics} />
      </div>
      <Card className="mt-4 divide-y divide-line">
        {s.tasks.map((t) => (
          <div key={t.instance_id} className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm">{t.title}</div>
              <div className="font-mono text-[11px] text-faint">
                {t.instance_id} · {formatDuration(t.elapsed_ms)} · {t.models_solved}/{t.models_total} models solved it
              </div>
            </div>
            <PhaseBadge phase={t.you} />
          </div>
        ))}
      </Card>
    </>
  );
}

export default function SharePage({ params }: PageProps<"/r/[shareId]">) {
  return (
    <>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-white/[0.03]" />}>
          <ShareBody params={params} />
        </Suspense>
        <Card className="mt-8 flex flex-wrap items-center justify-between gap-4 border-human/30 bg-human/[0.04] p-6">
          <div>
            <div className="text-lg font-semibold">Are you better than AI?</div>
            <p className="text-sm text-muted">Real GitHub issues, 15 minutes each, graded by the official SWE-bench harness.</p>
          </div>
          <LinkButton href="/play" variant="primary" size="lg">
            Take the test →
          </LinkButton>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
