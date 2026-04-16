ALTER TABLE "service_category_config" ADD COLUMN "buffer_time_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_members" ADD COLUMN "buffer_time_minutes" integer;