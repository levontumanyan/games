# Workout Player Instructions

## Share Link Resolution
When given a workout link (`https://levon.ajwest.ca/workout/#s=<id>` or `?s=<id>`):
- Fetch the routine JSON directly via `GET https://levon.ajwest.ca/workout/api/share/<id>` (or `http://localhost:8766/workout/api/share/<id>` in local dev).

# API & Agent Workflows

## User Identity
- Identify active user via `X-User-Id` header (fallback: `levon`). Base subpath is `/workout/api/` (or `/api/`).

## Routine Endpoints
- `GET /workout/api/routines/{id}` — Fetch routine by ID or title slug.
- `PUT /workout/api/routines/{id}` — Create or update a single routine without overwriting others.
- `DELETE /workout/api/routines/{id}` — Delete a routine.
