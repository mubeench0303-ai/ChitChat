ALTER TABLE users
    ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO users (
    id,
    username,
    full_name,
    email,
    password_hash,
    is_verified,
    is_system,
    avatar_url
)
VALUES (
    'a1000000-0000-4000-8000-000000000001',
    'ai-assistant',
    'AI Assistant',
    'ai-assistant@system.chitchat.local',
    '$2a$12$AIAssistantNoLoginHashPlaceholderXXXXXXXXXXXXXXXXXXX',
    TRUE,
    TRUE,
    NULL
)
ON CONFLICT (id) DO NOTHING;
