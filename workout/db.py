import json
import secrets
import sqlite3
import string
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


class Database:
	def __init__(self, db_path: Path):
		self.db_path = db_path
		self.init_db()

	def get_connection(self) -> sqlite3.Connection:
		conn = sqlite3.connect(self.db_path)
		conn.row_factory = sqlite3.Row
		conn.execute("PRAGMA foreign_keys = ON")
		return conn

	def init_db(self) -> None:
		self.db_path.parent.mkdir(parents=True, exist_ok=True)
		with self.get_connection() as conn:
			conn.executescript(
				"""
				CREATE TABLE IF NOT EXISTS users (
					id TEXT PRIMARY KEY,
					display_name TEXT NOT NULL,
					created_at TEXT NOT NULL
				);

				CREATE TABLE IF NOT EXISTS routines (
					id TEXT NOT NULL,
					user_id TEXT NOT NULL,
					title TEXT NOT NULL,
					steps_json TEXT NOT NULL,
					music_tracks_json TEXT NOT NULL DEFAULT '[]',
					updated_at TEXT NOT NULL,
					PRIMARY KEY (id, user_id),
					FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
				);

				CREATE TABLE IF NOT EXISTS sessions (
					id TEXT PRIMARY KEY,
					user_id TEXT NOT NULL,
					routine_id TEXT,
					routine_title TEXT,
					started_at TEXT NOT NULL,
					completed_at TEXT,
					duration_seconds INTEGER NOT NULL DEFAULT 0,
					completed_steps INTEGER NOT NULL DEFAULT 0,
					total_steps INTEGER NOT NULL DEFAULT 0,
					status TEXT NOT NULL DEFAULT 'in_progress',
					FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
				);

				CREATE TABLE IF NOT EXISTS shared_routines (
					id TEXT PRIMARY KEY,
					title TEXT NOT NULL,
					routine_json TEXT NOT NULL,
					created_at TEXT NOT NULL
				);

				CREATE TABLE IF NOT EXISTS exercises (
					id TEXT PRIMARY KEY,
					user_id TEXT,
					name TEXT NOT NULL,
					category TEXT NOT NULL,
					discipline TEXT NOT NULL DEFAULT 'general',
					default_mode TEXT NOT NULL DEFAULT 'time',
					default_quantity INTEGER NOT NULL DEFAULT 30,
					description TEXT DEFAULT '',
					media_url TEXT DEFAULT '',
					media_assets_json TEXT NOT NULL DEFAULT '[]',
					primary_muscles_json TEXT NOT NULL DEFAULT '[]',
					secondary_muscles_json TEXT NOT NULL DEFAULT '[]',
					created_at TEXT NOT NULL
				);

				CREATE TABLE IF NOT EXISTS combos (
					id TEXT PRIMARY KEY,
					user_id TEXT,
					name TEXT NOT NULL,
					category TEXT NOT NULL DEFAULT 'drill',
					discipline TEXT NOT NULL DEFAULT 'general',
					flow_type TEXT NOT NULL DEFAULT 'alternating',
					exercise_ids_json TEXT NOT NULL DEFAULT '[]',
					default_mode TEXT NOT NULL DEFAULT 'time',
					default_quantity INTEGER NOT NULL DEFAULT 190,
					description TEXT DEFAULT '',
					media_url TEXT DEFAULT '',
					media_assets_json TEXT NOT NULL DEFAULT '[]',
					created_at TEXT NOT NULL
				);

				CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);
				CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions(user_id, started_at);
				CREATE INDEX IF NOT EXISTS idx_exercises_user ON exercises(user_id, category, discipline);
				CREATE INDEX IF NOT EXISTS idx_combos_user ON combos(user_id, category, discipline);
				"""
			)

			# Auto-migrate routines table to composite primary key (id, user_id) if needed
			table_info = conn.execute("PRAGMA table_info(routines)").fetchall()
			if table_info:
				pk_cols = [row["name"] for row in table_info if row["pk"] > 0]
				if pk_cols == ["id"]:
					conn.executescript(
						"""
						CREATE TABLE routines_new (
							id TEXT NOT NULL,
							user_id TEXT NOT NULL,
							title TEXT NOT NULL,
							steps_json TEXT NOT NULL,
							music_tracks_json TEXT NOT NULL DEFAULT '[]',
							updated_at TEXT NOT NULL,
							PRIMARY KEY (id, user_id),
							FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
						);
						INSERT OR IGNORE INTO routines_new SELECT * FROM routines;
						DROP TABLE routines;
						ALTER TABLE routines_new RENAME TO routines;
						CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);
						"""
					)

			# Auto-migrate sessions table to include is_preview and exercises_json
			sess_info = conn.execute("PRAGMA table_info(sessions)").fetchall()
			sess_cols = [row["name"] for row in sess_info]
			if "is_preview" not in sess_cols:
				try:
					conn.execute(
						"ALTER TABLE sessions ADD COLUMN is_preview INTEGER NOT NULL DEFAULT 0"
					)
				except Exception:
					pass
			if "exercises_json" not in sess_cols:
				try:
					conn.execute(
						"ALTER TABLE sessions ADD COLUMN exercises_json TEXT NOT NULL DEFAULT '[]'"
					)
				except Exception:
					pass

			# Auto-migrate exercises table to include media_assets_json and muscle group columns
			ex_info = conn.execute("PRAGMA table_info(exercises)").fetchall()
			ex_cols = [row["name"] for row in ex_info]
			if "media_assets_json" not in ex_cols:
				try:
					conn.execute(
						"ALTER TABLE exercises ADD COLUMN media_assets_json TEXT NOT NULL DEFAULT '[]'"
					)
				except Exception:
					pass
			if "primary_muscles_json" not in ex_cols:
				try:
					conn.execute(
						"ALTER TABLE exercises ADD COLUMN primary_muscles_json TEXT NOT NULL DEFAULT '[]'"
					)
				except Exception:
					pass
			if "secondary_muscles_json" not in ex_cols:
				try:
					conn.execute(
						"ALTER TABLE exercises ADD COLUMN secondary_muscles_json TEXT NOT NULL DEFAULT '[]'"
					)
				except Exception:
					pass

			# Ensure default user 'levon' exists
			cursor = conn.execute("SELECT id FROM users WHERE id = ?", ("levon",))
			if not cursor.fetchone():
				conn.execute(
					"INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)",
					("levon", "Levon", datetime.now().isoformat()),
				)

			# Seed preset exercises and combos libraries
			self._seed_default_exercises(conn)
			self._seed_default_combos(conn)

	def migrate_legacy_routines(self, legacy_file: Path) -> None:
		if not legacy_file.exists():
			return
		try:
			content = legacy_file.read_text(encoding="utf-8")
			routines = json.loads(content)
			if not isinstance(routines, list) or not routines:
				return

			with self.get_connection() as conn:
				count = conn.execute(
					"SELECT COUNT(*) FROM routines WHERE user_id = 'levon'"
				).fetchone()[0]
				if count == 0:
					for routine in routines:
						if not isinstance(routine, dict) or "id" not in routine:
							continue
						r_id = str(routine["id"])
						title = routine.get("title", "Untitled Workout")
						steps_json = json.dumps(routine.get("steps", []), ensure_ascii=False)
						music_json = json.dumps(routine.get("musicTracks", []), ensure_ascii=False)
						now = datetime.now().isoformat()
						conn.execute(
							"""
							INSERT OR REPLACE INTO routines (id, user_id, title, steps_json, music_tracks_json, updated_at)
							VALUES (?, 'levon', ?, ?, ?, ?)
							""",
							(r_id, title, steps_json, music_json, now),
						)
		except Exception as e:
			print(f"Warning: Failed to migrate legacy routines: {e}")

	# ── Users ────────────────────────────────────────────────────────────────

	def list_users(self) -> list[dict[str, Any]]:
		with self.get_connection() as conn:
			rows = conn.execute(
				"SELECT id, display_name, created_at FROM users ORDER BY created_at ASC"
			).fetchall()
			return [dict(row) for row in rows]

	def get_or_create_user(self, user_id: str, display_name: str | None = None) -> dict[str, Any]:
		clean_id = user_id.strip().lower()
		name = (display_name or user_id).strip()
		with self.get_connection() as conn:
			row = conn.execute(
				"SELECT id, display_name, created_at FROM users WHERE id = ?", (clean_id,)
			).fetchone()
			if row:
				return dict(row)
			now = datetime.now().isoformat()
			conn.execute(
				"INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)",
				(clean_id, name, now),
			)
			return {"id": clean_id, "display_name": name, "created_at": now}

	# ── Routines ─────────────────────────────────────────────────────────────

	def get_routines(self, user_id: str) -> list[dict[str, Any]]:
		with self.get_connection() as conn:
			rows = conn.execute(
				"SELECT id, title, steps_json, music_tracks_json FROM routines WHERE user_id = ? ORDER BY rowid ASC",
				(user_id,),
			).fetchall()
			result = []
			for row in rows:
				try:
					steps = json.loads(row["steps_json"])
				except Exception:
					steps = []
				try:
					music = json.loads(row["music_tracks_json"])
				except Exception:
					music = []
				result.append(
					{
						"id": row["id"],
						"title": row["title"],
						"steps": steps,
						"musicTracks": music,
					}
				)
			return result

	def save_routines(self, user_id: str, routines: list[dict[str, Any]]) -> None:
		self.get_or_create_user(user_id)
		with self.get_connection() as conn:
			# Replace all routines for this user
			conn.execute("DELETE FROM routines WHERE user_id = ?", (user_id,))
			now = datetime.now().isoformat()
			for routine in routines:
				r_id = str(routine.get("id", ""))
				if not r_id:
					continue
				title = routine.get("title", "Untitled Workout")
				steps_json = json.dumps(routine.get("steps", []), ensure_ascii=False)
				music_json = json.dumps(routine.get("musicTracks", []), ensure_ascii=False)
				conn.execute(
					"""
					INSERT INTO routines (id, user_id, title, steps_json, music_tracks_json, updated_at)
					VALUES (?, ?, ?, ?, ?, ?)
					""",
					(r_id, user_id, title, steps_json, music_json, now),
				)

	def get_routine(self, user_id: str, routine_id: str) -> dict[str, Any] | None:
		clean_user = user_id.strip().lower()
		clean_id = routine_id.strip()
		with self.get_connection() as conn:
			row = conn.execute(
				"SELECT id, title, steps_json, music_tracks_json FROM routines WHERE user_id = ? AND id = ?",
				(clean_user, clean_id),
			).fetchone()
			if not row:
				# Also check title match or slug match (case insensitive)
				rows = conn.execute(
					"SELECT id, title, steps_json, music_tracks_json FROM routines WHERE user_id = ?",
					(clean_user,),
				).fetchall()
				for r in rows:
					slug = r["title"].lower().replace(" ", "-").replace("_", "-")
					if r["title"].lower() == clean_id.lower() or slug == clean_id.lower():
						row = r
						break
			if not row:
				return None
			try:
				steps = json.loads(row["steps_json"])
			except Exception:
				steps = []
			try:
				music = json.loads(row["music_tracks_json"])
			except Exception:
				music = []
			return {
				"id": row["id"],
				"title": row["title"],
				"steps": steps,
				"musicTracks": music,
			}

	def upsert_routine(self, user_id: str, routine: dict[str, Any]) -> dict[str, Any]:
		clean_user = user_id.strip().lower()
		self.get_or_create_user(clean_user)
		r_id = str(routine.get("id", "")).strip()
		if not r_id:
			chars = string.ascii_lowercase + string.digits
			r_id = f"routine_{int(datetime.now().timestamp())}_{''.join(secrets.choice(chars) for _ in range(6))}"
		title = routine.get("title", "Untitled Workout")
		steps = routine.get("steps", [])
		music = routine.get("musicTracks", [])
		steps_json = json.dumps(steps, ensure_ascii=False)
		music_json = json.dumps(music, ensure_ascii=False)
		now = datetime.now().isoformat()
		with self.get_connection() as conn:
			conn.execute(
				"""
				INSERT INTO routines (id, user_id, title, steps_json, music_tracks_json, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(id, user_id) DO UPDATE SET
					title=excluded.title,
					steps_json=excluded.steps_json,
					music_tracks_json=excluded.music_tracks_json,
					updated_at=excluded.updated_at
				""",
				(r_id, clean_user, title, steps_json, music_json, now),
			)
		return {
			"id": r_id,
			"title": title,
			"steps": steps,
			"musicTracks": music,
		}

	def delete_routine(self, user_id: str, routine_id: str) -> bool:
		clean_user = user_id.strip().lower()
		clean_id = routine_id.strip()
		with self.get_connection() as conn:
			cursor = conn.execute(
				"DELETE FROM routines WHERE user_id = ? AND id = ?",
				(clean_user, clean_id),
			)
			if cursor.rowcount == 0:
				# Check slug or title match
				rows = conn.execute(
					"SELECT id, title FROM routines WHERE user_id = ?",
					(clean_user,),
				).fetchall()
				for r in rows:
					slug = r["title"].lower().replace(" ", "-").replace("_", "-")
					if r["title"].lower() == clean_id.lower() or slug == clean_id.lower():
						conn.execute(
							"DELETE FROM routines WHERE user_id = ? AND id = ?",
							(clean_user, r["id"]),
						)
						return True
				return False
			return True

	def _seed_default_exercises(self, conn: sqlite3.Connection) -> None:
		now = datetime.now().isoformat()
		conn.execute("DELETE FROM exercises WHERE user_id IS NULL OR user_id = 'system'")

		default_exercises = [
			# Star Jumps (Atomic)
			(
				"ex-star-jumps",
				None,
				"Star Jumps",
				"drill",
				"general",
				"time",
				45,
				"Explosive jumping jack variation with wide star expansion for conditioning and coordination.",
				"https://www.youtube.com/watch?v=ZWZWzRnLpVM",
				[
					{
						"id": "asset-star-jumps-demo",
						"kind": "demonstration",
						"type": "video",
						"title": "Star Jumps Drill Cadence",
						"videoId": "ZWZWzRnLpVM",
						"startSeconds": 60,
						"endSeconds": 250,
					}
				],
				["calves", "quads", "groin"],
				["shoulders", "abs"],
			),
			# Coordination Footwork Drills (Atomic)
			(
				"ex-coordination-drills",
				None,
				"Coordination Footwork Drills",
				"drill",
				"general",
				"time",
				45,
				"Fast agility footwork, bounce rhythm, and athletic coordination drill.",
				"https://www.youtube.com/watch?v=ZWZWzRnLpVM",
				[
					{
						"id": "asset-coord-drills-demo",
						"kind": "demonstration",
						"type": "video",
						"title": "Coordination Footwork Cadence",
						"videoId": "ZWZWzRnLpVM",
						"startSeconds": 60,
						"endSeconds": 250,
					}
				],
				["calves", "quads", "groin"],
				["abs", "glutes"],
			),
			# Check Repeats (Lead & Rear Block)
			(
				"ex-check-repeats",
				None,
				"Check Repeats (Lead & Rear Block)",
				"technique",
				"muay_thai",
				"time",
				60,
				"Rapid knee checks against incoming roundhouse kicks, alternating lead and rear shins.",
				"https://www.youtube.com/watch?v=wPGC3uFIOBA",
				[
					{
						"id": "asset-check-repeats-demo",
						"kind": "demonstration",
						"type": "video",
						"title": "Check Repeats Technique & Cadence",
						"videoId": "wPGC3uFIOBA",
						"startSeconds": 0,
						"endSeconds": 60,
					}
				],
				["hip_flexors", "obliques", "quads"],
				["calves", "groin"],
			),
			# Lateral Jumps
			(
				"ex-lateral-jumps",
				None,
				"Lateral Jumps",
				"drill",
				"general",
				"time",
				45,
				"Side-to-side explosive bounding for lateral agility and leg power.",
				"https://www.youtube.com/watch?v=ZWZWzRnLpVM",
				[
					{
						"id": "asset-lateral-jumps-demo",
						"kind": "demonstration",
						"type": "video",
						"title": "Lateral Jumps Drill",
						"videoId": "ZWZWzRnLpVM",
						"startSeconds": 585,
						"endSeconds": 770,
					}
				],
				["quads", "calves", "groin"],
				["glutes", "obliques"],
			),
			# Mountain Climbers
			(
				"ex-mountain-climbers",
				None,
				"Mountain Climbers",
				"cardio",
				"general",
				"time",
				60,
				"High tempo alternating knee drive in pushup plank position for core and conditioning.",
				"https://www.youtube.com/watch?v=7sLw5dHdRG4",
				[
					{
						"id": "asset-mountain-climbers-demo",
						"kind": "demonstration",
						"type": "video",
						"title": "Mountain Climbers Cardio Pace",
						"videoId": "7sLw5dHdRG4",
						"startSeconds": 492,
						"endSeconds": 552,
					}
				],
				["abs", "hip_flexors", "shoulders"],
				["quads", "chest", "calves"],
			),
			# Jab-Cross Combo
			(
				"ex-jab-cross",
				None,
				"Jab-Cross Combo",
				"technique",
				"boxing",
				"time",
				184,
				"Straight punch fundamentals: lead jab followed by rear cross with hip rotation.",
				"https://www.youtube.com/watch?v=7sLw5dHdRG4",
				[
					{
						"id": "asset-jab-cross-inst",
						"kind": "instruction",
						"type": "video",
						"title": "Jab Cross Punching Mechanics & Stance",
						"videoId": "7sLw5dHdRG4",
						"startSeconds": 662,
						"endSeconds": 846,
					}
				],
				["shoulders", "obliques"],
				["triceps", "forearms", "calves"],
			),
			# Rear Knee / Switch Knee Thrust
			(
				"ex-knee-strike",
				None,
				"Rear Knee / Switch Knee Thrust",
				"technique",
				"muay_thai",
				"time",
				60,
				"Explosive Muay Thai knee thrust driven by hip extension.",
				"https://www.youtube.com/watch?v=z37V3X6tPG4",
				[
					{
						"id": "asset-knee-demo",
						"kind": "demonstration",
						"type": "video",
						"title": "Knee Strike Execution",
						"videoId": "z37V3X6tPG4",
						"startSeconds": 694,
						"endSeconds": 938,
					}
				],
				["hip_flexors", "abs", "glutes"],
				["quads", "calves"],
			),
			# Lead & Rear Elbow Strikes
			(
				"ex-elbow-strikes",
				None,
				"Lead & Rear Elbow Strikes",
				"technique",
				"muay_thai",
				"time",
				60,
				"Slashing and horizontal close-range elbow strikes with guard protection.",
				"https://www.youtube.com/watch?v=z37V3X6tPG4",
				[
					{
						"id": "asset-elbow-demo",
						"kind": "demonstration",
						"type": "video",
						"title": "Elbow Strikes Flow",
						"videoId": "z37V3X6tPG4",
						"startSeconds": 1000,
						"endSeconds": 1243,
					}
				],
				["shoulders", "obliques", "lats"],
				["traps", "triceps", "biceps"],
			),
			# Standard Pushups
			(
				"ex-standard-pushups",
				None,
				"Standard Pushups",
				"strength",
				"calisthenics",
				"reps",
				20,
				"Full range chest-to-floor bodyweight push-ups with locked core.",
				"/workout/media/pushups.svg",
				[
					{
						"id": "asset-pushups-anim",
						"kind": "animation",
						"type": "image",
						"title": "Standard Push-up Form Animation",
						"url": "/workout/media/pushups.svg",
					}
				],
				["chest", "triceps"],
				["shoulders", "abs", "forearms"],
			),
			# Diamond Pushups
			(
				"ex-diamond-pushups",
				None,
				"Diamond Pushups",
				"strength",
				"calisthenics",
				"reps",
				15,
				"Close grip push-ups with thumbs and index fingers forming a diamond for tricep overload.",
				"/workout/media/diamond-pushups.svg",
				[
					{
						"id": "asset-diamond-anim",
						"kind": "animation",
						"type": "image",
						"title": "Diamond Push-up Tricep Form Animation",
						"url": "/workout/media/diamond-pushups.svg",
					}
				],
				["triceps", "chest"],
				["shoulders", "abs", "forearms"],
			),
			# Decline Pushups
			(
				"ex-decline-pushups",
				None,
				"Decline Pushups",
				"strength",
				"calisthenics",
				"reps",
				15,
				"Feet-elevated pushups shifting bodyweight load upward to emphasize clavicular head (upper chest) and anterior delts.",
				"/workout/media/pushups.svg",
				[
					{
						"id": "asset-decline-pushups-anim",
						"kind": "animation",
						"type": "image",
						"title": "Decline Push-up Form Animation",
						"url": "/workout/media/pushups.svg",
					}
				],
				["chest", "shoulders"],
				["triceps", "abs", "forearms"],
			),
			# Pike Pushups
			(
				"ex-pike-pushups",
				None,
				"Pike Pushups",
				"strength",
				"calisthenics",
				"reps",
				12,
				"Inverted V-shape pushups creating a vertical pressing angle to build shoulder and overhead pushing power.",
				"/workout/media/pushups.svg",
				[
					{
						"id": "asset-pike-pushups-anim",
						"kind": "animation",
						"type": "image",
						"title": "Pike Push-up Form Animation",
						"url": "/workout/media/pushups.svg",
					}
				],
				["shoulders", "triceps"],
				["chest", "traps", "abs"],
			),
			# Plank Shoulder Taps
			(
				"ex-plank-shoulder-taps",
				None,
				"Plank Shoulder Taps",
				"strength",
				"calisthenics",
				"reps",
				20,
				"High plank anti-rotation touches: alternate tapping each opposite shoulder without swaying hips.",
				"/workout/media/shoulder-taps.svg",
				[
					{
						"id": "asset-taps-anim",
						"kind": "animation",
						"type": "image",
						"title": "Plank Shoulder Taps Form Animation",
						"url": "/workout/media/shoulder-taps.svg",
					}
				],
				["abs", "obliques", "shoulders"],
				["chest", "triceps", "forearms"],
			),
			# Cobra Pose & Hip Opener
			(
				"ex-cobra-pose",
				None,
				"Cobra Pose & Hip Opener",
				"stretch",
				"yoga",
				"time",
				45,
				"Prone spine extension and gentle hip flexor / abdominal opening stretch.",
				"/workout/media/cobra-stretch.jpg",
				[
					{
						"id": "asset-cobra-photo",
						"kind": "photo",
						"type": "image",
						"title": "Cobra Pose Alignment Photo",
						"url": "/workout/media/cobra-stretch.jpg",
					},
					{
						"id": "asset-cobra-anim",
						"kind": "animation",
						"type": "image",
						"title": "Cobra Pose SVG Guide",
						"url": "/workout/media/cobra-stretch.svg",
					},
				],
				["abs", "hip_flexors", "lower_back"],
				["groin", "shoulders"],
			),
			# Overhead Tricep & Shoulder Stretch
			(
				"ex-overhead-tricep-stretch",
				None,
				"Overhead Tricep & Shoulder Stretch",
				"stretch",
				"general",
				"time",
				30,
				"Elbow pulled gently behind the head to release the triceps, lats, and posterior shoulder.",
				"/workout/media/overhead-tricep-stretch.jpg",
				[
					{
						"id": "asset-overhead-tricep-photo",
						"kind": "photo",
						"type": "image",
						"title": "Overhead Tricep Stretch Reference Photo",
						"url": "/workout/media/overhead-tricep-stretch.jpg",
					},
					{
						"id": "asset-overhead-tricep-anim",
						"kind": "animation",
						"type": "image",
						"title": "Overhead Tricep Stretch SVG Guide",
						"url": "/workout/media/shoulder-tricep-stretch.svg",
					},
				],
				["triceps", "shoulders", "lats"],
				["traps"],
			),
			# Pigeon Pose Hip Opener
			(
				"ex-pigeon-pose",
				None,
				"Pigeon Pose Hip Opener",
				"stretch",
				"yoga",
				"time",
				45,
				"Deep unilateral hip opener releasing the piriformis, glutes, and external hip rotators.",
				"/workout/media/pigeon-pose.jpg",
				[
					{
						"id": "asset-pigeon-photo",
						"kind": "photo",
						"type": "image",
						"title": "Pigeon Pose Reference Photo",
						"url": "/workout/media/pigeon-pose.jpg",
					},
					{
						"id": "asset-pigeon-anim",
						"kind": "animation",
						"type": "image",
						"title": "Pigeon Pose SVG Guide",
						"url": "/workout/media/pigeon-pose.svg",
					},
				],
				["glutes", "groin", "hip_flexors"],
				["hamstrings", "lower_back"],
			),
			# Seated Forward Hamstring Fold
			(
				"ex-seated-hamstring-fold",
				None,
				"Seated Forward Hamstring Fold",
				"stretch",
				"yoga",
				"time",
				45,
				"Seated straight-leg forward fold targeting hamstrings and spinal decompression.",
				"/workout/media/seated-hamstring-fold.jpg",
				[
					{
						"id": "asset-hamstring-photo",
						"kind": "photo",
						"type": "image",
						"title": "Hamstring Fold Reference Photo",
						"url": "/workout/media/seated-hamstring-fold.jpg",
					}
				],
				["hamstrings", "lower_back"],
				["calves", "groin"],
			),
			# Extended Child's Pose Spine & Lat Stretch
			(
				"ex-childs-pose",
				None,
				"Extended Child's Pose Spine & Lat Stretch",
				"stretch",
				"yoga",
				"time",
				60,
				"Kneeling restful stretch reaching arms forward to decompress lower back and elongate the lats.",
				"/workout/media/childs-pose.jpg",
				[
					{
						"id": "asset-child-photo",
						"kind": "photo",
						"type": "image",
						"title": "Child's Pose Reference Photo",
						"url": "/workout/media/childs-pose.jpg",
					},
					{
						"id": "asset-child-anim",
						"kind": "animation",
						"type": "image",
						"title": "Child's Pose SVG Guide",
						"url": "/workout/media/childs-pose.svg",
					},
				],
				["lats", "lower_back", "traps"],
				["groin", "glutes"],
			),
		]

		for (
			ex_id,
			u_id,
			name,
			cat,
			disc,
			mode,
			qty,
			desc,
			media,
			assets,
			pri_muscles,
			sec_muscles,
		) in default_exercises:
			assets_json = json.dumps(assets, ensure_ascii=False)
			pri_json = json.dumps(pri_muscles, ensure_ascii=False)
			sec_json = json.dumps(sec_muscles, ensure_ascii=False)
			conn.execute(
				"""
				INSERT INTO exercises (
					id, user_id, name, category, discipline, default_mode, default_quantity, description, media_url, media_assets_json, primary_muscles_json, secondary_muscles_json, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					name = excluded.name,
					category = excluded.category,
					discipline = excluded.discipline,
					default_mode = excluded.default_mode,
					default_quantity = excluded.default_quantity,
					description = excluded.description,
					media_url = excluded.media_url,
					media_assets_json = excluded.media_assets_json,
					primary_muscles_json = excluded.primary_muscles_json,
					secondary_muscles_json = excluded.secondary_muscles_json
				""",
				(
					ex_id,
					u_id,
					name,
					cat,
					disc,
					mode,
					qty,
					desc,
					media,
					assets_json,
					pri_json,
					sec_json,
					now,
				),
			)

	def _seed_default_combos(self, conn: sqlite3.Connection) -> None:
		now = datetime.now().isoformat()
		conn.execute("DELETE FROM combos WHERE user_id IS NULL OR user_id = 'system'")

		default_combos = [
			# 1. Star Jumps ⮀ Coordination Drills (5x Alternating Flow)
			(
				"combo-star-jumps-coord",
				None,
				"Star Jumps ⮀ Coordination Drills",
				"drill",
				"general",
				"alternating",
				["ex-star-jumps", "ex-coordination-drills"],
				"time",
				190,
				"Continuous 5-round alternating cadence of explosive star jumps and fast coordination footwork.",
				"https://www.youtube.com/watch?v=ZWZWzRnLpVM",
				[
					{
						"id": "asset-combo-star-coord",
						"kind": "demonstration",
						"type": "video",
						"title": "5x Alternating Star Jumps & Footwork Cadence",
						"videoId": "ZWZWzRnLpVM",
						"startSeconds": 60,
						"endSeconds": 250,
					}
				],
			),
			# 2. Lateral Jumps ⮀ Plank Shoulder Taps (Alternating Flow)
			(
				"combo-lateral-taps",
				None,
				"Lateral Jumps ⮀ Plank Shoulder Taps",
				"drill",
				"general",
				"alternating",
				["ex-lateral-jumps", "ex-plank-shoulder-taps"],
				"time",
				185,
				"Explosive lateral bounding intervals paired with core anti-rotation high plank shoulder touches.",
				"https://www.youtube.com/watch?v=ZWZWzRnLpVM",
				[
					{
						"id": "asset-combo-lat-taps",
						"kind": "demonstration",
						"type": "video",
						"title": "Alternating Lateral Jumps & Plank Taps Flow",
						"videoId": "ZWZWzRnLpVM",
						"startSeconds": 585,
						"endSeconds": 770,
					}
				],
			),
			# 3. Jab + Rear Knee / Switch Knee (Sequence Combo)
			(
				"combo-jab-knee",
				None,
				"Jab + Rear Knee / Switch Knee",
				"technique",
				"muay_thai",
				"sequence",
				["ex-jab-cross", "ex-knee-strike"],
				"time",
				244,
				"Straight punch entry flowing directly into rear knee thrust or switch lead knee strike.",
				"https://www.youtube.com/watch?v=z37V3X6tPG4",
				[
					{
						"id": "asset-combo-jab-knee",
						"kind": "demonstration",
						"type": "video",
						"title": "Jab to Knee Strike Transition Drill",
						"videoId": "z37V3X6tPG4",
						"startSeconds": 694,
						"endSeconds": 938,
					}
				],
			),
			# 4. Jab + Lead Elbow + Rear Elbow (Elbow Flurry)
			(
				"combo-jab-elbow",
				None,
				"Jab + Lead Elbow + Rear Elbow",
				"technique",
				"muay_thai",
				"sequence",
				["ex-jab-cross", "ex-elbow-strikes"],
				"time",
				243,
				"Close-quarters entry jab followed by lead and rear slashing elbow strikes.",
				"https://www.youtube.com/watch?v=z37V3X6tPG4",
				[
					{
						"id": "asset-combo-jab-elbow",
						"kind": "demonstration",
						"type": "video",
						"title": "Jab & Double Elbow Strike Combo Flow",
						"videoId": "z37V3X6tPG4",
						"startSeconds": 1000,
						"endSeconds": 1243,
					}
				],
			),
		]

		for (
			c_id,
			u_id,
			name,
			cat,
			disc,
			flow,
			ex_ids,
			mode,
			qty,
			desc,
			media,
			assets,
		) in default_combos:
			ex_ids_json = json.dumps(ex_ids, ensure_ascii=False)
			assets_json = json.dumps(assets, ensure_ascii=False)
			conn.execute(
				"""
				INSERT INTO combos (
					id, user_id, name, category, discipline, flow_type, exercise_ids_json, default_mode, default_quantity, description, media_url, media_assets_json, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					name = excluded.name,
					category = excluded.category,
					discipline = excluded.discipline,
					flow_type = excluded.flow_type,
					exercise_ids_json = excluded.exercise_ids_json,
					default_mode = excluded.default_mode,
					default_quantity = excluded.default_quantity,
					description = excluded.description,
					media_url = excluded.media_url,
					media_assets_json = excluded.media_assets_json
				""",
				(
					c_id,
					u_id,
					name,
					cat,
					disc,
					flow,
					ex_ids_json,
					mode,
					qty,
					desc,
					media,
					assets_json,
					now,
				),
			)

	# ── Combos ───────────────────────────────────────────────────────────────

	def list_combos(
		self,
		user_id: str,
		category: str | None = None,
		discipline: str | None = None,
		search: str | None = None,
	) -> list[dict[str, Any]]:
		clean_user = user_id.strip().lower() if user_id else "levon"
		query = """
			SELECT id, user_id, name, category, discipline, flow_type, exercise_ids_json, default_mode, default_quantity, description, media_url, media_assets_json, created_at
			FROM combos
			WHERE (user_id IS NULL OR user_id = 'system' OR user_id = ?)
		"""
		params: list[Any] = [clean_user]

		if category and category.strip() and category.strip().lower() != "all":
			query += " AND LOWER(category) = ?"
			params.append(category.strip().lower())

		if discipline and discipline.strip() and discipline.strip().lower() != "all":
			query += " AND LOWER(discipline) = ?"
			params.append(discipline.strip().lower())

		if search and search.strip():
			query += " AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?)"
			term = f"%{search.strip().lower()}%"
			params.extend([term, term])

		query += " ORDER BY CASE WHEN user_id IS NOT NULL AND user_id != 'system' THEN 0 ELSE 1 END, name ASC"

		with self.get_connection() as conn:
			rows = conn.execute(query, params).fetchall()
			result = []
			for row in rows:
				d = dict(row)
				try:
					d["exercise_ids"] = json.loads(d.get("exercise_ids_json") or "[]")
				except Exception:
					d["exercise_ids"] = []
				try:
					d["media_assets"] = json.loads(d.get("media_assets_json") or "[]")
				except Exception:
					d["media_assets"] = []
				if not d["media_assets"] and d.get("media_url"):
					d["media_assets"] = [
						{
							"id": f"{d['id']}-default",
							"kind": "demonstration",
							"type": "video" if "youtube" in d["media_url"] else "image",
							"title": "Continuous Flow",
							"url": d["media_url"],
						}
					]
				result.append(d)
			return result

	def get_combo(self, combo_id: str) -> dict[str, Any] | None:
		with self.get_connection() as conn:
			row = conn.execute("SELECT * FROM combos WHERE id = ?", (combo_id,)).fetchone()
			if not row:
				return None
			d = dict(row)
			try:
				d["exercise_ids"] = json.loads(d.get("exercise_ids_json") or "[]")
			except Exception:
				d["exercise_ids"] = []
			try:
				d["media_assets"] = json.loads(d.get("media_assets_json") or "[]")
			except Exception:
				d["media_assets"] = []
			return d

	def create_combo(self, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
		clean_user = user_id.strip().lower() if user_id else "levon"
		self.get_or_create_user(clean_user)

		name = str(data.get("name", "")).strip()
		if not name:
			raise ValueError("Combo name is required")

		c_id = str(data.get("id") or f"combo-{secrets.token_hex(4)}")
		category = str(data.get("category", "drill")).strip().lower()
		discipline = str(data.get("discipline", "general")).strip().lower()
		flow_type = str(data.get("flow_type", "alternating")).strip().lower()
		exercise_ids = data.get("exercise_ids", [])
		default_mode = str(data.get("default_mode", "time")).strip().lower()
		default_quantity = int(data.get("default_quantity", 190))
		description = str(data.get("description", "")).strip()
		media_url = str(data.get("media_url", "")).strip()
		media_assets = data.get("media_assets", [])
		if not media_assets and media_url:
			media_assets = [
				{
					"id": f"{c_id}-default",
					"kind": "demonstration",
					"type": "video" if "youtube" in media_url else "image",
					"title": "Continuous Flow",
					"url": media_url,
				}
			]
		ex_ids_json = json.dumps(exercise_ids, ensure_ascii=False)
		media_assets_json = json.dumps(media_assets, ensure_ascii=False)
		now = datetime.now().isoformat()

		with self.get_connection() as conn:
			conn.execute(
				"""
				INSERT INTO combos (
					id, user_id, name, category, discipline, flow_type, exercise_ids_json, default_mode, default_quantity, description, media_url, media_assets_json, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					name = excluded.name,
					category = excluded.category,
					discipline = excluded.discipline,
					flow_type = excluded.flow_type,
					exercise_ids_json = excluded.exercise_ids_json,
					default_mode = excluded.default_mode,
					default_quantity = excluded.default_quantity,
					description = excluded.description,
					media_url = excluded.media_url,
					media_assets_json = excluded.media_assets_json
				""",
				(
					c_id,
					clean_user,
					name,
					category,
					discipline,
					flow_type,
					ex_ids_json,
					default_mode,
					default_quantity,
					description,
					media_url,
					media_assets_json,
					now,
				),
			)
		return {
			"id": c_id,
			"user_id": clean_user,
			"name": name,
			"category": category,
			"discipline": discipline,
			"flow_type": flow_type,
			"exercise_ids": exercise_ids,
			"default_mode": default_mode,
			"default_quantity": default_quantity,
			"description": description,
			"media_url": media_url,
			"media_assets": media_assets,
			"created_at": now,
		}

	def delete_combo(self, combo_id: str, user_id: str) -> bool:
		clean_user = user_id.strip().lower() if user_id else "levon"
		with self.get_connection() as conn:
			cur = conn.execute(
				"DELETE FROM combos WHERE id = ? AND (user_id = ? OR user_id IS NULL OR user_id = 'system')",
				(combo_id, clean_user),
			)
			return cur.rowcount > 0

	# ── Exercises ────────────────────────────────────────────────────────────

	def list_exercises(
		self,
		user_id: str,
		category: str | None = None,
		discipline: str | None = None,
		search: str | None = None,
		muscle: str | None = None,
	) -> list[dict[str, Any]]:
		clean_user = user_id.strip().lower() if user_id else "levon"
		query = """
			SELECT id, user_id, name, category, discipline, default_mode, default_quantity, description, media_url, media_assets_json, primary_muscles_json, secondary_muscles_json, created_at
			FROM exercises
			WHERE (user_id IS NULL OR user_id = 'system' OR user_id = ?)
		"""
		params: list[Any] = [clean_user]

		if category and category.strip() and category.strip().lower() != "all":
			query += " AND LOWER(category) = ?"
			params.append(category.strip().lower())

		if discipline and discipline.strip() and discipline.strip().lower() != "all":
			query += " AND LOWER(discipline) = ?"
			params.append(discipline.strip().lower())

		if search and search.strip():
			query += " AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?)"
			term = f"%{search.strip().lower()}%"
			params.extend([term, term])

		if muscle and muscle.strip() and muscle.strip().lower() != "all":
			m = f"%{muscle.strip().lower()}%"
			query += (
				" AND (LOWER(primary_muscles_json) LIKE ? OR LOWER(secondary_muscles_json) LIKE ?)"
			)
			params.extend([m, m])

		query += " ORDER BY CASE WHEN user_id IS NOT NULL AND user_id != 'system' THEN 0 ELSE 1 END, name ASC"

		with self.get_connection() as conn:
			rows = conn.execute(query, params).fetchall()
			result = []
			for row in rows:
				d = dict(row)
				try:
					d["media_assets"] = json.loads(d.get("media_assets_json") or "[]")
				except Exception:
					d["media_assets"] = []
				try:
					d["primary_muscles"] = json.loads(d.get("primary_muscles_json") or "[]")
				except Exception:
					d["primary_muscles"] = []
				try:
					d["secondary_muscles"] = json.loads(d.get("secondary_muscles_json") or "[]")
				except Exception:
					d["secondary_muscles"] = []
				if not d["media_assets"] and d.get("media_url"):
					d["media_assets"] = [
						{
							"id": f"{d['id']}-default",
							"kind": "animation",
							"type": "image",
							"title": "Animation",
							"url": d["media_url"],
						}
					]
				result.append(d)
			return result

	def get_exercise(self, exercise_id: str) -> dict[str, Any] | None:
		with self.get_connection() as conn:
			row = conn.execute("SELECT * FROM exercises WHERE id = ?", (exercise_id,)).fetchone()
			if not row:
				return None
			d = dict(row)
			try:
				d["media_assets"] = json.loads(d.get("media_assets_json") or "[]")
			except Exception:
				d["media_assets"] = []
			try:
				d["primary_muscles"] = json.loads(d.get("primary_muscles_json") or "[]")
			except Exception:
				d["primary_muscles"] = []
			try:
				d["secondary_muscles"] = json.loads(d.get("secondary_muscles_json") or "[]")
			except Exception:
				d["secondary_muscles"] = []
			if not d["media_assets"] and d.get("media_url"):
				d["media_assets"] = [
					{
						"id": f"{d['id']}-default",
						"kind": "animation",
						"type": "image",
						"title": "Animation",
						"url": d["media_url"],
					}
				]
			return d

	def create_exercise(self, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
		clean_user = user_id.strip().lower() if user_id else "levon"
		self.get_or_create_user(clean_user)

		name = str(data.get("name", "")).strip()
		if not name:
			raise ValueError("Exercise name is required")

		ex_id = str(data.get("id") or f"custom-{secrets.token_hex(4)}")
		category = str(data.get("category", "strength")).strip().lower()
		discipline = str(data.get("discipline", "general")).strip().lower()
		default_mode = (
			str(data.get("default_mode", "reps" if category == "strength" else "time"))
			.strip()
			.lower()
		)
		default_quantity = int(data.get("default_quantity", 20 if default_mode == "reps" else 30))
		description = str(data.get("description", "")).strip()
		media_url = str(data.get("media_url", "")).strip()
		media_assets = data.get("media_assets", [])
		if not media_assets and media_url:
			media_assets = [
				{
					"id": f"{ex_id}-default",
					"kind": "animation",
					"type": "image",
					"title": "Animation",
					"url": media_url,
				}
			]
		media_assets_json = json.dumps(media_assets, ensure_ascii=False)
		primary_muscles = data.get("primary_muscles", [])
		if not isinstance(primary_muscles, list):
			primary_muscles = []
		primary_muscles_json = json.dumps(primary_muscles, ensure_ascii=False)

		secondary_muscles = data.get("secondary_muscles", [])
		if not isinstance(secondary_muscles, list):
			secondary_muscles = []
		secondary_muscles_json = json.dumps(secondary_muscles, ensure_ascii=False)
		now = datetime.now().isoformat()

		with self.get_connection() as conn:
			conn.execute(
				"""
				INSERT INTO exercises (
					id, user_id, name, category, discipline, default_mode, default_quantity, description, media_url, media_assets_json, primary_muscles_json, secondary_muscles_json, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					name = excluded.name,
					category = excluded.category,
					discipline = excluded.discipline,
					default_mode = excluded.default_mode,
					default_quantity = excluded.default_quantity,
					description = excluded.description,
					media_url = excluded.media_url,
					media_assets_json = excluded.media_assets_json,
					primary_muscles_json = excluded.primary_muscles_json,
					secondary_muscles_json = excluded.secondary_muscles_json
				""",
				(
					ex_id,
					clean_user,
					name,
					category,
					discipline,
					default_mode,
					default_quantity,
					description,
					media_url,
					media_assets_json,
					primary_muscles_json,
					secondary_muscles_json,
					now,
				),
			)
		return {
			"id": ex_id,
			"user_id": clean_user,
			"name": name,
			"category": category,
			"discipline": discipline,
			"default_mode": default_mode,
			"default_quantity": default_quantity,
			"description": description,
			"media_url": media_url,
			"media_assets": media_assets,
			"primary_muscles": primary_muscles,
			"secondary_muscles": secondary_muscles,
			"created_at": now,
		}

	def delete_exercise(self, user_id: str, exercise_id: str) -> bool:
		clean_user = user_id.strip().lower() if user_id else "levon"
		with self.get_connection() as conn:
			cursor = conn.execute(
				"DELETE FROM exercises WHERE id = ? AND user_id = ?",
				(exercise_id, clean_user),
			)
			return cursor.rowcount > 0

	# ── Sessions ─────────────────────────────────────────────────────────────

	def upsert_session(self, user_id: str, session: dict[str, Any]) -> dict[str, Any]:
		self.get_or_create_user(user_id)
		session_id = str(session.get("id", ""))
		if not session_id:
			raise ValueError("Session ID is required")

		routine_id = session.get("routine_id")
		routine_title = session.get("routine_title", "Workout")
		started_at = session.get("started_at") or datetime.now().isoformat()
		completed_at = session.get("completed_at")
		duration_seconds = int(session.get("duration_seconds", 0))
		completed_steps = int(session.get("completed_steps", 0))
		total_steps = int(session.get("total_steps", 0))
		status = session.get("status", "in_progress")
		is_preview = 1 if session.get("is_preview") else 0
		exercises_json = json.dumps(session.get("exercises", []), ensure_ascii=False)

		with self.get_connection() as conn:
			conn.execute(
				"""
				INSERT INTO sessions (
					id, user_id, routine_id, routine_title, started_at, completed_at,
					duration_seconds, completed_steps, total_steps, status, is_preview, exercises_json
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					routine_title = excluded.routine_title,
					completed_at = excluded.completed_at,
					duration_seconds = excluded.duration_seconds,
					completed_steps = excluded.completed_steps,
					total_steps = excluded.total_steps,
					status = excluded.status,
					is_preview = excluded.is_preview,
					exercises_json = excluded.exercises_json
				""",
				(
					session_id,
					user_id,
					routine_id,
					routine_title,
					started_at,
					completed_at,
					duration_seconds,
					completed_steps,
					total_steps,
					status,
					is_preview,
					exercises_json,
				),
			)
		return session

	def get_sessions(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
		with self.get_connection() as conn:
			rows = conn.execute(
				"""
				SELECT
					id, user_id, routine_id, routine_title, started_at, completed_at,
					duration_seconds, completed_steps, total_steps, status, is_preview, exercises_json
				FROM sessions
				WHERE user_id = ? AND is_preview = 0
				ORDER BY started_at DESC
				LIMIT ?
				""",
				(user_id, limit),
			).fetchall()
			res = []
			for row in rows:
				d = dict(row)
				try:
					d["exercises"] = json.loads(d.get("exercises_json") or "[]")
				except Exception:
					d["exercises"] = []
				res.append(d)
			return res

	def delete_session(self, user_id: str, session_id: str) -> bool:
		with self.get_connection() as conn:
			cursor = conn.execute(
				"DELETE FROM sessions WHERE id = ? AND user_id = ?",
				(session_id, user_id),
			)
			return cursor.rowcount > 0

	# ── Stats & Streaks Computation ──────────────────────────────────────────

	def get_stats(self, user_id: str, timezone_offset_minutes: int = 0) -> dict[str, Any]:
		with self.get_connection() as conn:
			# Fetch all routines for mapping steps & exercises
			routine_rows = conn.execute(
				"SELECT id, steps_json FROM routines WHERE user_id = ?", (user_id,)
			).fetchall()
			routine_map = {}
			for r in routine_rows:
				try:
					routine_map[r["id"]] = json.loads(r["steps_json"])
				except Exception:
					routine_map[r["id"]] = []

			# Fetch all non-preview sessions for user
			rows = conn.execute(
				"""
				SELECT
					id, routine_id, routine_title, started_at, completed_at,
					duration_seconds, completed_steps, total_steps, status, exercises_json
				FROM sessions
				WHERE user_id = ? AND is_preview = 0 AND (duration_seconds >= 15 OR status = 'completed')
				ORDER BY started_at ASC
				""",
				(user_id,),
			).fetchall()

		sessions = [dict(r) for r in rows]

		# Group duration and workouts by local date YYYY-MM-DD
		daily_stats: dict[str, dict[str, int]] = {}
		total_duration = 0
		completed_count = 0
		total_reps = 0

		# Exercise analytics maps
		category_stats: dict[str, dict[str, Any]] = {
			"strength": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"label": "Strength / Force",
				"icon": "💪",
				"color": "#6366f1",
			},
			"drill": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"label": "Drills",
				"icon": "⚡",
				"color": "#06b6d4",
			},
			"technique": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"label": "Technique",
				"icon": "🥋",
				"color": "#8b5cf6",
			},
			"stretch": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"label": "Stretch & Recovery",
				"icon": "🧘",
				"color": "#10b981",
			},
			"cardio": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"label": "Cardio & Conditioning",
				"icon": "🫀",
				"color": "#ef4444",
			},
			"mobility": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"label": "Mobility",
				"icon": "🔄",
				"color": "#f59e0b",
			},
		}

		discipline_stats: dict[str, dict[str, Any]] = {
			"muay_thai": {"minutes": 0, "reps": 0, "count": 0, "label": "Muay Thai", "icon": "🥊"},
			"boxing": {"minutes": 0, "reps": 0, "count": 0, "label": "Boxing", "icon": "🥊"},
			"calisthenics": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"label": "Calisthenics",
				"icon": "🤸",
			},
			"general": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"label": "General Fitness",
				"icon": "🏋️",
			},
			"yoga": {"minutes": 0, "reps": 0, "count": 0, "label": "Yoga & Mobility", "icon": "🧘"},
		}

		exercise_frequency: dict[str, dict[str, Any]] = {}

		for s in sessions:
			total_duration += s["duration_seconds"]
			if s["status"] == "completed":
				completed_count += 1

			# Parse started_at with client timezone offset
			try:
				raw_iso = s["started_at"].replace("Z", "+00:00")
				dt = datetime.fromisoformat(raw_iso)
				if timezone_offset_minutes:
					dt = dt - timedelta(minutes=timezone_offset_minutes)
				day_str = dt.strftime("%Y-%m-%d")
			except Exception:
				day_str = s["started_at"][:10]

			if day_str not in daily_stats:
				daily_stats[day_str] = {"minutes": 0, "sessions": 0, "completed": 0}
			daily_stats[day_str]["minutes"] += round(s["duration_seconds"] / 60)
			daily_stats[day_str]["sessions"] += 1
			if s["status"] == "completed":
				daily_stats[day_str]["completed"] += 1

			# Aggregate exercise stats from routine steps
			r_id = s.get("routine_id")
			steps = routine_map.get(r_id, [])
			completed_steps_cnt = s.get("completed_steps") or len(steps)
			steps_to_count = steps[:completed_steps_cnt] if steps else []

			session_step_duration = (
				(s["duration_seconds"] / len(steps_to_count)) if steps_to_count else 0
			)

			for step in steps_to_count:
				step_exercises = step.get("exercises") or []
				step_mode = step.get("stepMode") or ("reps" if step.get("targetReps") else "time")
				step_reps = int(step.get("targetReps", 0)) if step_mode == "reps" else 0
				total_reps += step_reps

				if not step_exercises:
					# Infer from label or subtype
					lbl = str(step.get("label", "")).lower()
					inf_cat = (
						"stretch"
						if ("stretch" in lbl or "pose" in lbl or step.get("subtype") == "break")
						else "strength"
					)
					inf_disc = (
						"muay_thai"
						if ("kick" in lbl or "teep" in lbl or "clinch" in lbl)
						else "general"
					)
					step_exercises = [
						{
							"id": f"inf-{lbl}",
							"name": step.get("label") or "Exercise",
							"category": inf_cat,
							"discipline": inf_disc,
						}
					]

				# Distribute step duration and reps across exercises attached to this step
				ex_share_sec = session_step_duration / max(1, len(step_exercises))
				ex_share_reps = round(step_reps / max(1, len(step_exercises)))

				for ex in step_exercises:
					cat = (ex.get("category") or "strength").lower()
					disc = (ex.get("discipline") or "general").lower()
					ex_name = ex.get("name") or "Exercise"

					if cat not in category_stats:
						category_stats[cat] = {
							"minutes": 0,
							"reps": 0,
							"count": 0,
							"label": cat.title(),
							"icon": "💪",
							"color": "#6366f1",
						}
					category_stats[cat]["minutes"] += round(ex_share_sec / 60, 1)
					category_stats[cat]["reps"] += ex_share_reps
					category_stats[cat]["count"] += 1

					if disc not in discipline_stats:
						discipline_stats[disc] = {
							"minutes": 0,
							"reps": 0,
							"count": 0,
							"label": disc.replace("_", " ").title(),
							"icon": "🏋️",
						}
					discipline_stats[disc]["minutes"] += round(ex_share_sec / 60, 1)
					discipline_stats[disc]["reps"] += ex_share_reps
					discipline_stats[disc]["count"] += 1

					if ex_name not in exercise_frequency:
						exercise_frequency[ex_name] = {
							"name": ex_name,
							"category": cat,
							"discipline": disc,
							"count": 0,
							"total_reps": 0,
							"total_minutes": 0,
						}
					exercise_frequency[ex_name]["count"] += 1
					exercise_frequency[ex_name]["total_reps"] += ex_share_reps
					exercise_frequency[ex_name]["total_minutes"] += round(ex_share_sec / 60, 1)

		# Compute streaks
		active_dates = sorted(daily_stats.keys())
		current_streak, longest_streak = self._calculate_streaks(
			active_dates, timezone_offset_minutes
		)

		# Weekly breakdown (current ISO week Mon-Sun)
		client_now = datetime.now()
		if timezone_offset_minutes:
			client_now = client_now - timedelta(minutes=timezone_offset_minutes)
		today_date = client_now.date()

		# Compute current week (Mon-Sun)
		start_of_week = today_date - timedelta(days=today_date.weekday())
		weekly_data = []
		day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
		for i in range(7):
			d = start_of_week + timedelta(days=i)
			d_str = d.strftime("%Y-%m-%d")
			st = daily_stats.get(d_str, {"minutes": 0, "sessions": 0, "completed": 0})
			weekly_data.append(
				{
					"date": d_str,
					"day": day_names[i],
					"isToday": d == today_date,
					"minutes": st["minutes"],
					"sessions": st["sessions"],
					"completed": st["completed"],
				}
			)

		# Monthly breakdown (current calendar month)
		monthly_active_days = []
		month_prefix = today_date.strftime("%Y-%m")
		month_total_minutes = 0
		for day_str, st in daily_stats.items():
			if day_str.startswith(month_prefix):
				monthly_active_days.append(
					{
						"date": day_str,
						"minutes": st["minutes"],
						"sessions": st["sessions"],
					}
				)
				month_total_minutes += st["minutes"]

		# Recent 20 sessions (latest first)
		recent = sorted(sessions, key=lambda x: x["started_at"], reverse=True)[:20]

		top_exercises = sorted(
			exercise_frequency.values(),
			key=lambda x: (x["count"], x["total_reps"], x["total_minutes"]),
			reverse=True,
		)[:10]

		return {
			"current_streak": current_streak,
			"longest_streak": longest_streak,
			"total_sessions": len(sessions),
			"total_minutes": round(total_duration / 60),
			"total_reps": total_reps,
			"completed_count": completed_count,
			"categories": category_stats,
			"disciplines": discipline_stats,
			"top_exercises": top_exercises,
			"weekly": weekly_data,
			"monthly": {
				"year": today_date.year,
				"month": today_date.month,
				"month_name": today_date.strftime("%B"),
				"active_days": monthly_active_days,
				"total_minutes": month_total_minutes,
			},
			"recent_sessions": recent,
		}

	def _calculate_streaks(
		self, active_date_strs: list[str], timezone_offset_minutes: int
	) -> tuple[int, int]:
		if not active_date_strs:
			return 0, 0

		active_dates = set()
		for ds in active_date_strs:
			try:
				active_dates.add(datetime.strptime(ds, "%Y-%m-%d").date())
			except Exception:
				continue

		if not active_dates:
			return 0, 0

		sorted_dates = sorted(active_dates)

		# Longest streak calculation
		longest = 1
		current_run = 1
		for i in range(1, len(sorted_dates)):
			if sorted_dates[i] == sorted_dates[i - 1] + timedelta(days=1):
				current_run += 1
				if current_run > longest:
					longest = current_run
			elif sorted_dates[i] > sorted_dates[i - 1] + timedelta(days=1):
				current_run = 1

		# Current streak calculation
		client_now = datetime.now()
		if timezone_offset_minutes:
			client_now = client_now - timedelta(minutes=timezone_offset_minutes)
		today = client_now.date()
		yesterday = today - timedelta(days=1)

		if today in active_dates:
			check_date = today
		elif yesterday in active_dates:
			check_date = yesterday
		else:
			return 0, longest

		current_streak = 0
		while check_date in active_dates:
			current_streak += 1
			check_date -= timedelta(days=1)

		return current_streak, longest

	# ── Shared Routines ───────────────────────────────────────────────────────

	def create_shared_routine(self, routine_data: dict[str, Any]) -> str:
		chars = string.ascii_lowercase + string.digits
		now = datetime.now().isoformat()
		title = routine_data.get("title", "Shared Workout")
		routine_json = json.dumps(routine_data, ensure_ascii=False)

		with self.get_connection() as conn:
			for _ in range(10):
				code = "".join(secrets.choice(chars) for _ in range(6))
				cursor = conn.execute("SELECT id FROM shared_routines WHERE id = ?", (code,))
				if not cursor.fetchone():
					conn.execute(
						"INSERT INTO shared_routines (id, title, routine_json, created_at) VALUES (?, ?, ?, ?)",
						(code, title, routine_json, now),
					)
					return code
			raise RuntimeError("Could not generate unique share code")

	def get_shared_routine(self, share_id: str) -> dict[str, Any] | None:
		clean_id = share_id.strip().lower()
		with self.get_connection() as conn:
			row = conn.execute(
				"SELECT routine_json FROM shared_routines WHERE id = ?", (clean_id,)
			).fetchone()
			if not row:
				return None
			try:
				return json.loads(row["routine_json"])
			except Exception:
				return None
