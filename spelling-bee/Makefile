.PHONY: run install test smoke-test

install:
	uv sync

run:
	uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765

test:
	uv run pytest

smoke-test:
	uv run python scripts/smoke_test.py
