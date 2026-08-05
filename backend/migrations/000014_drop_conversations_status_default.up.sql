-- Migration 000013 made status nullable for group conversations but left the
-- original DEFAULT 'pending' from 000005. Group inserts require status IS NULL.
ALTER TABLE conversations
    ALTER COLUMN status DROP DEFAULT;
