DROP TABLE IF EXISTS conversation_read_state;

ALTER TABLE messages
    DROP COLUMN IF EXISTS delivered_at;
