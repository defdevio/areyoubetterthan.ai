import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { HumanAvatar } from "@/components/human-avatar";
import { Card, cx, LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDuration } from "@/lib/format";
import { getLeaderboard, standingOf, type Leaderboard, type LeaderboardEntry } from "@/lib/leaderboard";
import { pct } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "The best humans at fixing real GitHub issues from SWE-bench Verified, ranked by a difficulty-adjusted skill score.",
};

const SHOWN = 100;
const MEDAL = ["text-human", "text-zinc-300", "text-orange-400"];

function Avatar({ e, size = "size-7" }: { e: LeaderboardEntry; size?: string }) {
  return <HumanAvatar name={e.name} url={e.avatar_url} size={size} />;
}

/** Links to the person's GitHub profile when listed by login; a display name links to their share page, if any. */
function Name({ e, className }: { e: LeaderboardEntry; className?: string }) {
  const href = e.login ? `https://github.com/${e.login}` : e.share_id ? `/r/${e.share_id}` : null;
  const label = <span className={cx("truncate", className)}>{e.name}</span>;
  if (!href) return label;
  return href.startsWith("/") ? (
    <Link href={href} className="min-w-0 truncate hover:underline">
      {label}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:underline">
      {label}
    </a>
  );
}

function SkillBar({ e }: { e: LeaderboardEntry }) {
  return (
    <div
      className="relative h-1.5 w-full rounded-full bg-white/[0.06]"
      title={`Likely range ${pct(e.skill_range[0], 1)}–${pct(e.skill_range[1], 1)}`}
    >
      <div className="absolute inset-y-0 left-0 rounded-full bg-human" style={{ width: `${e.skill * 100}%` }} />
    </div>
  );
}

