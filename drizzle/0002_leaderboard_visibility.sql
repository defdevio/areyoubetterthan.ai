ALTER TABLE "users" ADD COLUMN "leaderboard_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "leaderboard_hidden" boolean DEFAULT false NOT NULL;