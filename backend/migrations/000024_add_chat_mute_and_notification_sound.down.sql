ALTER TABLE conversation_members
DROP COLUMN IF EXISTS is_muted;

ALTER TABLE users
DROP COLUMN IF EXISTS notification_sound_enabled;
