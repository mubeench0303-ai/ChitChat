ALTER TABLE conversation_members
DROP COLUMN IF EXISTS pinned_at,
DROP COLUMN IF EXISTS is_pinned;
