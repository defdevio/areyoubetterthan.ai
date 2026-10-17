import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { FIXTURES } from "@/lib/tasks";

/** Serves the synthetic e2e fixture bundles (gzipped like the real ones). Fixture mode only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/dev/bundles/[file]">) {
  if (!FIXTURES) return new Response("not found", { status: 404 });
  const { file } = await ctx.params;
  const m = /^([A-Za-z0-9_.-]+)\.json\.gz$/.exec(file);
  if (!m || m[1].includes("..")) return new Response("not found", { status: 404 });
  try {
    const json = await readFile(path.join(process.cwd(), "e2e/fixtures/bundles", `${m[1]}.json`));
    return new Response(gzipSync(json), { headers: { "content-type": "application/gzip" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
