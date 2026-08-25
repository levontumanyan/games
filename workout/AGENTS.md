# Workout Player Instructions

## Share & Routine Link Resolution
When given a workout link (`https://levon.ajwest.ca/workout/#u=<user>&r=<id>` or `#r=<id>`):
- Fetch the routine JSON directly via `GET https://levon.ajwest.ca/workout/api/routines/<id>?user_id=<user>` (fallback user: `levon`).

# API & Agent Workflows

## User Identity
- Identify active user via `X-User-Id` header (fallback: `levon`). Base subpath is `/workout/api/` (or `/api/`).

## Routine Endpoints
- `GET /workout/api/routines/{id}` — Fetch routine by ID or title slug (supports `?user_id=...`).
- `PUT /workout/api/routines/{id}` — Create or update a single routine without overwriting others.
- `DELETE /workout/api/routines/{id}` — Delete a routine.
