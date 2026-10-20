import { readFile } from "node:fs/promises";
import path from "node:path";
import { GENERIC, MARKS, fillFor, type Mark } from "@/components/model-logo";

// Satori can't resolve currentColor, so monochrome marks get the card's text color.
const INK = "#ececf1";

async function markDataUri(mark: Mark) {
  if ("src" in mark) {
    const png = await readFile(path.join(process.cwd(), "public", mark.src));
    return `data:image/png;base64,${png.toString("base64")}`;
  }
  const svg =
    "path" in mark
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox ?? "0 0 24 24"}"><path d="${mark.path}" fill="${fillFor(mark, INK)}"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}">${mark.shapes
          .map((s) => {
            const fill = s.fill === "currentColor" ? INK : s.fill;
            return `<path d="${s.d}" fill="${fill}"${mark.evenodd ? ' fill-rule="evenodd"' : ""}/>`;
          })
          .join("")}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** The vendor mark for an org as a data URI for Satori. Unknown or missing orgs get the generic placeholder. */
export function ogModelLogo(org: string | null | undefined) {
  const key = typeof org === "string" ? org.trim().toLowerCase() : undefined;
  return markDataUri(key ? (MARKS[key] ?? GENERIC) : GENERIC);
}
