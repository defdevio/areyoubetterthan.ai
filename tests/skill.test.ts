import { describe, expect, it } from "vitest";
import { difficulty, expectedRate, fitTheta, populationTheta, thetaSd, type Observation } from "@/lib/skill";

// A spread of difficulties like the real task set: most tasks are easy for models.
const B = Array.from({ length: 100 }, (_, i) => difficulty(Math.round(15 + (i / 99) * 70), 86));
const median = B[50];
const record = (k: number, n: number, b = median): Observation[] =>
  Array.from({ length: n }, (_, i) => ({ b, solved: i < k }));
const skill = (obs: Observation[], mean = -1) => expectedRate(fitTheta(obs, mean), B);

describe("skill model", () => {
  it("rates harder tasks as harder", () => {
    expect(difficulty(10, 86)).toBeGreaterThan(difficulty(80, 86));
    expect(Number.isFinite(difficulty(0, 86))).toBe(true);
    expect(Number.isFinite(difficulty(86, 86))).toBe(true);
  });

  it("stays at the prior with no data", () => {
    expect(fitTheta([], -0.7)).toBeCloseTo(-0.7, 9);
  });

  it("doesn't let a lucky short record beat a long strong one", () => {
    expect(skill(record(1, 1))).toBeLessThan(skill(record(40, 50)));
    expect(skill(record(2, 2))).toBeLessThan(skill(record(40, 50)));
  });

  it("rewards solving harder tasks", () => {
    const hard = B.slice(0, 5);
    const easy = B.slice(-5);
    const onHard = hard.map((b, i) => ({ b, solved: i < 3 }));
    const onEasy = easy.map((b, i) => ({ b, solved: i < 3 }));
    expect(skill(onHard)).toBeGreaterThan(skill(onEasy) + 0.1);
  });

  it("goes up with each extra solve and narrows with more data", () => {
    const rates = [0, 1, 2, 3, 4, 5].map((k) => skill(record(k, 5)));
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    const few = record(3, 5);
    const many = record(30, 50);
    expect(thetaSd(fitTheta(many, -1), many)).toBeLessThan(thetaSd(fitTheta(few, -1), few));
  });

  it("is on a 0–1 scale and approaches the extremes with long records", () => {
    expect(skill(record(100, 100))).toBeGreaterThan(0.9);
    expect(skill(record(0, 100))).toBeLessThan(0.15);
    expect(skill(record(50, 100))).toBeGreaterThan(0);
  });

  it("centres the population prior on how humans actually did", () => {
    const weak = populationTheta(record(10, 100));
    const strong = populationTheta(record(90, 100));
    expect(weak).toBeLessThan(strong);
    // Before anyone plays the prior sits at the typical model.
    expect(populationTheta([])).toBe(0);
  });
});
