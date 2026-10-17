"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, cx, SortSelect } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { CATEGORIES, CATEGORY_LABEL, type Category, type MetricsSummary } from "@/lib/metrics";
import { pct, type Rate } from "@/lib/stats";

export const CATEGORY_COLOR: Record<Category, string> = {
  resolved: "bg-pass",
  regression: "bg-[#a3e635]",
  partial_fix: "bg-warn",
  wrong_fix: "bg-fail",
  did_not_apply: "bg-[#c084fc]",
  no_patch: "bg-faint",
  other: "bg-line-strong",
};

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-[11px] leading-snug text-muted">{hint}</div>
    </Card>
  );
}

export function MetricTiles({ m, who = "you" }: { m: MetricsSummary; who?: "you" | "humans" }) {
  const you = who === "you";
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="metric-tiles">
      <Tile
        label="Median time per task"
        value={formatDuration(m.median_time_ms)}
        hint={`Mean ${formatDuration(m.mean_time_ms)}. Running out the clock counts as 15:00.`}
      />
      <Tile
        label="Median time to a correct fix"
        value={formatDuration(m.median_time_resolved_ms)}
        hint="Only tasks that were resolved."
      />
      <Tile
        label="Bug tests passing"
        value={pct(m.bug_tests_passed)}
        hint="Average share of each task's FAIL_TO_PASS tests that pass. Partial credit; no patch counts as 0."
      />
      <Tile
        label="Found the right file"
        value={pct(m.right_file_rate)}
        hint={`Patches that changed a file the upstream fix changed. File-level F1 ${m.mean_file_f1 === null ? "–" : m.mean_file_f1.toFixed(2)}.${
          m.median_patch_ratio !== null ? ` ${you ? "Your" : "Typical"} patch is ${m.median_patch_ratio.toFixed(1)}× the reference's size.` : ""
        }`}
      />
    </div>
  );
}

export function OutcomeBar({ categories }: { categories: Record<Category, number> }) {
  const total = CATEGORIES.reduce((a, c) => a + categories[c], 0);
  if (!total) return null;
  const present = CATEGORIES.filter((c) => categories[c] > 0);
  return (
    <div data-testid="outcome-bar">
      <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
        {present.map((c) => (
          <div
            key={c}
            className={CATEGORY_COLOR[c]}
            style={{ width: `${(categories[c] / total) * 100}%` }}
            title={`${CATEGORY_LABEL[c]}: ${categories[c]}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {present.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className={cx("size-2 rounded-full", CATEGORY_COLOR[c])} />
            {CATEGORY_LABEL[c]} <span className="font-mono text-faint">{categories[c]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Share of attempts resolved within N minutes, N = 1..15. */
export function SolveCurve({
  series,
  markers = [],
}: {
  series: { label: string; values: number[]; tone: "human" | "ai" | "muted" }[];
  /** Vertical reference lines in minutes, e.g. model average times. */
  markers?: { label: string; minutes: number }[];
}) {
  // Drawn at the container's real pixel width so labels stay legible on phones instead of being scaled down.
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 180;
  const P = { l: 34, r: 10, t: 10, b: 24 };
  const x = (min: number) => P.l + ((min - 0) / 15) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - v * (H - P.t - P.b);
  const stroke = { human: "#fbbf24", ai: "#818cf8", muted: "#6b6b78" };
  return (
    <div ref={ref}>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Solve rate by minute" data-testid="solve-curve">
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#ffffff10" />
          <text x={P.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#6b6b78">
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      {[0, 5, 10, 15].map((m) => (
        <text key={m} x={x(m)} y={H - 8} textAnchor="middle" fontSize="9" fill="#6b6b78">
          {m}m
        </text>
      ))}
      {markers
        .filter((mk) => mk.minutes > 0 && mk.minutes <= 15)
        .map((mk, i) => (
          <g key={mk.label}>
            <line x1={x(mk.minutes)} x2={x(mk.minutes)} y1={P.t} y2={H - P.b} stroke="#818cf855" strokeDasharray="3 3" />
            {/* Alternate rows so neighbouring labels don't overlap on narrow charts. */}
            <text x={x(mk.minutes) + 3} y={P.t + 9 + (i % 2) * 12} fontSize="9" fill="#818cf8">
              {mk.label}
            </text>
          </g>
        ))}
      {series.map((s) => (
        <polyline
          key={s.label}
          fill="none"
          stroke={stroke[s.tone]}
          strokeWidth={2}
          strokeLinejoin="round"
          points={[`${x(0)},${y(0)}`, ...s.values.map((v, i) => `${x(i + 1)},${y(v)}`)].join(" ")}
        />
      ))}
    </svg>
    </div>
  );
}

export interface SpeedRow {
  id: string;
  model: string;
  org: string | null;
  rate: Rate;
  published_pct: number | null;
  published_stderr: number | null;
  latency_s: number | null;
  cost_usd: number | null;
}

type SortKey = "rate" | "published" | "time" | "cost";

/** "3/3" for small samples, where a bare percentage overstates precision. */
export function fraction(rate: Rate) {
  return `${rate.k}/${rate.n}`;
}

function SortHeader({
  k,
  sort,
  onSort,
  children,
}: {
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  return (
    <th className="hidden px-3 py-2 text-right font-normal lg:table-cell">
      <button onClick={() => onSort(k)} className={cx("hover:text-fg", sort === k && "text-fg")}>
        {children}
        {sort === k ? " ↓" : ""}
      </button>
    </th>
  );
}

type SpeedTableRow = SpeedRow & { isHuman: boolean };

function speedText(k: SortKey, r: SpeedTableRow): string {
  switch (k) {
    case "rate":
      return r.rate.n >= 10 ? `${fraction(r.rate)} ${pct(r.rate.p)}` : fraction(r.rate);
    case "published":
      return r.published_pct === null ? "–" : `${r.published_pct.toFixed(1)}%`;
    case "time":
      return r.latency_s === null ? "–" : formatDuration(r.latency_s * 1000);
    case "cost":
      return r.isHuman ? "free" : r.cost_usd === null ? "–" : `$${r.cost_usd < 0.1 ? r.cost_usd.toFixed(3) : r.cost_usd.toFixed(2)}`;
  }
}

const SPEED_SHORT: Record<SortKey, string> = { rate: "", published: "vals.ai", time: "", cost: "" };

/** You (or all humans) next to vals.ai models: resolve rate on the same tasks, time and cost per task. */
export function SpeedTable({
  human,
  rows,
  limit = 12,
}: {
  human: { label: string; rate: Rate; meanTimeMs: number | null; subsetLabel?: string };
  rows: SpeedRow[];
  limit?: number;
}) {
  const [sort, setSort] = useState<SortKey>("rate");
  const [all, setAll] = useState(false);
  const humanRow = useMemo(
    () => ({
      id: "__human",
      model: human.label,
      org: null,
      rate: human.rate,
      published_pct: null,
      published_stderr: null,
      latency_s: human.meanTimeMs === null ? null : human.meanTimeMs / 1000,
      cost_usd: null,
      isHuman: true,
    }),
    [human],
  );
  const sorted = useMemo(() => {
    const list = [...rows.map((r) => ({ ...r, isHuman: false })), humanRow];
    const key = (r: (typeof list)[number]) =>
      sort === "rate"
        ? -(r.rate.p ?? 0)
        : sort === "published"
          ? -(r.published_pct ?? (r.isHuman ? 100 * (r.rate.p ?? 0) : -1))
          : sort === "time"
            ? (r.latency_s ?? Infinity)
            : (r.cost_usd ?? (r.isHuman ? -1 : Infinity));
    // Ties (common on a handful of tasks) fall back to the published score, humans first.
    return list.sort(
      (a, b) =>
        key(a) - key(b) ||
        (a.isHuman ? -1 : b.isHuman ? 1 : 0) ||
        (b.published_pct ?? 0) - (a.published_pct ?? 0),
    );
  }, [rows, humanRow, sort]);
  const humanIdx = sorted.findIndex((r) => r.isHuman);
  const visible = all ? sorted : sorted.filter((_, i) => i < limit || i === humanIdx);
  const faster = human.meanTimeMs === null ? 0 : rows.filter((r) => r.latency_s !== null && r.latency_s * 1000 > human.meanTimeMs!).length;
  const timed = rows.filter((r) => r.latency_s !== null).length;

  return (
    <div data-testid="speed-table">
      {human.meanTimeMs !== null && (
        <p className="mb-3 text-sm text-muted">
          {human.label === "You" ? "You average" : "Humans average"}{" "}
          <span className="font-mono text-human">{formatDuration(human.meanTimeMs)}</span> per task, faster than{" "}
          <span className="text-fg">
            {faster} of {timed}
          </span>{" "}
          models&apos; average.
        </p>
      )}
      <SortSelect
        value={sort}
        onChange={setSort}
        options={[
          ["rate", human.subsetLabel ?? "On your tasks"],
          ["published", "vals.ai accuracy"],
          ["time", "Avg time / task"],
          ["cost", "Cost / task"],
        ]}
        className="mb-2 lg:hidden"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-faint">
            <tr className="border-b border-line">
              <th className="px-3 py-2 text-left font-normal">Solver</th>
              <th className="px-3 py-2 text-right font-normal lg:hidden">
                {sort === "rate" ? (human.subsetLabel ?? "On your tasks") : sort === "published" ? "vals.ai accuracy" : sort === "time" ? "Avg time" : "Cost"}
              </th>
              <SortHeader k="rate" sort={sort} onSort={setSort}>
                {human.subsetLabel ?? "On your tasks"}
              </SortHeader>
              <SortHeader k="published" sort={sort} onSort={setSort}>
                vals.ai accuracy
              </SortHeader>
              <SortHeader k="time" sort={sort} onSort={setSort}>
                Avg time / task
              </SortHeader>
              <SortHeader k="cost" sort={sort} onSort={setSort}>
                Cost / task
              </SortHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((r) => (
              <tr key={r.id} className={cx(r.isHuman && "bg-human/10")}>
                <td className="max-w-[60vw] px-3 py-1.5 lg:max-w-56">
                  <div className={cx("truncate", r.isHuman && "font-semibold text-human")}>
                    {r.model}
                    {r.org && <span className="ml-2 text-[11px] font-normal text-faint">{r.org}</span>}
                  </div>
                  <div className="font-mono text-[10px] leading-snug text-faint lg:hidden">
                    {(["rate", "published", "time", "cost"] as const)
                      .filter((k) => k !== sort)
                      .map((k) => [k, speedText(k, r)] as const)
                      .filter(([, v]) => v !== "–")
                      .map(([k, v]) => `${SPEED_SHORT[k]} ${v}`.trim())
                      .join(" · ")}
                  </div>
                </td>
                <td
                  className={cx(
                    "px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap lg:hidden",
                    r.isHuman ? "text-human" : "text-fg",
                  )}
                >
                  {speedText(sort, r)}
                </td>
                <td className={cx("hidden px-3 py-1.5 text-right font-mono text-xs lg:table-cell", r.isHuman ? "text-human" : "text-muted")}>
                  {fraction(r.rate)}
                  {r.rate.n >= 10 && <span className="ml-1.5 text-faint">{pct(r.rate.p)}</span>}
                </td>
                <td className="hidden px-3 py-1.5 text-right font-mono text-xs text-muted lg:table-cell">
                  {r.published_pct === null ? (
                    "–"
                  ) : (
                    <>
                      {r.published_pct.toFixed(1)}%
                      {r.published_stderr !== null && (
                        <span className="text-faint"> ±{r.published_stderr.toFixed(1)}</span>
                      )}
                    </>
                  )}
                </td>
                <td className={cx("hidden px-3 py-1.5 text-right font-mono text-xs lg:table-cell", r.isHuman ? "text-human" : "text-muted")}>
                  {r.latency_s === null ? "–" : formatDuration(r.latency_s * 1000)}
                </td>
                <td className="hidden px-3 py-1.5 text-right font-mono text-xs text-muted lg:table-cell">
                  {speedText("cost", r)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button onClick={() => setAll((v) => !v)} className="mt-2 px-3 text-xs text-faint hover:text-fg">
          {all ? "Show fewer" : `Show all ${rows.length} models`}
        </button>
      )}
      <p className="mt-3 px-3 text-[11px] leading-relaxed text-faint">
        The first column is solved / attempted on exactly these tasks; with only a few tasks most strong models solve all of
        them, so ties are ordered by{" "}
        <a href="https://www.vals.ai/benchmarks/swebench" className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
          vals.ai
        </a>
        &apos;s published accuracy (± standard error) on all 194 “&lt;15 min fix” tasks. Times and costs are vals.ai&apos;s
        averages over that same band, run with one bash-only harness and timed from the model&apos;s first step. Human time is
        capped at 15 minutes and includes reading the issue; model time includes API latency.
      </p>
    </div>
  );
}
