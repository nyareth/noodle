-- Campus quiz platform: initial schema.
-- Design notes
--  * Live content (subjects / questions / answer_options / question_correct_answers) can be edited or deleted
--    by admins at any time.
--  * An attempt never points at live content for what the student saw: attempt_questions / attempt_options /
--    attempt_correct_options are a frozen copy taken when the attempt starts, so history and scores stay exact.
--  * Answer keys live in their own tables (question_correct_answers, attempt_correct_options). Student-facing
--    queries never touch them while an attempt is in progress.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL CHECK (length(btrim(name)) > 0),
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_email_shape CHECK (position('@' IN email) > 1)
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE subjects (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                      text,
  name                      text NOT NULL CHECK (length(btrim(name)) > 0),
  description               text,
  -- NULL = untimed. Total time limit for an attempt = number of questions * this value.
  time_per_question_seconds integer CHECK (time_per_question_seconds IS NULL OR time_per_question_seconds BETWEEN 5 AND 3600),
  -- score_only | correctness | answers | full  (see src/lib/services/attempts.ts)
  review_policy             text NOT NULL DEFAULT 'full' CHECK (review_policy IN ('score_only', 'correctness', 'answers', 'full')),
  questions_per_page        integer NOT NULL DEFAULT 1 CHECK (questions_per_page BETWEEN 1 AND 100),
  shuffle_options           boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subjects_code_key ON subjects (lower(code)) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX subjects_name_key ON subjects (lower(name));

CREATE TABLE questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY,   -- keeps the order questions were imported in
  subject_id  uuid NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
  external_id text NOT NULL CHECK (length(btrim(external_id)) > 0),
  type        text NOT NULL CHECK (type IN ('single_choice', 'multiple_choice')),
  text        text NOT NULL CHECK (length(btrim(text)) > 0),
  explanation text,
  image_key   text,   -- object key in the configured storage backend (uploaded from the dashboard)
  image_url   text,   -- or an external http(s) URL
  image_alt   text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questions_subject_external_key UNIQUE (subject_id, external_id),
  CONSTRAINT questions_single_image_source CHECK (image_key IS NULL OR image_url IS NULL),
  CONSTRAINT questions_image_url_scheme CHECK (image_url IS NULL OR image_url ~* '^https?://')
);
CREATE INDEX questions_subject_active_idx ON questions (subject_id) WHERE active;
CREATE INDEX questions_image_key_idx ON questions (image_key) WHERE image_key IS NOT NULL;

CREATE TABLE answer_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  position    integer NOT NULL CHECK (position >= 0),
  label       text NOT NULL CHECK (length(btrim(label)) > 0),
  text        text NOT NULL CHECK (length(btrim(text)) > 0),
  CONSTRAINT answer_options_position_key UNIQUE (question_id, position),
  CONSTRAINT answer_options_label_key UNIQUE (question_id, label),
  CONSTRAINT answer_options_question_id_key UNIQUE (question_id, id)   -- target of the composite FK below
);

-- Answer key. The composite FK guarantees a "correct" option really belongs to that question.
CREATE TABLE question_correct_answers (
  question_id uuid NOT NULL,
  option_id   uuid NOT NULL,
  PRIMARY KEY (question_id, option_id),
  FOREIGN KEY (question_id, option_id) REFERENCES answer_options (question_id, id) ON DELETE CASCADE
);

