"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";

export function DevSignIn() {
  const params = useSearchParams();
  return (
    <form action="/api/auth/dev" method="post" className="mt-6 space-y-3">
      <input type="hidden" name="next" value={params.get("next") ?? "/play"} />
      <input
        name="login"
        required
        autoFocus
        placeholder="octocat"
        pattern="[A-Za-z0-9\-]+"
        data-testid="dev-login"
        className="h-10 w-full rounded-lg border border-line bg-panel px-3 font-mono text-sm focus:border-human/50 focus:outline-none"
      />
      <Button variant="primary" className="w-full" data-testid="dev-login-submit">
        Sign in
      </Button>
    </form>
  );
}
