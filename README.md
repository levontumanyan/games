# Games

A collection of self-hosted, real-time web games built with FastAPI and vanilla JavaScript.

# Available Games

## Spelling Bee (`spelling-bee/`)
- A real-time, dynamic variation of the classic Spelling Bee word puzzle featuring live letter mutations, penalty lockouts, and achievement tracking.
- **Backend**: FastAPI with SCOWL dictionary validation and vowel-equilibrium puzzle generation.
- **Frontend**: Responsive single-page interface.
- **Live Demo**: [https://levon.ajwest.ca/spelling/](https://levon.ajwest.ca/spelling/)

# Running Locally

```bash
cd spelling-bee
uv sync
uv run python main.py
```
