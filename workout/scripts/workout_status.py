#!/usr/bin/env python3
"""CLI tool to inspect workout status, schedule adherence, and next recommendations.

Queries the Workout Player live API directly.
"""

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request


def get_default_tz_offset_minutes() -> int:
	"""Calculate local timezone offset in minutes from UTC."""
	return int(time.timezone / 60 if time.daylight == 0 else time.altzone / 60)


def fetch_api(url: str, user_id: str, method: str = "GET") -> dict:
	headers = {
		"User-Agent": (
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
			"AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
		),
		"X-User-Id": user_id,
		"Accept": "application/json",
	}
	req = urllib.request.Request(url, headers=headers, method=method)
	try:
		with urllib.request.urlopen(req) as resp:
			return json.loads(resp.read().decode("utf-8"))
	except urllib.error.HTTPError as e:
		err_body = e.read().decode("utf-8")
		sys.stderr.write(f"HTTP Error {e.code}: {err_body}\n")
		sys.exit(1)
	except Exception as e:
		sys.stderr.write(f"Connection Error: {e}\n")
		sys.exit(1)


def format_duration(seconds: int) -> str:
	mins = seconds // 60
	secs = seconds % 60
	return f"{mins}m {secs:02d}s" if mins > 0 else f"{secs}s"


def main():
	parser = argparse.ArgumentParser(
		description="Inspect workout status, recent history, schedule sync, and next routine recommendation."
	)
	parser.add_argument(
		"--url",
		default="https://levon.ajwest.ca/workout",
		help="Base URL of the workout app (default: https://levon.ajwest.ca/workout)",
	)
	parser.add_argument(
		"--user",
		default="levon",
		help="User ID to query (default: levon)",
	)
	parser.add_argument(
		"--tz-offset",
		type=int,
		default=None,
		help="Timezone offset in minutes (default: auto-detected from local machine)",
	)
	parser.add_argument(
		"--reconcile",
		action="store_true",
		help="Trigger server-side reconciliation of scheduled workouts against completed sessions before checking status",
	)
	parser.add_argument(
		"--json",
		action="store_true",
		help="Output raw JSON response",
	)

	args = parser.parse_args()

	base_url = args.url.rstrip("/")
	tz_offset = args.tz_offset if args.tz_offset is not None else get_default_tz_offset_minutes()

	if args.reconcile:
		reconcile_url = f"{base_url}/api/schedule/reconcile"
		rec_res = fetch_api(reconcile_url, args.user, method="POST")
		if not args.json and rec_res.get("reconciled_count", 0) > 0:
			print(
				f"[Sync] Reconciled {rec_res['reconciled_count']} scheduled workout(s) with completed sessions.\n"
			)

	rec_url = f"{base_url}/api/schedule/recommendation?tz_offset={tz_offset}"
	data = fetch_api(rec_url, args.user)

	if args.json:
		print(json.dumps(data, indent=2))
		return

	as_of_date = data.get("as_of_date", "")
	day_of_week = data.get("day_of_week", "")
	last_session = data.get("last_session")
	today_sched = data.get("today_scheduled", [])
	missed_sched = data.get("missed_scheduled", [])
	rec = data.get("recommendation", {})

	print(f"Workout Status for {args.user.capitalize()} ({day_of_week}, {as_of_date})")
	print("=" * 60)

	# 1. Last completed session
	print("\n[Last Completed Workout]")
	if last_session:
		title = last_session.get("routine_title") or "Workout"
		r_id = last_session.get("routine_id", "")
		completed_at = (
			last_session.get("completed_at") or last_session.get("started_at") or "Unknown"
		)
		duration = format_duration(last_session.get("duration_seconds", 0))
		steps = (
			f"{last_session.get('completed_steps', 0)}/{last_session.get('total_steps', 0)} steps"
		)
		print(f"  Title:    {title}")
		print(f"  Date:     {completed_at}")
		print(f"  Duration: {duration} ({steps})")
		if r_id:
			print(f"  URL:      {base_url}/#r={r_id}")
	else:
		print("  No completed sessions recorded yet.")

	# 2. Today's schedule
	print("\n[Today's Schedule]")
	if today_sched:
		for item in today_sched:
			st = "Completed" if item.get("status") == "completed" else "Scheduled"
			t_title = item.get("routine_title", "Workout")
			t_time = item.get("scheduled_time") or "Anytime"
			print(f"  * [{st}] {t_title} ({t_time})")
	else:
		print("  No workout explicitly scheduled on calendar for today.")

	# 3. Missed items
	if missed_sched:
		print("\n[Missed Scheduled Workouts (Past 7 Days)]")
		for item in missed_sched:
			print(f"  * {item.get('scheduled_date')}: {item.get('routine_title')} (Pending)")

	# 4. Recommendation
	print("\n[Smart Next Recommendation]")
	if rec:
		r_title = rec.get("routine_title", "")
		r_id = rec.get("routine_id", "")
		reason = rec.get("reason", "")
		launch_url = rec.get("launch_url", "")
		print(f"  Recommended: {r_title}")
		print(f"  Reason:      {reason}")
		print(f"  Direct Link: {launch_url}")

		alt = rec.get("alternative")
		if alt:
			print("\n  Alternative Catch-Up Option:")
			print(f"    * {alt.get('routine_title')}")
			print(f"      Reason: {alt.get('reason')}")
			print(f"      Link:   {alt.get('launch_url')}")
	print()


if __name__ == "__main__":
	main()
