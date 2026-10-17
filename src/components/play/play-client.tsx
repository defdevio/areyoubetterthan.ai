"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useResults, useSession } from "@/components/providers";
import { GitHubMark } from "@/components/site-header";
import { Button, Card, cx, LinkButton, PhaseBadge, Spinner } from "@/components/ui";
import type { ActiveAttempt, SubmittedInfo } from "@/components/workspace/workspace";
import type { SourceBundle } from "@/lib/bundle-types";
import { api, ApiError } from "@/lib/client/api";
import { formatBytes, loadBundle, type Progress } from "@/lib/client/bundle";
import { isPending, PHASE_HINT, shortId } from "@/lib/format";

const Workspace = dynamic(() => import("@/components/workspace/workspace").then((m) => m.Workspace), {
  ssr: false,
  loading: () => <CenterNote>Loading editor…</CenterNote>,
});

interface PlayState {
  server_now: string;
  progress: { done: number; total: number };
  active: ActiveAttempt | null;
  next: { instance_id: string; repo: string; bundle_url: string; position: number } | null;
}

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; state: PlayState }
  | { kind: "working"; attempt: ActiveAttempt; bundle: SourceBundle }
  | { kind: "submitted"; attemptId: string; instanceId: string; info: SubmittedInfo }
  | { kind: "done"; state: PlayState };

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-8 text-sm text-muted">
      <div className="flex items-center gap-2">
        <Spinner /> {children}
      </div>
    </div>
  );
}

