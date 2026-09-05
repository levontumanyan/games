#!/usr/bin/env python3
"""
CLI helper for searching YouTube videos and interacting with the remote Workout Player API.
Ensures proper Cloudflare Tunnel and authentication headers (User-Agent, X-User-Id) are always sent.
"""

import argparse
import json
import sys
from typing import Any

import httpx
from youtube_search import YoutubeSearch

DEFAULT_BASE_URL = "https://levon.ajwest.ca/workout"
DEFAULT_USER_ID = "levon"
DEFAULT_USER_AGENT = (
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
	"(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

DEFAULT_HEADERS = {
	"User-Agent": DEFAULT_USER_AGENT,
	"X-User-Id": DEFAULT_USER_ID,
	"Accept": "application/json",
}


def search_youtube(query: str, max_results: int = 5) -> list[dict[str, Any]]:
	"""Search YouTube and return formatted video results."""
	results = YoutubeSearch(query, max_results=max_results).to_dict()
	cleaned = []
	for item in results:
		video_id = item.get("id")
		cleaned.append(
			{
				"id": video_id,
				"title": item.get("title"),
				"duration": item.get("duration"),
				"channel": item.get("channel"),
				"url": f"https://www.youtube.com/watch?v={video_id}",
			}
		)
	return cleaned


def get_remote_exercises(
	base_url: str = DEFAULT_BASE_URL,
	user_id: str = DEFAULT_USER_ID,
	category: str | None = None,
	discipline: str | None = None,
) -> list[dict[str, Any]]:
	"""Fetch exercises from remote live instance with required Cloudflare/auth headers."""
	url = f"{base_url.rstrip('/')}/api/exercises"
	params = {}
	if category:
		params["category"] = category
	if discipline:
		params["discipline"] = discipline

	headers = {**DEFAULT_HEADERS, "X-User-Id": user_id}
	with httpx.Client(timeout=10.0) as client:
		resp = client.get(url, headers=headers, params=params)
		resp.raise_for_status()
		return resp.json()


def get_remote_routines(
	base_url: str = DEFAULT_BASE_URL,
	user_id: str = DEFAULT_USER_ID,
) -> list[dict[str, Any]]:
	"""Fetch routines from remote live instance with required headers."""
	url = f"{base_url.rstrip('/')}/api/routines"
	headers = {**DEFAULT_HEADERS, "X-User-Id": user_id}
	with httpx.Client(timeout=10.0) as client:
		resp = client.get(url, headers=headers)
		resp.raise_for_status()
		return resp.json()


def create_remote_exercise(
	exercise_data: dict[str, Any],
	base_url: str = DEFAULT_BASE_URL,
	user_id: str = DEFAULT_USER_ID,
) -> dict[str, Any]:
	"""Create or update an exercise on remote live instance."""
	url = f"{base_url.rstrip('/')}/api/exercises"
	headers = {**DEFAULT_HEADERS, "X-User-Id": user_id, "Content-Type": "application/json"}
	with httpx.Client(timeout=10.0) as client:
		resp = client.post(url, headers=headers, json=exercise_data)
		resp.raise_for_status()
		return resp.json()


def print_card(title: str, lines: list[tuple[str, str]]):
	width = 76
	print("┌" + "─" * (width - 2) + "┐")
	print(f"│ {title:<{width - 4}} │")
	print("├" + "─" * (width - 2) + "┤")
	for label, val in lines:
		content = f"{label:<12}: {val}"
		print(f"│ {content:<{width - 4}} │")
	print("└" + "─" * (width - 2) + "┘")


def main():
	parser = argparse.ArgumentParser(
		description="Search YouTube and query Workout Player remote API with proper headers."
	)
	parser.add_argument("query", nargs="?", default="", help="Search query for YouTube videos")
	parser.add_argument("--max", type=int, default=5, help="Max results for YouTube search")
	parser.add_argument(
		"--list-exercises", action="store_true", help="List exercises from remote live API"
	)
	parser.add_argument("--category", default=None, help="Filter remote exercises by category")
	parser.add_argument("--discipline", default=None, help="Filter remote exercises by discipline")
	parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL of workout app")
	parser.add_argument("--user-id", default=DEFAULT_USER_ID, help="Active user ID")
	parser.add_argument("--json", action="store_true", help="Output raw JSON")

	args = parser.parse_args()

	if args.list_exercises:
		try:
			exercises = get_remote_exercises(
				base_url=args.base_url,
				user_id=args.user_id,
				category=args.category,
				discipline=args.discipline,
			)
			if args.json:
				print(json.dumps(exercises, indent=2))
			else:
				print(f"Found {len(exercises)} exercises on remote {args.base_url}:")
				for ex in exercises:
					print_card(
						ex.get("name", "Unnamed"),
						[
							("ID", ex.get("id", "")),
							("Category", ex.get("category", "")),
							("Discipline", ex.get("discipline", "")),
							(
								"Mode",
								f"{ex.get('default_quantity', 0)} {ex.get('default_mode', '')}",
							),
							("Media URL", ex.get("media_url") or "None"),
							("Assets", str(len(ex.get("media_assets") or []))),
						],
					)
		except Exception as e:
			print(f"[ERROR] Failed to fetch remote exercises: {e}", file=sys.stderr)
			sys.exit(1)
		return

	if not args.query:
		parser.print_help()
		sys.exit(1)

	try:
		videos = search_youtube(args.query, max_results=args.max)
		if args.json:
			print(json.dumps(videos, indent=2))
		else:
			print(f"YouTube search results for: '{args.query}'")
			for v in videos:
				print_card(
					v["title"][:70],
					[
						("ID", v["id"]),
						("Duration", v["duration"] or "N/A"),
						("Channel", v["channel"] or "N/A"),
						("URL", v["url"]),
					],
				)
	except Exception as e:
		print(f"[ERROR] Failed to search YouTube: {e}", file=sys.stderr)
		sys.exit(1)


if __name__ == "__main__":
	main()
