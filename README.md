<p align="center"><img src="public/noodle-logo.svg" alt="Noodle" width="96"></p>

# Noodle

Practice quizzes for a campus (built for ~50 students), with quiz pages modelled on Moodle's quiz attempt
interface. One Next.js app (App Router, TypeScript) + PostgreSQL. Question pictures and subject banners are
stored on [UploadThing](https://uploadthing.com).

* Students: sign in, pick a subject (cards with banner images), choose how many questions, get a random set, flag
  questions, submit, see the score and review, and retake as often as they like (every attempt is kept).
* Admins: manage subjects and their banners, import the question bank from JSON (validate + preview first),
  browse / search / edit / delete questions, attach images, inspect attempts and scores, manage users.

## Run it

### A. Everything in Docker (app + PostgreSQL)

```bash
cp .env.example .env            # set POSTGRES_PASSWORD, ADMIN_PASSWORD, UPLOADTHING_TOKEN ...
docker compose up -d --build    # http://localhost:3000   (APP_PORT in .env changes the port)
docker compose logs -f app
```

The `db` service is built from the `POSTGRES_*` variables in `.env`; the `app` service gets the same file plus a
`DATABASE_URL` that points at the `db` service. On every start the container applies the migrations and, if the
database has no users yet, seeds the admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`), a demo student and a sample subject
(set `SEED_DEMO_DATA=false` to skip the demo data, `SEED_ON_START=false` to skip seeding). Data lives in the `pgdata`
volume (and `uploads` when UploadThing is not configured).

```bash
docker compose exec db pg_dump -U noodle noodle > backup.sql      # back up (user/db names from .env)
docker compose down                                               # stop (add -v to delete the data!)
```

### B. Local development (Node 20.9+, PostgreSQL 13+)

```bash
npm install
cp .env.example .env
npm run db:up                   # only the database from docker-compose.yml (or use your own Postgres)
npm run db:migrate
npm run db:seed
npm run dev                     # http://localhost:3000
```

Seeded accounts (change the admin password before real use):

| role    | e-mail               | password       |
|---------|----------------------|----------------|
| admin   | admin@campus.test    | ChangeMe123!   |
| student | student@campus.test  | Student123!    |

Production without Docker: `npm run build && npm start` behind an HTTPS reverse proxy that sends
`X-Forwarded-Proto` and `X-Forwarded-For`.

Tests: `npm run test:unit` (no server needed) and, with the app running and the database seeded,
`BASE_URL=http://localhost:3000 npm run test:api`.

## Configuration (`.env`)

Only the database is required; everything else has a default. See `.env.example` for every variable.

| group | variables |
|---|---|
| PostgreSQL | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT`, `DATABASE_URL` (built from the others) |
| Docker app | `APP_PORT`, `SEED_ON_START` |
| Site | `SITE_NAME` (default Noodle), `APP_TIMEZONE`, `ANSWER_NUMBERING` (`abc`, `ABCD`, `123`, `none`) |
| Accounts | `ALLOW_REGISTRATION`, `ALLOWED_EMAIL_DOMAIN`, `SESSION_DAYS`, `BCRYPT_COST`, `COOKIE_SECURE`, `TRUSTED_ORIGINS` |
| First admin | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `SEED_DEMO_DATA` |
| Quiz rules | `MAX_QUESTIONS_PER_ATTEMPT`, `DEADLINE_GRACE_SECONDS` |
| Images | `UPLOADTHING_TOKEN`, `STORAGE_DRIVER`, `LOCAL_UPLOAD_DIR`, `MAX_IMAGE_BYTES` |

## Images and banners (UploadThing)

1. In the UploadThing dashboard create an app, open **API Keys** and copy the `UPLOADTHING_TOKEN` value into `.env`.
2. That is all: with a token set, question images and subject banners go to UploadThing. With no token they are kept
   on disk (`LOCAL_UPLOAD_DIR`) so development works offline. `STORAGE_DRIVER=local|uploadthing` forces one.

How it works: the admin dashboard sends the picture to the app, which checks it (real PNG/JPEG/GIF/WebP, size limit;
SVG is refused) and uploads it with UploadThing's server API - no webhook or public callback URL is needed, so it works on a
campus network. The browser loads pictures from `/api/images/<key>`, so they stay behind the login; the app reads the file
from UploadThing (public URL first, a short-lived signed URL if your UploadThing app serves files privately). Replaced or
removed pictures are deleted from UploadThing unless a question, banner or past attempt still uses them.

* **Subject banners:** Admin > Subjects > Edit > *Banner image* (wide pictures, about 1200 x 400, work best). Shown on
  the subject card and at the top of the subject page; subjects without a banner get a colour gradient.
* Question images: Admin > Questions > Edit.
* If you switch from local to UploadThing later, pictures saved locally keep working (they are still read from disk);
  new uploads go to UploadThing.

## Importing questions

Admin > **Import questions**. Paste or choose the JSON, press *Validate and preview*, check the questions and
their marked answers, then import.

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

* Nothing is guessed or "fixed": wording, option order and answer keys are stored as supplied. A wrong label, two answers
  on a `single_choice`, a duplicate id, a bad type... each becomes an error naming the question. The import is all-or-nothing.
* `external_id` is the duplicate guard. Re-importing the same file adds nothing; choose *update* to overwrite questions
  that already exist (past attempts are unaffected). Same wording under a different id is flagged as a warning.
* Subjects are matched by `code` (or by name when there is no code); an unknown subject is created.
* `image` is `null` or an https URL. Attach/replace/remove uploaded pictures from Admin > Questions > Edit.
* Question text is plain text shown literally. Blank lines make paragraphs, lines starting with `- ` or `1. ` make lists,
  ``` fences make code blocks, and `$x^2$` / `$$...$$` render as math (KaTeX).

## How it keeps results trustworthy

* **Attempts are frozen.** Starting an attempt copies the chosen questions, their option order and the answer key into
  `attempt_questions / attempt_options / attempt_correct_options`. Editing or deleting a question (or the subject) later
  never changes past attempts. A retake is always a new attempt.
* **The server does everything that matters.** It picks the random questions, stores their order, grades, and computes the
  score (37 of 50 -> 74.00%; `correct_count`, `total_questions` and `score_percent` are all stored). The browser only sends
  which options were selected.
* **No answer key before submission.** The in-progress API returns option ids and text only; keys live in separate tables
  that in-progress queries never touch (the API tests walk the whole payload to check this).
* **Grading** is exact-set (all correct options and no wrong ones) in `src/lib/grading.ts` - swap one function to change it.
* **Timer.** `deadline_at` is stored when the attempt starts and enforced by the server (answers after the deadline plus
  `DEADLINE_GRACE_SECONDS` are refused and the attempt is closed with what was saved). The browser countdown is cosmetic.
* **Safe retries.** Answers are saved as a full replacement, per question, in order. Submit is idempotent and carries the
  browser's complete final answers, so a failed autosave cannot lose work; double clicks and refreshes are harmless.
* **Review policy per subject:** score only / + right-wrong / + correct answers / + explanations, enforced on the server.
* **Option shuffling** (per subject, off by default) shuffles the frozen copy, so grading always follows the right option.
  Leave it off for questions like "all of the above".
* Authorization is checked in the route handlers and layouts; students get 404 for other people's attempts. Writes also
  check the request origin; sessions are server-side, `HttpOnly`, `SameSite=Lax`.

## The Moodle look

Everything quiz-related is in `src/app/moodle.css` and uses values copied from Moodle 4.5's own stylesheets (question
blocks, info box, formulation/outcome colours, navigation block buttons, review table, confirmation dialog). Colours and sizes
are variables at the top of the file. It is the best match without your campus screenshots - send screenshots of your
Moodle's attempt, summary and review pages and the matching blocks can be tuned (`.que`, `.qnbutton`,
`.quizreviewsummary`, `.navbar`).

