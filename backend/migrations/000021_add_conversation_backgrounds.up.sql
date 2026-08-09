ALTER TABLE conversation_members
ADD COLUMN background_type TEXT NOT NULL DEFAULT 'default'
    CHECK (background_type IN ('default', 'preset', 'custom')),
ADD COLUMN background_value TEXT;
