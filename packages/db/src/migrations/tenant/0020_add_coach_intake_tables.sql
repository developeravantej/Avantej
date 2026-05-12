-- NOVEL: adds coach_intake_availability + coach_intake_exceptions tables.
-- Rewritten with idempotent guards so re-running succeeds on tenants that
-- already have the tables / constraints / indexes.
CREATE TABLE IF NOT EXISTS "coach_intake_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coach_intake_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_intake_exc_unique" UNIQUE("trainer_id","date","start_time","end_time")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "coach_intake_availability" ADD CONSTRAINT "coach_intake_availability_trainer_id_members_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "coach_intake_exceptions" ADD CONSTRAINT "coach_intake_exceptions_trainer_id_members_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_intake_trainer_idx" ON "coach_intake_availability" USING btree ("trainer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_intake_trainer_day_idx" ON "coach_intake_availability" USING btree ("trainer_id","day_of_week");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_intake_exc_trainer_date_idx" ON "coach_intake_exceptions" USING btree ("trainer_id","date");
