-- Phase H2: split branch-specific columns into branch_details table.
-- hierarchy_nodes.address + hierarchy_nodes.pic_user_id were only populated
-- on type='branch' rows; sparse columns on the parent table are a smell.

CREATE TABLE IF NOT EXISTS "branch_details" (
  "node_id" uuid PRIMARY KEY REFERENCES "hierarchy_nodes"("id") ON DELETE CASCADE,
  "address" text,
  "pic_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Backfill: move existing data from hierarchy_nodes for branch rows.
INSERT INTO "branch_details" ("node_id", "address", "pic_user_id")
SELECT id, address, pic_user_id FROM hierarchy_nodes
WHERE type = 'branch' AND (address IS NOT NULL OR pic_user_id IS NOT NULL)
ON CONFLICT (node_id) DO UPDATE SET
  address = EXCLUDED.address,
  pic_user_id = EXCLUDED.pic_user_id,
  updated_at = now();
--> statement-breakpoint

-- Drop the moved columns from hierarchy_nodes. IF EXISTS makes this idempotent.
ALTER TABLE "hierarchy_nodes" DROP COLUMN IF EXISTS "address";
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" DROP COLUMN IF EXISTS "pic_user_id";
--> statement-breakpoint

-- Index pic_user_id on branch_details for member lookups.
CREATE INDEX IF NOT EXISTS "branch_details_pic_user_idx" ON "branch_details" ("pic_user_id");
