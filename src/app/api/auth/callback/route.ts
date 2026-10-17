import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/auth/github-oauth";
import { createSessionCookie, safeNext } from "@/lib/auth/session";
import { upsertUser } from "@/lib/auth/users";
import { config } from "@/lib/config";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get("abt_oauth")?.value ?? "{}");
  } catch {}
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/?signin_error=${encodeURIComponent(reason)}`, config.appUrl));

  if (!code || !state || !saved.state || state !== saved.state) return fail("state_mismatch");
  try {
    const profile = await exchangeCode(code);
    const user = await upsertUser(profile);
    const session = await createSessionCookie(user.id);
    const res = NextResponse.redirect(new URL(safeNext(saved.next), config.appUrl));
    res.cookies.set(session.name, session.value, session.options);
    res.cookies.delete({ name: "abt_oauth", path: "/api/auth" });
    return res;
  } catch (err) {
    console.error("[auth] callback failed", err);
    return fail("github");
  }
}
