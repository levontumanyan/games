import asyncio
import os

from playwright.async_api import async_playwright


async def run_quick_log_inspection():
	output_dir = "/tmp/workout_screenshots"
	os.makedirs(output_dir, exist_ok=True)

	async with async_playwright() as p:
		browser = await p.chromium.launch(headless=True)
		context = await browser.new_context(
			viewport={"width": 1440, "height": 900},
			extra_http_headers={"X-User-Id": "levon"},
		)
		page = await context.new_page()

		print("1. Navigating to workout app...")
		await page.goto("http://127.0.0.1:8766/workout/")
		await page.wait_for_timeout(1000)

		# Check Quick Log button in topbar
		quick_btn = page.locator("#quick-log-btn")
		assert await quick_btn.is_visible(), "Quick Log button must be visible in topbar"
		print("✓ Quick Log button is visible in topbar.")

		# Click Quick Log button
		await quick_btn.click()
		await page.wait_for_selector(".quick-log-modal-content", state="visible")
		await page.wait_for_timeout(400)

		modal_title = page.locator(".custom-modal-window .modal-title")
		assert "Quick Workout Log" in await modal_title.text_content()
		print("✓ Quick Log modal opened with title:", await modal_title.text_content())

		# Capture initial Quick Log modal screenshot
		shot_path_1 = os.path.join(output_dir, "quick_log_modal_single.png")
		await page.screenshot(path=shot_path_1)
		print(f"✓ Screenshot saved: {shot_path_1}")

		# Test stepper: click +5 button
		step_plus_5 = page.locator(".quick-log-counter-steppers button[data-step='5']").first
		rep_input = page.locator(".quick-log-rep-input").first
		initial_val = int(await rep_input.input_value())
		await step_plus_5.click()
		new_val = int(await rep_input.input_value())
		assert new_val == initial_val + 5, f"Expected {initial_val + 5}, got {new_val}"
		print(f"✓ Stepper test passed: {initial_val} -> {new_val}")

		# Test speed pills: click 30
		pill_30 = page.locator(".ql-pill-btn[data-set='30']").first
		await pill_30.click()
		assert int(await rep_input.input_value()) == 30, "Speed pill 30 should set input to 30"
		print("✓ Speed pill test passed: set to 30")

		# Test "+ Add Another Exercise" button
		add_row_btn = page.locator("#ql-add-row-btn")
		await add_row_btn.click()
		await page.wait_for_timeout(300)

		row_cards = page.locator(".quick-log-row-card")
		assert await row_cards.count() == 2, (
			f"Expected 2 exercise cards, got {await row_cards.count()}"
		)
		print("✓ Successfully added second exercise card.")

		# Change second exercise to another movement (e.g. 2nd option in dropdown)
		second_select = page.locator(".quick-log-select").nth(1)
		# Select option 2 or 3
		options = await second_select.locator("option").all()
		if len(options) > 1:
			val = await options[1].get_attribute("value")
			await second_select.select_option(val)
			print(f"✓ Selected movement for 2nd exercise: {val}")

		# Set reps for second exercise to 20
		second_pill_20 = (
			page.locator(".quick-log-row-card").nth(1).locator(".ql-pill-btn[data-set='20']")
		)
		await second_pill_20.click()

		# Check summary
		summary_vol = page.locator("#ql-summary-volume")
		summary_text = await summary_vol.text_content()
		print("✓ Real-time summary:", summary_text)
		assert "50 total reps" in summary_text, (
			f"Expected 50 total reps in summary, got: {summary_text}"
		)

		# Capture screenshot of multi-exercise modal
		shot_path_2 = os.path.join(output_dir, "quick_log_modal_multi.png")
		await page.screenshot(path=shot_path_2)
		print(f"✓ Screenshot saved: {shot_path_2}")

		# Submit the workout
		submit_btn = page.locator("#ql-submit-btn")
		await submit_btn.click()

		# Wait for modal to close
		await page.wait_for_selector(".quick-log-modal-backdrop", state="detached", timeout=5000)
		print("✓ Modal closed after submit.")

		# Check toast appearance
		toast = page.locator(".toast-pill.show")
		await page.wait_for_timeout(300)
		if await toast.count() > 0:
			toast_text = await toast.first.text_content()
			print(f"✓ Toast message confirmed: {toast_text}")

		# Navigate to Stats tab to verify cache reset and stats wire-in
		await page.click("#tab-stats-btn")
		await page.wait_for_selector(".stats-container", state="visible")
		await page.wait_for_timeout(1000)

		# Verify recent sessions history contains our new Quick Workout
		history_list = page.locator("#session-history-list")
		assert await history_list.is_visible()
		history_text = await history_list.text_content()
		assert "Quick" in history_text, "Quick workout should appear in recent session history"
		print("✓ Confirmed Quick Workout appears in Stats session history!")

		# Capture screenshot of Stats dashboard
		shot_path_3 = os.path.join(output_dir, "stats_after_quick_log.png")
		await page.screenshot(path=shot_path_3)
		print(f"✓ Screenshot saved: {shot_path_3}")

		# Test mobile layout (390x844)
		print("2. Testing mobile layout...")
		mobile_context = await browser.new_context(
			viewport={"width": 390, "height": 844},
			extra_http_headers={"X-User-Id": "levon"},
		)
		m_page = await mobile_context.new_page()
		await m_page.goto("http://127.0.0.1:8766/workout/")
		await m_page.wait_for_timeout(500)

		m_quick_btn = m_page.locator("#quick-log-btn")
		assert await m_quick_btn.is_visible()
		await m_quick_btn.click()
		await m_page.wait_for_selector(".quick-log-modal-content", state="visible")
		await m_page.wait_for_timeout(400)

		shot_path_4 = os.path.join(output_dir, "mobile_quick_log_modal.png")
		await m_page.screenshot(path=shot_path_4)
		print(f"✓ Mobile screenshot saved: {shot_path_4}")

		await browser.close()
		print("\n🎉 ALL UI TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
	asyncio.run(run_quick_log_inspection())
