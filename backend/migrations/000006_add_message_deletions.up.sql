CREATE TABLE message_deletions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  UUID NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT message_deletions_unique UNIQUE (message_id, user_id)
);

CREATE INDEX message_deletions_user_id_idx ON message_deletions (user_id);
CREATE INDEX message_deletions_message_id_idx ON message_deletions (message_id);
