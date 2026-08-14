ALTER TABLE messages
ADD COLUMN video_url TEXT,
ADD COLUMN video_duration_seconds INTEGER;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;

ALTER TABLE messages ADD CONSTRAINT messages_type_check
    CHECK (type IN ('text', 'image', 'voice', 'video'));

ALTER TABLE statuses
ADD COLUMN video_url TEXT,
ADD COLUMN video_duration_seconds INTEGER;

ALTER TABLE statuses DROP CONSTRAINT IF EXISTS statuses_type_check;

ALTER TABLE statuses ADD CONSTRAINT statuses_type_check
    CHECK (type IN ('text', 'image', 'video'));
