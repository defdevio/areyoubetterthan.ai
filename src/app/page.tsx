import Link from "next/link";
import { Suspense } from "react";
import { CountryFlag } from "@/components/country-flag";
import { SiteFooter } from "@/components/site-footer";
import { HumanAvatar } from "@/components/human-avatar";
import { Medal } from "@/components/medal";
import { Card, LinkButton, RateBar, cx } from "@/components/ui";
import { ModelLogo } from "@/components/model-logo";
import { getLeaderboard } from "@/lib/leaderboard";
import { modelRatesOn, valsSource } from "@/lib/models";
import { formatDuration } from "@/lib/format";
import { getHumanStats } from "@/lib/public-stats";
import { pct } from "@/lib/stats";
import { getTasksFile, taskIds } from "@/lib/tasks";

function TasksIcon() {
  return (
    <svg {...STEP_ICON_PROPS}>
      <rect x="3" y="2.5" width="10" height="11" rx="1.5" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg {...STEP_ICON_PROPS}>
      <path d="M8 1.8l5 1.9v4.1c0 3-2.1 5.4-5 6.4-2.9-1-5-3.4-5-6.4V3.7z" />
      <path d="M5.8 8.1l1.5 1.5 2.9-3" />
    </svg>
  );
}
function FlagIcon() {
  return (
    <svg {...STEP_ICON_PROPS}>
      <path d="M3.5 14.5V2" />
      <path d="M3.5 2.5h8.5l-1.8 2.5 1.8 2.5H3.5" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg {...STEP_ICON_PROPS}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  );
}
function TerminalIcon() {
  return (
    <svg {...STEP_ICON_PROPS}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M4.5 6.5L6.5 8l-2 1.5M8.5 10h3" />
    </svg>
  );
}
function BulbIcon() {
  return (
    <svg {...STEP_ICON_PROPS}>
      <path d="M6 11.5c-.8-.6-1.5-1.5-1.5-2.8a3.5 3.5 0 1 1 7 0c0 1.3-.7 2.2-1.5 2.8-.3.2-.5.6-.5 1v.2h-3v-.2c0-.4-.2-.8-.5-1z" />
      <path d="M6.5 14h3" />
    </svg>
  );
}

const SAME = [
  { label: "Tasks", text: "Real GitHub issues from SWE-bench Verified, at the original commit", Icon: TasksIcon },
  { label: "Grading", text: "The official SWE-bench harness, same Docker images, same hidden tests", Icon: ShieldIcon },
  { label: "Bar to pass", text: "Every FAIL_TO_PASS and PASS_TO_PASS test must pass", Icon: FlagIcon },
];
const DIFFERENT = [
  { label: "Time", text: "You get 15 minutes. Agents ran until they decided they were done.", Icon: ClockIcon },
  { label: "Execution", text: "You can read, search and edit, but not run code. Agents had a shell.", Icon: TerminalIcon },
  { label: "Hints", text: "Neither side sees hints or the tests. Same as the leaderboard.", Icon: BulbIcon },
];

