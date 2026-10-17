import { handle, requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { assertSameOrigin, HttpError, readJson } from "@/lib/errors";
import { startAttempt } from "@/lib/game";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req, config.appUrl);
    const user = await requireUser();
    const body = await readJson<{ instance_id?: string }>(req);
    if (typeof body.instance_id !== "string") throw new HttpError(400, "instance_id is required.");
    return startAttempt(user, body.instance_id);
  });
}
