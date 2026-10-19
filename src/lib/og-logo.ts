import { readFile } from "node:fs/promises";
import path from "node:path";

/** The site icon as a data URI, so Satori can embed it in the share images. */
export async function ogLogoDataUri() {
  const png = await readFile(path.join(process.cwd(), "public", "icon.png"));
  return `data:image/png;base64,${png.toString("base64")}`;
}
