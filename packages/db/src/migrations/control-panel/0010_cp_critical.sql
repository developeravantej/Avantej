-- migration: 0010_cp_critical
-- description: audit-added — organizations.ownerUserId RESTRICT + admin_session_actions audit table
-- scope: control-panel database only

-- 1. organizations.ownerUserId: change FK ON DELETE from "no action" to RESTRICT
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_owner_user_id_user_id_fk";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_user_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- 2. admin_session_actions — per-action audit log for admin impersonation sessions
CREATE TABLE IF NOT EXISTS "admin_session_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_session_id" uuid NOT NULL,
  "action_type" text NOT NULL,
  "target_organization_id" uuid,
  "target_user_id" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "admin_session_actions" ADD CONSTRAINT "admin_session_actions_admin_session_id_admin_sessions_id_fk"
    FOREIGN KEY ("admin_session_id") REFERENCES "public"."admin_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "admin_session_actions" ADD CONSTRAINT "admin_session_actions_target_organization_id_organizations_id_fk"
    FOREIGN KEY ("target_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_session_actions_session_idx" ON "admin_session_actions" USING btree ("admin_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_session_actions_target_org_idx" ON "admin_session_actions" USING btree ("target_organization_id");
