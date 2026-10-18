"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useResults, useSession } from "@/components/providers";
import { cx, PhaseBadge, Spinner } from "@/components/ui";
import { useHydrated } from "@/lib/client/use-media";
import { formatClock, isPending, PHASE_HINT, shortId, timeAgo } from "@/lib/format";

const NAV = [
  { href: "/play", label: "Play" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/stats", label: "Humans vs AI" },
  { href: "/results", label: "My results" },
  { href: "/methodology", label: "Methodology" },
];

/** Current time, refreshed on an interval. 0 until mounted (keeps prerendering deterministic). */
function useNow(intervalMs: number, enabled = true) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const id = setInterval(update, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs, enabled]);
  return now;
}

function ActiveAttemptChip() {
  const { items } = useResults();
  const pathname = usePathname();
  const active = items.find((i) => i.phase === "in_progress" && i.deadline_at);
  const now = useNow(1000, Boolean(active));
  if (!active || pathname === "/play" || now === 0) return null;
  const left = new Date(active.deadline_at!).getTime() - now;
  return (
    <Link
      href="/play"
      className="hidden items-center gap-2 rounded-full border border-human/40 bg-human/10 px-3 py-1 font-mono text-xs text-human hover:bg-human/20 sm:inline-flex"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-human" />
      {left > 0 ? `${formatClock(left)} left · back to task` : "Time's up"}
    </Link>
  );
}

