import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { Card, LinkButton, RateBar } from "@/components/ui";
import { modelRatesOn, valsSource } from "@/lib/models";
import { formatDuration } from "@/lib/format";
import { getHumanStats } from "@/lib/public-stats";
import { pct } from "@/lib/stats";
import { getTasksFile, taskIds } from "@/lib/tasks";

const SAME = [
  ["Tasks", "Real GitHub issues from SWE-bench Verified, at the original commit"],
  ["Grading", "The official SWE-bench harness, same Docker images, same hidden tests"],
  ["Bar to pass", "Every FAIL_TO_PASS and PASS_TO_PASS test must pass"],
];
const DIFFERENT = [
  ["Time", "You get 15 minutes. Agents ran until they decided they were done."],
  ["Execution", "You can read, search and edit, but not run code. Agents had a shell."],
  ["Hints", "Neither side sees hints or the tests. Same as the leaderboard."],
];

async function HumansSoFar() {
  const stats = await getHumanStats();
  if (!stats.unlocked) {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-human">Humans</span>
          <span className="font-mono text-human">?</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full bg-human/60" style={{ width: `${Math.min(100, (stats.attempts / stats.min_attempts) * 100)}%` }} />
        </div>
        <div className="text-[11px] text-faint">
          Ranked after {stats.min_attempts} scored attempts · {stats.attempts} so far.{" "}
          <span className="text-human">You could be one of them.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-human">Humans so far</span>
        <span className="font-mono text-human">{pct(stats.pooled.p)}</span>
      </div>
      <RateBar p={stats.pooled.p} ci={stats.pooled.ci} tone="human" />
      <div className="text-[11px] text-faint">
        {stats.attempts} {stats.attempts === 1 ? "attempt" : "attempts"} by {stats.humans} {stats.humans === 1 ? "human" : "humans"} across {stats.tasks_covered} {stats.tasks_covered === 1 ? "task" : "tasks"}
      </div>
    </div>
  );
}

export default function Home() {
  const top = modelRatesOn([...taskIds], "vals").slice(0, 6);
  const src = valsSource();
  const tasks = getTasksFile();
  return (
    <>
      <main className="relative">
        <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
        <section className="relative mx-auto grid max-w-6xl gap-12 px-4 pt-20 pb-16 lg:grid-cols-[1.15fr_1fr] lg:pt-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-pass" /> The human control group for SWE-bench
            </div>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-6xl">
              Are you better
              <br />
              than <span className="text-ai">AI</span>
              <span className="caret">?</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              AI coding agents are ranked on how many real GitHub issues they can fix. Nobody measured the humans. Take{" "}
              <span className="text-fg">the exact same tasks</span>, graded by{" "}
              <span className="text-fg">the exact same tests</span>, and find out where you land.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/play" variant="primary" size="lg">
                Take the test →
              </LinkButton>
              <LinkButton href="/methodology" size="lg" variant="ghost">
                How it works
              </LinkButton>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-faint">
              <span>{tasks.tasks.length} validated tasks</span>
              <span>15 min each</span>
              <span>{src.entries}+ models compared</span>
              <span>scored by swebench {tasks.harness_version}</span>
            </div>
          </div>

          <Card className="self-start p-6">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-medium">
                On these {taskIds.length} tasks <span className="text-[11px] font-normal text-faint">· vals.ai runs</span>
              </div>
              <Link href="/stats" className="text-xs text-faint hover:text-fg">
                Full table →
              </Link>
            </div>
            <div className="mt-5 space-y-4">
              {top.map((m) => (
                <div key={m.row.id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">
                      {m.row.model}
                      {m.row.latencyS !== null && (
                        <span className="ml-2 text-[11px] text-faint">{formatDuration(m.row.latencyS * 1000)} / task</span>
                      )}
                    </span>
                    <span className="font-mono text-ai">{pct(m.rate.p)}</span>
                  </div>
                  <RateBar p={m.rate.p} ci={null} tone="ai" />
                </div>
              ))}
              <div className="border-t border-line pt-4">
                <Suspense fallback={<div className="h-12 animate-pulse rounded bg-white/5" />}>
                  <HumansSoFar />
                </Suspense>
              </div>
            </div>
          </Card>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["1", "Get a real issue", "A bug report from Django, sympy, scikit-learn and friends, picked from the tasks SWE-bench rates as “<15 min fix”."],
              ["2", "Fix it in your browser", "The whole repository at the original commit: file tree, full-text search, a real editor. Fifteen minutes on the clock."],
              ["3", "Get graded, compare", "Your diff runs through the official harness on a public GitHub runner. See which models you beat on exactly the tasks you did."],
            ].map(([n, title, body]) => (
              <Card key={n} className="p-6">
                <div className="font-mono text-sm text-human">{n}</div>
                <div className="mt-3 font-medium">{title}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">A fair fight, mostly</h2>
          <p className="mt-2 max-w-2xl text-muted">
            We kept everything that can be kept identical, and we&apos;re upfront about what isn&apos;t. Results are reported as they
            are, whichever side they flatter.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <div className="text-sm font-medium text-pass">Identical</div>
              <dl className="mt-4 space-y-3 text-sm">
                {SAME.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[6rem_1fr] gap-3">
                    <dt className="text-faint">{k}</dt>
                    <dd className="text-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card className="p-6">
              <div className="text-sm font-medium text-warn">Different</div>
              <dl className="mt-4 space-y-3 text-sm">
                {DIFFERENT.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[6rem_1fr] gap-3">
                    <dt className="text-faint">{k}</dt>
                    <dd className="text-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
          <div className="mt-10">
            <LinkButton href="/play" variant="primary" size="lg">
              I&apos;m ready →
            </LinkButton>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
