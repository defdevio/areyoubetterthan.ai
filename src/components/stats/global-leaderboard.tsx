"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import type { BoardRow } from "@/lib/results";
import { pct, type Rate } from "@/lib/stats";

type Source = "vals" | "swe";
type SortKey = "h2h" | "all" | "published" | "time" | "cost";

export interface HumanSummary {
  unlocked: boolean;
  attempts: number;
  minAttempts: number;
  pooled: Rate;
  meanTimeMs: number | null;
}

type Row = BoardRow & { isHuman?: boolean };

function Header({
  k,
  sort,
  onSort,
  children,
  title,
}: {
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <th className="px-3 py-2 text-right font-normal whitespace-nowrap" title={title}>
      <button onClick={() => onSort(k)} className={cx("hover:text-fg", sort === k && "text-fg")}>
        {children}
        {sort === k ? (k === "time" || k === "cost" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function RateCell({ r, showCount }: { r: Rate | null; showCount: boolean }) {
  if (!r || r.n === 0) return <span className="text-faint">–</span>;
  return (
    <span title={r.ci ? `${r.k}/${r.n} · 95% CI ${pct(r.ci[0])}–${pct(r.ci[1])}` : undefined}>
      {pct(r.p, 1)}
      {showCount && (
        <span className="ml-1.5 text-faint">
          {r.k}/{r.n}
        </span>
      )}
    </span>
  );
}

function money(v: number) {
  return `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`;
}

/** The global table: every model, and humans as one more competitor once there's enough data. */
export function GlobalLeaderboard({
  boards,
  humans,
  totalTasks,
}: {
  boards: { vals: BoardRow[]; swe: BoardRow[] };
  humans: HumanSummary;
  totalTasks: number;
}) {
  const [source, setSource] = useState<Source>("vals");
  const [sort, setSort] = useState<SortKey>(humans.unlocked ? "h2h" : "all");
  const [showAll, setShowAll] = useState(false);
  const rows = boards[source];
  const vals = source === "vals";

  const ranked = useMemo(() => {
    const list: Row[] = [...rows];
    if (humans.unlocked) {
      list.push({
        id: "__humans",
        model: "Humans (pooled)",
        org: null,
        agent: "",
        bashOnly: false,
        source: "vals",
        published_pct: null,
        published_stderr: null,
        published_scope: "band",
        latency_s: humans.meanTimeMs === null ? null : humans.meanTimeMs / 1000,
        cost_usd: null,
        all: { k: 0, n: 0, p: null, ci: null },
        h2h: humans.pooled,
        isHuman: true,
      });
    }
    // Lower is better for every key; null sinks to the bottom.
    const value = (r: Row): number => {
      switch (sort) {
        case "h2h":
          return -(r.h2h?.p ?? -1);
        case "all":
          return r.isHuman ? -(humans.pooled.p ?? -1) : -(r.all.p ?? -1);
        case "published":
          return -(r.published_pct ?? -1);
        case "time":
          return r.latency_s ?? Infinity;
        case "cost":
          return r.isHuman ? -1 : (r.cost_usd ?? Infinity);
      }
    };
    list.sort(
      (a, b) =>
        value(a) - value(b) ||
        (a.isHuman ? -1 : b.isHuman ? 1 : 0) ||
        (b.published_pct ?? 0) - (a.published_pct ?? 0),
    );
    // Competition ranking: ties share a rank and are shown as "=n".
    let rank = 0;
    return list.map((r, i) => {
      if (i === 0 || value(r) !== value(list[i - 1])) rank = i + 1;
      const tied =
        (i > 0 && value(r) === value(list[i - 1])) || (i < list.length - 1 && value(r) === value(list[i + 1]));
      return { row: r, rank, tied };
    });
  }, [rows, sort, humans]);

  const humanIdx = ranked.findIndex((x) => x.row.isHuman);
  const limit = 15;
  const visible = showAll ? ranked : ranked.filter((_, i) => i < limit || i === humanIdx);

  return (
    <div data-testid="global-leaderboard">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex rounded-lg border border-line p-0.5 text-xs" role="tablist">
          {(
            [
              ["vals", "vals.ai runs · time & cost"],
              ["swe", "SWE-bench leaderboard"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={source === k}
              onClick={() => {
                setSource(k);
                if (k === "swe" && (sort === "time" || sort === "cost")) setSort(humans.unlocked ? "h2h" : "all");
              }}
              className={cx("rounded-md px-3 py-1.5", source === k ? "bg-white/10 text-fg" : "text-muted hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-faint">
          {vals
            ? `${rows.length} models, one bash-only harness, run independently by vals.ai`
            : `${rows.length} models, latest leaderboard result each (bash-only scaffold preferred)`}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-faint">
            <tr className="border-b border-line">
              <th className="w-10 px-3 py-2 text-right font-normal">#</th>
              <th className="px-3 py-2 text-left font-normal">Solver</th>
              {humans.unlocked && (
                <Header k="h2h" sort={sort} onSort={setSort} title="Scored on exactly the attempts humans made">
                  Head-to-head
                </Header>
              )}
              <Header k="all" sort={sort} onSort={setSort}>
                All {totalTasks} tasks
              </Header>
              <Header
                k="published"
                sort={sort}
                onSort={setSort}
                title={
                  vals
                    ? "vals.ai accuracy on all 194 “<15 min fix” tasks, ± standard error"
                    : "Published % resolved on all 500 SWE-bench Verified tasks"
                }
              >
                {vals ? "Published (<15 min band)" : "Published (all 500)"}
              </Header>
              {vals && (
                <>
                  <Header k="time" sort={sort} onSort={setSort}>
                    Avg time / task
                  </Header>
                  <Header k="cost" sort={sort} onSort={setSort}>
                    Cost / task
                  </Header>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {!humans.unlocked && (
              <tr className="bg-human/[0.06]" data-testid="humans-locked-row">
                <td className="px-3 py-2.5 text-right font-mono text-[11px] text-human">?</td>
                <td className="px-3 py-2.5" colSpan={vals ? 5 : 3}>
                  <span className="font-semibold text-human">Humans</span>
                  <span className="ml-3 text-xs text-muted">
                    ranked once {humans.minAttempts} {humans.minAttempts === 1 ? "attempt is" : "attempts are"} scored ·{" "}
                    {humans.attempts}/{humans.minAttempts} so far ·{" "}
                    <Link href="/play" className="text-human hover:underline">
                      add yours →
                    </Link>
                  </span>
                  <div className="mt-1.5 h-1 w-48 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-human"
                      style={{ width: `${Math.min(100, (humans.attempts / humans.minAttempts) * 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            )}
            {visible.map(({ row: r, rank, tied }) => (
              <tr key={r.id} className={cx(r.isHuman ? "bg-human/10" : "hover:bg-white/[0.02]")} data-human={r.isHuman || undefined}>
                <td className={cx("px-3 py-2 text-right font-mono text-[11px]", r.isHuman ? "text-human" : "text-faint")}>
                  {tied ? `=${rank}` : rank}
                </td>
                <td className="max-w-72 truncate px-3 py-2">
                  <span className={cx(r.isHuman && "font-semibold text-human")}>{r.model}</span>
                  {!r.isHuman && (
                    <span className="ml-2 text-[11px] text-faint">
                      {vals ? (r.org ?? "") : r.bashOnly ? "mini-SWE-agent" : r.agent}
                    </span>
                  )}
                </td>
                {humans.unlocked && (
                  <td className={cx("px-3 py-2 text-right font-mono text-xs", r.isHuman ? "text-human" : "text-muted")}>
                    <RateCell r={r.h2h} showCount />
                  </td>
                )}
                <td className="px-3 py-2 text-right font-mono text-xs text-muted">
                  {r.isHuman ? (
                    <span className="text-faint" title="Humans haven't attempted every task yet">
                      –
                    </span>
                  ) : (
                    <RateCell r={r.all} showCount={false} />
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-muted">
                  {r.published_pct === null ? (
                    <span className="text-faint">–</span>
                  ) : (
                    <>
                      {r.published_pct.toFixed(1)}%
                      {r.published_stderr !== null && <span className="text-faint"> ±{r.published_stderr.toFixed(1)}</span>}
                    </>
                  )}
                </td>
                {vals && (
                  <>
                    <td className={cx("px-3 py-2 text-right font-mono text-xs", r.isHuman ? "text-human" : "text-muted")}>
                      {r.latency_s === null ? <span className="text-faint">–</span> : formatDuration(r.latency_s * 1000)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted">
                      {r.isHuman ? "free" : r.cost_usd === null ? "–" : money(r.cost_usd)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ranked.length > limit && (
        <button onClick={() => setShowAll((v) => !v)} className="px-5 py-3 text-xs text-faint hover:text-fg">
          {showAll ? "Show fewer" : `Show all ${rows.length} models`}
        </button>
      )}
      <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-faint">
        <strong className="font-medium text-muted">Head-to-head</strong> scores each model on exactly the attempts humans made
        (a task three people tried counts three times), so it&apos;s directly comparable to the pooled human rate.{" "}
        <strong className="font-medium text-muted">All {totalTasks} tasks</strong> is each model on the whole task set.{" "}
        <span className="font-mono">=</span> marks a tie on the sorted column; tied rows are ordered by published accuracy.{" "}
        {vals ? (
          <>
            Published accuracy, time and cost are{" "}
            <a
              href="https://www.vals.ai/benchmarks/swebench"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              vals.ai
            </a>
            &apos;s figures for the “&lt;15 min fix” band our tasks come from. Human time is capped at 15 minutes and includes
            reading the issue; model time includes API latency.
          </>
        ) : (
          <>Published is each submission&apos;s % resolved on all 500 SWE-bench Verified tasks.</>
        )}
      </p>
    </div>
  );
}
