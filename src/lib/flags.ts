import type { PasteEvent } from "@/lib/db/schema";

export const FLAG_RULES = {
  /** A single paste from outside the workspace at least this long. */
  largeExternalPaste: 400,
  /** Total characters pasted from outside the workspace. */
  totalExternalPaste: 1000,
  /** Non-trivial patch submitted faster than a human could read the issue. */
  fastSubmitMs: 45_000,
  fastSubmitMinLines: 4,
} as const;

export const FLAG_LABELS: Record<string, string> = {
  large_external_paste: "Large paste from outside the workspace",
  heavy_external_paste: "Lots of text pasted from outside the workspace",
  fast_submit: "Non-trivial patch submitted within 45 seconds",
};

/**
 * Honor-system flags. Nothing is blocked: flagged attempts are still scored and shown to
 * the user, but are left out of aggregate "all humans" statistics.
 */
export function computeFlags(input: {
  pasteEvents: PasteEvent[];
  elapsedMs: number;
  linesChanged: number;
}): string[] {
  const flags: string[] = [];
  const external = input.pasteEvents.filter((e) => e.external);
  if (external.some((e) => e.chars >= FLAG_RULES.largeExternalPaste)) flags.push("large_external_paste");
  else if (external.reduce((a, e) => a + e.chars, 0) >= FLAG_RULES.totalExternalPaste) {
    flags.push("heavy_external_paste");
  }
  if (input.elapsedMs < FLAG_RULES.fastSubmitMs && input.linesChanged >= FLAG_RULES.fastSubmitMinLines) {
    flags.push("fast_submit");
  }
  return flags;
}

export function sanitizePasteEvents(raw: unknown, attemptMs: number): PasteEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 500).flatMap((e): PasteEvent[] => {
    if (!e || typeof e !== "object") return [];
    const o = e as Record<string, unknown>;
    const t = Number(o.t);
    const chars = Number(o.chars);
    const lines = Number(o.lines);
    if (![t, chars, lines].every(Number.isFinite)) return [];
    return [
      {
        t: Math.max(0, Math.min(attemptMs + 60_000, Math.round(t))),
        chars: Math.max(0, Math.min(1_000_000, Math.round(chars))),
        lines: Math.max(0, Math.min(100_000, Math.round(lines))),
        external: o.external !== false,
        file: typeof o.file === "string" ? o.file.slice(0, 300) : undefined,
      },
    ];
  });
}
