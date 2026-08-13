ALTER TABLE users
ADD COLUMN privacy_last_seen_and_online TEXT NOT NULL DEFAULT 'everyone'
    CHECK (privacy_last_seen_and_online IN ('everyone', 'connections', 'connections_except', 'nobody'));

UPDATE users
SET privacy_last_seen_and_online = CASE
    WHEN privacy_last_seen = 'nobody' OR privacy_online_status = 'nobody' THEN 'nobody'
    WHEN privacy_last_seen = 'connections_except' OR privacy_online_status = 'connections_except' THEN 'connections_except'
    WHEN privacy_last_seen = 'connections' OR privacy_online_status = 'connections' THEN 'connections'
    ELSE 'everyone'
END;

ALTER TABLE users
DROP COLUMN privacy_last_seen,
DROP COLUMN privacy_online_status;

UPDATE privacy_exceptions
SET field = 'last_seen_and_online'
WHERE field = 'last_seen';

INSERT INTO privacy_exceptions (user_id, field, excluded_user_id, created_at)
SELECT user_id, 'last_seen_and_online', excluded_user_id, created_at
FROM privacy_exceptions pe
WHERE field = 'online_status'
  AND NOT EXISTS (
      SELECT 1
      FROM privacy_exceptions existing
      WHERE existing.user_id = pe.user_id
        AND existing.field = 'last_seen_and_online'
        AND existing.excluded_user_id = pe.excluded_user_id
  );

DELETE FROM privacy_exceptions
WHERE field = 'online_status';

ALTER TABLE privacy_exceptions
DROP CONSTRAINT IF EXISTS privacy_exceptions_field_check;

ALTER TABLE privacy_exceptions
ADD CONSTRAINT privacy_exceptions_field_check
    CHECK (field IN ('last_seen_and_online', 'profile_photo', 'bio', 'status'));
