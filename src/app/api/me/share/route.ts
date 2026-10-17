import { eq } from "drizzle-orm";
import { handle, requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { shares } from "@/lib/db/schema";
import { assertSameOrigin, HttpError, readJson } from "@/lib/errors";
import { newId } from "@/lib/ids";

function cleanName(v: unknown): string {
  if (typeof v !== "string") throw new HttpError(400, "Display name is required.");
  const name = v.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (name.length < 1) throw new HttpError(400, "Display name is required.");
  return name;
}

export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req, config.appUrl);
    const user = await requireUser();
    const body = await readJson<{ display_name?: unknown; public?: unknown }>(req);
    const displayName = cleanName(body.display_name);
    const isPublic = body.public !== false;
    const db = await getDb();
    const [row] = await db
      .insert(shares)
      .values({ id: newId(10), userId: user.id, displayName, public: isPublic })
      .onConflictDoUpdate({
        target: shares.userId,
        set: { displayName, public: isPublic, updatedAt: new Date() },
      })
      .returning();
    return { id: row.id, display_name: row.displayName, public: row.public, url: `${config.appUrl}/r/${row.id}` };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    assertSameOrigin(req, config.appUrl);
    const user = await requireUser();
    const db = await getDb();
    await db.delete(shares).where(eq(shares.userId, user.id));
    return { ok: true };
  });
}
