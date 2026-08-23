.PHONY: help dev-workout dev-spelling test sync stop lint format check

PORT_WORKOUT ?= 8766
PORT_SPELLING ?= 8765

help:
	@echo "Available commands:"
	@echo "  make dev-workout   - Start Workout app on http://localhost:8766/workout/"
	@echo "  make dev-spelling  - Start Spelling Bee on http://localhost:8765/spelling/"
	@echo "  make lint          - Run Ruff linter on all projects"
	@echo "  make format        - Format code with Ruff on all projects"
	@echo "  make test          - Run tests for all game suites"
	@echo "  make check         - Run linting and all tests"
	@echo "  make sync          - Install dependencies across all projects"
	@echo "  make stop          - Stop any running local dev servers (8765 & 8766)"

dev-workout run-workout:
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
