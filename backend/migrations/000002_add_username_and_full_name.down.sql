DROP INDEX IF EXISTS users_username_key;

ALTER TABLE users DROP COLUMN full_name;

ALTER TABLE users RENAME COLUMN username TO name;
