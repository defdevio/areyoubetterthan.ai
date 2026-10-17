import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, setDbForTests } from "@/lib/db";
import { attempts, submissions } from "@/lib/db/schema";
import { upsertUser } from "@/lib/auth/users";
import { generateDiff } from "@/lib/diff";
import { getPlayState, saveDraft, startAttempt, submitAttempt } from "@/lib/game";
import { setBackendForTests } from "@/lib/github";
import { MockBackend } from "@/lib/github/mock";
import type { RunInfo } from "@/lib/github/types";
import { taskOrder } from "@/lib/order";
import { humanStats, userResults, userSummary } from "@/lib/results";
import { handleWorkflowRunEvent, pumpQueue, reconcile } from "@/lib/scoring/service";
import { getTask, taskIds } from "@/lib/tasks";

let githubId = 1;
async function newUser(login = `user${githubId}`) {
  return upsertUser({ id: githubId++, login, name: null, avatar_url: null });
}

function diffFor(instanceId: string, marker = "") {
  // Edits the file the fixture's reference patch touches (resolved by the mock backend).
  const task = getTask(instanceId)!;
  const file = /diff --git a\/(\S+)/.exec(task.patch)![1];
  return generateDiff([{ path: file, original: "a = 1\n", current: `a = 2${marker ? ` # ${marker}` : ""}\n` }]).diff;
}

beforeEach(() => {
  setDbForTests(undefined);
  setBackendForTests(new MockBackend());
});

describe("attempt lifecycle", () => {
  it("serves tasks in the user's seeded order and rejects cherry-picking", async () => {
    const user = await newUser();
    const state = await getPlayState(user);
    const expected = taskOrder(taskIds, user.seed)[0];
    expect(state.next?.instance_id).toBe(expected);
    expect(state.next).not.toHaveProperty("problem_statement");

    const other = taskIds.find((t) => t !== expected)!;
    await expect(startAttempt(user, other)).rejects.toMatchObject({ status: 409, code: "out_of_order" });

    const started = await startAttempt(user, expected);
    expect(started.active.task?.problem_statement).toBeTruthy();
    expect(started.active.task).not.toHaveProperty("patch");
    expect(started.active.task).not.toHaveProperty("hints_text");
    // Starting again resumes the same attempt instead of creating a new one.
    const again = await startAttempt(user, expected);
    expect(again.active.id).toBe(started.active.id);
  });

  it("scores a submission end to end through the queue", async () => {
    const user = await newUser();
    const { next } = await getPlayState(user);
    const { active } = await startAttempt(user, next!.instance_id);
    const res = await submitAttempt(user, active.id, diffFor(next!.instance_id), [
      { t: 1000, chars: 12, lines: 1, external: false },
    ]);
    expect(res.submission_id).toMatch(/^[a-z0-9]{16}$/);

    // Idempotent re-submit.
    expect((await submitAttempt(user, active.id, "", [])).submission_id).toBe(res.submission_id);

    let items = await userResults(user.id);
    // userResults reconciles: queued -> dispatched -> completed (mock scores instantly).
    for (let i = 0; i < 3 && items[0].phase !== "resolved"; i++) items = await userResults(user.id);
    expect(items[0]).toMatchObject({ instance_id: next!.instance_id, phase: "resolved" });
    expect(items[0].tests?.f2p_passed).toBe(items[0].tests?.f2p_total);

    const db = await getDb();
    const [stored] = await db.select().from(attempts).where(eq(attempts.id, active.id));
    expect(stored.metrics).toMatchObject({ category: "resolved", f2p_passed: 1, f2p_total: 1 });
    expect(stored.metrics?.localization?.hit.length).toBe(1);

    const summary = await userSummary(user.id, "default");
    expect(summary.human).toMatchObject({ k: 1, n: 1, p: 1 });
    expect(summary.metrics).toMatchObject({ attempts: 1, right_file_rate: 1, bug_tests_passed: 1 });
    expect(summary.speed.length).toBeGreaterThan(20);
    expect(summary.speed[0].latency_s).toBeGreaterThan(0);
    expect(summary.tasks[0]).toMatchObject({ category: "resolved", right_file: true });
    const vals = await userSummary(user.id, "vals");
    expect(vals.models[0].source).toBe("vals");
    expect(summary.models.length).toBeGreaterThan(0);
    expect(summary.tasks[0].you).toBe("resolved");

    // The next task is now offered.
    const after = await getPlayState(user);
    expect(after.next?.instance_id).not.toBe(next!.instance_id);
    expect(after.progress.done).toBe(1);
  });

  it("counts an empty submission as unresolved without scoring", async () => {
    const user = await newUser();
    const { next } = await getPlayState(user);
    const { active } = await startAttempt(user, next!.instance_id);
    const res = await submitAttempt(user, active.id, "", []);
    expect(res.submission_id).toBeNull();
    const items = await userResults(user.id);
    expect(items[0]).toMatchObject({ phase: "unresolved", reason: "no_patch" });
    const db = await getDb();
    const [a] = await db.select().from(attempts).where(eq(attempts.id, active.id));
    expect(a.metrics).toMatchObject({ category: "no_patch", patch_lines: null });
  });

  it("rejects malformed diffs", async () => {
    const user = await newUser();
    const { next } = await getPlayState(user);
    const { active } = await startAttempt(user, next!.instance_id);
    await expect(submitAttempt(user, active.id, "not a diff", [])).rejects.toMatchObject({ status: 400 });
    const traversal = "diff --git a/../x b/../x\n--- a/../x\n+++ b/../x\n@@ -1 +1 @@\n-a\n+b\n";
    await expect(submitAttempt(user, active.id, traversal, [])).rejects.toMatchObject({ status: 400 });
  });

  it("auto-submits the autosaved draft when the clock runs out", async () => {
    const user = await newUser();
    const { next } = await getPlayState(user);
    const { active } = await startAttempt(user, next!.instance_id);
    await saveDraft(user, active.id, diffFor(next!.instance_id), []);

    const db = await getDb();
    await db
      .update(attempts)
      .set({ startedAt: new Date(Date.now() - 20 * 60_000), deadlineAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(attempts.id, active.id));

    await expect(submitAttempt(user, active.id, diffFor(next!.instance_id), [])).rejects.toMatchObject({
      code: "deadline_passed",
    });
    const [a] = await db.select().from(attempts).where(eq(attempts.id, active.id));
    expect(a).toMatchObject({ status: "submitted", autoSubmitted: true, elapsedMs: 15 * 60_000 });
    const [s] = await db.select().from(submissions).where(eq(submissions.attemptId, active.id));
    expect(s.status).toBe("queued");
  });

  it("expires an abandoned attempt with no draft as unresolved", async () => {
    const user = await newUser();
    const { next } = await getPlayState(user);
    const { active } = await startAttempt(user, next!.instance_id);
    const db = await getDb();
    await db.update(attempts).set({ deadlineAt: new Date(Date.now() - 60_000) }).where(eq(attempts.id, active.id));
    const state = await getPlayState(user);
    expect(state.active).toBeNull();
    const [a] = await db.select().from(attempts).where(eq(attempts.id, active.id));
    expect(a).toMatchObject({ status: "expired", outcome: "unresolved", outcomeReason: "timed_out_no_patch" });
  });

  it("flags large external pastes but still scores", async () => {
    const user = await newUser();
    const { next } = await getPlayState(user);
    const { active } = await startAttempt(user, next!.instance_id);
    await submitAttempt(user, active.id, diffFor(next!.instance_id), [{ t: 5000, chars: 2000, lines: 40, external: true }]);
    const db = await getDb();
    const [a] = await db.select().from(attempts).where(eq(attempts.id, active.id));
    expect(a.flagged).toBe(true);
    expect(a.flagReasons).toContain("large_external_paste");
  });
});

describe("scoring pipeline", () => {
  async function submitOne(marker = "") {
    const user = await newUser();
    const { next } = await getPlayState(user);
    const { active } = await startAttempt(user, next!.instance_id);
    const res = await submitAttempt(user, active.id, diffFor(next!.instance_id, marker), []);
    return { user, subId: res.submission_id!, instanceId: next!.instance_id };
  }

  it("retries infra errors and then succeeds", async () => {
    const { user, subId } = await submitOne("MOCK_INFRA_ONCE");
    const rerun = vi.spyOn(MockBackend.prototype, "rerun");
    await pumpQueue();
    await reconcile(); // completes with infra_error -> retrying
    const db = await getDb();
    let [s] = await db.select().from(submissions).where(eq(submissions.id, subId));
    expect(s).toMatchObject({ status: "retrying", retries: 1 });
    expect(rerun).toHaveBeenCalledTimes(1);
    const items = await userResults(user.id); // reconcile again -> resolved
    [s] = await db.select().from(submissions).where(eq(submissions.id, subId));
    expect(s.status).toBe("resolved");
    expect(items[0].phase).toBe("resolved");
  });

  it("gives up after repeated infra errors and never reports a failure", async () => {
    const { user, subId } = await submitOne("MOCK_INFRA");
    const issue = vi.spyOn(MockBackend.prototype, "openIssue");
    await pumpQueue();
    for (let i = 0; i < 4; i++) await reconcile();
    const db = await getDb();
    const [s] = await db.select().from(submissions).where(eq(submissions.id, subId));
    expect(s).toMatchObject({ status: "needs_attention", retries: 2 });
    expect(issue).toHaveBeenCalled();
    const items = await userResults(user.id);
    expect(items[0].phase).toBe("attention");
    // Not counted for or against the human.
    expect((await userSummary(user.id, "default")).human.n).toBe(0);
  });

  it("counts a patch that fails to apply as unresolved", async () => {
    const { user } = await submitOne("MOCK_APPLY_FAIL");
    await pumpQueue();
    await reconcile();
    const items = await userResults(user.id);
    expect(items[0]).toMatchObject({ phase: "unresolved", reason: "patch_apply_failed" });
    expect((await userSummary(user.id, "default")).metrics.categories.did_not_apply).toBe(1);
  });

  it("enforces the per-user concurrency cap", async () => {
    const user = await newUser();
    const db = await getDb();
    // Three queued submissions for one user (bypassing the one-at-a-time attempt flow).
    for (const iid of taskIds) {
      await db.insert(attempts).values({ id: `a-${iid}`, userId: user.id, instanceId: iid, status: "submitted", deadlineAt: new Date() });
      await db.insert(submissions).values({
        id: `s${iid.replace(/[^a-z0-9]/g, "")}`.slice(0, 20), attemptId: `a-${iid}`, userId: user.id, instanceId: iid,
        diff: diffFor(iid), diffSha: "x", filesChanged: 1, linesAdded: 1, linesRemoved: 1,
      });
    }
    const { config } = await import("@/lib/config");
    const prev = config.limits.maxActivePerUser;
    config.limits.maxActivePerUser = 2;
    try {
      expect(await pumpQueue()).toBe(2);
      expect(await pumpQueue()).toBe(0);
    } finally {
      config.limits.maxActivePerUser = prev;
    }
  });

  it("applies workflow_run webhooks by branch and ignores other repos", async () => {
    const { subId } = await submitOne();
    await pumpQueue();
    const db = await getDb();
    const [s] = await db.select().from(submissions).where(eq(submissions.id, subId));
    const { config } = await import("@/lib/config");
    const run = (status: RunInfo["status"], conclusion: string | null) => ({
      workflow_run: { id: 99, head_branch: s.branch, status, conclusion, run_attempt: 1, html_url: "x", path: ".github/workflows/score.yml" },
      repository: { full_name: config.github.submissionsRepo },
    });
    expect(await handleWorkflowRunEvent({ ...run("in_progress", null), repository: { full_name: "evil/repo" } })).toBe("ignored");
    expect(await handleWorkflowRunEvent(run("in_progress", null))).toBe("ok");
    let [row] = await db.select().from(submissions).where(eq(submissions.id, subId));
    expect(row.status).toBe("running");
    expect(await handleWorkflowRunEvent(run("completed", "success"))).toBe("ok");
    [row] = await db.select().from(submissions).where(eq(submissions.id, subId));
    expect(row.status).toBe("resolved");
    // Late/duplicate events after finalization are no-ops.
    expect(await handleWorkflowRunEvent(run("in_progress", null))).toBe("ok");
    [row] = await db.select().from(submissions).where(eq(submissions.id, subId));
    expect(row.status).toBe("resolved");
  });
});

describe("aggregate stats", () => {
  it("excludes flagged attempts", async () => {
    const a = await newUser();
    const b = await newUser();
    for (const [user, paste] of [[a, 0], [b, 5000]] as const) {
      const { next } = await getPlayState(user);
      const { active } = await startAttempt(user, next!.instance_id);
      await submitAttempt(user, active.id, diffFor(next!.instance_id), paste ? [{ t: 1, chars: paste, lines: 1, external: true }] : []);
    }
    await pumpQueue();
    await reconcile();
    const stats = await humanStats();
    expect(stats.humans).toBe(1);
    expect(stats.attempts).toBe(1);
    expect(stats.pooled.k).toBe(1);
  });
});
