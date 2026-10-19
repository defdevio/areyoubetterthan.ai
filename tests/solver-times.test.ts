import { describe, expect, it } from "vitest";
import { solverTimes } from "@/lib/models";
import { taskIds } from "@/lib/tasks";

describe("solverTimes", () => {
  it("reports average and fastest vals.ai solver time, or nothing when no solver has a time", () => {
    let withTimes = 0;
    for (const id of taskIds) {
      const t = solverTimes(id);
      if (t.timed === 0) {
        expect(t).toEqual({ avg_s: null, fastest_s: null, timed: 0 });
        continue;
      }
      withTimes++;
      expect(t.fastest_s).not.toBeNull();
      expect(t.avg_s).not.toBeNull();
      expect(t.fastest_s!).toBeGreaterThan(0);
      expect(t.fastest_s!).toBeLessThanOrEqual(t.avg_s!);
    }
    expect(withTimes).toBeGreaterThan(0);
  });
});
