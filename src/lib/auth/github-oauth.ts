import "server-only";
import { config } from "@/lib/config";
import type { GitHubProfile } from "./users";

export function authorizeUrl(state: string) {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", config.github.clientId ?? "");
  u.searchParams.set("redirect_uri", `${config.appUrl}/api/auth/callback`);
  u.searchParams.set("state", state);
  u.searchParams.set("allow_signup", "true");
  return u.toString();
}

/**
 * Exchanges an OAuth code for a short-lived user token and reads the profile. The token is
 * only used for this one call and never stored: we need identity, not access.
 */
export async function exchangeCode(code: string): Promise<GitHubProfile> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code,
      redirect_uri: `${config.appUrl}/api/auth/callback`,
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!token.access_token) throw new Error(token.error_description ?? "OAuth exchange failed");
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token.access_token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!userRes.ok) throw new Error(`GitHub /user failed: ${userRes.status}`);
  const u = (await userRes.json()) as GitHubProfile;
  return { id: u.id, login: u.login, name: u.name, avatar_url: u.avatar_url };
}
