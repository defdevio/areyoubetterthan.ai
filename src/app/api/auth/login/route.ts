import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl } from "@/lib/auth/github-oauth";
import { safeNext } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { newId } from "@/lib/ids";

export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (config.github.mode !== "app" || !config.github.clientId) {
    if (config.devLogin) {
      return NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent(next)}`, config.appUrl));
    }
    return NextResponse.json({ error: "GitHub sign-in is not configured." }, { status: 503 });
  }
  const state = newId(24);
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("abt_oauth", JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: config.appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
