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

				CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);
				CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions(user_id, started_at);
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


			# Ensure default user 'levon' exists
			cursor = conn.execute("SELECT id FROM users WHERE id = ?", ("levon",))
			if not cursor.fetchone():
				conn.execute(
					"INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)",
					("levon", "Levon", datetime.now().isoformat()),
				)

	def migrate_legacy_routines(self, legacy_file: Path) -> None:
		if not legacy_file.exists():
			return
		try:
			content = legacy_file.read_text(encoding="utf-8")
			routines = json.loads(content)
			if not isinstance(routines, list) or not routines:
				return

			with self.get_connection() as conn:
				count = conn.execute("SELECT COUNT(*) FROM routines WHERE user_id = 'levon'").fetchone()[0]
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
			rows = conn.execute("SELECT id, display_name, created_at FROM users ORDER BY created_at ASC").fetchall()
			return [dict(row) for row in rows]

	def get_or_create_user(self, user_id: str, display_name: str | None = None) -> dict[str, Any]:
		clean_id = user_id.strip().lower()
		name = (display_name or user_id).strip()
		with self.get_connection() as conn:
			row = conn.execute("SELECT id, display_name, created_at FROM users WHERE id = ?", (clean_id,)).fetchone()
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
				result.append({
					"id": row["id"],
					"title": row["title"],
					"steps": steps,
					"musicTracks": music,
				})
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

		with self.get_connection() as conn:
			conn.execute(
				"""
				INSERT INTO sessions (id, user_id, routine_id, routine_title, started_at, completed_at,
				                      duration_seconds, completed_steps, total_steps, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					routine_title = excluded.routine_title,
					completed_at = excluded.completed_at,
					duration_seconds = excluded.duration_seconds,
					completed_steps = excluded.completed_steps,
					total_steps = excluded.total_steps,
					status = excluded.status
				""",
				(session_id, user_id, routine_id, routine_title, started_at, completed_at,
				 duration_seconds, completed_steps, total_steps, status),
			)
		return session

	def get_sessions(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
		with self.get_connection() as conn:
			rows = conn.execute(
				"""
				SELECT id, user_id, routine_id, routine_title, started_at, completed_at,
				       duration_seconds, completed_steps, total_steps, status
				FROM sessions
				WHERE user_id = ?
				ORDER BY started_at DESC
				LIMIT ?
				""",
				(user_id, limit),
			).fetchall()
			return [dict(row) for row in rows]

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
			# Fetch all valid sessions for user (meaningful progress > 15s or completed)
			rows = conn.execute(
				"""
				SELECT id, routine_id, routine_title, started_at, completed_at,
				       duration_seconds, completed_steps, total_steps, status
				FROM sessions
				WHERE user_id = ? AND (duration_seconds >= 15 OR status = 'completed')
				ORDER BY started_at ASC
				""",
				(user_id,),
			).fetchall()

		sessions = [dict(r) for r in rows]

		# Group duration and workouts by local date YYYY-MM-DD
		daily_stats: dict[str, dict[str, int]] = {}
		total_duration = 0
		completed_count = 0

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

		# Compute streaks
		active_dates = sorted(daily_stats.keys())
		current_streak, longest_streak = self._calculate_streaks(active_dates, timezone_offset_minutes)

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
			weekly_data.append({
				"date": d_str,
				"day": day_names[i],
				"isToday": d == today_date,
				"minutes": st["minutes"],
				"sessions": st["sessions"],
				"completed": st["completed"],
			})

		# Monthly breakdown (current calendar month)
		monthly_active_days = []
		month_prefix = today_date.strftime("%Y-%m")
		month_total_minutes = 0
		for day_str, st in daily_stats.items():
			if day_str.startswith(month_prefix):
				monthly_active_days.append({
					"date": day_str,
					"minutes": st["minutes"],
					"sessions": st["sessions"],
				})
				month_total_minutes += st["minutes"]

		# Recent 20 sessions (latest first)
		recent = sorted(sessions, key=lambda x: x["started_at"], reverse=True)[:20]

		return {
			"current_streak": current_streak,
			"longest_streak": longest_streak,
			"total_sessions": len(sessions),
			"total_minutes": round(total_duration / 60),
			"completed_count": completed_count,
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

	def _calculate_streaks(self, active_date_strs: list[str], timezone_offset_minutes: int) -> tuple[int, int]:
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
			row = conn.execute("SELECT routine_json FROM shared_routines WHERE id = ?", (clean_id,)).fetchone()
			if not row:
				return None
			try:
				return json.loads(row["routine_json"])
			except Exception:
				return None

