#!/bin/sh
# Vercel build command (see vercel.json).
#
# Production builds apply pending migrations before `next build`, over Neon's
# direct connection: node-pg-migrate holds a session advisory lock, which the
# pooled (PgBouncer) DATABASE_URL cannot keep. Preview builds skip this; most
# previews have no database of their own.
#
# The previous deployment keeps serving until this build finishes, so every
# migration must be backward compatible with the code already in production.
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  DATABASE_URL="${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED must be set to migrate production}" npm run migrate:up
fi

npm run build
