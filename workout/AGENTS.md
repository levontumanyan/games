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

## Shared UI Primitives
- **Modals**: Use [`createCustomModal()`](file:///Users/levontumanyan/repos/games/workout/js/modal.js) from `modal.js` (handles backdrop, click-outside, and <kbd>Esc</kbd> dismissal).
- **Cards**: Use [`renderExerciseCardElement()`](file:///Users/levontumanyan/repos/games/workout/js/exercises.js) from `exercises.js` for exercise library cards.
- **Search & Inputs**: Use `.search-box-wrapper` with `.search-box-input` and always set `autocomplete="off"`.
- **Badges**: Use `getCategoryBadgeHtml()`, `getDisciplineBadgeHtml()`, and `getMuscleBadgeHtml()` from `taxonomy.js`.

## Playwright Visual Inspection
- `uv run --with playwright python scripts/inspect_pages.py` — Capture desktop and mobile screenshots across all primary views (saved to `/tmp/workout_screenshots/`).