CREATE TABLE attempts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  subject_id         uuid REFERENCES subjects (id) ON DELETE SET NULL,
  subject_name       text NOT NULL,   -- frozen so history survives subject edits / deletion
  subject_code       text,
  status             text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'finished')),
  finish_reason      text CHECK (finish_reason IN ('submitted', 'time_expired')),
  review_policy      text NOT NULL CHECK (review_policy IN ('score_only', 'correctness', 'answers', 'full')),
  questions_per_page integer NOT NULL DEFAULT 1 CHECK (questions_per_page BETWEEN 1 AND 100),
  time_limit_seconds integer CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
  started_at         timestamptz NOT NULL DEFAULT now(),
  deadline_at        timestamptz,     -- enforced on the server
  finished_at        timestamptz,
  total_questions    integer NOT NULL CHECK (total_questions > 0),
  correct_count      integer,
  score_percent      numeric(5, 2),
  CONSTRAINT attempts_finished_has_time CHECK ((status = 'finished') = (finished_at IS NOT NULL)),
  CONSTRAINT attempts_finished_has_reason CHECK ((status = 'finished') = (finish_reason IS NOT NULL)),
  CONSTRAINT attempts_finished_has_score CHECK ((status = 'finished') = (correct_count IS NOT NULL AND score_percent IS NOT NULL)),
  CONSTRAINT attempts_correct_in_range CHECK (correct_count IS NULL OR correct_count BETWEEN 0 AND total_questions),
  CONSTRAINT attempts_percent_in_range CHECK (score_percent IS NULL OR score_percent BETWEEN 0 AND 100),
  CONSTRAINT attempts_deadline_matches_limit CHECK ((deadline_at IS NULL) = (time_limit_seconds IS NULL))
);
CREATE INDEX attempts_user_started_idx ON attempts (user_id, started_at DESC);
CREATE INDEX attempts_subject_idx ON attempts (subject_id);
CREATE INDEX attempts_open_deadline_idx ON attempts (deadline_at) WHERE status = 'in_progress';

-- The exact questions of an attempt, in displayed order, with their wording frozen.
CREATE TABLE attempt_questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  uuid NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
  position    integer NOT NULL CHECK (position >= 1),
  question_id uuid REFERENCES questions (id) ON DELETE SET NULL,
  external_id text NOT NULL,
  type        text NOT NULL CHECK (type IN ('single_choice', 'multiple_choice')),
  text        text NOT NULL,
  explanation text,
  image_key   text,
  image_url   text,
  image_alt   text,
  flagged     boolean NOT NULL DEFAULT false,
  is_correct  boolean,                         -- NULL until the attempt is graded
  CONSTRAINT attempt_questions_position_key UNIQUE (attempt_id, position),
  CONSTRAINT attempt_questions_question_key UNIQUE (attempt_id, question_id)
);
CREATE INDEX attempt_questions_question_idx ON attempt_questions (question_id);
CREATE INDEX attempt_questions_image_key_idx ON attempt_questions (image_key) WHERE image_key IS NOT NULL;

-- Options exactly as displayed (position = displayed order, which may be shuffled).
CREATE TABLE attempt_options (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_question_id uuid NOT NULL REFERENCES attempt_questions (id) ON DELETE CASCADE,
  position            integer NOT NULL CHECK (position >= 0),
  label               text NOT NULL,           -- label supplied in the import (A, B, ...)
  text                text NOT NULL,
  option_id           uuid REFERENCES answer_options (id) ON DELETE SET NULL,
  CONSTRAINT attempt_options_position_key UNIQUE (attempt_question_id, position),
  CONSTRAINT attempt_options_question_id_key UNIQUE (attempt_question_id, id)
);

-- Frozen answer key for the attempt. Never read by in-progress endpoints.
CREATE TABLE attempt_correct_options (
  attempt_question_id uuid NOT NULL,
  attempt_option_id   uuid NOT NULL,
  PRIMARY KEY (attempt_question_id, attempt_option_id),
  FOREIGN KEY (attempt_question_id, attempt_option_id) REFERENCES attempt_options (attempt_question_id, id) ON DELETE CASCADE
);

-- What the student selected (one row per selected option).
CREATE TABLE attempt_responses (
  attempt_question_id uuid NOT NULL,
  attempt_option_id   uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_question_id, attempt_option_id),
  FOREIGN KEY (attempt_question_id, attempt_option_id) REFERENCES attempt_options (attempt_question_id, id) ON DELETE CASCADE
);
