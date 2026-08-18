# Spelling Bee

A real-time, dynamic variation of the classic Spelling Bee word puzzle featuring solo daily puzzles and real-time 1v1 and 2v2 multiplayer duels with synchronized letter mutations, penalty lockouts, and achievement tracking.

# Overview

The objective is to find words of 4 or more letters constructed from the 7 letters in the honeycomb, with the center letter mandatory for every word. The game supports both Solo play and competitive live Multiplayer with customizable rule sets.

# Game Modes & Multiplayer

## 1v1 Duel Mode
- Real-time head-to-head competition over WebSockets.
- Match countdown timer (2m, 3m, 5m, or untimed).
- Real-time opponent scoreboard and activity feed showing rival finds and penalties.
- Post-match victory podium and instant rematch flow.

## Scalable Team Architecture (2v2 / FFA)
- Configurable team slots (`Team Gold` and `Team Blue`) with aggregated team scoring.
- Pluggable rule variations:
	- **Dynamic Duel**: Live letter mutations (every 20s) and penalty lockouts (every ~25s) synchronized across all players.
	- **Classic Mode**: Traditional static NYT honeycomb with no mutations.
	- **Word Claim Rules**: Independent score race (both players can find the same word) or Snatch mode (first to claim removes word from pool).

# Core Mechanics

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

# Architecture & Stack

## Backend
- **Framework**: FastAPI ([app/main.py](file:///Users/levontumanyan/repos/games/spelling-bee/app/main.py))
- **Room & Match Engine**: In-memory room manager ([app/engine/room_manager.py](file:///Users/levontumanyan/repos/games/spelling-bee/app/engine/room_manager.py)) and authoritative session loop ([app/engine/game_session.py](file:///Users/levontumanyan/repos/games/spelling-bee/app/engine/game_session.py))
- **Rule Strategy Engine**: Pluggable variants ([app/engine/rules_engine.py](file:///Users/levontumanyan/repos/games/spelling-bee/app/engine/rules_engine.py))
- **Puzzle Generator**: Pangram-first sampler with vowel equilibrium ([app/puzzle.py](file:///Users/levontumanyan/repos/games/spelling-bee/app/puzzle.py))
- **Validation Engine**: [app/words.py](file:///Users/levontumanyan/repos/games/spelling-bee/app/words.py)

## Frontend
- **UI**: Standalone responsive interface with integrated lobby overlay, multiplayer HUD, and theme engine in [static/index.html](file:///Users/levontumanyan/repos/games/spelling-bee/static/index.html).
- **Networking**: Resilient WebSocket client synchronizing state, letter mutations, and rival events.

# Running Locally

```bash
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

# Running Tests

```bash
uv run pytest
uv run ruff check .
```

# Production Deployment

- **Live URL**: `https://levon.ajwest.ca/spelling/`
- **Host**: `levon-box` (Proxmox CT124 Debian 13 container)
- **Service**: systemd unit `spelling.service` running uvicorn on port `8765`
- **Reverse Proxy**: Nginx at `/etc/nginx/levon-apps/spelling.conf`
