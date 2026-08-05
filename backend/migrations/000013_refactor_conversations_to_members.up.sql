CREATE TABLE conversation_members (
    conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_members_user_id_idx ON conversation_members (user_id);

ALTER TABLE conversations
    ADD COLUMN type TEXT NOT NULL DEFAULT 'direct',
    ADD COLUMN name TEXT,
    ADD COLUMN avatar_url TEXT,
    ADD COLUMN created_by UUID REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN direct_pair_key TEXT;

ALTER TABLE conversations
    ADD CONSTRAINT conversations_type_check CHECK (type IN ('direct', 'group'));

UPDATE conversations
SET
    direct_pair_key = LEAST(user_one_id::text, user_two_id::text) || '_' ||
                      GREATEST(user_one_id::text, user_two_id::text),
    created_by = requested_by;

INSERT INTO conversation_members (conversation_id, user_id, role)
SELECT id, user_one_id, 'member'
FROM conversations
UNION ALL
SELECT id, user_two_id, 'member'
FROM conversations;

ALTER TABLE conversations
    ALTER COLUMN status DROP NOT NULL,
    ALTER COLUMN requested_by DROP NOT NULL;

ALTER TABLE conversations
    ADD CONSTRAINT conversations_type_fields_check CHECK (
        (
            type = 'direct'
            AND name IS NULL
            AND avatar_url IS NULL
            AND direct_pair_key IS NOT NULL
            AND status IS NOT NULL
            AND requested_by IS NOT NULL
        )
        OR
        (
            type = 'group'
            AND status IS NULL
            AND requested_by IS NULL
            AND direct_pair_key IS NULL
        )
    );

CREATE UNIQUE INDEX conversations_direct_pair_key_unique
    ON conversations (direct_pair_key)
    WHERE type = 'direct';

ALTER TABLE conversations DROP CONSTRAINT conversations_unique_pair;
ALTER TABLE conversations DROP CONSTRAINT conversations_user_order_check;

DROP INDEX IF EXISTS conversations_user_one_id_idx;
DROP INDEX IF EXISTS conversations_user_two_id_idx;

ALTER TABLE conversations
    DROP COLUMN user_one_id,
    DROP COLUMN user_two_id;
