PORT ?= 8766

.PHONY: run dev sync test stop

run dev:
	uv run uvicorn app:create_app --reload --host 127.0.0.1 --port $(PORT) --factory

sync:
	uv sync

test:
	uv run pytest

stop:
	@lsof -ti :$(PORT) | xargs kill -9 2>/dev/null || true
