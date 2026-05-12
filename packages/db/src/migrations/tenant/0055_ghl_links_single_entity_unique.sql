-- Phase G: flip ghl_contact_links and ghl_user_links unique constraints from
-- (entity, branch) → (entity). Reflects org-shared GHL model: one customer
-- maps to ONE GHL contact per org; one member maps to ONE GHL user per org.

-- Pre-flight: detect duplicate (customer_profile_id) rows that would block the
-- new unique. If any tenant has >1 row per customer, hard-fail with a clear
-- message so the operator can dedupe before retrying.
DO $$
DECLARE
  dup_count int;
  offending_ids text;
BEGIN
  SELECT count(*), string_agg(customer_profile_id::text, ', ')
    INTO dup_count, offending_ids
  FROM (
    SELECT customer_profile_id FROM ghl_contact_links
    GROUP BY customer_profile_id HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % customer_profile_id(s) in ghl_contact_links have multiple rows. Offending: %. Dedupe before applying.', dup_count, offending_ids;
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  dup_count int;
  offending_ids text;
BEGIN
  SELECT count(*), string_agg(member_id::text, ', ')
    INTO dup_count, offending_ids
  FROM (
    SELECT member_id FROM ghl_user_links
    GROUP BY member_id HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % member_id(s) in ghl_user_links have multiple rows. Offending: %. Dedupe before applying.', dup_count, offending_ids;
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_contact_links_customer_branch_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_user_links_member_branch_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_contact_links_customer_unique" ON "ghl_contact_links" ("customer_profile_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_user_links_member_unique" ON "ghl_user_links" ("member_id");
