import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import { newId, randomSeed } from "@/lib/ids";

export interface GitHubProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export async function upsertUser(profile: GitHubProfile): Promise<User> {
  const db = await getDb();
  const [row] = await db
    .insert(users)
    .values({
      id: newId(),
      githubId: profile.id,
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatar_url,
      seed: randomSeed(),
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.githubId,
      // seed is deliberately not updated: a user's task order is fixed for life.
      set: {
        login: profile.login,
        name: profile.name,
        avatarUrl: profile.avatar_url,
        lastSeenAt: sql`now()`,
      },
    })
    .returning();
  return row;
}

export async function touchUser(id: string) {
  const db = await getDb();
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, id));
}

/** Stable fake GitHub id for dev logins, far above real GitHub ids. */
export function devGithubId(login: string) {
  let h = 0;
  for (const c of login) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 9_000_000_000_000 + h;
}
