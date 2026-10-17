import { sql } from "drizzle-orm";
import type { AttemptMetrics } from "@/lib/metrics";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
  login: text("login").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  /** Seeds this user's task order so coverage spreads evenly across the task set. */
  seed: integer("seed").notNull(),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export type PasteEvent = {
  /** ms since attempt start */
  t: number;
  chars: number;
  lines: number;
  /** false when the text was copied from inside the workspace (editor or issue). */
  external: boolean;
  file?: string;
};

export type AttemptStatus = "in_progress" | "submitted" | "expired";
/** Final, user-facing outcome of an attempt. null while pending. */
export type AttemptOutcome = "resolved" | "unresolved" | "excluded";

export const attempts = pgTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instanceId: text("instance_id").notNull(),
    status: text("status").$type<AttemptStatus>().notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    elapsedMs: integer("elapsed_ms"),
    draftDiff: text("draft_diff"),
    draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }),
    pasteEvents: jsonb("paste_events").$type<PasteEvent[]>().notNull().default(sql`'[]'::jsonb`),
    flagged: boolean("flagged").notNull().default(false),
    flagReasons: jsonb("flag_reasons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    autoSubmitted: boolean("auto_submitted").notNull().default(false),
    outcome: text("outcome").$type<AttemptOutcome>(),
    outcomeReason: text("outcome_reason"),
    /** Computed when the outcome is decided: time, test-level results, localization, patch size. */
    metrics: jsonb("metrics").$type<AttemptMetrics>(),
  },
  (t) => [
    uniqueIndex("attempts_user_instance").on(t.userId, t.instanceId),
    index("attempts_instance").on(t.instanceId),
    index("attempts_status").on(t.status),
  ],
);

export type SubmissionStatus =
  | "queued" // waiting for a scoring slot (our own queue, before a PR exists)
  | "dispatching" // claimed by a dispatcher, creating branch + PR
  | "dispatched" // PR open, waiting for a runner
  | "running" // workflow in progress
  | "retrying" // infra error, re-run requested
  | "resolved"
  | "unresolved"
  | "needs_attention"; // infra errors exhausted retries; we have to look

export type ScoreOutcome = "resolved" | "unresolved" | "patch_apply_failed" | "infra_error";

export interface ScoreResult {
  schema: number;
  instance_id: string;
  submission_id: string | null;
  outcome: ScoreOutcome;
  resolved: boolean;
  reason: string | null;
  tests: {
    fail_to_pass: { passed: string[]; failed: string[]; passed_count: number; failed_count: number };
    pass_to_pass: { failed: string[]; passed_count: number; failed_count: number };
  } | null;
  harness: { package: string; version: string | null; dataset: string };
  duration_s: number | null;
  log_tail?: string;
}

export const submissions = pgTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .unique()
      .references(() => attempts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instanceId: text("instance_id").notNull(),
    diff: text("diff").notNull(),
    diffSha: text("diff_sha").notNull(),
    filesChanged: integer("files_changed").notNull(),
    linesAdded: integer("lines_added").notNull(),
    linesRemoved: integer("lines_removed").notNull(),
    status: text("status").$type<SubmissionStatus>().notNull().default("queued"),
    outcome: text("outcome").$type<ScoreOutcome>(),
    reason: text("reason"),
    branch: text("branch"),
    prNumber: integer("pr_number"),
    runId: bigint("run_id", { mode: "number" }),
    /** Infra-error re-runs requested so far. */
    retries: integer("retries").notNull().default(0),
    /** Failed attempts to create the branch/PR (GitHub API errors). */
    dispatchFailures: integer("dispatch_failures").notNull().default(0),
    result: jsonb("result").$type<ScoreResult>(),
    error: text("error"),
    issueNumber: integer("issue_number"),
    createdAt: createdAt(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  },
  (t) => [
    index("submissions_status_created").on(t.status, t.createdAt),
    index("submissions_user").on(t.userId),
    index("submissions_branch").on(t.branch),
  ],
);

export const shares = pgTable("shares", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  public: boolean("public").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** GitHub webhook delivery ids, so redelivered events are processed once. */
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Share = typeof shares.$inferSelect;
