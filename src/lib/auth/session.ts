import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import { HttpError } from "@/lib/errors";

export { HttpError, handle } from "@/lib/errors";

const COOKIE = "abt_session";
const MAX_AGE_S = 60 * 60 * 24 * 30;

function key() {
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be set (at least 32 characters)");
  }
  return new TextEncoder().encode(config.sessionSecret);
}

export async function createSessionCookie(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(key());
  return {
    name: COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: config.appUrl.startsWith("https://"),
      sameSite: "lax" as const,
      path: "/",
      maxAge: MAX_AGE_S,
    },
  };
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

async function sessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const id = await sessionUserId();
  if (!id) return null;
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Sign in with GitHub to continue.", "unauthenticated");
  return user;
}

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/play";
  return next;
}
