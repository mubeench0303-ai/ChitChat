ALTER TABLE conversation_members
ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN pinned_at TIMESTAMPTZ;
