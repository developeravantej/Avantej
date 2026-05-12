ALTER TABLE "package_instances" DROP COLUMN "credits_remaining";
--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "credits_remaining" integer GENERATED ALWAYS AS (COALESCE(credits_unlocked, credits_total) - credits_used) STORED NOT NULL;
