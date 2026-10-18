import { describe, expect, it } from "vitest";
import { cleanDisplayName } from "@/lib/display-name";

describe("cleanDisplayName", () => {
  it("accepts ordinary names and trims whitespace", () => {
    expect(cleanDisplayName("  Priya   S. ")).toBe("Priya S.");
    expect(cleanDisplayName("Maximilian Okonkwo-Vasquez")).toBe("Maximilian Okonkwo-Vasquez");
  });

  it("allows names that contain a profane substring", () => {
    expect(cleanDisplayName("Emily Dickinson")).toBe("Emily Dickinson");
    expect(cleanDisplayName("Cassandra")).toBe("Cassandra");
  });

  it("rejects profanity, including leetspeak and spacing tricks", () => {
    expect(() => cleanDisplayName("fuck")).toThrow();
    expect(() => cleanDisplayName("f u c k")).toThrow();
    expect(() => cleanDisplayName("sh1t")).toThrow();
  });

  it("rejects empty names", () => {
    expect(() => cleanDisplayName("   ")).toThrow();
    expect(() => cleanDisplayName(42)).toThrow();
  });
});
