ALTER TABLE privacy_exceptions
DROP CONSTRAINT IF EXISTS privacy_exceptions_field_check;

ALTER TABLE privacy_exceptions
ADD CONSTRAINT privacy_exceptions_field_check
    CHECK (field IN ('last_seen', 'online_status', 'profile_photo', 'bio'));

ALTER TABLE users
DROP COLUMN IF EXISTS privacy_status;

DROP TABLE IF EXISTS status_views;
DROP TABLE IF EXISTS statuses;
