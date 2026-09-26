# Workout Player Instructions

## Share & Routine Link Resolution
When given a workout link (`https://levon.ajwest.ca/workout/#u=<user>&r=<id>` or `#r=<id>`):
- Fetch the routine JSON via the routine endpoint using query param `?user_id=<user>` (fallback user: `levon`).

## YouTube Video Searching
- Use [`scripts/search_youtube.py`](file:///Users/levontumanyan/repos/games/workout/scripts/search_youtube.py) to search verified YouTube videos:
	`uv run python scripts/search_youtube.py "<query>" [--max 5]`

# API & Agent Workflows

## Remote-First Execution & Database Access
- **Zero Local Database Access**: Do NOT query or modify local `data/workout.db`. The local database is an unmaintained development artifact. All reads and writes for routines, exercises, combos, and taxonomy MUST run against the live instance at `https://levon.ajwest.ca/workout/api/`.
- **Headers & Cloudflare**:
	- `User-Agent`: Standard CLI tools (`curl`, `httpx`) work out of the box. Cloudflare blocks Python's default `urllib` user agent (`Python-urllib/3.x`) with HTTP 403; set a browser User-Agent if writing custom Python scripts.
	- `X-User-Id`: Optional. Defaults automatically to `levon` on all user-scoped endpoints. Specify `X-User-Id: <user>` or query param `?user_id=<user>` only when operating on behalf of a different user.

## Dynamic Route & Schema Discovery
- **Do not hardcode route paths or payloads**: Always discover live endpoints, parameters, and schemas dynamically.
- **Live OpenAPI Spec**: Inspect `GET https://levon.ajwest.ca/workout/openapi.json` or interactive docs at `https://levon.ajwest.ca/workout/docs`.
- **Codebase Schemas**: In this repository, inspect [`schemas.py`](file:///Users/levontumanyan/repos/games/workout/schemas.py) for typed Pydantic models (payload definitions, field constraints, defaults) and [`app.py`](file:///Users/levontumanyan/repos/games/workout/app.py) for endpoint declarations.

# Routine Authoring & Step Mutations
- **Concise Step Ingestion**: Prefer minimal step descriptors (e.g. `{"exercise_id": "...", "reps": 10}` or `{"rest": 20}`); the backend automatically inflates metadata, IDs, and modes.
- **Granular Step Mutations**: Use the `/steps` sub-resource endpoints (`POST`, `PATCH`, `DELETE`, `reorder`) for partial updates, appends, reordering, and deletions rather than re-uploading the entire routine array.

# Development & UI Verification

## Shared UI Primitives
- **Modals**: Use [`createCustomModal()`](file:///Users/levontumanyan/repos/games/workout/js/modal.js) from `modal.js` (handles backdrop, click-outside, and <kbd>Esc</kbd> dismissal).
- **Cards**: Use [`renderExerciseCardElement()`](file:///Users/levontumanyan/repos/games/workout/js/exercises.js) from `exercises.js` for exercise library cards.
- **Search & Inputs**: Use `.search-box-wrapper` and `.clean-input` (auto-disables browser suggestions).
- **Badges**: Use `getCategoryBadgeHtml()`, `getDisciplineBadgeHtml()`, and `getMuscleBadgeHtml()` from `taxonomy.js`.

## Playwright Visual Inspection
- `uv run --with playwright python scripts/inspect_pages.py` — Capture desktop and mobile screenshots across all primary views (saved to `/tmp/workout_screenshots/`).

