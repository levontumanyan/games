.PHONY: help dev-workout dev-spelling test sync stop lint format check pull-db backup backup-workout

PORT_WORKOUT ?= 8766
PORT_SPELLING ?= 8765
GDRIVE_BACKUP_DIR ?= $(HOME)/Library/CloudStorage/GoogleDrive-ltfibonacci@gmail.com/My Drive/workout_backups
DB_SNAPSHOTS_KEEP ?= 30

help:
	@echo "Available commands:"
	@echo "  make dev-workout   - Pull live DB & start Workout app on http://localhost:8766/workout/"
	@echo "  make dev-spelling  - Start Spelling Bee on http://localhost:8765/spelling/"
	@echo "  make pull-db       - Sync latest workout.db from levon-box to local data/"
	@echo "  make backup        - Backup live DB (deduped snapshots) + media assets to Google Drive"
	@echo "  make lint          - Run Ruff linter on all projects"
	@echo "  make format        - Format code with Ruff on all projects"
	@echo "  make test          - Run tests for all game suites"
	@echo "  make check         - Run linting and all tests"
	@echo "  make sync          - Install dependencies across all projects"
	@echo "  make stop          - Stop any running local dev servers (8765 & 8766)"

pull-db:
	@echo "==> Pulling live database from levon-box..."
	@mkdir -p workout/data/uploads
	@rm -f workout/data/workout.db
	@scp levon-box:/home/levon/games/workout/data/workout.db workout/data/workout.db 2>/dev/null && echo "==> Successfully synced live workout.db from levon-box!" || echo "==> Warning: Could not pull live db (offline/unreachable), using local db."
	@rsync -az levon-box:/home/levon/games/workout/data/uploads/ workout/data/uploads/ 2>/dev/null && echo "==> Successfully synced uploaded media assets!" || true

backup backup-workout: pull-db
	@echo "==> Backing up workout.db to Google Drive..."
	@mkdir -p "$(GDRIVE_BACKUP_DIR)"
	@CUR=$$(shasum -a 256 workout/data/workout.db | cut -d' ' -f1); \
	LAST=$$(cat "$(GDRIVE_BACKUP_DIR)/workout_latest.db.sha256" 2>/dev/null || true); \
	if [ -f "$(GDRIVE_BACKUP_DIR)/workout_latest.db" ] && [ "$$CUR" = "$$LAST" ]; then \
		echo "==> DB unchanged since last backup, skipping snapshot."; \
	else \
		TS=$$(date +%Y%m%d_%H%M%S); \
		cp workout/data/workout.db "$(GDRIVE_BACKUP_DIR)/workout_$${TS}.db" && \
		cp workout/data/workout.db "$(GDRIVE_BACKUP_DIR)/workout_latest.db" && \
		echo "$$CUR" > "$(GDRIVE_BACKUP_DIR)/workout_latest.db.sha256" && \
		echo "==> Snapshot: workout_$${TS}.db"; \
		ls -1t "$(GDRIVE_BACKUP_DIR)"/workout_*.db 2>/dev/null | grep -v latest | tail -n +$$(( $(DB_SNAPSHOTS_KEEP) + 1 )) | xargs -I{} rm -f "{}"; \
	fi
	@echo "==> Syncing media assets to Google Drive (incremental, checksum-based)..."
	@mkdir -p "$(GDRIVE_BACKUP_DIR)/uploads"
	@rsync -rlt --checksum --no-perms --no-owner --no-group workout/data/uploads/ "$(GDRIVE_BACKUP_DIR)/uploads/" \
		&& echo "==> Media assets up to date: $(GDRIVE_BACKUP_DIR)/uploads" \
		|| echo "==> Warning: media sync failed (Drive offline/unreachable)."

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
	@echo "==> Running workout tests (fast unit & AST module cycle tests)..."
	@cd workout && uv run pytest -q
	@echo "==> Running spelling-bee tests..."
	@cd spelling-bee && uv run pytest -q
	@echo "All fast tests passed!"

test-browser:
	@echo "==> Running Playwright headless browser smoke tests..."
	@cd workout && uv run pytest -q -m browser
	@echo "All browser smoke tests passed!"

test-all:
	@echo "==> Running full test suite (fast unit + Playwright browser tests)..."
	@cd workout && uv run pytest -q -m ""
	@cd spelling-bee && uv run pytest -q
	@echo "All tests (including browser suite) passed!"

sync:
	@echo "==> Syncing workout dependencies..."
	@cd workout && uv sync
	@echo "==> Syncing spelling-bee dependencies..."
	@cd spelling-bee && uv sync

stop:
	@echo "Stopping dev servers on ports $(PORT_WORKOUT) and $(PORT_SPELLING)..."
	@lsof -ti :$(PORT_WORKOUT) -ti :$(PORT_SPELLING) | xargs kill -9 2>/dev/null || true
	@echo "Dev servers stopped."
