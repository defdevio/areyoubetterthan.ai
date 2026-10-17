import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { PHASE_HINT, PHASE_LABEL } from "@/lib/format";
import type { Phase } from "@/lib/results";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const BUTTON = {
  primary:
    "bg-human text-black hover:bg-amber-300 focus-visible:outline-human disabled:bg-human/40 disabled:text-black/60",
  secondary:
    "bg-panel-2 text-fg border border-line-strong hover:border-faint hover:bg-[#1d1d24] disabled:opacity-50",
  ghost: "text-muted hover:text-fg hover:bg-white/5 disabled:opacity-50",
  danger: "bg-fail/15 text-fail border border-fail/30 hover:bg-fail/25 disabled:opacity-50",
};
const SIZE = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON; size?: keyof typeof SIZE }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
        BUTTON[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON; size?: keyof typeof SIZE }) {
  return (
    <Link
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        BUTTON[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-line bg-panel", className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

const PHASE_STYLE: Record<Phase, string> = {
  in_progress: "bg-human/15 text-human border-human/30",
  queued: "bg-white/5 text-muted border-line-strong",
  waiting: "bg-ai/10 text-ai border-ai/30",
  running: "bg-ai/15 text-ai border-ai/40",
  delayed: "bg-warn/10 text-warn border-warn/30",
  attention: "bg-warn/10 text-warn border-warn/30",
  resolved: "bg-pass/15 text-pass border-pass/30",
  unresolved: "bg-fail/15 text-fail border-fail/30",
};

export function PhaseBadge({ phase, queuePosition }: { phase: Phase; queuePosition?: number | null }) {
  const spinning = phase === "waiting" || phase === "running" || phase === "delayed";
  return (
    <span
      title={PHASE_HINT[phase]}
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        PHASE_STYLE[phase],
      )}
    >
      {spinning && <Spinner className="size-2.5 border-[1.5px]" />}
      {phase === "resolved" && "✓"}
      {phase === "unresolved" && "✗"}
      {PHASE_LABEL[phase]}
      {phase === "queued" && queuePosition ? ` · #${queuePosition}` : ""}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[11px] text-muted", className)}>
      {children}
    </span>
  );
}

/** A horizontal bar for a rate with a whisker for its 95% interval. */
export function RateBar({
  p,
  ci,
  tone,
  className,
}: {
  p: number | null;
  ci: [number, number] | null;
  tone: "human" | "ai" | "muted";
  className?: string;
}) {
  const color = tone === "human" ? "bg-human" : tone === "ai" ? "bg-ai/70" : "bg-faint";
  return (
    <div className={cx("relative h-2.5 w-full rounded-full bg-white/[0.06]", className)}>
      {p !== null && <div className={cx("absolute inset-y-0 left-0 rounded-full", color)} style={{ width: `${p * 100}%` }} />}
      {ci && (
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded bg-white/50"
          style={{ left: `${ci[0] * 100}%`, width: `${Math.max(0.5, (ci[1] - ci[0]) * 100)}%` }}
          title={`95% CI ${(ci[0] * 100).toFixed(0)}–${(ci[1] * 100).toFixed(0)}%`}
        />
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>
  );
}

export function Section({ title, children, aside, className }: { title: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={cx("space-y-4", className)}>
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
