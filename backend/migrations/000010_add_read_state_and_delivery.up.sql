ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE TABLE conversation_read_state (
    conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_read_state_user_id_idx ON conversation_read_state (user_id);
