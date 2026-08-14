ALTER TABLE statuses DROP CONSTRAINT IF EXISTS statuses_type_check;

ALTER TABLE statuses ADD CONSTRAINT statuses_type_check
    CHECK (type IN ('text', 'image'));

ALTER TABLE statuses
DROP COLUMN IF EXISTS video_url,
DROP COLUMN IF EXISTS video_duration_seconds;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;

ALTER TABLE messages ADD CONSTRAINT messages_type_check
    CHECK (type IN ('text', 'image', 'voice'));

ALTER TABLE messages
DROP COLUMN IF EXISTS video_url,
DROP COLUMN IF EXISTS video_duration_seconds;
