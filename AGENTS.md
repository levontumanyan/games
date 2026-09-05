# Project Instructions

## Overview
A collection of self-hosted, real-time web games and apps built with FastAPI and vanilla JavaScript. Deployed to `levon-box` (accessible via SSH `ssh levon-box` over Cloudflare Tunnel, web domain `https://levon.ajwest.ca/`).

## Architecture & Apps

| **Spelling Bee**   | `8765`     | `http://localhost:8765/spelling/` | `https://levon.ajwest.ca/spelling/`|
| **Workout Player** | `8766`     | `http://localhost:8766/workout/`  | `https://levon.ajwest.ca/workout/` |

## Sub-App Instructions
Each sub-app directory maintains its own domain-specific `AGENTS.md` (e.g. `workout/AGENTS.md`). When working on, querying, or parsing links for a specific app, inspect its local `AGENTS.md` first for share link resolution rules, DB schema, and API contracts.

## Code Standards
- **Indentation**: Use **tabs** exclusively for all code (Python, Shell scripts, Makefiles, JS, CSS, HTML). Never use spaces except in YAML.
- **Python Tooling**: Use `uv` for Python environments and dependencies.
- **Linting & Formatting**: Ruff is configured across all sub-projects with tab indentation and standard lint rules.
- **Shared Components**: Always maximize reuse of shared UI styles, classes, and components across views and apps rather than creating one-offs.

# Development Workflows

## Common Commands

`make dev-workout` - Start Workout app on `http://localhost:8766/workout/` with hot-reload
`make dev-spelling` - Start Spelling Bee on `http://localhost:8765/spelling/` with hot-reload
`make lint` - Run Ruff linting and format checking across all projects
`make format` - Auto-format and fix lint issues across all projects
`make test` - Run pytest test suites across all projects
`make check` - Run both linting and all test suites
`make sync` - Sync `uv` dependencies across all projects
`make stop` - Kill running development servers on ports 8765 and 8766

## Pre-Commit Hooks
Git is configured to use native `.githooks` via `core.hooksPath = .githooks`. The pre-commit hook runs:
1. `uv run ruff check .` and `uv run ruff format --check .` (fail-fast format and lint check)
2. `uv run pytest -q` for both `workout` and `spelling-bee`

## Deployment
Auto-deployed to `levon-box` via git post-receive hook to `/home/levon/games/`. Systemd services are reverse-proxied by Nginx (`/etc/nginx/levon-apps/*.conf`).
