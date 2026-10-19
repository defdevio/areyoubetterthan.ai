import { describe, expect, it } from "vitest";
import { shareTargets } from "@/lib/share-links";

const url = "https://areyoubetterthan.ai/r/abc123";
const message = "Are you better than AI?";

function hrefOf(id: string) {
  const t = shareTargets({ url, message }).find((x) => x.id === id);
  if (!t) throw new Error(`missing ${id}`);
  return new URL(t.href);
}

describe("shareTargets", () => {
  it("encodes the page url for url-based networks", () => {
    expect(hrefOf("reddit").searchParams.get("url")).toBe(url);
    expect(hrefOf("reddit").searchParams.get("title")).toBe(message);
    expect(hrefOf("facebook").searchParams.get("u")).toBe(url);
    expect(hrefOf("linkedin").searchParams.get("url")).toBe(url);
    expect(hrefOf("x").searchParams.get("url")).toBe(url);
    expect(hrefOf("x").searchParams.get("text")).toBe(message);
  });

  it("puts the url in the text for text-only networks", () => {
    for (const id of ["threads", "bluesky", "whatsapp"]) {
      expect(hrefOf(id).searchParams.get("text")).toBe(`${message} ${url}`);
    }
  });

  it("builds a mailto link with subject and body", () => {
    const t = shareTargets({ url, message }).find((x) => x.id === "email");
    expect(t?.href.startsWith("mailto:?")).toBe(true);
    expect(new URLSearchParams(t!.href.split("?")[1]).get("body")).toBe(`${message} ${url}`);
  });

  it("does not include Instagram, which has no web share URL", () => {
    expect(shareTargets({ url, message }).some((t) => t.label.toLowerCase().includes("instagram"))).toBe(false);
  });
});
