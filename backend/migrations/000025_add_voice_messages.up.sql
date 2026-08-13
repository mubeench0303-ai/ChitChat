ALTER TABLE messages
ADD COLUMN audio_url TEXT,
ADD COLUMN audio_duration_seconds INTEGER,
ADD COLUMN type TEXT NOT NULL DEFAULT 'text';

UPDATE messages
SET type = 'image'
WHERE image_url IS NOT NULL AND TRIM(image_url) <> '';

ALTER TABLE messages
ADD CONSTRAINT messages_type_check
    CHECK (type IN ('text', 'image', 'voice'));
