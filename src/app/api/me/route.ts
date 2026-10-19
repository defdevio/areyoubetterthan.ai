import { eq } from "drizzle-orm";
import { getCurrentUser, handle } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { shares } from "@/lib/db/schema";
import { leaderboardSettings } from "@/lib/leaderboard";

export async function GET() {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return { user: null, tour_completed: false, dev_login: config.devLogin };
    const db = await getDb();
    const [share] = await db.select().from(shares).where(eq(shares.userId, user.id));
    return {
      user: { id: user.id, login: user.login, name: user.name, avatar_url: user.avatarUrl },
      share: share ? { id: share.id, display_name: share.displayName, public: share.public } : null,
      leaderboard: leaderboardSettings(user),
      tour_completed: user.tourCompletedAt !== null,
      dev_login: config.devLogin,
    };
  });
}
