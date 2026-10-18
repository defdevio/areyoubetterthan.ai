"use client";

import { useEffect, useState } from "react";
import { DiffView } from "@/components/diff-view";
import { Markdown } from "@/components/markdown";
import { useResults, useSession } from "@/components/providers";
import { Card, cx, LinkButton, PhaseBadge, Pill, RateBar, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import type { ScoreResult } from "@/lib/db/schema";
import { FLAG_LABELS } from "@/lib/flags";
import { formatDuration, isPending, PHASE_HINT, REASON_LABEL } from "@/lib/format";
import { CATEGORY_LABEL, type AttemptMetrics } from "@/lib/metrics";
import type { ResultItem } from "@/lib/results";
import { CATEGORY_COLOR } from "@/components/metrics";

interface Review {
  item: ResultItem;
  metrics: AttemptMetrics | null;
  task: {
    instance_id: string;
    repo: string;
    title: string;
    base_commit: string;
    problem_statement: string;
    hints_text: string;
    patch: string;
    fail_to_pass: string[];
    pass_to_pass_count: number;
  } | null;
  diff: string | null;
  result: ScoreResult | null;
  models: { solved: number; total: number; names: string[] };
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-line bg-panel">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium">
        {title}
        <span className="text-faint transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-line p-5">{children}</div>
    </details>
  );
}

