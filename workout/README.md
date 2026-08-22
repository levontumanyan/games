# Workout

A client-side workout routine player that combines YouTube video clips with custom interval timers. Create, manage, and play custom workout routines entirely in the browser.

# Features

- **Routine Management** — Create, edit, duplicate, and delete workout routines
- **Video Clips** — Embed YouTube segments with start/end timestamps
- **Interval Timers & Music** — Custom countdown timers with exercise labels and per-interval background music (YouTube / YouTube Music links or local audio files) that seamlessly loop or play sequentially
- **Seamless Playback** — Auto-advances through clips and timers with smooth transitions and auto-coordinated audio/video
- **Audio Feedback** — Synthetic beeps at 3, 2, 1, and 0 seconds using Web Audio API
- **Drag & Reorder** — Drag-and-drop step ordering in the editor
- **Import/Export** — Save and share routines as JSON files
- **Persistent Storage** — All routines saved server-side in `data/routines.json` with automatic two-way sync and `localStorage` offline caching; uploaded audio files cached in `IndexedDB`
- **Responsive UI** — Dark theme, works on desktop and mobile

# Running Locally

```bash
cd workout
uv sync
uv run python main.py
```

Then open [http://127.0.0.1:8766](http://127.0.0.1:8766).

# Data Schema

```
Routine:    { id, title, steps[] }
Step Clip:  { id, type:'clip', videoId, startSeconds, endSeconds, label }
Step Timer: { id, type:'timer', durationSeconds, label, musicTracks: MusicTrack[] }
MusicTrack: { id, source: 'youtube' | 'file', videoId?, fileId?, fileName?, label }
```

Routines are persisted on the server in `workout/data/routines.json` and cached locally in `localStorage` under `custom_workout_routines`. Audio files are stored in `IndexedDB` (`workout_music_db`).
