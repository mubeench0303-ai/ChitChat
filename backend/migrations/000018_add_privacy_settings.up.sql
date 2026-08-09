ALTER TABLE users
ADD COLUMN privacy_last_seen TEXT NOT NULL DEFAULT 'everyone'
    CHECK (privacy_last_seen IN ('everyone', 'connections', 'connections_except', 'nobody')),
ADD COLUMN privacy_online_status TEXT NOT NULL DEFAULT 'everyone'
    CHECK (privacy_online_status IN ('everyone', 'connections', 'connections_except', 'nobody')),
ADD COLUMN privacy_profile_photo TEXT NOT NULL DEFAULT 'everyone'
    CHECK (privacy_profile_photo IN ('everyone', 'connections', 'connections_except', 'nobody')),
ADD COLUMN privacy_bio TEXT NOT NULL DEFAULT 'everyone'
    CHECK (privacy_bio IN ('everyone', 'connections', 'connections_except', 'nobody'));

CREATE TABLE privacy_exceptions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    field            TEXT NOT NULL
        CHECK (field IN ('last_seen', 'online_status', 'profile_photo', 'bio')),
    excluded_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, field, excluded_user_id)
);

CREATE INDEX privacy_exceptions_user_id_idx ON privacy_exceptions (user_id);
CREATE INDEX privacy_exceptions_user_id_field_idx ON privacy_exceptions (user_id, field);
