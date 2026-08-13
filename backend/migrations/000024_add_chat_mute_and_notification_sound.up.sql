ALTER TABLE conversation_members
ADD COLUMN is_muted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
ADD COLUMN notification_sound_enabled BOOLEAN NOT NULL DEFAULT true;
