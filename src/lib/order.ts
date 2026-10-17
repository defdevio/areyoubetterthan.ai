/** mulberry32: small, fast, deterministic PRNG. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Per-user task order: a seeded Fisher–Yates shuffle of the (sorted) task ids. Each user
 * sees every task exactly once in their own random order, which spreads human coverage
 * evenly across the whole task set instead of piling up on the first few tasks.
 */
export function taskOrder(ids: readonly string[], seed: number): string[] {
  const out = [...ids].sort();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function nextTask(ids: readonly string[], seed: number, done: ReadonlySet<string>): string | null {
  return taskOrder(ids, seed).find((id) => !done.has(id)) ?? null;
}
