ALTER TABLE users
ADD COLUMN privacy_last_seen TEXT NOT NULL DEFAULT 'everyone'
    CHECK (privacy_last_seen IN ('everyone', 'connections', 'connections_except', 'nobody')),
ADD COLUMN privacy_online_status TEXT NOT NULL DEFAULT 'everyone'
    CHECK (privacy_online_status IN ('everyone', 'connections', 'connections_except', 'nobody'));

UPDATE users
SET
    privacy_last_seen = privacy_last_seen_and_online,
    privacy_online_status = privacy_last_seen_and_online;

ALTER TABLE users
DROP COLUMN privacy_last_seen_and_online;

UPDATE privacy_exceptions
SET field = 'last_seen'
WHERE field = 'last_seen_and_online';

ALTER TABLE privacy_exceptions
DROP CONSTRAINT IF EXISTS privacy_exceptions_field_check;

ALTER TABLE privacy_exceptions
ADD CONSTRAINT privacy_exceptions_field_check
    CHECK (field IN ('last_seen', 'online_status', 'profile_photo', 'bio', 'status'));
