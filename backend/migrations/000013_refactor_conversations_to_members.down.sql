ALTER TABLE conversations
    ADD COLUMN user_one_id UUID REFERENCES users (id) ON DELETE CASCADE,
    ADD COLUMN user_two_id UUID REFERENCES users (id) ON DELETE CASCADE;

UPDATE conversations c
SET
    user_one_id = pair.user_one_id,
    user_two_id = pair.user_two_id
FROM (
    SELECT
        cm.conversation_id,
        MIN(cm.user_id) AS user_one_id,
        MAX(cm.user_id) AS user_two_id
    FROM conversation_members cm
    JOIN conversations conv ON conv.id = cm.conversation_id
    WHERE conv.type = 'direct'
    GROUP BY cm.conversation_id
    HAVING COUNT(*) = 2
) pair
WHERE c.id = pair.conversation_id;

ALTER TABLE conversations
    ALTER COLUMN user_one_id SET NOT NULL,
    ALTER COLUMN user_two_id SET NOT NULL;

ALTER TABLE conversations
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN requested_by SET NOT NULL;

DROP INDEX IF EXISTS conversations_direct_pair_key_unique;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_fields_check;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;

ALTER TABLE conversations
    DROP COLUMN IF EXISTS type,
    DROP COLUMN IF EXISTS name,
    DROP COLUMN IF EXISTS avatar_url,
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS direct_pair_key;

ALTER TABLE conversations
    ADD CONSTRAINT conversations_user_order_check CHECK (user_one_id < user_two_id),
    ADD CONSTRAINT conversations_unique_pair UNIQUE (user_one_id, user_two_id);

CREATE INDEX conversations_user_one_id_idx ON conversations (user_one_id);
CREATE INDEX conversations_user_two_id_idx ON conversations (user_two_id);

DROP TABLE IF EXISTS conversation_members;
