"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { formatClock } from "@/lib/format";

/** Counts down to a server deadline (corrected for clock skew) and fires onExpire once. */
export function Timer({
  deadline,
  offsetMs,
  totalMs,
  onExpire,
}: {
  deadline: number;
  offsetMs: number;
  totalMs: number;
  onExpire: () => void;
}) {
  const [left, setLeft] = useState(() => deadline - (Date.now() + offsetMs));
  const fired = useRef(false);
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const tick = () => {
      const l = deadline - (Date.now() + offsetMs);
      setLeft(l);
      if (l <= 0 && !fired.current) {
        fired.current = true;
        expire.current();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline, offsetMs]);

  const frac = Math.max(0, Math.min(1, left / totalMs));
  const tone = left <= 60_000 ? "fail" : left <= 3 * 60_000 ? "warn" : "fg";
  return (
    <div className="flex items-center gap-2" data-testid="timer" role="timer" aria-live="off">
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <div
          className={cx(
            "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300",
            tone === "fail" ? "bg-fail" : tone === "warn" ? "bg-warn" : "bg-human",
          )}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
      <span
        className={cx(
          "w-12 font-mono text-sm font-semibold tabular-nums",
          tone === "fail" ? "animate-pulse text-fail" : tone === "warn" ? "text-warn" : "text-fg",
        )}
      >
        {formatClock(left)}
      </span>
    </div>
  );
}
