-- Banner image for each subject (shown on the subject cards and the subject page).
-- banner_key is the key returned by the storage driver (UploadThing file key, or <uuid>.<ext> for local files).
ALTER TABLE subjects ADD COLUMN banner_key text;
CREATE INDEX subjects_banner_key_idx ON subjects (banner_key) WHERE banner_key IS NOT NULL;
