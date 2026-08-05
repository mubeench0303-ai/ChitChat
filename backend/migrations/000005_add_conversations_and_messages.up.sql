CREATE TABLE conversations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_one_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_two_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'blocked')),
    requested_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT conversations_user_order_check CHECK (user_one_id < user_two_id),
    CONSTRAINT conversations_unique_pair UNIQUE (user_one_id, user_two_id)
);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX conversations_user_one_id_idx ON conversations (user_one_id);
CREATE INDEX conversations_user_two_id_idx ON conversations (user_two_id);
CREATE INDEX messages_conversation_id_idx ON messages (conversation_id);
CREATE INDEX messages_sender_id_idx ON messages (sender_id);
