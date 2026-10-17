"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useResults, useSession } from "@/components/providers";
import { Button, Card, cx, LinkButton, PhaseBadge, Pill, RateBar, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { formatDuration, isPending, shortId } from "@/lib/format";
import type { UserSummary } from "@/lib/results";
import { pct } from "@/lib/stats";

type Mode = "default" | "all";

export function ComparisonChart({
  summary,
  you = "You",
  limit = 15,
}: {
  summary: Pick<UserSummary, "human" | "models">;
  you?: string;
  limit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    const models = summary.models.map((m) => ({ kind: "model" as const, ...m }));
    const human = { kind: "human" as const, id: "__you", name: you, model: you, rate: summary.human };
    // After every strictly better model; ties share a rank (competition ranking).
    const idx = models.findIndex((m) => (m.rate.p ?? 0) <= (summary.human.p ?? 0));
    const all: (typeof models[number] | typeof human)[] = [...models];
    all.splice(idx === -1 ? all.length : idx, 0, human);
    return all;
  }, [summary, you]);
  const youIdx = rows.findIndex((r) => r.kind === "human");
  const visible = showAll ? rows : rows.filter((_, i) => i < limit || i === youIdx);
  return (
    <div className="space-y-1" data-testid="comparison-chart">
      {visible.map((r) => {
        const isYou = r.kind === "human";
        const rank = 1 + rows.filter((o) => (o.rate.p ?? 0) > (r.rate.p ?? 0)).length;
        const tied = rows.some((o) => o !== r && o.rate.p === r.rate.p);
        return (
          <div
            key={r.id}
            className={cx(
              "grid grid-cols-[2rem_minmax(0,14rem)_1fr_3.5rem] items-center gap-3 rounded-lg px-2 py-1.5",
              isYou && "bg-human/10 ring-1 ring-human/30",
            )}
          >
            <span className="text-right font-mono text-[11px] text-faint">{tied ? `=${rank}` : rank}</span>
            <span className="truncate text-sm">
              <span className={cx(isYou && "font-semibold text-human")}>{r.model}</span>
              {r.kind === "model" && (
                <span className="ml-2 text-[11px] text-faint">{r.bashOnly ? "mini-SWE-agent" : r.agent}</span>
              )}
            </span>
            <RateBar p={r.rate.p} ci={r.rate.ci} tone={isYou ? "human" : "ai"} />
            <span className={cx("text-right font-mono text-xs", isYou ? "text-human" : "text-muted")}>{pct(r.rate.p)}</span>
          </div>
        );
      })}
      {rows.length > limit && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 px-2 text-xs text-faint hover:text-fg">
          {showAll ? "Show fewer" : `Show all ${rows.length - 1} models`}
        </button>
      )}
    </div>
  );
}

function SharePanel() {
  const { me, reload } = useSession();
  const [name, setName] = useState(me?.share?.display_name ?? me?.user?.login ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const share = me?.share;
  const path = share ? `/r/${share.id}` : null;

  const save = async (isPublic: boolean) => {
    setSaving(true);
    try {
      await api("/api/me/share", { method: "PUT", json: { display_name: name, public: isPublic } });
      await reload();
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await api("/api/me/share", { method: "DELETE" });
      await reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="text-sm font-medium">Share your results</div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Opt-in. Creates a public page with your score and comparison under a name you choose. Your GitHub account isn&apos;t
        shown. Turn it off any time.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Display name"
          data-testid="share-name"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm focus:border-human/50 focus:outline-none"
        />
        <Button variant="primary" disabled={saving || !name.trim()} onClick={() => void save(true)} data-testid="share-save">
          {share?.public ? "Update" : "Create link"}
        </Button>
      </div>
      {share?.public && path && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Link href={`/r/${share.id}`} className="truncate rounded bg-white/5 px-2 py-1 font-mono text-muted hover:text-fg" data-testid="share-link">
            {path}
          </Link>
          <Button
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}${path}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void remove()} disabled={saving}>
            Delete link
          </Button>
        </div>
      )}
    </Card>
  );
}