Tailwind v4 provides the reset (preflight). Its class scanning is switched off in `src/app/globals.css` because the Moodle
helper classes (`w-100`, `mb-3`, ...) are defined in `moodle.css` with Bootstrap's meaning; add an `@source` line there if you
want to use Tailwind utilities in new components. The logo is `public/noodle-logo.svg` (also the favicon, `src/app/icon.svg`).

## Layout

```
Dockerfile, docker-compose.yml, docker/entrypoint.sh   container setup
db/migrations/                 001_init.sql (schema), 002_subject_banner.sql
scripts/                       migrate.ts, seed.ts
sample-data/                   net101.json (sample bank), net101-banner.jpg
src/lib/services/              attempts (start/grade/review), questions, subjects, importer, images, users
src/lib/storage/               local + UploadThing drivers
src/lib/import-validation.ts   pure JSON validator
src/app/api/**                 route handlers (JSON API, /api/health)
src/app/**/page.tsx            pages; src/components/**  UI
tests/                         unit/ (grading, rich text, import validation, storage) and api.test.mjs
```

## Not included / known limits

* The UploadThing driver is covered by unit tests with a stubbed API and a runtime check of the SDK's URL building, but it
  has not been run against a live UploadThing app. Try one upload after setting the token.
* The Docker files were not built in the environment this was written in (no Docker there); the container's start-up
  script, migrations, seeding and the production server were run directly and tested instead.
* No "forgot password" e-mail; admins reset passwords from Admin > Users. No e-mail verification.
* The login rate limiter is in memory (fine for one server process).
* Questions are created by import only (they can be edited, enabled/disabled and deleted in the dashboard).
* Attempts left open forever are not auto-closed (timed ones are closed when their deadline passes).
* Every administrator can view all attempts (there is no finer-grained permission). No score export (CSV).

## Credits and licences

`moodle.css` reproduces layout rules and values from Moodle (GPL-3.0-or-later). That is fine for a campus tool; if you
publish this repository publicly, license it under GPL-3.0-or-later as well. The navigation-block result icons are
Font Awesome Free 6.6.0 (CC BY 4.0) as shipped in Moodle's `pix/i/grade_*.svg`.
