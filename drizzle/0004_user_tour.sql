ALTER TABLE "users" ADD COLUMN "tour_completed_at" timestamp with time zone;--> statement-breakpoint
-- Existing players already took the test, so they skip the tour.
UPDATE "users" SET "tour_completed_at" = now() WHERE "id" IN (SELECT "user_id" FROM "attempts");