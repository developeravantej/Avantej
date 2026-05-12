CREATE TABLE IF NOT EXISTS "member_service_buffer_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"buffer_time_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "msbo_member_service_unique_idx" UNIQUE ("member_id","service_id")
);
--> statement-breakpoint
ALTER TABLE "member_service_buffer_overrides" ADD CONSTRAINT "member_service_buffer_overrides_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_service_buffer_overrides" ADD CONSTRAINT "member_service_buffer_overrides_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msbo_member_idx" ON "member_service_buffer_overrides" USING btree ("member_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msbo_service_idx" ON "member_service_buffer_overrides" USING btree ("service_id");
--> statement-breakpoint
INSERT INTO member_service_buffer_overrides (member_id, service_id, buffer_time_minutes)
SELECT mcbo.member_id, sm.service_id, mcbo.buffer_time_minutes
FROM member_category_buffer_overrides mcbo
JOIN service_members sm ON sm.member_id = mcbo.member_id
JOIN services s ON s.id = sm.service_id AND s.category_id = mcbo.category_id
ON CONFLICT (member_id, service_id) DO NOTHING;
