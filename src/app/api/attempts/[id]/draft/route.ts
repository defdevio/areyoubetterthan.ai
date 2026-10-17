import { handle, requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { assertSameOrigin, readJson } from "@/lib/errors";
import { saveDraft } from "@/lib/game";

export async function PUT(req: Request, ctx: RouteContext<"/api/attempts/[id]/draft">) {
  return handle(async () => {
    assertSameOrigin(req, config.appUrl);
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await readJson<{ diff?: unknown; paste_events?: unknown }>(req, config.limits.maxDiffBytes + 64 * 1024);
    return saveDraft(user, id, body.diff, body.paste_events);
  });
}
