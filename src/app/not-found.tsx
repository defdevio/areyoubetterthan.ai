import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <>
      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-5 py-20 text-center">
        <div>
          <div className="font-mono text-sm text-faint">404</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Nothing to fix here</h1>
          <p className="mt-2 text-sm text-muted">This page doesn&apos;t exist, or a shared result was taken down by its owner.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href="/" variant="primary">
              Home
            </LinkButton>
            <LinkButton href="/stats">Humans vs AI</LinkButton>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
