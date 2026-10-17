import { NextResponse, type NextRequest } from "next/server";
import { createSessionCookie, safeNext } from "@/lib/auth/session";
import { devGithubId, upsertUser } from "@/lib/auth/users";
import { config } from "@/lib/config";

/** Local development and e2e only: sign in as any made-up GitHub login. */
export async function POST(req: NextRequest) {
  if (!config.devLogin) return NextResponse.json({ error: "Not available." }, { status: 404 });
  const form = await req.formData();
  const login = String(form.get("login") ?? "")
    .trim()
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 39);
  if (!login) return NextResponse.json({ error: "Pick a login." }, { status: 400 });
  const user = await upsertUser({ id: devGithubId(login), login, name: login, avatar_url: null });
  const session = await createSessionCookie(user.id);
  const res = NextResponse.redirect(new URL(safeNext(String(form.get("next") ?? "")), config.appUrl), 303);
  res.cookies.set(session.name, session.value, session.options);
  return res;
}