export function PlayClient() {
  const { me, loading } = useSession();
  const results = useResults();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [offsetMs, setOffsetMs] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [bundle, setBundle] = useState<SourceBundle | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [resumeFailed, setResumeFailed] = useState(false);

  const fetchState = useCallback(async () => {
    const t0 = Date.now();
    const state = await api<PlayState>("/api/play");
    const t1 = Date.now();
    setOffsetMs(new Date(state.server_now).getTime() - (t0 + t1) / 2);
    return state;
  }, []);

  const preload = useCallback(async (url: string) => {
    setBundle(null);
    setBundleError(null);
    setProgress({ loaded: 0, total: null });
    try {
      const b = await loadBundle(url, setProgress);
      setBundle(b);
      return b;
    } catch (e) {
      setBundleError((e as Error).message);
      return null;
    }
  }, []);

  const load = useCallback(
    () =>
      fetchState()
        .then(async (state) => {
          if (state.active?.task) {
            // Resuming: the clock is already running, so go straight back in.
            const b = await preload(state.active.task.bundle_url);
            if (b) setView({ kind: "working", attempt: state.active, bundle: b });
            else {
              setResumeFailed(true);
              setView({ kind: "ready", state });
            }
            return;
          }
          if (!state.next) return setView({ kind: "done", state });
          setView({ kind: "ready", state });
          void preload(state.next.bundle_url);
        })
        .catch((e: Error) => setView({ kind: "error", message: e.message })),
    [fetchState, preload],
  );

  useEffect(() => {
    if (!me?.user) return;
    // Deferred and cancellable, so StrictMode's double mount doesn't fetch twice.
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [me?.user, load]);

  const start = async (state: PlayState) => {
    if (!state.next || !bundle) return;
    setStarting(true);
    setStartError(null);
    try {
      const t0 = Date.now();
      const res = await api<{ server_now: string; active: ActiveAttempt }>("/api/attempts", {
        method: "POST",
        json: { instance_id: state.next.instance_id },
      });
      setOffsetMs(new Date(res.server_now).getTime() - (t0 + Date.now()) / 2);
      void results.refresh();
      setView({ kind: "working", attempt: res.active, bundle });
    } catch (e) {
      const err = e as ApiError;
      setStartError(err.message);
      if (err.code === "out_of_order" || err.code === "attempt_in_progress") void load();
    } finally {
      setStarting(false);
    }
  };

  const onSubmitted = useCallback(
    (attempt: ActiveAttempt) => (info: SubmittedInfo) => {
      setView({ kind: "submitted", attemptId: attempt.id, instanceId: attempt.instance_id, info });
      void results.refresh();
    },
    [results],
  );

  if (loading) return <CenterNote>Loading…</CenterNote>;
  if (!me?.user) return <SignInGate devLogin={me?.dev_login ?? false} />;

  switch (view.kind) {
    case "loading":
      return <CenterNote>Finding your next task…</CenterNote>;
    case "error":
      return (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <p className="text-sm text-fail">{view.message}</p>
            <Button
              className="mt-4"
              onClick={() => {
                setView({ kind: "loading" });
                void load();
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      );
    case "done":
      return (
        <div className="mx-auto max-w-xl flex-1 px-4 py-24 text-center">
          <div className="text-5xl">🏁</div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">You&apos;ve attempted every task.</h1>
          <p className="mt-3 text-muted">
            All {view.state.progress.total} of them. That makes you one of the most thorough humans in the control group.
          </p>
          <LinkButton href="/results" variant="primary" className="mt-8">
            See how you compare →
          </LinkButton>
        </div>
      );
    case "ready":
      return (
        <ReadyScreen
          state={view.state}
          progress={progress}
          bundle={bundle}
          bundleError={bundleError}
          onRetryBundle={() => view.state.next && void preload(view.state.next.bundle_url)}
          starting={starting}
          startError={startError}
          onStart={() => void start(view.state)}
          resumeFailed={resumeFailed && Boolean(view.state.active)}
          pendingCount={results.pending}
        />
      );
    case "working":
      return (
        <Workspace
          key={view.attempt.id}
          attempt={view.attempt}
          bundle={view.bundle}
          offsetMs={offsetMs}
          onSubmitted={onSubmitted(view.attempt)}
        />
      );
    case "submitted":
      return (
        <SubmittedScreen
          attemptId={view.attemptId}
          instanceId={view.instanceId}
          info={view.info}
          onNext={() => {
            setView({ kind: "loading" });
            void load();
          }}
        />
      );
  }
}

function SignInGate({ devLogin }: { devLogin: boolean }) {
  return (
    <div className="mx-auto max-w-lg flex-1 px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in to take the test</h1>
      <p className="mt-3 text-muted">
        We use your GitHub account to keep one attempt per task and to show you your results. We only read your public
        profile.
      </p>
      <p className="mt-3 text-xs text-faint">
        Heads up: patches are scored in public pull requests that mention your GitHub username. That&apos;s the audit trail.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <a
          href="/api/auth/login?next=/play"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-fg px-5 text-sm font-medium text-black hover:bg-white"
        >
          <GitHubMark className="size-4" /> Continue with GitHub
        </a>
        {devLogin && (
          <LinkButton href="/signin?next=/play" variant="ghost" size="lg">
            Dev sign-in
          </LinkButton>
        )}
      </div>
    </div>
  );
}

const RULES: [string, string][] = [
  ["15 minutes, one shot", "The clock starts when you press Start. At 0:00 whatever you've changed is submitted automatically. No skips, no retries."],
  ["The real repo, in your browser", "Browse, search and edit the full source at the exact commit the issue was filed against. Create files if you need to."],
  ["No running code", "There's no terminal here. The AI agents had one; we say so next to every result. The official tests run after you submit."],
  ["Graded like the models", "The official SWE-bench harness runs the hidden FAIL_TO_PASS and PASS_TO_PASS tests on a GitHub runner. All must pass."],
  ["Honor system", "No AI assistants and no looking up the actual fix. Big pastes from outside the editor are recorded, and flagged attempts are left out of global stats."],
];

function ReadyScreen({
  state,
  progress,
  bundle,
  bundleError,
  onRetryBundle,
  starting,
  startError,
  onStart,
  resumeFailed,
  pendingCount,
}: {
  state: PlayState;
  progress: Progress | null;
  bundle: SourceBundle | null;
  bundleError: string | null;
  onRetryBundle: () => void;
  starting: boolean;
  startError: string | null;
  onStart: () => void;
  resumeFailed: boolean;
  pendingCount: number;
}) {
  const next = state.next;
  const pct = progress?.total ? Math.min(100, (progress.loaded / progress.total) * 100) : bundle ? 100 : null;
  if (resumeFailed && state.active) {
    const until = new Date(state.active.deadline_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return (
      <div className="mx-auto max-w-lg flex-1 px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Your task is still running</h1>
        <p className="mt-2 text-muted">
          The clock runs until {until}. We couldn&apos;t load the repository: {bundleError}
        </p>
        <Button className="mt-6" variant="primary" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!next) return null;
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-14">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span className="font-mono">
          Task {next.position} of {state.progress.total}
        </span>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/10 px-2 py-0.5 text-xs text-ai">
            <Spinner className="size-2.5 border-[1.5px]" /> {pendingCount} earlier patch{pendingCount === 1 ? "" : "es"} scoring
          </span>
        )}
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Next up: a real issue from <span className="font-mono text-human">{next.repo}</span>
      </h1>
      <p className="mt-3 text-muted">
        The issue stays hidden until you start, because reading it is part of the 15 minutes, just like it was for the models.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {RULES.map(([title, body], i) => (
          <Card key={title} className={cx("p-4", i === 0 && "sm:col-span-2 border-human/30 bg-human/[0.04]")}>
            <div className="text-sm font-medium">{title}</div>
            <div className="mt-1 text-sm leading-relaxed text-muted">{body}</div>
          </Card>
        ))}
      </div>

      <Card className="mt-8 p-5">
        <div className="flex items-center justify-between gap-4 text-xs text-muted">
          <span>
            {bundle ? (
              <>
                Repository ready: {Object.keys(bundle.files).length.toLocaleString()} files at{" "}
                <span className="font-mono">{bundle.base_commit.slice(0, 7)}</span>
              </>
            ) : bundleError ? (
              <span className="text-fail">Download failed: {bundleError}</span>
            ) : (
              <>Downloading the repository so the clock doesn&apos;t pay for it…</>
            )}
          </span>
          <span className="font-mono">
            {progress && !bundle && `${formatBytes(progress.loaded)}${progress.total ? ` / ${formatBytes(progress.total)}` : ""}`}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={cx("h-full rounded-full transition-[width]", bundle ? "bg-pass" : "bg-human", pct === null && "w-1/3 animate-pulse")}
            style={pct !== null ? { width: `${pct}%` } : undefined}
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {bundleError ? (
            <Button onClick={onRetryBundle}>Retry download</Button>
          ) : (
            <Button variant="primary" size="lg" disabled={!bundle || starting} onClick={onStart} data-testid="start-task">
              {starting ? <Spinner /> : "▶"} Start the clock (15:00)
            </Button>
          )}
          <span className="text-xs text-faint">Works best on a laptop or desktop.</span>
        </div>
        {startError && <p className="mt-3 text-sm text-fail">{startError}</p>}
      </Card>
    </div>
  );
}

function SubmittedScreen({
  attemptId,
  instanceId,
  info,
  onNext,
}: {
  attemptId: string;
  instanceId: string;
  info: SubmittedInfo;
  onNext: () => void;
}) {
  const { items } = useResults();
  const item = items.find((i) => i.attempt_id === attemptId);
  const phase = item?.phase ?? (info.submissionId ? "queued" : "unresolved");
  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 py-20" data-testid="submitted">
      <div className="text-sm text-muted">
        {info.auto ? "⏱ Time's up" : "✓ Submitted"} · <span className="font-mono">{shortId(instanceId)}</span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {phase === "resolved"
          ? "Resolved. Nice work."
          : phase === "unresolved" && info.submissionId
            ? "Not this time."
            : info.submissionId
              ? "Your patch is being graded."
              : "Recorded."}
      </h1>
      {info.message && <p className="mt-3 text-sm text-warn">{info.message}</p>}
      {info.submissionId ? (
        <p className="mt-3 text-muted">
          {info.stats.files} file{info.stats.files === 1 ? "" : "s"}, <span className="text-pass">+{info.stats.added}</span>{" "}
          <span className="text-fail">−{info.stats.removed}</span>. The official SWE-bench harness is running the tests on a
          GitHub runner. That usually takes 3–8 minutes. You don&apos;t need to wait: the result will pop up wherever you are.
        </p>
      ) : (
        !info.message && <p className="mt-3 text-muted">No changes were submitted, so this one counts as unresolved.</p>
      )}

      <Card className="mt-8 flex items-center justify-between gap-4 p-4">
        <div>
          <div className="text-sm font-medium">{item?.title ?? instanceId}</div>
          <div className="mt-1 text-xs text-faint">{PHASE_HINT[phase]}</div>
        </div>
        <PhaseBadge phase={phase} queuePosition={item?.queue_position} />
      </Card>
      {item?.pr_url && (
        <a href={item.pr_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-faint hover:text-fg">
          Public scoring PR →
        </a>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="primary" size="lg" onClick={onNext} data-testid="next-task">
          Next task →
        </Button>
        {item && !isPending(phase) ? (
          <LinkButton href={`/review/${instanceId}`} size="lg">
            Review this task
          </LinkButton>
        ) : (
          <LinkButton href="/results" size="lg" variant="ghost">
            My results
          </LinkButton>
        )}
      </div>
      <p className="mt-6 text-xs text-faint">
        Tip: take a breather between tasks. The clock only runs once you press Start.{" "}
        <Link href="/methodology" className="underline-offset-2 hover:underline">
          How scoring works
        </Link>
      </p>
    </div>
  );
}
