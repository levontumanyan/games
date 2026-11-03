#!/usr/bin/env python3
"""CLI helper to create an exercise, upload media, tag muscles, and link video in one shot."""

import argparse
import json
import mimetypes
import shutil
import subprocess
import sys
from pathlib import Path

import httpx

DEFAULT_BASE_URL = "https://levon.ajwest.ca/workout"
DEFAULT_USER_ID = "levon"
DEFAULT_USER_AGENT = (
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
	"(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Atomic exercise creator with media upload and taxonomy tagging."
	)
	parser.add_argument("--name", required=True, help="Exercise name")
	parser.add_argument(
		"--laterality",
		required=True,
		choices=["bilateral", "unilateral"],
		help="REQUIRED: bilateral or unilateral",
	)
	parser.add_argument(
		"--category",
		default="strength",
		choices=["strength", "cardio", "technique", "mobility", "stretch", "drill"],
	)
	parser.add_argument(
		"--discipline",
		default="calisthenics",
		choices=["calisthenics", "general", "boxing", "muay_thai", "kickboxing", "yoga"],
	)
	parser.add_argument("--mode", default="reps", choices=["reps", "time"])
	parser.add_argument("--quantity", type=int, default=12)
	parser.add_argument("--description", default="")
	parser.add_argument("--gif", help="Path to local GIF/image file to upload as primary media")
	parser.add_argument("--media-url", default="", help="Direct media URL if already hosted")
	parser.add_argument("--youtube", help="YouTube URL to attach as secondary video asset")
	parser.add_argument("--primary-muscles", nargs="*", default=[])
	parser.add_argument("--secondary-muscles", nargs="*", default=[])
	parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
	parser.add_argument("--user-id", default=DEFAULT_USER_ID)
	return parser.parse_args()


def main() -> None:
	args = parse_args()
	base = args.base_url.rstrip("/")
	headers = {
		"User-Agent": DEFAULT_USER_AGENT,
		"X-User-Id": args.user_id,
	}

	with httpx.Client(base_url=base, headers=headers, timeout=30.0) as client:
		# 1. Upload local GIF/image if supplied
		media_url = args.media_url
		if args.gif:
			gif_path = Path(args.gif).resolve()
			if not gif_path.exists():
				sys.stderr.write(f"Error: File not found: {gif_path}\n")
				sys.exit(1)

			upload_path = gif_path
			if shutil.which("gifsicle") and gif_path.suffix.lower() == ".gif":
				opt_path = gif_path.with_name(f"{gif_path.stem}_opt.gif")
				try:
					subprocess.run(
						["gifsicle", "-O3", "--lossy=80", "-o", str(opt_path), str(gif_path)],
						check=True,
						capture_output=True,
					)
					if opt_path.exists() and opt_path.stat().st_size < gif_path.stat().st_size:
						upload_path = opt_path
						print(
							f"Optimized with gifsicle: {gif_path.stat().st_size} -> {opt_path.stat().st_size} bytes"
						)
				except Exception:
					pass

			mime = mimetypes.guess_type(str(upload_path))[0] or "image/gif"
			with open(upload_path, "rb") as f:
				files = {"file": (upload_path.name, f, mime)}
				resp = client.post("/api/upload", files=files)
				if resp.status_code >= 400:
					sys.stderr.write(f"Upload failed ({resp.status_code}): {resp.text}\n")
					sys.exit(1)
				media_url = resp.json().get("url", "")
				print(f"Uploaded media: {media_url}")

		# 2. Create base exercise
		payload = {
			"name": args.name,
			"laterality": args.laterality,
			"category": args.category,
			"discipline": args.discipline,
			"default_mode": args.mode,
			"default_quantity": args.quantity,
			"description": args.description,
			"media_url": media_url,
		}
		res = client.post("/api/exercises", json=payload)
		if res.status_code >= 400:
			sys.stderr.write(f"Exercise creation failed ({res.status_code}): {res.text}\n")
			sys.exit(1)
		exercise = res.json()
		ex_id = exercise["id"]
		print(f"Created exercise: {ex_id} ({exercise['name']})")

		# 3. Tag muscles if provided
		if args.primary_muscles or args.secondary_muscles:
			patch_payload = {}
			if args.primary_muscles:
				patch_payload["primary_muscles"] = args.primary_muscles
			if args.secondary_muscles:
				patch_payload["secondary_muscles"] = args.secondary_muscles
			p_res = client.patch(f"/api/exercises/{ex_id}", json=patch_payload)
			if p_res.status_code < 400:
				exercise = p_res.json()
				print(
					f"Tagged muscles: primary={args.primary_muscles}, secondary={args.secondary_muscles}"
				)

		# 4. Attach YouTube asset if provided
		if args.youtube:
			yt_payload = {
				"url": args.youtube,
				"kind": "instruction",
				"type": "video",
				"title": "Tutorial Video",
				"set_as_primary": not bool(media_url),
			}
			yt_res = client.post(f"/api/exercises/{ex_id}/media", json=yt_payload)
			if yt_res.status_code < 400:
				exercise = yt_res.json()
				print(f"Attached video asset: {args.youtube}")

		print(json.dumps(exercise, indent=2))


if __name__ == "__main__":
	main()