function Podium({ top, models, youId }: { top: LeaderboardEntry[]; models: number; youId: string | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" data-testid="podium">
      {top.map((e, i) => (
        <Card
          key={e.rank}
          className={cx(
            "relative overflow-hidden p-5",
            i === 0 && "border-human/40 bg-human/[0.05]",
            e.user_id === youId && "ring-1 ring-human/50",
          )}
        >
          <div className={cx("font-mono text-sm font-semibold", MEDAL[i])}>#{e.rank}</div>
          <div className="mt-3 flex min-w-0 items-center gap-3">
            <Avatar e={e} size="size-10" />
            <div className="min-w-0">
              <Name e={e} className="block text-base font-semibold" />
              <div className="text-[11px] text-faint">
                {e.solved}/{e.attempted} solved{e.user_id === youId ? " · you" : ""}
              </div>
            </div>
          </div>
          <div className="mt-4 text-3xl font-semibold tracking-tight text-human">{pct(e.skill, 1)}</div>
          <div className="mt-2">
            <SkillBar e={e} />
          </div>
          <div className="mt-2 text-[11px] text-muted">
            Beats {e.beats} of {models} models
            {e.median_solve_ms !== null && ` · ${formatDuration(e.median_solve_ms)} median fix`}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RankTable({ rows, models, youId }: { rows: LeaderboardEntry[]; models: number; youId: string | null }) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full table-fixed text-sm" data-testid="ranked-table">
        <thead className="text-left text-[11px] text-faint">
          <tr className="border-b border-line">
            <th className="w-12 px-3 py-2 text-right font-normal">#</th>
            <th className="px-3 py-2 font-normal">Human</th>
            <th className="w-36 px-3 py-2 font-normal sm:w-56">Skill</th>
            <th className="hidden w-24 px-3 py-2 text-right font-normal md:table-cell">Solved</th>
            <th className="hidden w-28 px-3 py-2 text-right font-normal md:table-cell">Median fix</th>
            <th className="hidden w-24 px-4 py-2 text-right font-normal md:table-cell">Beats</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((e) => {
            const you = e.user_id === youId;
            return (
              <tr key={e.rank} className={cx(you ? "bg-human/10" : "hover:bg-white/[0.02]")} data-you={you || undefined}>
                <td className={cx("px-3 py-2.5 text-right font-mono text-xs", you ? "text-human" : "text-faint")}>{e.rank}</td>
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar e={e} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <Name e={e} className={cx(you && "font-semibold text-human")} />
                        {you && <span className="shrink-0 text-[11px] text-human">you</span>}
                      </div>
                      <div className="truncate font-mono text-[10px] text-faint md:hidden">
                        {e.solved}/{e.attempted}
                        {e.median_solve_ms !== null && ` · ${formatDuration(e.median_solve_ms)}`} · beats {e.beats}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={cx("w-12 shrink-0 text-right font-mono text-xs", you ? "text-human" : "text-fg")}>
                      {pct(e.skill, 1)}
                    </span>
                    <SkillBar e={e} />
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 text-right font-mono text-xs text-muted md:table-cell">
                  {e.solved}/{e.attempted}
                </td>
                <td className="hidden px-3 py-2.5 text-right font-mono text-xs text-muted md:table-cell">
                  {formatDuration(e.median_solve_ms)}
                </td>
                <td className="hidden px-4 py-2.5 text-right font-mono text-xs text-muted md:table-cell">
                  {e.beats}/{models}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function YourStanding({ board, userId }: { board: Leaderboard; userId: string }) {
  const s = standingOf(board, userId);
  if (!s) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4 border-human/30 bg-human/[0.04] p-5" data-testid="your-standing">
        <div>
          <div className="font-medium">You&apos;re not on the board yet</div>
          <p className="mt-0.5 text-sm text-muted">
            Score {board.min_tasks} tasks to get a rank. Each one takes at most 15 minutes.
          </p>
        </div>
        <LinkButton href="/play" variant="primary">
          Start a task →
        </LinkButton>
      </Card>
    );
  }
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 border-human/30 bg-human/[0.04] p-5" data-testid="your-standing">
      <div>
        <div className="font-medium">
          {s.rank === null
            ? `Provisional: ${s.needed} more ${s.needed === 1 ? "task" : "tasks"} to get ranked`
            : s.hidden
              ? `You'd be #${s.rank} of ${s.of}, but you're hidden`
              : `You're #${s.rank} of ${s.of}`}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          Skill {pct(s.skill, 1)} · {s.solved}/{s.attempted} solved · beats {s.beats} of {s.models_total} models.{" "}
          <Link href="/results#leaderboard-settings" className="text-human hover:underline">
            {s.hidden ? "Show me" : "Change how you appear"}
          </Link>
        </p>
      </div>
      <LinkButton href="/play" variant="primary">
        {s.rank === null ? "Next task →" : "Climb higher →"}
      </LinkButton>
    </Card>
  );
}

async function Board() {
  const [board, user] = await Promise.all([getLeaderboard(), getCurrentUser()]);
  const youId = user?.id ?? null;
  const podium = board.ranked.slice(0, 3);
  let rest = board.ranked.slice(3, SHOWN);
  const you = board.ranked.find((e) => e.user_id === youId);
  if (you && you.rank! > SHOWN) rest = [...rest, you];

  return (
    <div className="space-y-6">
      {user && <YourStanding board={board} userId={user.id} />}

      {board.ranked.length === 0 ? (
        <Card className="p-10 text-center" data-testid="leaderboard-empty">
          <div className="text-4xl">🏆</div>
          <div className="mt-4 text-lg font-medium">Nobody&apos;s ranked yet</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Score {board.min_tasks} tasks to claim the top spot.
            {board.provisional.length > 0 &&
              ` ${board.provisional.length} ${board.provisional.length === 1 ? "person is" : "people are"} on the way.`}
          </p>
          <LinkButton href="/play" variant="primary" className="mt-6">
            Take the test →
          </LinkButton>
        </Card>
      ) : (
        <>
          <Podium top={podium} models={board.models_total} youId={youId} />
          {rest.length > 0 && <RankTable rows={rest} models={board.models_total} youId={youId} />}
          {board.ranked.length > SHOWN && (
            <p className="text-xs text-faint">
              Showing the top {SHOWN} of {board.ranked.length} ranked humans.
            </p>
          )}
        </>
      )}

      {board.provisional.length > 0 && (
        <section className="space-y-3" data-testid="provisional">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-medium">Provisional</h2>
            <span className="text-[11px] text-faint">fewer than {board.min_tasks} scored tasks, not ranked yet</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {board.provisional.slice(0, 60).map((e, i) => (
              <span
                key={i}
                className={cx(
                  "inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-panel py-1 pr-3 pl-1 text-xs",
                  e.user_id === youId && "border-human/50 text-human",
                )}
              >
                <Avatar e={e} size="size-5" />
                <span className="truncate">{e.name}</span>
                <span className="font-mono text-faint">
                  {e.attempted}/{board.min_tasks}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Leaderboard</h1>
          <p className="mt-2 max-w-2xl text-muted">
            The best humans at fixing real GitHub issues from SWE-bench Verified. Ranked by skill: the share of all the tasks
            you&apos;d be expected to fix, adjusted for how hard yours were and how many you&apos;ve done.
          </p>
        </div>
        <Suspense fallback={<div className="h-[480px] animate-pulse rounded-xl bg-white/[0.03]" />}>
          <Board />
        </Suspense>
        <Card className="p-5 text-sm leading-relaxed text-muted">
          <div className="mb-2 font-medium text-fg">How the ranking works</div>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="text-fg">Harder tasks count more.</span> Each task&apos;s difficulty comes from how many of the
              vals.ai models failed it. Fixing one most models miss lifts your score a lot; missing one they all fix costs more.
            </li>
            <li>
              <span className="text-fg">Short records are pulled toward the human average</span>, so a lucky 1/1 can&apos;t
              outrank a strong 40/50. The more tasks you score, the more your skill reflects you alone.
            </li>
            <li>
              <span className="text-fg">Skill is on the same scale as the models:</span> the share of all the tasks you&apos;d be
              expected to resolve, so &ldquo;beats&rdquo; counts the models whose actual resolve rate is lower.
            </li>
            <li>
              <span className="text-fg">Ties</span> (same skill to 0.1%) go to the faster median fix. Flagged attempts
              don&apos;t count.
            </li>
          </ul>
          <p className="mt-3">
            Everyone who plays is listed by GitHub login unless they choose a display name or hide themselves in{" "}
            <Link href="/results#leaderboard-settings" className="text-human hover:underline">
              My results
            </Link>
            .{" "}
            <Link href="/methodology#leaderboard" className="underline-offset-2 hover:underline">
              Details →
            </Link>
          </p>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
