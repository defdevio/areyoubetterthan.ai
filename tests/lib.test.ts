import { describe, expect, it } from "vitest";
import { computeFlags, sanitizePasteEvents } from "@/lib/flags";
import { newId } from "@/lib/ids";
import { nextTask, taskOrder } from "@/lib/order";
import { clearlyDifferent, rate, wilson } from "@/lib/stats";
import { verifySignature } from "@/lib/github/webhook";
import { createHmac } from "node:crypto";
import { apportion, selectTasks } from "../scripts/select-tasks";
import type { Candidate } from "@/lib/data-types";

describe("wilson", () => {
  it("matches reference values", () => {
    const [lo, hi] = wilson(5, 10)!;
    expect(lo).toBeCloseTo(0.2366, 3);
    expect(hi).toBeCloseTo(0.7634, 3);
    const [lo0, hi0] = wilson(0, 10)!;
    expect(lo0).toBe(0);
    expect(hi0).toBeCloseTo(0.2775, 3);
    const [lo1, hi1] = wilson(10, 10)!;
    expect(lo1).toBeCloseTo(0.7225, 3);
    expect(hi1).toBe(1);
  });
  it("handles n = 0", () => {
    expect(wilson(0, 0)).toBeNull();
    expect(rate(0, 0)).toEqual({ k: 0, n: 0, p: null, ci: null });
  });
  it("flags clearly different rates only when intervals are disjoint", () => {
    expect(clearlyDifferent(rate(1, 20), rate(19, 20))).toBe(true);
    expect(clearlyDifferent(rate(4, 10), rate(6, 10))).toBe(false);
  });
});

describe("task order", () => {
  const ids = Array.from({ length: 100 }, (_, i) => `repo__repo-${i}`);
  it("is a deterministic permutation", () => {
    const a = taskOrder(ids, 42);
    expect(a).toEqual(taskOrder([...ids].reverse(), 42));
    expect(new Set(a).size).toBe(100);
    expect(taskOrder(ids, 43)).not.toEqual(a);
  });
  it("spreads first tasks across users", () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 2000; seed++) {
      const first = taskOrder(ids, seed)[0];
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(90);
    expect(Math.max(...counts.values())).toBeLessThan(50);
  });
  it("skips done tasks", () => {
    const order = taskOrder(ids, 7);
    expect(nextTask(ids, 7, new Set(order.slice(0, 3)))).toBe(order[3]);
    expect(nextTask(ids, 7, new Set(ids))).toBeNull();
  });
});

describe("flags", () => {
  it("flags large external pastes and fast submits, not internal pastes", () => {
    expect(computeFlags({ pasteEvents: [{ t: 1, chars: 900, lines: 20, external: false }], elapsedMs: 300_000, linesChanged: 10 })).toEqual([]);
    expect(computeFlags({ pasteEvents: [{ t: 1, chars: 500, lines: 20, external: true }], elapsedMs: 300_000, linesChanged: 10 })).toEqual(["large_external_paste"]);
    expect(computeFlags({ pasteEvents: Array(5).fill({ t: 1, chars: 250, lines: 2, external: true }), elapsedMs: 300_000, linesChanged: 10 })).toEqual(["heavy_external_paste"]);
    expect(computeFlags({ pasteEvents: [], elapsedMs: 20_000, linesChanged: 6 })).toEqual(["fast_submit"]);
    expect(computeFlags({ pasteEvents: [], elapsedMs: 20_000, linesChanged: 2 })).toEqual([]);
  });
  it("sanitizes untrusted paste events", () => {
    const out = sanitizePasteEvents([{ t: -5, chars: 1e9, lines: 2, external: true, file: "x".repeat(500) }, "junk", { t: "x" }], 900_000);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ t: 0, chars: 1_000_000, external: true });
    expect(out[0].file).toHaveLength(300);
    expect(sanitizePasteEvents("nope", 1)).toEqual([]);
  });
});

describe("ids", () => {
  it("are lowercase alphanumeric and unique", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId(16)));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{16}$/);
  });
});

describe("webhook signature", () => {
  it("verifies HMAC-SHA256", () => {
    const body = '{"a":1}';
    const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
    expect(verifySignature("s3cret", body, sig)).toBe(true);
    expect(verifySignature("s3cret", body + " ", sig)).toBe(false);
    expect(verifySignature("other", body, sig)).toBe(false);
    expect(verifySignature("s3cret", body, null)).toBe(false);
  });
});

describe("task selection", () => {
  it("apportions by repo with at least one per repo", () => {
    const alloc = apportion({ django: 92, sympy: 25, flask: 1, pylint: 3 }, 50);
    expect(Object.values(alloc).reduce((a, b) => a + b, 0)).toBe(50);
    expect(alloc.flask).toBe(1);
    expect(alloc.django).toBeGreaterThan(alloc.sympy);
  });
  it("is deterministic and respects the target", () => {
    const cands = Array.from({ length: 30 }, (_, i) => ({ instance_id: `r${i % 3}__r-${i}`, repo: `r${i % 3}` }) as Candidate);
    const a = selectTasks(cands, 10).map((c) => c.instance_id);
    expect(a).toHaveLength(10);
    expect(selectTasks([...cands].reverse(), 10).map((c) => c.instance_id)).toEqual(a);
  });
});

describe("model comparison set", async () => {
  const { comparisonEntries, modelKey } = await import("@/lib/models");
  it("treats word-order variants as the same model", () => {
    expect(modelKey("Claude Opus 4.5")).toBe(modelKey("Claude 4.5 Opus"));
    expect(modelKey("GPT-5")).toBe(modelKey("GPT 5"));
    expect(modelKey("GPT-5")).not.toBe(modelKey("GPT 5 mini"));
  });
  it("keeps one entry per model, prefers bash-only, and drops multi-model systems", () => {
    const def = comparisonEntries("default");
    const all = comparisonEntries("all");
    expect(def.length).toBeLessThan(all.length);
    expect(def.some((e) => e.multi_model)).toBe(false);
    const keys = def.map((e) => modelKey(e.model));
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of def) {
      const rivals = all.filter((o) => !o.multi_model && modelKey(o.model) === modelKey(e.model));
      if (rivals.some((o) => o.bash_only)) expect(e.bash_only).toBe(true);
      const sameScaffold = rivals.filter((o) => o.bash_only === e.bash_only);
      expect(sameScaffold.every((o) => o.date <= e.date)).toBe(true);
    }
  });
});
