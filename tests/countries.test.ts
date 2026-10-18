import { describe, expect, it } from "vitest";
import { COUNTRIES, countryName, isCountryCode } from "@/lib/countries";

describe("countries", () => {
  it("lists the 249 officially assigned ISO 3166-1 codes once each", () => {
    expect(COUNTRIES).toHaveLength(249);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(249);
  });

  it("accepts assigned codes and rejects anything else", () => {
    expect(isCountryCode("US")).toBe(true);
    expect(isCountryCode("us")).toBe(false);
    expect(isCountryCode("EU")).toBe(false);
    expect(isCountryCode("XK")).toBe(false);
    expect(isCountryCode("")).toBe(false);
    expect(isCountryCode(null)).toBe(false);
  });

  it("resolves English names and sorts by them", () => {
    expect(countryName("JP")).toBe("Japan");
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });
});
