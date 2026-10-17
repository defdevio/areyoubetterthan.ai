"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useResults } from "@/components/providers";
import { Button, LinkButton, Spinner } from "@/components/ui";
import { useMediaQuery } from "@/lib/client/use-media";
import { formatClock } from "@/lib/format";

/** The workspace (file tree + editor + issue, side by side) needs roughly this much room. */
export const PLAY_MIN_WIDTH = 900;
export const PLAY_MIN_HEIGHT = 500;
const FITS = `(min-width: ${PLAY_MIN_WIDTH}px) and (min-height: ${PLAY_MIN_HEIGHT}px)`;

/**
 * Renders children only on a desktop-sized viewport. Below that nothing inside is mounted: no
 * task is fetched, no repository is downloaded and no clock can start. Once allowed it stays
 * mounted, so resizing the window mid-task never throws away work.
 */
export function DesktopGate({ children }: { children: ReactNode }) {
  const fits = useMediaQuery(FITS);
  const [latched, setLatched] = useState(false);
  if (fits && !latched) setLatched(true);

  if (latched || fits) return children;
  if (fits === null) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-sm text-muted">
        <Spinner />
      </div>
    );
  }
  return <DesktopOnlyNotice />;
}

function DesktopOnlyNotice() {
  const touch = useMediaQuery("(pointer: coarse)");
  const { items } = useResults();
  const active = items.find((i) => i.phase === "in_progress" && i.deadline_at);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active]);
  const left = active && now ? new Date(active.deadline_at!).getTime() - now : null;

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-5 py-14 text-center" data-testid="desktop-only">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-line-strong bg-panel text-human">
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="2.5" y="4" width="19" height="12.5" rx="1.5" />
          <path d="M8.5 20h7M12 16.5V20" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">The test needs a bigger screen</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        You fix the bug in a real code editor, with the file tree, search and the issue side by side and a 15-minute clock
        running. That doesn&apos;t fit on a phone, so for the best experience the test is taken on a desktop or laptop.
      </p>
      {touch === false ? (
        <p className="mt-3 text-sm leading-relaxed text-fg">
          Make this window at least {PLAY_MIN_WIDTH}×{PLAY_MIN_HEIGHT} and it will continue automatically.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-fg">Nothing has started. The clock only starts when you press Start.</p>
      )}

      {active && (
        <div className="mt-6 rounded-xl border border-human/40 bg-human/10 p-4 text-left text-sm" data-testid="desktop-only-active">
          <div className="font-medium text-human">
            You have a task in progress{left !== null ? (left > 0 ? `: ${formatClock(left)} left` : ": time's up") : ""}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Its clock keeps running. Finish it on the computer you started it on; when time runs out, your last autosaved
            draft is submitted for you.
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-3">
        <ShareLinkButton />
        <LinkButton href="/stats" variant="ghost">
          See Humans vs AI →
        </LinkButton>
      </div>
      <p className="mt-8 text-xs text-faint">
        Curious how it works first? Read the{" "}
        <Link href="/methodology" className="text-muted underline-offset-2 hover:underline">
          methodology
        </Link>
        .
      </p>
    </div>
  );
}

/** Hands the link to the share sheet (phones) or the clipboard, so it's easy to open on a computer. */
function ShareLinkButton() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const onClick = async () => {
    const url = `${window.location.origin}/play`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Are you better than AI?", text: "Take the test on a computer:", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch (e) {
      // Dismissing the share sheet isn't an error worth showing.
      if ((e as Error).name !== "AbortError") setState("failed");
    }
  };
  return (
    <Button variant="primary" size="lg" onClick={() => void onClick()} data-testid="share-play-link">
      {state === "copied" ? "Link copied ✓" : state === "failed" ? "Copy this page's address instead" : "Send the link to your computer"}
    </Button>
  );
}