export function ResultsClient() {
  const { me, loading } = useSession();
  const { items, loaded } = useResults();
  const [mode, setMode] = useState<Mode>("default");
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const finishedCount = items.filter((i) => i.phase === "resolved" || i.phase === "unresolved").length;

  useEffect(() => {
    if (!me?.user) return;
    let cancelled = false;
    void api<UserSummary>(`/api/me/summary?mode=${mode}`).then((s) => !cancelled && setSummary(s));
    return () => {
      cancelled = true;
    };
  }, [me?.user, mode, finishedCount]);

  if (loading) return <Centered>Loading…</Centered>;
  if (!me?.user) {
    return (
      <div className="mx-auto max-w-lg flex-1 px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Sign in to see your results</h1>
        <a href="/api/auth/login?next=/results" className="mt-6 inline-block text-human hover:underline">
          Continue with GitHub →
        </a>
      </div>
    );
  }

  const pending = items.filter((i) => isPending(i.phase) || i.phase === "attention" || i.phase === "in_progress");
  const s = summary;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12" data-testid="results-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your results</h1>
          <p className="mt-1 text-sm text-muted">
            Compared task-for-task: every model is scored on exactly the tasks you attempted.
          </p>
        </div>
        <div className="flex rounded-lg border border-line p-0.5 text-xs" role="tablist">
          {(
            [
              ["default", "Latest per model"],
              ["all", "All submissions"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-selected={mode === m}
              role="tab"
              title={
                m === "default"
                  ? "One row per model: its most recent result, preferring the bash-only mini-SWE-agent scaffold"
                  : "Every agent + model submission on the SWE-bench leaderboard"
              }
              className={cx("rounded-md px-3 py-1.5", mode === m ? "bg-white/10 text-fg" : "text-muted hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {pending.length > 0 && (
        <Card className="mt-8 divide-y divide-line">
          {pending.map((i) => (
            <div key={i.attempt_id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm">{i.phase === "in_progress" ? "A task is in progress" : i.title}</div>
                <div className="font-mono text-[11px] text-faint">{i.instance_id}</div>
              </div>
              {i.phase === "in_progress" ? (
                <LinkButton href="/play" size="sm" variant="primary">
                  Back to task
                </LinkButton>
              ) : (
                <PhaseBadge phase={i.phase} queuePosition={i.queue_position} />
              )}
            </div>
          ))}
        </Card>
      )}

      {!s || !loaded ? (
        <Centered>Crunching numbers…</Centered>
      ) : s.human.n === 0 ? (
        <Card className="mt-8 p-10 text-center">
          <div className="text-lg font-medium">No scored attempts yet</div>
          <p className="mt-2 text-sm text-muted">
            Once your first patch is graded you&apos;ll see how you stack up against every model on the same tasks.
          </p>
          <LinkButton href="/play" variant="primary" className="mt-6">
            Start a task →
          </LinkButton>
        </Card>
      ) : (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <Card className="p-6">
              <div className="text-sm text-muted">You resolved</div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-5xl font-semibold tracking-tight text-human" data-testid="human-rate">
                  {pct(s.human.p)}
                </span>
                <span className="font-mono text-sm text-muted">
                  {s.human.k} / {s.human.n} {s.human.n === 1 ? "task" : "tasks"}
                </span>
              </div>
              {s.human.ci && (
                <div className="mt-2 text-xs text-faint">
                  95% interval {pct(s.human.ci[0])}–{pct(s.human.ci[1])}
                  {s.human.n < 20 && ". Wide, because it's a small sample. More tasks will tighten it."}
                </div>
              )}
              <div className="mt-6 border-t border-line pt-5">
                <div className="text-2xl font-semibold" data-testid="beaten">
                  You beat {s.beaten} of {s.total_models} models
                </div>
                <p className="mt-1 text-sm text-muted">
                  on the same {s.human.n} {s.human.n === 1 ? "task" : "tasks"}
                  {s.tied > 0 ? `, tied with ${s.tied}` : ""}. Models had a shell and no time limit; you had 15 minutes and no
                  code execution.
                </p>
              </div>
              <div className="mt-5 font-mono text-[11px] text-faint">
                {s.progress.attempted} of {s.progress.total} tasks attempted
              </div>
              {s.flagged > 0 && (
                <div className="mt-4 rounded-lg border border-warn/30 bg-warn/5 p-3 text-xs text-warn">
                  {s.flagged} of your attempts were flagged by the honor-system checks (e.g. large pastes from outside the
                  editor). They count here but are left out of the global human stats.
                </div>
              )}
            </Card>
            <Card className="p-6">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-sm font-medium">Resolve rate on your tasks</div>
                <div className="text-[11px] text-faint">white line: 95% interval</div>
              </div>
              <ComparisonChart summary={s} />
            </Card>
          </div>

          {(s.human_edge.length > 0 || s.ai_edge.length > 0) && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card className="p-5">
                <div className="text-sm font-medium text-human">Where you beat the machines</div>
                <p className="mt-1 text-xs text-muted">You solved it; at least half the models didn&apos;t.</p>
                <TaskMiniList rows={s.human_edge} empty="None yet." />
              </Card>
              <Card className="p-5">
                <div className="text-sm font-medium text-ai">Where they beat you</div>
                <p className="mt-1 text-xs text-muted">80%+ of models solved it; you didn&apos;t.</p>
                <TaskMiniList rows={s.ai_edge} empty="None. Respect." />
              </Card>
            </div>
          )}

          <Card className="mt-4 overflow-hidden">
            <div className="border-b border-line px-5 py-3 text-sm font-medium">Every task you attempted</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="task-table">
                <thead className="text-left text-[11px] text-faint">
                  <tr className="border-b border-line">
                    <th className="px-5 py-2 font-normal">Task</th>
                    <th className="px-3 py-2 font-normal">You</th>
                    <th className="px-3 py-2 font-normal">Time</th>
                    <th className="px-5 py-2 font-normal">Models that solved it</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {s.tasks.map((t) => (
                    <tr key={t.instance_id} className="hover:bg-white/[0.02]">
                      <td className="max-w-md px-5 py-3">
                        <Link href={`/review/${t.instance_id}`} className="block truncate hover:text-human">
                          {t.title}
                        </Link>
                        <div className="font-mono text-[11px] text-faint">{t.instance_id}</div>
                      </td>
                      <td className="px-3 py-3">
                        <PhaseBadge phase={t.you} />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted">{formatDuration(t.elapsed_ms)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <RateBar p={t.models_total ? t.models_solved / t.models_total : 0} ci={null} tone="ai" className="w-32" />
                          <span className="font-mono text-xs text-muted">
                            {t.models_solved}/{t.models_total}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SharePanel />
            <Card className="flex flex-col justify-between gap-4 p-5">
              <div>
                <div className="text-sm font-medium">Keep going</div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Every extra task narrows your interval and adds to the human baseline. There are{" "}
                  {s.progress.total - s.progress.attempted} left.
                </p>
              </div>
              <LinkButton href="/play" variant="primary" className="self-start">
                Next task →
              </LinkButton>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function TaskMiniList({ rows, empty }: { rows: UserSummary["tasks"]; empty: string }) {
  if (rows.length === 0) return <div className="mt-3 text-xs text-faint">{empty}</div>;
  return (
    <ul className="mt-3 space-y-2">
      {rows.slice(0, 6).map((t) => (
        <li key={t.instance_id} className="flex items-center justify-between gap-3 text-sm">
          <Link href={`/review/${t.instance_id}`} className="truncate hover:text-human">
            <span className="font-mono text-xs text-muted">{shortId(t.instance_id)}</span> {t.title}
          </Link>
          <Pill>
            {t.models_solved}/{t.models_total} models
          </Pill>
        </li>
      ))}
    </ul>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-12 text-sm text-muted">
      <div className="flex items-center gap-2">
        <Spinner /> {children}
      </div>
    </div>
  );
}
