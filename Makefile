.PHONY: help dev-workout dev-spelling test sync stop lint format check pull-db backup backup-workout

PORT_WORKOUT ?= 8766
PORT_SPELLING ?= 8765
GDRIVE_BACKUP_DIR ?= $(HOME)/Library/CloudStorage/GoogleDrive-ltfibonacci@gmail.com/My Drive/workout_backups

help:
	@echo "Available commands:"
	@echo "  make dev-workout   - Pull live DB & start Workout app on http://localhost:8766/workout/"
	@echo "  make dev-spelling  - Start Spelling Bee on http://localhost:8765/spelling/"
	@echo "  make pull-db       - Sync latest workout.db from levon-box to local data/"
	@echo "  make backup        - Pull live DB and create a timestamped backup in Google Drive"
	@echo "  make lint          - Run Ruff linter on all projects"
	@echo "  make format        - Format code with Ruff on all projects"
	@echo "  make test          - Run tests for all game suites"
	@echo "  make check         - Run linting and all tests"
	@echo "  make sync          - Install dependencies across all projects"
	@echo "  make stop          - Stop any running local dev servers (8765 & 8766)"

pull-db:
	@echo "==> Pulling live database from levon-box..."
	@mkdir -p workout/data
	@rm -f workout/data/workout.db
	@scp levon-box:/home/levon/games/workout/data/workout.db workout/data/workout.db 2>/dev/null && echo "==> Successfully synced live workout.db from levon-box!" || echo "==> Warning: Could not pull live db (offline/unreachable), using local db."

backup backup-workout: pull-db
	@echo "==> Backing up workout.db to Google Drive..."
	@mkdir -p "$(GDRIVE_BACKUP_DIR)"
	@TS=$$(date +%Y%m%d_%H%M%S); \
	cp workout/data/workout.db "$(GDRIVE_BACKUP_DIR)/workout_$${TS}.db" && \
	cp workout/data/workout.db "$(GDRIVE_BACKUP_DIR)/workout_latest.db" && \
	echo "==> Snapshot: $(GDRIVE_BACKUP_DIR)/workout_$${TS}.db" && \
	echo "==> Latest:   $(GDRIVE_BACKUP_DIR)/workout_latest.db"

dev-workout run-workout: pull-db
	@cd workout && uv run uvicorn app:create_app --reload --host 127.0.0.1 --port $(PORT_WORKOUT) --factory

dev-spelling run-spelling:
	@cd spelling-bee && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $(PORT_SPELLING)

lint:
	@echo "==> Linting workout..."
	@cd workout && uv run ruff check .
	@cd workout && uv run ruff format --check .
	@echo "==> Linting spelling-bee..."
	@cd spelling-bee && uv run ruff check .
	@cd spelling-bee && uv run ruff format --check .
	@echo "All lint checks passed!"

format:
	@echo "==> Formatting workout..."
	@cd workout && uv run ruff check --fix . && uv run ruff format .
	@echo "==> Formatting spelling-bee..."
	@cd spelling-bee && uv run ruff check --fix . && uv run ruff format .
	@echo "All files formatted!"

check: lint test

test:
	@echo "==> Running workout tests..."
	@cd workout && uv run pytest -q
	@echo "==> Running spelling-bee tests..."
	@cd spelling-bee && uv run pytest -q
	@echo "All tests passed!"

sync:
	@echo "==> Syncing workout dependencies..."
	@cd workout && uv sync
	@echo "==> Syncing spelling-bee dependencies..."
	@cd spelling-bee && uv sync

stop:
	@echo "Stopping dev servers on ports $(PORT_WORKOUT) and $(PORT_SPELLING)..."
	@lsof -ti :$(PORT_WORKOUT) -ti :$(PORT_SPELLING) | xargs kill -9 2>/dev/null || true
	@echo "Dev servers stopped."
