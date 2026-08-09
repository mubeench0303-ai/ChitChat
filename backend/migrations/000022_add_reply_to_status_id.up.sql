ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS reply_to_status_id UUID REFERENCES statuses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_reply_to_status_id_idx ON messages (reply_to_status_id);
