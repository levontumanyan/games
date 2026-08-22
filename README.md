# Games

A collection of self-hosted, real-time web games built with FastAPI and vanilla JavaScript.

# Available Games

## Spelling Bee (`spelling-bee/`)
- A real-time, dynamic variation of the classic Spelling Bee word puzzle featuring live letter mutations, penalty lockouts, and achievement tracking.
- **Backend**: FastAPI with SCOWL dictionary validation and vowel-equilibrium puzzle generation.
- **Frontend**: Responsive single-page interface.
- **Live Demo**: [https://levon.ajwest.ca/spelling/](https://levon.ajwest.ca/spelling/)

## Workout (`workout/`)
- A client-side workout routine player combining YouTube video clips with custom interval timers.
- **Backend**: Minimal FastAPI static file server (purely optional — works as standalone HTML/JS/CSS).
- **Frontend**: Dark-theme responsive SPA with drag-and-drop editing, Web Audio countdown beeps, and YouTube IFrame API integration.
- **Storage**: localStorage with JSON import/export.
- **Live Demo**: [https://levon.ajwest.ca/workout/](https://levon.ajwest.ca/workout/)

# Running Locally

```bash
cd spelling-bee
uv sync
uv run python main.py
```
