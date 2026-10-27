# Campus Quiz Practice

A practice-quiz site for a campus (built for ~50 students) whose quiz-taking pages are modelled on Moodle's
quiz attempt interface. One Next.js app (App Router, TypeScript) with PostgreSQL behind it - no Rails, no
queues, no extra services.

* Students: sign in, pick a subject, choose how many questions, get a random set, flag questions, submit,
  see their score and review, and retake as often as they like (every attempt is kept).
* Admins: manage subjects, import the question bank from JSON (validate + preview first), browse / search /
  edit / delete questions, attach images, inspect attempts and scores, manage users.

## Run it

Requirements: Node 20.9+ (22 recommended) and PostgreSQL 13+ (Docker is the easiest way).

```bash
npm install
cp .env.example .env            # defaults work for local development
docker compose up -d db         # or point DATABASE_URL at your own PostgreSQL
npm run db:migrate              # creates the tables
npm run db:seed                 # admin + demo student + a 12-question sample subject (NET101)
npm run dev                     # http://localhost:3000
```

Seeded accounts (change the admin password before real use - `ADMIN_PASSWORD` in `.env`, or Admin > Users):

| role    | e-mail               | password       |
|---------|----------------------|----------------|
| admin   | admin@campus.test    | ChangeMe123!   |
| student | student@campus.test  | Student123!    |

Production: `npm run build && npm start`, behind a reverse proxy with HTTPS (Caddy / nginx). The proxy must
send `X-Forwarded-Proto` and `X-Forwarded-For`. Back up the database (`pg_dump`) and the `uploads/` folder if you
use local image storage.

Tests (API level, against a running server and a migrated + seeded database):

```bash
npm run build && npm start &    # or npm run dev
BASE_URL=http://localhost:3000 npm test
```

## Environment variables

Only `DATABASE_URL` is required. Everything else has a default (see `.env.example`).

| variable | purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SITE_NAME`, `APP_TIMEZONE` | name in the navbar; time zone for dates (default `Asia/Kuala_Lumpur`) |
| `ANSWER_NUMBERING` | `abc` (Moodle default, "a. b. c."), `ABCD`, `123`, `none` |
| `ALLOW_REGISTRATION`, `ALLOWED_EMAIL_DOMAIN` | self sign-up on/off; optionally only these e-mail domains |
| `SESSION_DAYS`, `BCRYPT_COST`, `COOKIE_SECURE`, `TRUSTED_ORIGINS` | sessions and security (cookie `Secure` is auto-detected from HTTPS) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `SEED_DEMO_DATA` | used by `npm run db:seed` |
| `MAX_QUESTIONS_PER_ATTEMPT`, `DEADLINE_GRACE_SECONDS` | quiz limits |
| `STORAGE_DRIVER` (`local` or `s3`), `LOCAL_UPLOAD_DIR`, `MAX_IMAGE_BYTES`, `S3_*` | where question images are stored |

## Importing questions

Admin > **Import questions**. Paste or choose the JSON, press *Validate and preview*, check the questions and
their marked answers, then import. The format is exactly the one in the brief:

```json
{
  "subject": { "name": "Computer Networking", "code": "NET101" },
  "questions": [
    {
      "external_id": "net-001",
      "text": "Which characteristic allows a network to expand rapidly?",
      "type": "single_choice",
      "options": [ { "label": "A", "text": "Scalability" }, { "label": "B", "text": "Quality of service" } ],
      "correct_answers": ["A"],
      "explanation": null,
      "image": null
    }
  ]
}
```

* Nothing is guessed or "fixed": wording, option order and answer keys are stored as supplied. A wrong label,
  two answers on a `single_choice`, a duplicate id, a bad type... each becomes an error naming the question.
  The import is all-or-nothing.
* `external_id` is the duplicate guard. Re-importing the same file adds nothing; choose *update* to overwrite
  questions that already exist (past attempts are unaffected). Same wording under a different id is flagged as a warning.
* Subjects are matched by `code` (or by name when there is no code); an unknown subject is created.
* `image` is `null` or an https URL. Attach/replace/remove uploaded images from Admin > Questions > Edit.
* Question text is plain text shown literally (no HTML/Markdown surprises). Blank lines make paragraphs,
  lines starting with `- ` or `1. ` make lists, ``` fences make code blocks, and `$x^2$` / `$$...$$` render as math (KaTeX).

