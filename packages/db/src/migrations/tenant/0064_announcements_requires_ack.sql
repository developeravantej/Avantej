ALTER TABLE announcements ADD COLUMN IF NOT EXISTS requires_acknowledgement boolean NOT NULL DEFAULT false;
