import { eq } from "drizzle-orm";
import { handle, requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { cleanDisplayName } from "@/lib/display-name";
import { assertSameOrigin, HttpError, readJson } from "@/lib/errors";
import { leaderboardSettings, type LeaderboardVisibility } from "@/lib/leaderboard";

/** How you appear on the public leaderboard: GitHub login + avatar, a display name, or not at all. */
export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req, config.appUrl);
    const user = await requireUser();
    const body = await readJson<{ visibility?: unknown; name?: unknown }>(req);
    const visibility = body.visibility as LeaderboardVisibility;
    if (!["github", "name", "hidden"].includes(visibility)) throw new HttpError(400, "Unknown visibility.");
    const set =
      visibility === "hidden"
        ? { leaderboardHidden: true }
        : visibility === "name"
          ? { leaderboardHidden: false, leaderboardName: cleanDisplayName(body.name) }
          : { leaderboardHidden: false, leaderboardName: null };
    const db = await getDb();
    const [row] = await db.update(users).set(set).where(eq(users.id, user.id)).returning();
    return leaderboardSettings(row);
  });
}
