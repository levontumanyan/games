# Spelling Bee

A real-time, dynamic variation of the classic Spelling Bee word puzzle featuring live letter mutations, penalty lockouts, and achievement tracking.

# Overview

The objective is to find words of 4 or more letters constructed from the 7 letters in the honeycomb, with the center letter mandatory for every word. Unlike traditional static word puzzles, the honeycomb dynamically shifts over time to challenge the player.

# Game Mechanics

## Letter Mutation
- The 6 outer letters periodically mutate every 20 seconds.
- The generator maintains a balanced vowel equilibrium (2–3 vowels) across mutations.
- A **1-time grace letter** mechanism permits the single most recently mutated letter to be counted toward the immediate next guess.

## Letter Lockout Penalty
- Every ~25 seconds (±3s jitter), a random outer hex begins charging up.
- **Warning phase (2s)**: Pulsing red indicator on the targeted letter.
- **Lockout phase (10s)**: The letter turns solid red and is completely unusable for typing or word validation.
- The center letter is never targeted by lockouts.

## Center Letter Change
- Players can change the center letter on demand for a penalty of 5 points (requires at least 5 points).

## Scoring & Ranks
- 4-letter words earn 1 point.
- 5+ letter words earn 1 point per letter.
- Pangrams (using all 7 letters) earn a 7-point bonus.
- Ranks progress from Beginner to Queen Bee (100% of maximum possible score).

# Lexicon & Word List

- **Source**: Based on **SCOWL** (Spell Checker Oriented Word Lists), specifically curated down from size 70 to a core ~32,000 common English word lexicon in [words.txt](file:///Users/levontumanyan/repos/cloud-lab/games/spelling-bee/app/words.txt).
- **Invariants**: Excludes rare/puzzle-unfriendly letters (Q, Z) from base generator pangrams, enforces 4+ letter length, and filters out non-alpha characters.
- **Validation**: Performed server-side via [app/words.py](file:///Users/levontumanyan/repos/cloud-lab/games/spelling-bee/app/words.py) against live client letter states.

# Architecture & Stack

## Backend
- **Framework**: FastAPI ([app/main.py](file:///Users/levontumanyan/repos/cloud-lab/games/spelling-bee/app/main.py))
- **Puzzle Generator**: Pangram-first sampler with vowel equilibrium ([app/puzzle.py](file:///Users/levontumanyan/repos/cloud-lab/games/spelling-bee/app/puzzle.py))
- **Validation Engine**: [app/words.py](file:///Users/levontumanyan/repos/cloud-lab/games/spelling-bee/app/words.py)

## Frontend
- **UI**: Standalone responsive single-page application in [static/index.html](file:///Users/levontumanyan/repos/cloud-lab/games/spelling-bee/static/index.html)
- **State & Timers**: Client-side countdowns for letter mutations, lockout state machine, and localStorage achievements.

# Running Locally

```bash
uv sync
uv run python main.py
```

# Production Deployment

- **Live URL**: `https://levon.ajwest.ca/spelling/` (and root `https://levon.ajwest.ca` redirect)
- **Host**: `levon-box` (Proxmox CT124 Debian 13 container)
- **Service**: systemd unit `spelling.service` running uvicorn on port `8765`
- **Reverse Proxy**: Nginx at `/etc/nginx/levon-apps/spelling.conf`
- **Auto-deployment**: `git push origin main` pushes simultaneously to GitHub and `levon-box`, automatically syncing dependencies with `uv` and restarting `spelling.service`.
