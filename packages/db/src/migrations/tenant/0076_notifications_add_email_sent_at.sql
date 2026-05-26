ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_email_sent_at_idx
  ON notifications (email_sent_at)
  WHERE email_sent_at IS NULL;
