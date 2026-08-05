CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE verification_type AS ENUM (
    'email_verify',
    'password_reset'
);

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE verification_codes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code       VARCHAR(255) NOT NULL,
    type       verification_type NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX verification_codes_user_id_idx ON verification_codes (user_id);
CREATE INDEX verification_codes_type_idx ON verification_codes (type);
CREATE INDEX verification_codes_expires_at_idx ON verification_codes (expires_at);
