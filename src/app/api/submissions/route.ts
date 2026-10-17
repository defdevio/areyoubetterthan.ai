import { after } from "next/server";
import { handle, requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { assertSameOrigin, HttpError, readJson } from "@/lib/errors";
import { submitAttempt } from "@/lib/game";
import { pumpQueue } from "@/lib/scoring/service";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req, config.appUrl);
    const user = await requireUser();
    const body = await readJson<{ attempt_id?: string; diff?: unknown; paste_events?: unknown }>(
      req,
      config.limits.maxDiffBytes + 64 * 1024,
    );
    if (typeof body.attempt_id !== "string") throw new HttpError(400, "attempt_id is required.");
    const result = await submitAttempt(user, body.attempt_id, body.diff, body.paste_events);
    // Opening the PR takes a few GitHub API calls; don't make the user wait for it.
    if (result.submission_id) after(() => pumpQueue().catch((e) => console.error("[scoring] pump", e)));
    return result;
  });
}
