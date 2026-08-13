ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_type_check;

ALTER TABLE messages
DROP COLUMN IF EXISTS audio_url,
DROP COLUMN IF EXISTS audio_duration_seconds,
DROP COLUMN IF EXISTS type;