function ResultsTray() {
  const { items, pending, loaded } = useResults();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const now = useNow(30_000, open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const recent = items.filter((i) => i.phase !== "in_progress").slice(0, 8);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Scoring results"
        data-testid="tray-button"
        className={cx(
          "inline-flex h-8 items-center gap-2 rounded-full border px-2.5 text-xs font-medium transition-colors sm:px-3",
          pending > 0 ? "border-ai/40 bg-ai/10 text-ai" : "border-line-strong text-muted hover:text-fg",
        )}
      >
        {pending > 0 ? <Spinner className="size-3" /> : <span aria-hidden>◎</span>}
        {pending > 0 ? (
          <span>
            <span className="hidden sm:inline">Scoring </span>
            {pending}
          </span>
        ) : (
          <span className="hidden sm:inline">Results</span>
        )}
      </button>
      {open && (
        // Phones: pinned under the header across the screen; larger screens: anchored to the button.
        <div className="animate-rise fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-line-strong bg-panel shadow-2xl shadow-black/60 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[26rem]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="text-sm font-medium">Scoring tray</div>
            <div className="text-xs text-faint">{pending > 0 ? "live · updates every few seconds" : "all caught up"}</div>
          </div>
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto" data-testid="tray-list">
            {!loaded && <li className="px-4 py-6 text-center text-sm text-faint">Loading…</li>}
            {loaded && recent.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-faint">
                Nothing yet. Submitted patches show up here while they&apos;re graded.
              </li>
            )}
            {recent.map((i) => (
              <li key={i.attempt_id}>
                <Link
                  href={`/review/${i.instance_id}`}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-xs text-muted">{shortId(i.instance_id)}</span>
                    <PhaseBadge phase={i.phase} queuePosition={i.queue_position} />
                  </div>
                  <div className="mt-1 truncate text-sm">{i.title}</div>
                  <div className="mt-1 text-[11px] text-faint">
                    {isPending(i.phase) ? PHASE_HINT[i.phase] : now ? timeAgo(i.ended_at ?? i.started_at, now) : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/results"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-2.5 text-center text-xs text-muted hover:text-fg"
          >
            See full comparison →
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { me, loading } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The session can resolve before this boundary hydrates; render the server's placeholder until then.
  const hydrated = useHydrated();
  if (loading || !hydrated) return <div className="h-8 w-20 animate-pulse rounded-full bg-white/5" />;
  if (!me?.user) {
    return (
      <a
        href={`/api/auth/login?next=${encodeURIComponent(pathname === "/" ? "/play" : pathname)}`}
        className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-fg px-3 text-xs font-medium whitespace-nowrap text-black hover:bg-white"
      >
        <GitHubMark /> Sign in
      </a>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <ResultsTray />
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Account menu"
          className="flex cursor-pointer items-center gap-2 rounded-full p-0.5 hover:bg-white/5"
        >
          {me.user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.user.avatar_url} alt="" className="size-7 rounded-full" />
          ) : (
            <span className="grid size-7 place-items-center rounded-full bg-human/20 text-xs font-semibold text-human">
              {me.user.login[0]?.toUpperCase()}
            </span>
          )}
        </button>
        {open && (
          <div className="animate-rise absolute right-0 z-50 mt-2 w-48 rounded-xl border border-line-strong bg-panel p-1 shadow-2xl shadow-black/60">
            <div className="px-3 py-2 text-xs text-faint">
              Signed in as <span className="text-fg">@{me.user.login}</span>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-white/5 hover:text-fg">
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export function GitHubMark({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="group flex min-w-0 items-center gap-2 font-mono text-[13px] font-semibold tracking-tight sm:text-sm">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-human">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/human_vs_ai.svg" alt="" className="size-7" />
      </span>
      <span className="truncate">
        areyoubetterthan<span className="text-ai">.ai</span>
      </span>
    </Link>
  );
}

/** Static header used in the prerendered shell until the pathname-aware one streams in. */
export function SiteHeaderShell() {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-6 px-4">
        <Logo />
      </div>
    </header>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const compact = pathname === "/play";
  return (
    <header
      className={cx(
        "sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur",
        compact ? "h-12" : "h-14",
      )}
    >
      <div className={cx("mx-auto flex h-full items-center gap-3 px-4 md:gap-6", compact ? "max-w-none" : "max-w-6xl")}>
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive(pathname, n.href) ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <ActiveAttemptChip />
          <UserMenu />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

/** Below md the nav links move into a menu under the header. */
function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="md:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        data-testid="mobile-nav-button"
        className="grid size-8 place-items-center rounded-full border border-line-strong text-muted hover:text-fg"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          {open ? <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /> : <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" strokeLinecap="round" />}
        </svg>
      </button>
      {open && (
        // Anchored to the sticky header (the nearest positioned ancestor), full width.
        <nav
          id="mobile-nav"
          data-testid="mobile-nav"
          className="animate-rise absolute inset-x-0 top-full border-b border-line bg-bg px-4 py-2 shadow-2xl shadow-black/60"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(pathname, n.href) ? "page" : undefined}
              className={cx(
                "flex items-center justify-between rounded-lg px-3 py-3 text-base",
                isActive(pathname, n.href) ? "bg-white/5 text-fg" : "text-muted hover:text-fg",
              )}
            >
              {n.label}
              {n.href === "/play" && <span className="text-[11px] text-faint">on a computer</span>}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function ResultToasts() {
  const { justFinished, dismiss } = useResults();
  useEffect(() => {
    if (justFinished.length === 0) return;
    const id = setTimeout(() => dismiss(justFinished[justFinished.length - 1].attempt_id), 9000);
    return () => clearTimeout(id);
  }, [justFinished, dismiss]);
  return (
    <div className="pointer-events-none fixed top-16 right-4 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {justFinished.map((i) => (
        <div
          key={i.attempt_id}
          className={cx(
            "animate-rise pointer-events-auto rounded-xl border bg-panel p-4 shadow-2xl shadow-black/60",
            i.phase === "resolved" ? "border-pass/40" : "border-fail/40",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={cx("text-sm font-semibold", i.phase === "resolved" ? "text-pass" : "text-fail")}>
                {i.phase === "resolved" ? "✓ Resolved!" : "✗ Not resolved"}
              </div>
              <div className="mt-0.5 font-mono text-xs text-muted">{shortId(i.instance_id)}</div>
            </div>
            <button onClick={() => dismiss(i.attempt_id)} className="text-faint hover:text-fg" aria-label="Dismiss">
              ×
            </button>
          </div>
          <Link href={`/review/${i.instance_id}`} className="mt-2 inline-block text-xs text-ai hover:underline">
            Review tests & reference fix →
          </Link>
        </div>
      ))}
    </div>
  );
}
