// AUTO-GENERATED — do not edit. Run `bun scripts/gen-control-panel-migrations.ts` to regenerate.
// Source: packages/db/src/migrations/control-panel/*.sql
// Order: lex by filename (matches drizzle-kit ordering).

export const CONTROL_PANEL_MIGRATIONS = [
	{ tag: "0000_far_luminals", sql: `CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"tier" text NOT NULL,
	"organization_count_limit" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"neon_project_id" text NOT NULL,
	"connection_string" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"payment_status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"owner_user_id" text,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_neon_project_id_unique" UNIQUE("neon_project_id")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" text NOT NULL,
	"impersonated_user_id" text NOT NULL,
	"organization_id" uuid,
	"session_token" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	CONSTRAINT "admin_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_impersonated_user_id_user_id_fk" FOREIGN KEY ("impersonated_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "organizations_subscription_idx" ON "organizations" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "organizations_payment_status_idx" ON "organizations" USING btree ("payment_status");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_user_org_idx" ON "organization_members" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "org_members_org_idx" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_members_status_idx" ON "organization_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_admins_role_idx" ON "platform_admins" USING btree ("role");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_active_idx" ON "admin_sessions" USING btree ("ended_at") WHERE "admin_sessions"."ended_at" IS NULL;` },
	{ tag: "0001_redundant_stature", sql: `ALTER TABLE "organizations" ADD COLUMN "stripe_connect_account_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_connect_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_connect_account_type" text DEFAULT 'franchiser' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_connect_onboarding_completed_at" timestamp;--> statement-breakpoint
CREATE INDEX "organizations_stripe_connect_idx" ON "organizations" USING btree ("stripe_connect_account_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_connect_account_id_unique" UNIQUE("stripe_connect_account_id");` },
	{ tag: "0002_wealthy_mariko_yashida", sql: `ALTER TABLE "user" ADD COLUMN "role" text;` },
	{ tag: "0003_careful_mole_man", sql: `ALTER TABLE "user" ADD COLUMN "banned" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_expires" timestamp;` },
	{ tag: "0004_flaky_kang", sql: `ALTER TABLE "organizations" ADD COLUMN "schema_version" text DEFAULT '0000';` },
	{ tag: "0005_little_victor_mancha", sql: `CREATE TABLE "organization_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"total_customers" integer DEFAULT 0 NOT NULL,
	"active_customers" integer DEFAULT 0 NOT NULL,
	"total_bookings" integer DEFAULT 0 NOT NULL,
	"completed_bookings" integer DEFAULT 0 NOT NULL,
	"cancelled_bookings" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"monthly_revenue" integer DEFAULT 0 NOT NULL,
	"active_package_instances" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_analytics_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "organization_analytics" ADD CONSTRAINT "organization_analytics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_analytics_org_idx" ON "organization_analytics" USING btree ("organization_id");` },
	{ tag: "0006_free_bruce_banner", sql: `CREATE TABLE "ghl_location_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"webhook_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ghl_location_links" ADD CONSTRAINT "ghl_location_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_location_links_location_id_unique" ON "ghl_location_links" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "ghl_location_links_org_idx" ON "ghl_location_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ghl_location_links_active_idx" ON "ghl_location_links" USING btree ("is_active");` },
	{ tag: "0007_narrow_boom_boom", sql: `CREATE TABLE "organization_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_node_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_branches" ADD CONSTRAINT "organization_branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_branches_name_unique_idx" ON "organization_branches" USING btree ("name");--> statement-breakpoint
CREATE INDEX "org_branches_org_idx" ON "organization_branches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_branches_tenant_node_idx" ON "organization_branches" USING btree ("tenant_node_id");` },
	{ tag: "0008_cooing_the_spike", sql: `ALTER TABLE "organization_branches" ADD COLUMN "country" text;--> statement-breakpoint
CREATE INDEX "org_branches_country_idx" ON "organization_branches" USING btree ("country");` },
	{ tag: "0009_abandoned_blonde_phantom", sql: `ALTER TABLE "organization_branches" ADD COLUMN "country_tenant_node_id" uuid;--> statement-breakpoint
CREATE INDEX "org_branches_country_node_idx" ON "organization_branches" USING btree ("country_tenant_node_id");` },
	{ tag: "0010_cp_critical", sql: `-- migration: 0010_cp_critical
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
` },
	{ tag: "0010_rename_ghl_links_per_branch", sql: `ALTER TABLE "ghl_location_links" RENAME TO "ghl_branch_links";--> statement-breakpoint
ALTER TABLE "ghl_branch_links" RENAME COLUMN "location_id" TO "ghl_location_id";--> statement-breakpoint

-- Drop old indexes that reference the renamed table/column
DROP INDEX IF EXISTS "ghl_location_links_location_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_location_links_org_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_location_links_active_idx";--> statement-breakpoint

-- Add new columns. NOTE: NOT NULL adds work fine on a dev DB with 0 rows.
-- For prod (or dev DBs with existing rows) this would need a default + backfill;
-- out of scope for this task.
ALTER TABLE "ghl_branch_links" ADD COLUMN "tenant_branch_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ghl_branch_links" ADD COLUMN "ghl_api_key" text NOT NULL;--> statement-breakpoint

-- Rename FK constraint to match the new table name
ALTER TABLE "ghl_branch_links" DROP CONSTRAINT "ghl_location_links_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "ghl_branch_links" ADD CONSTRAINT "ghl_branch_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- New indexes matching the new schema definition
CREATE UNIQUE INDEX "ghl_branch_links_org_branch_unique" ON "ghl_branch_links" USING btree ("organization_id","tenant_branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_branch_links_ghl_location_unique" ON "ghl_branch_links" USING btree ("ghl_location_id");--> statement-breakpoint
CREATE INDEX "ghl_branch_links_org_idx" ON "ghl_branch_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ghl_branch_links_branch_idx" ON "ghl_branch_links" USING btree ("tenant_branch_id");--> statement-breakpoint
CREATE INDEX "ghl_branch_links_active_idx" ON "ghl_branch_links" USING btree ("is_active");
` },
	{ tag: "0011_worthless_black_tom", sql: `ALTER TABLE "ghl_branch_links" ADD COLUMN "existing_branch_custom_field_id" text;` },
	{ tag: "0012_ghl_org_shared", sql: `-- Phase G: add GHL org-shared sync columns to organizations (control panel DB).
-- Idempotent.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghl_location_id" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghl_api_key_encrypted" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghl_country_field_map" jsonb;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghl_provisioned_at" timestamp;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghl_sync_model" text;
--> statement-breakpoint
-- Default existing tenants to per-branch model to preserve current behavior.
UPDATE "organizations" SET "ghl_sync_model" = 'per-branch'
WHERE "ghl_sync_model" IS NULL;
` },
	{ tag: "0013_subscriptions_extensions", sql: `ALTER TABLE "subscriptions" ADD COLUMN "stripe_price_id" text NOT NULL DEFAULT 'price_legacy_seed';
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "stripe_price_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "application_fee_bps" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "application_fee_bps" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "currency" text DEFAULT 'usd' NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "past_due_at" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "grace_period_ends_at" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "current_period_start" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "current_period_end" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" text DEFAULT 'false' NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "canceled_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" ("status");
` },
	{ tag: "0014_subscriptions_cancel_bool_and_index", sql: `ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" TYPE boolean USING (cancel_at_period_end::boolean);
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_past_due_idx" ON "subscriptions" ("grace_period_ends_at") WHERE "status" = 'past_due';
` },
	{ tag: "0015_organizations_trial_and_connect_state", sql: `ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "subscription_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "charges_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "payouts_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "details_submitted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "connect_account_updated_at" timestamp;
` },
	{ tag: "0016_organizations_trial_idx", sql: `CREATE INDEX IF NOT EXISTS "organizations_trial_ends_at_idx" ON "organizations"("trial_ends_at") WHERE "trial_ends_at" IS NOT NULL;
` },
	{ tag: "0017_processed_webhook_events", sql: `CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
    "event_id" text PRIMARY KEY NOT NULL,
    "event_type" text NOT NULL,
    "source" text NOT NULL,
    "stripe_account" text,
    "received_at" timestamp DEFAULT now() NOT NULL,
    "processed_at" timestamp,
    "attempts" integer DEFAULT 1 NOT NULL,
    "error" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_webhook_events_type_idx" ON "processed_webhook_events"("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_webhook_events_source_idx" ON "processed_webhook_events"("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_webhook_events_received_idx" ON "processed_webhook_events"("received_at");
` },
	{ tag: "0018_platform_payment_ledger", sql: `CREATE TABLE IF NOT EXISTS "platform_payment_ledger" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid,
    "event_kind" text NOT NULL,
    "stripe_event_id" text NOT NULL,
    "stripe_object_id" text NOT NULL,
    "stripe_account" text,
    "amount" integer NOT NULL,
    "application_fee" integer DEFAULT 0 NOT NULL,
    "currency" text DEFAULT 'usd' NOT NULL,
    "occurred_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "platform_payment_ledger_stripe_event_id_unique" UNIQUE ("stripe_event_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_org_idx" ON "platform_payment_ledger"("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_event_kind_idx" ON "platform_payment_ledger"("event_kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_occurred_idx" ON "platform_payment_ledger"("occurred_at");
` },
	{ tag: "0019_org_country_stripe_accounts", sql: `-- Plan B Phase 4 — Per-country Stripe Connect accounts.
--
-- The Phase 1-3 model put a single stripe_connect_account_id on
-- organizations, scoped to one Stripe Connect Standard account (MY-only,
-- given the platform restriction at the time). Real franchises operate
-- across countries (MY / SG / TH branches), and each country needs its
-- own Stripe account (country-locked, native currency settlement).
--
-- This table holds one row per (organization, country) for the franchisee's
-- Stripe Connect account in that country. Branches resolve their acct via
-- their country hierarchy node -> country code -> this row.
--
-- Phase 1-3 single-acct rows on organizations are preserved during the
-- transition. A backfill script will copy the existing acct into a row here
-- with country derived from stripe.accounts.retrieve(). Callers continue
-- reading organizations.stripe_connect_account_id until the helper is
-- swapped to read this table, then the old column is dropped in a later
-- migration (1-release deprecation window).

CREATE TABLE IF NOT EXISTS "org_country_stripe_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "country_code" text NOT NULL,         -- ISO 3166-1 alpha-2 (MY, SG, TH, ...)
  "stripe_account_id" text UNIQUE,      -- acct_... (Standard via OAuth)
  "stripe_connect_status" text NOT NULL DEFAULT 'pending', -- pending | active | restricted | rejected
  "stripe_connect_account_type" text NOT NULL DEFAULT 'standard',
  "charges_enabled" boolean NOT NULL DEFAULT false,
  "payouts_enabled" boolean NOT NULL DEFAULT false,
  "details_submitted" boolean NOT NULL DEFAULT false,
  "currency" text NOT NULL,             -- MYR | SGD | THB | ...
  "stripe_connect_onboarding_completed_at" timestamp,
  "connect_account_updated_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_country_stripe_accounts_org_country_uq"
  ON "org_country_stripe_accounts" ("organization_id", "country_code");

CREATE INDEX IF NOT EXISTS "org_country_stripe_accounts_acct_idx"
  ON "org_country_stripe_accounts" ("stripe_account_id");
` },
	{ tag: "0020_drop_legacy_org_connect_columns", sql: `-- Plan B Phase 4.5 — Drop legacy org-level Stripe Connect columns.
--
-- All Connect state has migrated to org_country_stripe_accounts (Phase 4.1
-- + backfill ran in 4.1 for existing accts; ongoing flow via OAuth callback
-- + account.updated webhook since Phase 4.2/4.3). Callers no longer read
-- these columns (helper rewrites in Phase 4.4 + this commit).
--
-- Pre-flight verification (already done at code level):
--   - getConnectAccountForOrg reads org_country_stripe_accounts only
--   - getConnectAccountForOrgCountry — no legacy fallback
--   - stripeConnect.getAccountStatus reads org_country_stripe_accounts
--   - stripeConnect-oauth callback no longer writes legacy fields
--   - account.updated webhook no longer writes legacy fields
--   - grep -rn 'stripeConnectAccountId\\\\b' apps/server/src returns no matches
--     outside this migration / schema file
--
-- Rollback: re-create columns + index, then re-run the Phase 4.1 backfill in
-- reverse (copy org_country_stripe_accounts row → organizations columns).
-- Practical only if rollback happens within the same release.

DROP INDEX IF EXISTS "organizations_stripe_connect_idx";

ALTER TABLE "organizations"
  DROP COLUMN IF EXISTS "stripe_connect_account_id",
  DROP COLUMN IF EXISTS "stripe_connect_status",
  DROP COLUMN IF EXISTS "stripe_connect_account_type",
  DROP COLUMN IF EXISTS "stripe_connect_onboarding_completed_at",
  DROP COLUMN IF EXISTS "charges_enabled",
  DROP COLUMN IF EXISTS "payouts_enabled",
  DROP COLUMN IF EXISTS "details_submitted",
  DROP COLUMN IF EXISTS "connect_account_updated_at";
` },
	{ tag: "0021_plan_c_integrity_tables", sql: `-- Plan C Wave 1 — Payment integrity foundation tables.
--
-- Four new control-panel tables supporting:
--   - C.2 dispute handler (platform_dispute_queue)
--   - C.5 nightly reconciler (reconciliation_runs, payment_drift_log,
--     reconciliation_state)
--
-- platform_payment_ledger already exists from Plan A — C.7 wires writes
-- in a separate commit.

-- ── platform_dispute_queue (C.2) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "platform_dispute_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "stripe_account_id" text NOT NULL,
  "dispute_id" text NOT NULL UNIQUE,        -- dp_...
  "status" text NOT NULL,                    -- warning_needs_response | needs_response | under_review | won | lost | charge_refunded
  "amount" integer NOT NULL,                 -- minor units
  "currency" text NOT NULL,
  "reason" text,                             -- fraudulent | duplicate | requested_by_customer | etc.
  "deadline_at" timestamp,                   -- Stripe evidence deadline
  "handled_at" timestamp,
  "handled_by" text,                         -- platform admin user id
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "dispute_queue_org_idx" ON "platform_dispute_queue" ("organization_id");
CREATE INDEX IF NOT EXISTS "dispute_queue_status_idx" ON "platform_dispute_queue" ("status");
CREATE INDEX IF NOT EXISTS "dispute_queue_deadline_idx" ON "platform_dispute_queue" ("deadline_at");

-- ── reconciliation_runs (C.5) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reconciliation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_started_at" timestamp NOT NULL,
  "run_completed_at" timestamp,
  "status" text NOT NULL,                    -- running | completed | failed
  "drift_count" integer NOT NULL DEFAULT 0,
  "error" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ── payment_drift_log (C.5) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payment_drift_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "reconciliation_runs"("id") ON DELETE CASCADE,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
  "stripe_account_id" text,
  "resource_type" text NOT NULL,             -- charge | refund | payout | application_fee
  "resource_id" text NOT NULL,               -- ch_/re_/po_/fee_ id
  "severity" text NOT NULL,                  -- info | warn | critical
  "drift_kind" text NOT NULL,                -- missing_in_db | status_mismatch | amount_mismatch | currency_mismatch | ...
  "stripe_value" jsonb,
  "db_value" jsonb,
  "detected_at" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp,
  "resolved_by" text                         -- platform admin user id
);
CREATE INDEX IF NOT EXISTS "drift_run_idx" ON "payment_drift_log" ("run_id");
CREATE INDEX IF NOT EXISTS "drift_org_idx" ON "payment_drift_log" ("organization_id");
CREATE INDEX IF NOT EXISTS "drift_severity_idx" ON "payment_drift_log" ("severity");
CREATE INDEX IF NOT EXISTS "drift_unresolved_idx" ON "payment_drift_log" ("severity")
  WHERE "resolved_at" IS NULL;

-- ── reconciliation_state (C.5) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reconciliation_state" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "country_code" text NOT NULL,
  "resource_type" text NOT NULL,
  "last_reconciled_at" timestamp NOT NULL,
  PRIMARY KEY ("organization_id", "country_code", "resource_type")
);
` },
	{ tag: "0022_tenant_usage_snapshots", sql: `-- Plan E E.2 — Tenant Usage Snapshots
-- Daily-cron rollup of per-tenant usage. See ADR-0023.

CREATE TABLE IF NOT EXISTS "tenant_usage_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "snapshot_date" date NOT NULL,
  "member_count" integer NOT NULL DEFAULT 0,
  "customer_count" integer NOT NULL DEFAULT 0,
  "appt_count_30d" integer NOT NULL DEFAULT 0,
  "sales_total_30d_minor" integer NOT NULL DEFAULT 0,
  "sales_currency" text NOT NULL DEFAULT 'MYR',
  "storage_bytes" bigint NOT NULL DEFAULT 0,
  "ghl_active" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_usage_snapshots_org_date_uq"
  ON "tenant_usage_snapshots" ("organization_id", "snapshot_date");

CREATE INDEX IF NOT EXISTS "tenant_usage_snapshots_org_idx"
  ON "tenant_usage_snapshots" ("organization_id", "snapshot_date" DESC);
` },
	{ tag: "0023_admin_actions_direct_audit", sql: `-- Plan E E.3 — Allow admin_session_actions to record direct platform-admin
-- actions (lifecycle ops, comms, etc.) that don't occur within an
-- impersonation session.
--
-- Changes:
--   1. admin_session_id becomes nullable — direct actions have no session.
--   2. New admin_user_id column captures the actor for direct actions
--      (Better-Auth user id, plain text — no FK so audit survives user
--      deletion, mirroring target_user_id).
--   3. New index supports E.6 audit log queries by admin user.

ALTER TABLE "admin_session_actions"
  ALTER COLUMN "admin_session_id" DROP NOT NULL;

ALTER TABLE "admin_session_actions"
  ADD COLUMN IF NOT EXISTS "admin_user_id" text;

CREATE INDEX IF NOT EXISTS "admin_session_actions_admin_user_idx"
  ON "admin_session_actions" ("admin_user_id");
` },
	{ tag: "0024_tenant_deletions", sql: `-- Plan E E.8 — Tenant Deletions (GDPR soft + hard delete).
-- 30-day grace window before hard delete; restore zeroes restored_at.
-- See ADR-0026.

CREATE TABLE IF NOT EXISTS "tenant_deletions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "requested_at" timestamp DEFAULT now(),
  "requested_by" text NOT NULL,
  "hard_delete_after" timestamp NOT NULL,
  "restored_at" timestamp,
  "hard_deleted_at" timestamp,
  "export_url" text
);

-- Partial index — only rows that are still "open" (not restored, not hard-deleted)
-- can be picked up by the daily sweeper.
CREATE INDEX IF NOT EXISTS "tenant_deletions_hard_after_idx"
  ON "tenant_deletions" ("hard_delete_after")
  WHERE "hard_deleted_at" IS NULL AND "restored_at" IS NULL;

CREATE INDEX IF NOT EXISTS "tenant_deletions_org_idx"
  ON "tenant_deletions" ("organization_id");
` },
	{ tag: "0025_organizations_country_code", sql: `-- Plan E follow-up — country on organizations.
--
-- The E.7 provisioning wizard captured country (MY/SG/TH) but stashed it
-- in admin_session_actions.metadata only. Promote to a first-class column
-- so list/filter/drill-in can read it.
--
-- Nullable for existing rows; new tenants from the wizard always set it.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "country_code" text;

CREATE INDEX IF NOT EXISTS "organizations_country_code_idx"
  ON "organizations" ("country_code");
` },
	{ tag: "0026_tenant_notes", sql: `-- Plan F.1 — tenant_notes.
--
-- Internal platform-admin notes attached to a tenant org. Pinned,
-- append-only audit trail, 1-hour edit-own window then frozen.
-- Soft-delete via deleted_at to keep audit history intact.

CREATE TABLE tenant_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_user_id text NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  deleted_at timestamp
);
CREATE INDEX tenant_notes_org_idx ON tenant_notes (organization_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX tenant_notes_pinned_idx ON tenant_notes (organization_id, is_pinned, created_at DESC) WHERE deleted_at IS NULL;
` },
	{ tag: "0027_tenant_tags", sql: `-- Plan F.1 — tenant_tags.
--
-- Platform-admin labels attached to a tenant org (e.g. "enterprise",
-- "trial", "high-risk"). UNIQUE per (organization_id, label) so the
-- chip set per org is naturally deduped. No junction table — labels
-- are denormalised onto the org row via this 1:N table.
--
-- color is optional UI hint (e.g. "#ef4444" or tailwind token).
-- created_by_user_id is the Better-Auth user id (no FK so the tag
-- survives admin user deletion, mirroring tenant_notes).

CREATE TABLE tenant_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text,
  created_by_user_id text NOT NULL,
  created_at timestamp DEFAULT now(),
  UNIQUE (organization_id, label)
);
CREATE INDEX tenant_tags_label_idx ON tenant_tags (label);
CREATE INDEX tenant_tags_org_idx ON tenant_tags (organization_id);
` },
	{ tag: "0028_health_score_on_snapshots", sql: `-- Plan F.1.5 — Health score + risk flags on tenant_usage_snapshots (Agent H).
--
-- Adds two nullable columns to the existing daily snapshot table. The
-- cron will populate these on each new write from F.1.5 onward.
-- Historical rows stay NULL (no backfill — trend appears in 30d).
--
-- See ADR-0030 (health-score formula) and docs/plans/plan-f-ops-ux.md.

ALTER TABLE tenant_usage_snapshots
  ADD COLUMN IF NOT EXISTS health_score integer,
  ADD COLUMN IF NOT EXISTS risk_flags jsonb;
` },
	{ tag: "0029_comms_templates", sql: `-- Plan F.2.5 — Comms templates library (Agent C).
--
-- Reusable templates for direct-message and announcement composers.
-- The bulk composer (Agent B, next) and per-tenant compose flows pull
-- from this table. Soft-delete via archived_at — archived templates are
-- hidden from the picker but remain visible in the admin "All" view.
--
-- See docs/plans/plan-f-ops-ux.md (F.2.5 scope: outbox + template
-- library + bulk DM/announcement composer).

CREATE TABLE IF NOT EXISTS comms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body_markdown text NOT NULL,
  kind text NOT NULL,
  priority text,
  target_audience text,
  created_by_user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  archived_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS comms_templates_kind_idx
  ON comms_templates (kind)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS comms_templates_name_idx
  ON comms_templates (name);
` },
] as const;

export const CONTROL_PANEL_LATEST_MIGRATION_TAG =
	CONTROL_PANEL_MIGRATIONS[CONTROL_PANEL_MIGRATIONS.length - 1]!.tag;
