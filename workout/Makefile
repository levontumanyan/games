PORT ?= 8766

.PHONY: run dev sync test stop pull-db backup

GDRIVE_BACKUP_DIR ?= $(HOME)/Library/CloudStorage/GoogleDrive-ltfibonacci@gmail.com/My Drive/workout_backups

pull-db:
	@echo "==> Pulling live database from levon-box..."
	@mkdir -p data
	@rm -f data/workout.db
	@scp levon-box:/home/levon/games/workout/data/workout.db data/workout.db 2>/dev/null && echo "==> Successfully synced live workout.db from levon-box!" || echo "==> Warning: Could not pull live db (offline/unreachable), using local db."

backup: pull-db
	@echo "==> Backing up workout.db to Google Drive..."
	@mkdir -p "$(GDRIVE_BACKUP_DIR)"
	@TS=$$(date +%Y%m%d_%H%M%S); \
	cp data/workout.db "$(GDRIVE_BACKUP_DIR)/workout_$${TS}.db" && \
	cp data/workout.db "$(GDRIVE_BACKUP_DIR)/workout_latest.db" && \
	echo "==> Snapshot: $(GDRIVE_BACKUP_DIR)/workout_$${TS}.db" && \
	echo "==> Latest:   $(GDRIVE_BACKUP_DIR)/workout_latest.db"

run dev: pull-db
	uv run uvicorn app:create_app --reload --host 127.0.0.1 --port $(PORT) --factory

sync:
	uv sync

test:
	uv run pytest

stop:
	@lsof -ti :$(PORT) | xargs kill -9 2>/dev/null || true
