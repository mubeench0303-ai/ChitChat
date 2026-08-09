DROP TABLE IF EXISTS privacy_exceptions;

ALTER TABLE users
DROP COLUMN IF EXISTS privacy_last_seen,
DROP COLUMN IF EXISTS privacy_online_status,
DROP COLUMN IF EXISTS privacy_profile_photo,
DROP COLUMN IF EXISTS privacy_bio;
