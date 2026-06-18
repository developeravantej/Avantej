-- Per-tenant default local-part for the sender address (e.g. "support",
-- "noreply"). Nullable so we can tell "admin never configured" apart from
-- "admin explicitly set support".

ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS default_local_part text;
