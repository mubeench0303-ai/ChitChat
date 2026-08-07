ALTER TABLE conversations
ADD COLUMN blocked_by UUID REFERENCES users(id);
