#!/usr/bin/env python3
"""CLI utility to create an exercise against the live Workout API.

Enforces explicit laterality ('bilateral' vs 'unilateral') with no default fallback
to prevent authoring errors.
"""

import argparse
import json
import sys
import urllib.request


def create_exercise(
	base_url: str,
	user_id: str,
	name: str,
	laterality: str,
	category: str,
	discipline: str,
	default_mode: str,
	default_quantity: int,
	description: str,
	media_url: str,
) -> dict:
	url = f"{base_url.rstrip('/')}/api/exercises"
	payload = {
		"name": name,
		"laterality": laterality,
		"category": category,
		"discipline": discipline,
		"default_mode": default_mode,
		"default_quantity": default_quantity,
		"description": description,
		"media_url": media_url,
	}

	headers = {
		"Content-Type": "application/json",
		"User-Agent": (
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
			"AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
		),
		"X-User-Id": user_id,
	}

	req = urllib.request.Request(
		url,
		data=json.dumps(payload).encode("utf-8"),
		headers=headers,
		method="POST",
	)

	try:
		with urllib.request.urlopen(req) as resp:
			return json.loads(resp.read().decode("utf-8"))
	except urllib.error.HTTPError as e:
		err_body = e.read().decode("utf-8")
		sys.stderr.write(f"HTTP Error {e.code}: {err_body}\n")
		sys.exit(1)
	except Exception as e:
		sys.stderr.write(f"Request failed: {e}\n")
		sys.exit(1)


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Create a new exercise in the Workout library.",
		formatter_class=argparse.ArgumentDefaultsHelpFormatter,
	)
	parser.add_argument("--name", required=True, help="Exercise name")
	parser.add_argument(
		"--laterality",
		required=True,
		choices=["bilateral", "unilateral"],
		help="REQUIRED: Side coverage ('bilateral' for both sides together / alternating, 'unilateral' for one side at a time)",
	)
	parser.add_argument(
		"--category",
		default="strength",
		choices=["strength", "cardio", "technique", "mobility", "stretch", "drill"],
		help="Exercise category",
	)
	parser.add_argument(
		"--discipline",
		default="general",
		choices=["general", "boxing", "muay_thai", "kickboxing", "bjj", "yoga", "calisthenics"],
		help="Exercise discipline",
	)
	parser.add_argument(
		"--mode",
		default="reps",
		choices=["reps", "time"],
		help="Execution mode",
	)
	parser.add_argument(
		"--quantity",
		type=int,
		default=10,
		help="Default repetition count or timer seconds",
	)
	parser.add_argument("--description", default="", help="Instructional notes or cues")
	parser.add_argument("--media-url", default="", help="Demonstration media or video URL")
	parser.add_argument(
		"--base-url",
		default="https://levon.ajwest.ca/workout",
		help="Base Workout service URL",
	)
	parser.add_argument("--user-id", default="levon", help="User identifier")

	return parser.parse_args()


def main() -> None:
	args = parse_args()
	res = create_exercise(
		base_url=args.base_url,
		user_id=args.user_id,
		name=args.name,
		laterality=args.laterality,
		category=args.category,
		discipline=args.discipline,
		default_mode=args.mode,
		default_quantity=args.quantity,
		description=args.description,
		media_url=args.media_url,
	)
	print(json.dumps(res, indent=2))


if __name__ == "__main__":
	main()
