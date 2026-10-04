#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  node /app/migrate.mjs
fi

exec node /app/dist/index.js
