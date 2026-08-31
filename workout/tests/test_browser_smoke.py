"""
End-to-end headless browser smoke test using Playwright.
Validates that all JavaScript modules load in a real Chromium browser,
all tabs mount and switch without throwing uncaught exceptions, and
zero JavaScript console errors occur on page load and interaction.
"""

import socket
import threading
import time

import pytest
import uvicorn
from playwright.sync_api import sync_playwright

from app import create_app


def find_free_port() -> int:
	"""Find an available TCP port on localhost."""
	with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
		s.bind(("127.0.0.1", 0))
		return s.getsockname()[1]


@pytest.fixture(scope="module")
def live_server(tmp_path_factory):
	"""Launch a lightweight live FastAPI server in a background thread."""
	data_dir = tmp_path_factory.mktemp("browser_test_data")
	app = create_app(data_dir=data_dir)
	port = find_free_port()

	config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
	server = uvicorn.Server(config)

	thread = threading.Thread(target=server.run, daemon=True)
	thread.start()

	# Wait for server to become responsive
	url = f"http://127.0.0.1:{port}"
	for _ in range(50):
		try:
			with socket.create_connection(("127.0.0.1", port), timeout=0.1):
				break
		except OSError:
			time.sleep(0.05)
	else:
		pytest.fail("FastAPI test server failed to start within timeout.")

	yield url

	server.should_exit = True
	thread.join(timeout=2.0)


@pytest.mark.browser
def test_workout_frontend_loads_with_zero_console_errors(live_server):
	"""Verify page load, module evaluation, and tab navigation with zero JavaScript errors."""
	errors = []

	with sync_playwright() as p:
		browser = p.chromium.launch(headless=True)
		context = browser.new_context()
		page = context.new_page()

		# Capture uncaught exceptions and console errors
		page.on("pageerror", lambda err: errors.append(f"PageError: {err}"))
		page.on(
			"console",
			lambda msg: (
				errors.append(f"ConsoleError: {msg.text}")
				if msg.type == "error" and "favicon" not in msg.text
				else None
			),
		)

		# 1. Load the workout homepage
		response = page.goto(f"{live_server}/workout/", wait_until="networkidle")
		assert response.status == 200, f"Expected HTTP 200, got {response.status}"

		# Assert top navigation and brand bar exist
		page.wait_for_selector("#app-topbar", timeout=5000)
		assert page.is_visible("#tab-routines-btn")

		# 2. Navigate to Combos tab
		page.click("#tab-combos-btn")
		page.wait_for_selector("#combos-view:not(.hidden)", timeout=3000)

		# 3. Navigate to Exercises tab
		page.click("#tab-exercises-btn")
		page.wait_for_selector("#exercises-view:not(.hidden)", timeout=3000)
		page.wait_for_selector(".exercises-filter-bar", timeout=3000)

		# 4. Navigate to Anatomy tab
		page.click("#tab-anatomy-btn")
		page.wait_for_selector("#anatomy-view:not(.hidden)", timeout=3000)
		page.wait_for_selector(".body-svg", timeout=3000)

		# 5. Navigate to Stats tab
		page.click("#tab-stats-btn")
		page.wait_for_selector("#stats-view:not(.hidden)", timeout=3000)

		# 6. Navigate back to Workouts tab
		page.click("#tab-routines-btn")
		page.wait_for_selector("#app-sidebar", timeout=3000)

		browser.close()

	assert not errors, "Browser encountered JavaScript errors during smoke test:\n" + "\n".join(
		errors
	)
