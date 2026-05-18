-- Plan E E.3 — Allow admin_session_actions to record direct platform-admin
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
