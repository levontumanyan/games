# Workout Routine Player

A client-side workout routine player that combines YouTube video clips with custom interval timers, live session tracking, streak analytics, and soft accounts.

# Features

- **Routine Management** — Create, edit, duplicate, and delete custom workout routines.
- **Video Clips & Timers** — Embed YouTube segments with start/end timestamps alongside countdown timers and custom background music.
- **Soft Accounts** — Frictionless profile switcher (default: `levon`) with independent routines, history, and stats per user.
- **Live Session Persistence** — Active workout duration and step progress are continuously saved so exiting midway records progress as a partial session.
- **Streaks & Activity Analytics** — Streak tracking (🔥), weekly active minutes bar charts, monthly calendar heatmap, and session history logs.
- **Workout Sharing** — Generate shareable links (`#s=id` or compressed `#share=payload`) to preview and import routines with one click.
- **Import / Export** — Full JSON backup and restore capabilities.
- **Audio Feedback & Music** — Synthetic countdown beeps using Web Audio API and background music looping.

# Running Locally

From the root repository:
```bash
make dev-workout
```
Or within the `workout/` directory:
```bash
make dev
```
Open [http://localhost:8766/workout/](http://localhost:8766/workout/) in your browser.

# Running Tests

```bash
make test
```

# Architecture

- **Backend**: FastAPI with Python standard `sqlite3` database (`data/workout.db`).
- **Database Schema**:
  - `users`: `id`, `display_name`, `created_at`
  - `routines`: `id`, `user_id`, `title`, `steps_json`, `music_tracks_json`, `updated_at`
  - `sessions`: `id`, `user_id`, `routine_id`, `routine_title`, `started_at`, `completed_at`, `duration_seconds`, `completed_steps`, `total_steps`, `status`
  - `shared_routines`: `id`, `title`, `routine_json`, `created_at`
- **Frontend**: Vanilla ES modules (`js/app.js`, `js/player.js`, `js/editor.js`, `js/stats.js`, `js/session.js`, `js/user.js`, `js/storage.js`).
