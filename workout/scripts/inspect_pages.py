import argparse
import asyncio
import os

from playwright.async_api import async_playwright


async def capture_views(base_url: str, output_dir: str):
	os.makedirs(output_dir, exist_ok=True)
	async with async_playwright() as p:
		browser = await p.chromium.launch(headless=True)

		# ── Desktop Viewport (1440x900) ──────────────────────────────────────────
		page = await browser.new_page(
			viewport={"width": 1440, "height": 900},
			extra_http_headers={"X-User-Id": "levon"},
		)

		# 1. Workouts view
		await page.goto(f"{base_url.rstrip('/')}/")
		await page.wait_for_timeout(1000)
		await page.screenshot(path=os.path.join(output_dir, "view_workouts_empty.png"))

		first_item = page.locator("#routine-list .routine-item").first
		if await first_item.count() > 0:
			await first_item.click()
			await page.wait_for_timeout(1000)
			await page.screenshot(path=os.path.join(output_dir, "view_workouts_selected.png"))

		# 2. Combos view
		await page.click("#tab-combos-btn")
		await page.wait_for_timeout(1000)
		await page.screenshot(path=os.path.join(output_dir, "view_combos.png"))

		# 3. Exercises view
		await page.click("#tab-exercises-btn")
		await page.wait_for_timeout(1000)
		await page.screenshot(path=os.path.join(output_dir, "view_exercises.png"))

		# 4. Anatomy view
		await page.click("#tab-anatomy-btn")
		await page.wait_for_timeout(1000)
		await page.screenshot(path=os.path.join(output_dir, "view_anatomy.png"))

		# Click a muscle chip in Anatomy if available
		chest_chip = page.locator("button.anatomy-quick-chip:has-text('Chest')").first
		if await chest_chip.count() > 0:
			await chest_chip.click()
			await page.wait_for_timeout(500)
			await page.screenshot(path=os.path.join(output_dir, "view_anatomy_selected.png"))

		# ── Mobile Viewport (390x844) ────────────────────────────────────────────
		mobile_page = await browser.new_page(
			viewport={"width": 390, "height": 844},
			extra_http_headers={"X-User-Id": "levon"},
		)
		await mobile_page.goto(f"{base_url.rstrip('/')}/")
		await mobile_page.wait_for_timeout(1000)
		await mobile_page.screenshot(path=os.path.join(output_dir, "mobile_workouts.png"))

		await mobile_page.click("#m-tab-combos-btn")
		await mobile_page.wait_for_timeout(500)
		await mobile_page.screenshot(path=os.path.join(output_dir, "mobile_combos.png"))

		await mobile_page.click("#m-tab-exercises-btn")
		await mobile_page.wait_for_timeout(500)
		await mobile_page.screenshot(path=os.path.join(output_dir, "mobile_exercises.png"))

		await mobile_page.click("#m-tab-anatomy-btn")
		await mobile_page.wait_for_timeout(500)
		await mobile_page.screenshot(path=os.path.join(output_dir, "mobile_anatomy.png"))

		await browser.close()
		print(f"Screenshots successfully saved to: {output_dir}")


def main():
	parser = argparse.ArgumentParser(description="Capture visual screenshots of workout app views.")
	parser.add_argument(
		"--url", default="http://127.0.0.1:8766/workout", help="Base URL of workout app"
	)
	parser.add_argument(
		"--out", default="/tmp/workout_screenshots", help="Directory to save screenshots"
	)
	args = parser.parse_args()

	asyncio.run(capture_views(args.url, args.out))


if __name__ == "__main__":
	main()