## How it keeps results trustworthy

* **Attempts are frozen.** Starting an attempt copies the chosen questions, their option order and the answer
  key into `attempt_questions / attempt_options / attempt_correct_options`. Editing or deleting a question (or the
  whole subject) later never changes past attempts. A retake is always a new attempt.
* **The server does everything that matters.** It picks the random questions, stores their order, grades, and computes
  the score (37 of 50 -> 74.00%; `correct_count`, `total_questions` and `score_percent` are all stored).
  Client-sent scores or answer keys are ignored - the browser only sends which options were selected.
* **No answer key before submission.** The in-progress API returns option ids and text only. Keys live in separate
  tables that in-progress queries never touch (`tests/api.test.mjs` walks the whole payload to check this).
* **Grading** is exact-set (all correct options and no wrong ones) in `src/lib/grading.ts` - swap one function to change it.
* **Timer.** `deadline_at` is stored when the attempt starts and enforced by the server (answers after the deadline
  plus `DEADLINE_GRACE_SECONDS` are refused and the attempt is closed with what was saved). The browser countdown is cosmetic.
* **Safe retries.** Answers are saved as a full replacement, per question, in order. Submit is idempotent and carries
  the browser's complete final answers, so a failed autosave cannot lose work; double clicks and refreshes are harmless.
* **Review policy per subject:** score only / + right-wrong / + correct answers / + explanations. Enforced on the server.
* **Option shuffling** (per subject, off by default) shuffles the frozen copy, so grading always follows the right option.
  Leave it off for questions like "all of the above".
* Authorization is checked in the route handlers (and layouts); students get 404 for other people's attempts.
  Writes also check the request origin; sessions are server-side, `HttpOnly`, `SameSite=Lax`.

## The Moodle look

Everything quiz-related is in `src/app/moodle.css` and uses values copied from Moodle 4.5's own stylesheets
(question blocks, info box, formulation/outcome colours, navigation block buttons, review table, confirmation dialog).
Colours and sizes are variables at the top of the file. It is my best match without your campus screenshots -
send screenshots of your Moodle's attempt, summary and review pages and the matching blocks can be tuned
(`.que`, `.qnbutton`, `.quizreviewsummary`, `.navbar`).

Components: `QuestionBlock` (one question, used by attempt and review), `NavBlock` (the "Quiz navigation" block),
`AttemptView` (pages, flags, autosave, timer, summary, submit dialog), `ReviewView`.

## Layout

```
db/migrations/001_init.sql     schema (constraints, indexes, comments)
scripts/                       migrate.ts, seed.ts
sample-data/net101.json        sample question bank used by the seed
src/lib/services/              attempts (start/grade/review), questions, importer, subjects, users
src/lib/import-validation.ts   pure JSON validator
src/app/api/**                 route handlers (JSON API)
src/app/**/page.tsx            pages; src/components/**  UI
tests/api.test.mjs             end-to-end API tests
```

## Not included / known limits

* The S3 storage driver is written but was not run against a real bucket (local storage is tested).
* No "forgot password" e-mail; admins reset passwords from Admin > Users. No e-mail verification.
* The login rate limiter is in memory (fine for one server process).
* Questions are created by import only (they can be edited, enabled/disabled and deleted in the dashboard).
* Unused uploaded images are removed when nothing references them; attempts left open forever are not auto-closed
  (they are closed when their deadline passes, if the subject is timed).
* Every administrator can view all attempts (there is no finer-grained permission).
* No score export (CSV) and no Dockerfile for the app itself.

## Credits and licences

`moodle.css` reproduces layout rules and values from Moodle (GPL-3.0-or-later). That is fine for a campus tool; if you
publish this repository publicly, license it under GPL-3.0-or-later as well. The navigation-block result icons are
Font Awesome Free 6.6.0 (CC BY 4.0) as shipped in Moodle's `pix/i/grade_*.svg`.
