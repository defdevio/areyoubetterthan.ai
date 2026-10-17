CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"elapsed_ms" integer,
	"draft_diff" text,
	"draft_updated_at" timestamp with time zone,
	"paste_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_submitted" boolean DEFAULT false NOT NULL,
	"outcome" text,
	"outcome_reason" text
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"user_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"diff" text NOT NULL,
	"diff_sha" text NOT NULL,
	"files_changed" integer NOT NULL,
	"lines_added" integer NOT NULL,
	"lines_removed" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"outcome" text,
	"reason" text,
	"branch" text,
	"pr_number" integer,
	"run_id" bigint,
	"retries" integer DEFAULT 0 NOT NULL,
	"dispatch_failures" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" text,
	"issue_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	CONSTRAINT "submissions_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"github_id" bigint NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"seed" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_user_instance" ON "attempts" USING btree ("user_id","instance_id");--> statement-breakpoint
CREATE INDEX "attempts_instance" ON "attempts" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "attempts_status" ON "attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "submissions_status_created" ON "submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "submissions_user" ON "submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "submissions_branch" ON "submissions" USING btree ("branch");