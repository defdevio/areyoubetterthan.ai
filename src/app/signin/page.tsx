import type { Metadata } from "next";
import { Suspense } from "react";
import { DevSignIn } from "./dev-sign-in";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage() {
  return (
    <div className="mx-auto w-full max-w-sm flex-1 px-4 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Dev sign-in</h1>
      <p className="mt-2 text-sm text-muted">
        GitHub OAuth isn&apos;t configured, so you can sign in as any made-up user. This page is disabled in production.
      </p>
      <Suspense>
        <DevSignIn />
      </Suspense>
    </div>
  );
}
