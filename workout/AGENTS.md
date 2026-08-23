# Workout Player Instructions

## Share Link Resolution
When given a workout link (`https://levon.ajwest.ca/workout/#s=<id>` or `?s=<id>`):
- Fetch the routine JSON directly via `GET https://levon.ajwest.ca/workout/api/share/<id>` (or `http://localhost:8766/workout/api/share/<id>` in local dev).

# Conventions

## User Identity
- All client-server calls identify active user via `X-User-Id` header (fallback: `levon`).
