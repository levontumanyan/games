# Workout Player Instructions

## Share & Routine Link Resolution
When given a workout link (`https://levon.ajwest.ca/workout/#u=<user>&r=<id>` or `#r=<id>`):
- Fetch the routine JSON directly via `GET https://levon.ajwest.ca/workout/api/routines/<id>?user_id=<user>` (fallback user: `levon`).

## YouTube Video Searching
- Use youtube search python tool to find real, verified YouTube videos instead of guessing URLs.

# API & Agent Workflows

## Remote-First Execution
- Always perform routine and combo creations/updates on the remote live instance (`https://levon.ajwest.ca/workout/api/...`) via HTTP requests (`X-User-Id: levon`). Do not directly edit local database files for live routines.

## User Identity
- Identify active user via `X-User-Id` header (fallback: `levon`). Base subpath is `/workout/api/` (or `/api/`).

## Routine Endpoints
- `GET /workout/api/routines/{id}` — Fetch routine by ID or title slug (supports `?user_id=...`).
- `PUT /workout/api/routines/{id}` — Create or update a single routine without overwriting others.
- `DELETE /workout/api/routines/{id}` — Delete a routine.

## Combo & Exercise Endpoints
- `POST /workout/api/combos` — Create or update a custom combo.
- `POST /workout/api/exercises` — Create or update a custom exercise.

# Development & UI Verification

## UI Components & Design Tokens
- Consult [UI_TOKENS.md](file:///Users/levontumanyan/repos/games/workout/UI_TOKENS.md) for canonical classes, buttons, search inputs, modal factories (`createCustomModal`), and exercise card renderers (`renderExerciseCardElement`). Never create one-off styling classes for common primitives.

## Playwright Visual Inspection
- `uv run --with playwright python scripts/inspect_pages.py` — Capture desktop and mobile screenshots across all primary views (saved to `/tmp/workout_screenshots/`).

