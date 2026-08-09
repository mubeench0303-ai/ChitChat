CREATE TABLE statuses (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type             TEXT NOT NULL CHECK (type IN ('text', 'image')),
    content          TEXT,
    image_url        TEXT,
    background_color TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_statuses_user_created ON statuses (user_id, created_at);

CREATE TABLE status_views (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_id UUID NOT NULL REFERENCES statuses (id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (status_id, viewer_id)
);

ALTER TABLE users
ADD COLUMN privacy_status TEXT NOT NULL DEFAULT 'connections'
    CHECK (privacy_status IN ('everyone', 'connections', 'connections_except', 'nobody'));

ALTER TABLE privacy_exceptions
DROP CONSTRAINT IF EXISTS privacy_exceptions_field_check;

ALTER TABLE privacy_exceptions
ADD CONSTRAINT privacy_exceptions_field_check
    CHECK (field IN ('last_seen', 'online_status', 'profile_photo', 'bio', 'status'));
