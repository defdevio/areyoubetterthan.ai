export interface Rate {
  k: number;
  n: number;
  /** k / n, or null when n = 0 */
  p: number | null;
  /** Wilson 95% interval [lo, hi], or null when n = 0 */
  ci: [number, number] | null;
}

const Z95 = 1.959963984540054;

/** Wilson score interval: well-behaved for small n and p near 0 or 1, unlike the normal approximation. */
export function wilson(k: number, n: number, z = Z95): [number, number] | null {
  if (n <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [k === 0 ? 0 : Math.max(0, center - half), k === n ? 1 : Math.min(1, center + half)];
}

export function rate(k: number, n: number): Rate {
  return { k, n, p: n > 0 ? k / n : null, ci: wilson(k, n) };
}

export function pct(p: number | null | undefined, digits = 0): string {
  if (p === null || p === undefined) return "–";
  return `${(p * 100).toFixed(digits)}%`;
}

/** True when the two 95% intervals do not overlap: a conservative "clearly different". */
export function clearlyDifferent(a: Rate, b: Rate): boolean {
  if (!a.ci || !b.ci) return false;
  return a.ci[1] < b.ci[0] || b.ci[1] < a.ci[0];
}