const STEP_ICON_PROPS = {
  viewBox: "0 0 16 16",
  "aria-hidden": true,
  className: "size-4",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const STEP_ICONS = [
  function BugIcon() {
    return (
      <svg {...STEP_ICON_PROPS}>
        <rect x="5" y="5" width="6" height="8" rx="3" />
        <path d="M8 5V13M6 2.5L7 4M10 2.5L9 4M5 8H2.5M11 8h2.5M5 11l-2 1.5M11 11l2 1.5" />
      </svg>
    );
  },
  function BrowserIcon() {
    return (
      <svg {...STEP_ICON_PROPS}>
        <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
        <path d="M2 5.5h12M6.5 8.5L5 10l1.5 1.5M9.5 8.5L11 10l-1.5 1.5" />
      </svg>
    );
  },
  function CheckIcon() {
    return (
      <svg {...STEP_ICON_PROPS}>
        <circle cx="8" cy="8" r="6" />
        <path d="M5.5 8.25l1.75 1.75 3.25-3.5" />
      </svg>
    );
  },
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

// Below md each block is its own card. From md up they sit inside one card.
const BLOCK = "rounded-xl border border-line bg-panel p-4 md:rounded-none md:border-0 md:bg-transparent md:p-0";

async function TopHumans() {
  const board = await getLeaderboard();
  const top = board.ranked.slice(0, 5);
  return (
    <div
      data-testid="top-humans"
      className="space-y-3 md:space-y-0 md:rounded-xl md:border md:border-line md:bg-panel md:p-6"
    >
      <div className={cx(BLOCK, "flex items-baseline justify-between gap-3")}>
        <div className="text-sm font-medium">
          <span aria-hidden className="mr-1.5">🏆</span>Top humans
        </div>
        <Link href="/leaderboard" className="text-xs text-faint hover:text-fg">
          Leaderboard →
        </Link>
      </div>
      {top.length === 0 ? (
        <p className={cx(BLOCK, "text-sm text-muted md:mt-3")}>
          Nobody&apos;s ranked yet. Score {board.min_tasks} tasks and the top spot is yours.
          {board.provisional.length > 0 &&
            ` ${board.provisional.length} ${board.provisional.length === 1 ? "person is" : "people are"} already on the way.`}
        </p>
      ) : (
        <>
          <div className="hidden text-[10px] uppercase tracking-wide text-faint md:mt-4 md:flex md:justify-between">
            <span>Human</span>
            <span title="Share of tasks you'd be expected to resolve, on the same scale as the models">Skill</span>
          </div>
          <ol className="space-y-3 md:mt-3">
            {top.map((e, i) => (
              <li key={e.rank} className={cx(BLOCK, "flex items-center gap-3 text-sm")}>
                <span className="flex w-10 shrink-0 items-center gap-1 font-mono text-xs text-faint">
                  {i < 3 ? (
                    <Medal place={(i + 1) as 1 | 2 | 3} />
                  ) : (
                    <span aria-hidden className="inline-block size-5 shrink-0" />
                  )}
                  #{e.rank}
                </span>
                <HumanAvatar name={e.name} url={e.avatar_url} size="size-6" />
                <div className="min-w-0 flex-1">
                  <div className="break-words">
                    {e.country && <CountryFlag code={e.country} className="mr-2 align-middle" />}
                    {e.name}
                  </div>
                  <div className="font-mono text-[10px] text-faint md:truncate">
                    {e.solved}/{e.attempted} solved
                    {e.median_solve_ms !== null && ` · ${formatDuration(e.median_solve_ms)} median fix`}
                    {` · beats ${e.beats} of ${board.models_total} models`}
                  </div>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-human">{pct(e.skill, 1)}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-faint md:hidden">Skill</span>
                </span>
              </li>
            ))}
          </ol>
          <p className={cx(BLOCK, "text-[11px] leading-relaxed text-faint md:mt-4")}>
            <span className="text-muted">Skill</span> is the share of tasks you&apos;d be expected to resolve, on the same scale as the
            models.
          </p>
        </>
      )}
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
            {/* Matches the /play gate (900px wide); the test itself needs a desktop-sized screen. */}
            <p className="mt-3 text-xs text-faint min-[900px]:hidden">
              The test runs on a desktop or laptop. On your phone you can still explore every result.
            </p>
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
                      <ModelLogo org={m.row.org} />
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
              ["Get a real issue", "A bug report from Django, sympy, scikit-learn and friends, picked from the tasks SWE-bench rates as “<15 min fix”."],
              ["Fix it in your browser", "The whole repository at the original commit: file tree, full-text search, a real editor. Fifteen minutes on the clock."],
              ["Get graded, compare", "Your diff runs through the official harness on a public GitHub runner. See which models you beat on exactly the tasks you did."],
            ].map(([title, body], i) => {
              const Icon = STEP_ICONS[i];
              return (
                <Card key={title} className="p-6">
                  <span className="grid size-8 place-items-center rounded-lg border border-human/30 bg-human/10 text-human">
                    <Icon />
                  </span>
                  <div className="mt-3 font-medium">{title}</div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-8 md:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">And humans vs humans</h2>
            <p className="mt-2 max-w-md text-muted">
              Every task you score counts toward your rank. Fixing an issue most models miss counts for more than one they all
              solve, so the leaderboard rewards skill, not just stamina.
            </p>
            <LinkButton href="/leaderboard" variant="secondary" className="mt-6 max-md:hidden">
              See the leaderboard →
            </LinkButton>
          </div>
          <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-white/[0.03]" />}>
            <TopHumans />
          </Suspense>
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
                {SAME.map(({ label, text, Icon }) => (
                  <div key={label} className="grid grid-cols-[8.5rem_1fr] gap-3">
                    <dt className="flex items-center gap-2 text-faint">
                      <Icon />
                      {label}
                    </dt>
                    <dd className="text-muted">{text}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card className="p-6">
              <div className="text-sm font-medium text-warn">Different</div>
              <dl className="mt-4 space-y-3 text-sm">
                {DIFFERENT.map(({ label, text, Icon }) => (
                  <div key={label} className="grid grid-cols-[8.5rem_1fr] gap-3">
                    <dt className="flex items-center gap-2 text-faint">
                      <Icon />
                      {label}
                    </dt>
                    <dd className="text-muted">{text}</dd>
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
