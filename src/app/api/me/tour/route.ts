import { eq, isNull, and } from "drizzle-orm";
import { handle, requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { assertSameOrigin } from "@/lib/errors";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req, config.appUrl);
    const user = await requireUser();
    const db = await getDb();
    await db
      .update(users)
      .set({ tourCompletedAt: new Date() })
      .where(and(eq(users.id, user.id), isNull(users.tourCompletedAt)));
    return { ok: true };
  });
}
