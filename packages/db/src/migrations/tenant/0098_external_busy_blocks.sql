-- 0098_external_busy_blocks (UAT §6 — Google Calendar pull-sync)
-- Busy intervals pulled from a connected Google Calendar so a coach's bookable
-- availability reflects events created outside Avantej. computeAvailableSlots
-- subtracts these exactly like booked appointments. Idempotent — safe to re-run
-- on partially migrated tenant branches.

CREATE TABLE IF NOT EXISTS "external_busy_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"summary" text,
	"source" text DEFAULT 'google' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "external_busy_blocks"
		ADD CONSTRAINT "external_busy_blocks_connection_id_google_calendar_connections_id_fk"
		FOREIGN KEY ("connection_id") REFERENCES "google_calendar_connections"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	ALTER TABLE "external_busy_blocks"
		ADD CONSTRAINT "external_busy_blocks_trainer_id_members_id_fk"
		FOREIGN KEY ("trainer_id") REFERENCES "members"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "external_busy_blocks_connection_event_unique"
	ON "external_busy_blocks" ("connection_id", "google_event_id");
CREATE INDEX IF NOT EXISTS "external_busy_blocks_trainer_window_idx"
	ON "external_busy_blocks" ("trainer_id", "start_time");
CREATE INDEX IF NOT EXISTS "external_busy_blocks_connection_idx"
	ON "external_busy_blocks" ("connection_id");
