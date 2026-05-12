CREATE TABLE IF NOT EXISTS member_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  impersonated_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  admin_user_id text NOT NULL,
  impersonated_user_id text NOT NULL,
  session_token text NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS member_sessions_admin_idx ON member_sessions(admin_member_id);
CREATE INDEX IF NOT EXISTS member_sessions_active_idx ON member_sessions(ended_at) WHERE ended_at IS NULL;