function TestList({ title, names, tone }: { title: string; names: string[]; tone: "pass" | "fail" }) {
  if (names.length === 0) return null;
  return (
    <div>
      <div className="text-xs text-faint">{title}</div>
      <ul className="mt-1.5 space-y-1">
        {names.map((n) => (
          <li key={n} className="flex gap-2 font-mono text-[11.5px] break-all">
            <span className={tone === "pass" ? "text-pass" : "text-fail"}>{tone === "pass" ? "✓" : "✗"}</span>
            <span className="text-muted">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewClient({ instanceId }: { instanceId: string }) {
  const { me, loading } = useSession();
  const { items } = useResults();
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phase = items.find((i) => i.instance_id === instanceId)?.phase;

  useEffect(() => {
    if (!me?.user) return;
    api<Review>(`/api/me/review/${encodeURIComponent(instanceId)}`)
      .then(setReview)
      .catch((e: ApiError) => setError(e.message));
  }, [me?.user, instanceId, phase]);

  if (loading || (!review && !error && me?.user)) {
    return (
      <div className="grid flex-1 place-items-center text-sm text-muted">
        <span className="flex items-center gap-2">
          <Spinner /> Loading…
        </span>
      </div>
    );
  }
  if (!me?.user) {
    return (
      <div className="mx-auto max-w-lg flex-1 px-4 py-24 text-center">
        <a href={`/api/auth/login?next=/review/${instanceId}`} className="text-human hover:underline">
          Sign in to review your attempt →
        </a>
      </div>
    );
  }
  if (error || !review) {
    return (
      <div className="mx-auto max-w-lg flex-1 px-4 py-24 text-center">
        <p className="text-muted">{error}</p>
        <LinkButton href="/results" className="mt-6">
          Back to results
        </LinkButton>
      </div>
    );
  }

  const { item, task, diff, result, models, metrics } = review;
  const tests = result?.tests;
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12" data-testid="review-page">
      <div className="font-mono text-xs text-faint">
        {item.repo} · {item.instance_id}
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <h1 className="max-w-3xl text-2xl font-semibold tracking-tight">{item.title}</h1>
        <PhaseBadge phase={item.phase} queuePosition={item.queue_position} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill>Time used: {formatDuration(item.elapsed_ms)}</Pill>
        {item.reason && item.phase === "unresolved" && <Pill>{REASON_LABEL[item.reason] ?? item.reason}</Pill>}
        {item.auto_submitted && <Pill>Auto-submitted at 0:00</Pill>}
        {item.patch && (
          <Pill>
            {item.patch.files} file{item.patch.files === 1 ? "" : "s"} · +{item.patch.added} −{item.patch.removed}
          </Pill>
        )}
        {item.flag_reasons.map((f) => (
          <Pill key={f} className="border-warn/30 text-warn">
            {FLAG_LABELS[f] ?? f}
          </Pill>
        ))}
        {item.pr_url && (
          <a href={item.pr_url} target="_blank" rel="noreferrer" className="text-xs text-faint hover:text-fg">
            Scoring PR ↗
          </a>
        )}
        {item.run_url && (
          <a href={item.run_url} target="_blank" rel="noreferrer" className="text-xs text-faint hover:text-fg">
            Workflow run & logs ↗
          </a>
        )}
      </div>

      {isPending(item.phase) && (
        <Card className="mt-6 flex items-center gap-3 p-4 text-sm text-muted">
          <Spinner className="text-ai" /> {PHASE_HINT[item.phase]} This page updates when the result lands.
        </Card>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <Card className="p-5">
          <div className="text-sm font-medium">Hidden tests</div>
          {tests ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-faint">FAIL_TO_PASS (the bug)</div>
                  <div className="mt-1 font-mono">
                    <span className="text-pass">{tests.fail_to_pass.passed_count}</span> /{" "}
                    {tests.fail_to_pass.passed_count + tests.fail_to_pass.failed_count} passing
                  </div>
                </div>
                <div>
                  <div className="text-xs text-faint">PASS_TO_PASS (no regressions)</div>
                  <div className="mt-1 font-mono">
                    {tests.pass_to_pass.failed_count === 0 ? (
                      <span className="text-pass">all {tests.pass_to_pass.passed_count} still pass</span>
                    ) : (
                      <span className="text-fail">{tests.pass_to_pass.failed_count} broke</span>
                    )}
                  </div>
                </div>
              </div>
              <TestList title="Failing target tests" names={tests.fail_to_pass.failed} tone="fail" />
              <TestList title="Passing target tests" names={tests.fail_to_pass.passed} tone="pass" />
              <TestList title="Regressions" names={tests.pass_to_pass.failed} tone="fail" />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {item.reason === "patch_apply_failed"
                ? "The patch didn't apply cleanly to the repository, so no tests ran."
                : item.reason === "no_patch" || item.reason === "timed_out_no_patch"
                  ? "No patch was submitted, so there was nothing to test."
                  : isPending(item.phase)
                    ? "Waiting for the harness…"
                    : "No test details available."}
            </p>
          )}
        </Card>
        <Card className="p-5">
          <div className="text-sm font-medium">The machines on this task</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-ai">{models.solved}</span>
            <span className="text-sm text-muted">of {models.total} models solved it</span>
          </div>
          <RateBar p={models.total ? models.solved / models.total : 0} ci={null} tone="ai" className="mt-3" />
          {models.names.length > 0 && (
            <details className="mt-3 text-xs text-faint">
              <summary className="cursor-pointer hover:text-fg">Which ones</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {models.names.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center rounded-full border border-line-strong bg-white/[0.03] px-2.5 py-1 text-[11.5px] leading-none text-fg/90"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </details>
          )}
        </Card>
      </div>

      {metrics && <AttemptBreakdown m={metrics} />}

      <div className="mt-4 space-y-4">
        {diff && (
          <Collapsible title="Your patch" defaultOpen>
            <DiffView diff={diff} className="max-h-[480px]" />
          </Collapsible>
        )}
        {task ? (
          <>
            <Collapsible title="Reference fix (what was merged upstream)" defaultOpen={!diff}>
              <p className="mb-3 text-xs text-muted">
                One correct solution. Yours doesn&apos;t need to match it, only to make the same tests pass.
              </p>
              <DiffView diff={task.patch} className="max-h-[480px]" />
            </Collapsible>
            <Collapsible title="The issue">
              <Markdown>{task.problem_statement}</Markdown>
            </Collapsible>
            {task.hints_text.trim() && (
              <Collapsible title="Hints from the issue thread (hidden during the attempt)">
                <Markdown>{task.hints_text}</Markdown>
              </Collapsible>
            )}
          </>
        ) : (
          <Card className="p-5 text-sm text-muted">The reference fix is revealed once your attempt is over.</Card>
        )}
      </div>

      <div className="mt-8 flex gap-3">
        <LinkButton href="/play" variant="primary">
          Next task →
        </LinkButton>
        <LinkButton href="/results" variant="ghost">
          All results
        </LinkButton>
      </div>
    </div>
  );
}

function AttemptBreakdown({ m }: { m: AttemptMetrics }) {
  const loc = m.localization;
  return (
    <Card className="mt-4 p-5" data-testid="attempt-breakdown">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cx("size-2.5 rounded-full", CATEGORY_COLOR[m.category])} />
        <span className="text-sm font-medium">{CATEGORY_LABEL[m.category]}</span>
        <span className="text-xs text-faint">
          · {m.f2p_passed}/{m.f2p_total} bug tests passing
          {m.p2p_failed ? ` · ${m.p2p_failed} regression${m.p2p_failed === 1 ? "" : "s"}` : ""}
          {m.patch_lines !== null && m.gold_lines > 0
            ? ` · ${m.patch_lines} changed lines vs ${m.gold_lines} in the reference fix`
            : ""}
        </span>
      </div>
      {loc && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-faint">Files the upstream fix changed</div>
            <ul className="mt-1.5 space-y-1 font-mono text-[11.5px]">
              {loc.gold.map((f) => (
                <li key={f} className="flex gap-2 break-all">
                  <span className={loc.hit.includes(f) ? "text-pass" : "text-fail"}>{loc.hit.includes(f) ? "✓" : "✗"}</span>
                  <span className="text-muted">{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs text-faint">Files you changed</div>
            <ul className="mt-1.5 space-y-1 font-mono text-[11.5px]">
              {loc.touched.map((f) => (
                <li key={f} className="flex gap-2 break-all">
                  <span className={loc.hit.includes(f) ? "text-pass" : "text-faint"}>{loc.hit.includes(f) ? "✓" : "·"}</span>
                  <span className="text-muted">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
