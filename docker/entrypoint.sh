#!/bin/sh
# Container start: apply database migrations, seed a brand-new database, then start Next.js.
set -e

echo "[noodle] applying database migrations..."
node_modules/.bin/tsx scripts/migrate.ts

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[noodle] seeding (only when the database has no users yet)..."
  node_modules/.bin/tsx scripts/seed.ts --if-empty
fi

echo "[noodle] starting on port ${PORT:-3000}"
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
