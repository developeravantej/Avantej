CREATE TABLE IF NOT EXISTS "google_calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"google_email" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"sync_scope" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_calendar_event_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "google_calendar_event_id" text;
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "google_calendar_event_mappings" ADD CONSTRAINT "gcal_event_mappings_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "google_calendar_event_mappings" ADD CONSTRAINT "gcal_event_mappings_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gcal_connections_member_idx" ON "google_calendar_connections" USING btree ("member_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gcal_connections_active_idx" ON "google_calendar_connections" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gcal_connections_scope_idx" ON "google_calendar_connections" USING btree ("sync_scope");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gcal_event_map_appt_conn_idx" ON "google_calendar_event_mappings" USING btree ("appointment_id","connection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gcal_event_map_appt_idx" ON "google_calendar_event_mappings" USING btree ("appointment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gcal_event_map_conn_idx" ON "google_calendar_event_mappings" USING btree ("connection_id");
