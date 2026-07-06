-- 0041 — email_domains: Cloudflare Email provider support (Phase 3).
--
-- Adds a provider discriminator + Cloudflare identity/onboarding columns so
-- Resend and Cloudflare sending-domain rows can coexist during the migration.
-- Existing rows stay provider='resend' and keep working. Idempotent + additive.

ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'resend';
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS cf_zone_id text;
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS cf_subdomain_id text;
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS onboarding_tier text; -- 'default' | 'delegated' | 'bare'

-- Cloudflare rows have no Resend domain id, so relax the NOT NULL. The existing
-- UNIQUE stays (Postgres treats NULLs as distinct → multiple CF rows are fine).
ALTER TABLE email_domains ALTER COLUMN resend_domain_id DROP NOT NULL;
