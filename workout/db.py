import json
import secrets
import sqlite3
import string
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


class Database:
	def __init__(self, db_path: Path):
		self.db_path = db_path
		self._stats_cache: dict[tuple[str, int], dict[str, Any]] = {}
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

			# Migrate legacy 'groin' to 'adductors' in exercises table
			try:
				conn.execute(
					"UPDATE exercises SET primary_muscles_json = replace(primary_muscles_json, '\"groin\"', '\"adductors\"') WHERE primary_muscles_json LIKE '%\"groin\"%'"
				)
				conn.execute(
					"UPDATE exercises SET secondary_muscles_json = replace(secondary_muscles_json, '\"groin\"', '\"adductors\"') WHERE secondary_muscles_json LIKE '%\"groin\"%'"
				)
			except Exception:
				pass

			# Migrate legacy 'animation' and 'photo' media asset kinds to 'demonstration'
			try:
				for table in ("exercises", "combos"):
					for leg in ("animation", "photo"):
						conn.execute(
							f'UPDATE {table} SET media_assets_json = replace(media_assets_json, \'"kind": "{leg}"\', \'"kind": "demonstration"\') '
							f'WHERE media_assets_json LIKE \'%"kind": "{leg}"%\''
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

			# Reconcile routine steps with canonical exercise names
			try:
				ex_rows = conn.execute("SELECT id, name FROM exercises").fetchall()
				ex_map = {row["id"]: row["name"] for row in ex_rows}
				routine_rows = conn.execute(
					"SELECT id, user_id, steps_json FROM routines"
				).fetchall()
				for r_row in routine_rows:
					try:
						r_steps = json.loads(r_row["steps_json"])
					except Exception:
						continue
					needs_update = False
					for st in r_steps:
						if st.get("customLabel"):
							continue
						st_exs = st.get("exercises", [])
						for ex_item in st_exs:
							if isinstance(ex_item, dict):
								eid = ex_item.get("id")
								ename = ex_item.get("name")
								canonical_name = ex_map.get(eid)
								if canonical_name and ename != canonical_name:
									cur_lbl = (st.get("label") or "").strip()
									if ename and cur_lbl.lower() == ename.lower():
										st["label"] = canonical_name
									ex_item["name"] = canonical_name
									needs_update = True
					if needs_update:
						conn.execute(
							"UPDATE routines SET steps_json = ? WHERE id = ? AND user_id = ?",
							(
								json.dumps(r_steps, ensure_ascii=False),
								r_row["id"],
								r_row["user_id"],
							),
						)
			except Exception:
				pass

			# Reconcile exercises with video asset snippet durations
			try:
				ex_rows = conn.execute(
					"SELECT id, default_mode, default_quantity, media_assets_json FROM exercises WHERE default_mode = 'time'"
				).fetchall()
				for row in ex_rows:
					try:
						assets = json.loads(row["media_assets_json"] or "[]")
					except Exception:
						continue
					for a in assets:
						if not isinstance(a, dict):
							continue
						start = a.get("startSeconds")
						end = a.get("endSeconds")
						if (
							isinstance(start, (int, float))
							and isinstance(end, (int, float))
							and end > start
						):
							snippet_dur = int(end - start)
							cur_qty = row["default_quantity"]
							if cur_qty in (20, 30, 45, 60) and snippet_dur != cur_qty:
								conn.execute(
									"UPDATE exercises SET default_quantity = ? WHERE id = ?",
									(snippet_dur, row["id"]),
								)
								break
			except Exception:
				pass

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

	def _hydrate_routine_steps(
		self, conn: sqlite3.Connection, steps: list[dict[str, Any]], user_id: str | None = None
	) -> list[dict[str, Any]]:
		if not steps:
			return []
		clean_user = user_id.strip().lower() if user_id else "levon"
		rows = conn.execute(
			"SELECT id, name, flow_type, exercise_ids_json FROM combos WHERE user_id = ? OR user_id IS NULL",
			(clean_user,),
		).fetchall()
		combos_by_id = {}
		combos_by_name = {}
		for r in rows:
			c_id = r["id"]
			c_name = r["name"].strip().lower()
			try:
				ex_ids = json.loads(r["exercise_ids_json"] or "[]")
			except Exception:
				ex_ids = []
			info = {
				"id": c_id,
				"name": r["name"],
				"flow_type": r["flow_type"],
				"exercise_ids": ex_ids,
			}
			combos_by_id[c_id] = info
			combos_by_name[c_name] = info

		ex_rows = conn.execute(
			"SELECT id, name, category, discipline, default_mode, default_quantity FROM exercises"
		).fetchall()
		ex_map = {row["id"]: dict(row) for row in ex_rows}

		hydrated = []
		for step in steps:
			s = dict(step)
			combo = None
			if s.get("combo_id") and s["combo_id"] in combos_by_id:
				combo = combos_by_id[s["combo_id"]]
			elif s.get("label") and s["label"].strip().lower() in combos_by_name:
				combo = combos_by_name[s["label"].strip().lower()]

			if combo:
				s["combo_id"] = combo["id"]
				s["flow_type"] = combo["flow_type"]
				hydrated_exs = []
				for ex_id in combo["exercise_ids"]:
					eid = ex_id if isinstance(ex_id, str) else ex_id.get("id")
					if eid in ex_map:
						ex_item = {
							"id": eid,
							"name": ex_map[eid]["name"],
							"category": ex_map[eid]["category"],
							"discipline": ex_map[eid]["discipline"],
						}
						if ex_map[eid].get("default_mode"):
							ex_item["default_mode"] = ex_map[eid]["default_mode"]
						if ex_map[eid].get("default_quantity"):
							ex_item["default_quantity"] = ex_map[eid]["default_quantity"]
						hydrated_exs.append(ex_item)
					else:
						hydrated_exs.append({"id": eid})
				s["exercises"] = hydrated_exs
			elif s.get("exercises"):
				hydrated_exs = []
				for ex_ref in s["exercises"]:
					eid = ex_ref if isinstance(ex_ref, str) else ex_ref.get("id")
					stored_name = ex_ref.get("name") if isinstance(ex_ref, dict) else None
					if eid in ex_map:
						ex_item = {
							"id": eid,
							"name": ex_map[eid]["name"],
							"category": ex_map[eid]["category"],
							"discipline": ex_map[eid]["discipline"],
						}
						if ex_map[eid].get("default_mode"):
							ex_item["default_mode"] = ex_map[eid]["default_mode"]
						if ex_map[eid].get("default_quantity"):
							ex_item["default_quantity"] = ex_map[eid]["default_quantity"]
						hydrated_exs.append(ex_item)
						if not s.get("customLabel"):
							cur_lbl = (s.get("label") or "").strip()
							if stored_name and cur_lbl.lower() == stored_name.lower():
								s["label"] = ex_map[eid]["name"]
							elif cur_lbl in ("", "Exercise", "Video Clip", "Timer"):
								s["label"] = ex_map[eid]["name"]
					elif isinstance(ex_ref, dict):
						hydrated_exs.append(ex_ref)
					else:
						hydrated_exs.append({"id": eid})
				s["exercises"] = hydrated_exs
			elif s.get("exercise_id"):
				eid = s["exercise_id"]
				if eid in ex_map:
					ex_item = {
						"id": eid,
						"name": ex_map[eid]["name"],
						"category": ex_map[eid]["category"],
						"discipline": ex_map[eid]["discipline"],
					}
					if ex_map[eid].get("default_mode"):
						ex_item["default_mode"] = ex_map[eid]["default_mode"]
					if ex_map[eid].get("default_quantity"):
						ex_item["default_quantity"] = ex_map[eid]["default_quantity"]
					s["exercises"] = [ex_item]
					if not s.get("customLabel"):
						cur_lbl = (s.get("label") or "").strip()
						if cur_lbl in ("", "Exercise", "Video Clip", "Timer"):
							s["label"] = ex_map[eid]["name"]
				else:
					s["exercises"] = [{"id": eid}]
			hydrated.append(s)
		return hydrated

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
				steps = self._hydrate_routine_steps(conn, steps, user_id)
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
			steps = self._hydrate_routine_steps(conn, steps, clean_user)
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
			WHERE (user_id IS NULL OR user_id = ?)
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

		query += " ORDER BY name ASC"

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

			# Cascade combo update to any routines that reference this combo
			routine_rows = conn.execute(
				"SELECT id, steps_json FROM routines WHERE user_id = ?",
				(clean_user,),
			).fetchall()
			for r_row in routine_rows:
				try:
					r_steps = json.loads(r_row["steps_json"])
				except Exception:
					continue
				needs_update = False
				for st in r_steps:
					is_match = (st.get("combo_id") == c_id) or (
						not st.get("combo_id")
						and st.get("label")
						and st["label"].strip().lower() == name.lower()
					)
					if is_match:
						st["combo_id"] = c_id
						st["flow_type"] = flow_type
						st["exercises"] = [
							{"id": eid if isinstance(eid, str) else eid.get("id")}
							for eid in exercise_ids
						]
						needs_update = True
				if needs_update:
					conn.execute(
						"UPDATE routines SET steps_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
						(json.dumps(r_steps, ensure_ascii=False), now, r_row["id"], clean_user),
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
				"DELETE FROM combos WHERE id = ? AND (user_id = ? OR user_id IS NULL)",
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
			WHERE (user_id IS NULL OR user_id = ?)
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
			clean_m = muscle.strip().lower()
			if clean_m in ("adductors", "adductor", "groin"):
				query += (
					" AND (LOWER(primary_muscles_json) LIKE ? OR LOWER(secondary_muscles_json) LIKE ?"
					" OR LOWER(primary_muscles_json) LIKE ? OR LOWER(secondary_muscles_json) LIKE ?)"
				)
				params.extend(["%adductor%", "%adductor%", "%groin%", "%groin%"])
			else:
				m = f"%{clean_m}%"
				query += " AND (LOWER(primary_muscles_json) LIKE ? OR LOWER(secondary_muscles_json) LIKE ?)"
				params.extend([m, m])

		query += " ORDER BY name ASC"

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
					is_video = "youtube.com" in d["media_url"] or "youtu.be" in d["media_url"]
					d["media_assets"] = [
						{
							"id": f"{d['id']}-default",
							"kind": "demonstration",
							"type": "video" if is_video else "image",
							"title": "Demonstration" if is_video else "Visual Form",
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
				is_video = "youtube.com" in d["media_url"] or "youtu.be" in d["media_url"]
				d["media_assets"] = [
					{
						"id": f"{d['id']}-default",
						"kind": "demonstration",
						"type": "video" if is_video else "image",
						"title": "Demonstration" if is_video else "Visual Form",
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
		if not isinstance(media_assets, list):
			media_assets = []
		if not media_assets and media_url:
			is_video = "youtube.com" in media_url or "youtu.be" in media_url
			media_assets = [
				{
					"id": f"{ex_id}-default",
					"kind": "demonstration",
					"type": "video" if is_video else "image",
					"title": "Demonstration" if is_video else "Visual Form",
					"url": media_url,
				}
			]

		if default_mode == "time" and (
			"default_quantity" not in data or default_quantity in (20, 30, 60)
		):
			for a in media_assets:
				if isinstance(a, dict):
					start = a.get("startSeconds")
					end = a.get("endSeconds")
					if (
						isinstance(start, (int, float))
						and isinstance(end, (int, float))
						and end > start
					):
						default_quantity = int(end - start)
						break

		media_assets_json = json.dumps(media_assets, ensure_ascii=False)
		from taxonomy import normalize_muscles_list

		primary_muscles = normalize_muscles_list(data.get("primary_muscles", []))
		primary_muscles_json = json.dumps(primary_muscles, ensure_ascii=False)

		secondary_muscles = normalize_muscles_list(data.get("secondary_muscles", []))
		secondary_muscles_json = json.dumps(secondary_muscles, ensure_ascii=False)
		now = datetime.now().isoformat()

		with self.get_connection() as conn:
			old_row = conn.execute("SELECT name FROM exercises WHERE id = ?", (ex_id,)).fetchone()
			old_name = old_row["name"] if old_row else None

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

			# Cascade exercise update to any routines that reference this exercise
			routine_rows = conn.execute("SELECT id, user_id, steps_json FROM routines").fetchall()
			for r_row in routine_rows:
				try:
					r_steps = json.loads(r_row["steps_json"])
				except Exception:
					continue
				needs_update = False
				for st in r_steps:
					st_exs = st.get("exercises", [])
					matched = False
					for ex_item in st_exs:
						eid = ex_item if isinstance(ex_item, str) else ex_item.get("id")
						if eid == ex_id:
							matched = True
							if isinstance(ex_item, dict):
								ex_item["name"] = name
								ex_item["category"] = category
								ex_item["discipline"] = discipline
								ex_item["default_mode"] = default_mode
								ex_item["default_quantity"] = default_quantity
					if st.get("exercise_id") == ex_id:
						matched = True

					if matched:
						needs_update = True
						if not st.get("customLabel"):
							cur_lbl = (st.get("label") or "").strip()
							if old_name and cur_lbl.lower() == old_name.lower():
								st["label"] = name
							elif cur_lbl in ("", "Exercise", "Video Clip", "Timer"):
								st["label"] = name
							elif old_name and old_name.lower() in cur_lbl.lower():
								import re

								pattern = re.compile(re.escape(old_name), re.IGNORECASE)
								st["label"] = pattern.sub(name, cur_lbl)
				if needs_update:
					conn.execute(
						"UPDATE routines SET steps_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
						(
							json.dumps(r_steps, ensure_ascii=False),
							now,
							r_row["id"],
							r_row["user_id"],
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
				"DELETE FROM exercises WHERE id = ? AND (user_id = ? OR user_id IS NULL)",
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
		self.invalidate_stats_cache(user_id)
		return session

	def invalidate_stats_cache(self, user_id: str) -> None:
		keys_to_del = [k for k in self._stats_cache if k[0] == user_id]
		for k in keys_to_del:
			self._stats_cache.pop(k, None)

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
			if cursor.rowcount > 0:
				self.invalidate_stats_cache(user_id)
				return True
			return False

	# ── Stats & Streaks Computation ──────────────────────────────────────────

	def get_stats(self, user_id: str, timezone_offset_minutes: int = 0) -> dict[str, Any]:
		cache_key = (user_id, timezone_offset_minutes)
		if cache_key in self._stats_cache:
			return self._stats_cache[cache_key]

		with self.get_connection() as conn:
			# 1. High-level aggregates via fast SQL
			totals_row = conn.execute(
				"""
				SELECT
					COUNT(*) AS total_sessions,
					COALESCE(SUM(duration_seconds), 0) AS total_duration,
					COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count
				FROM sessions
				WHERE user_id = ? AND is_preview = 0 AND (duration_seconds >= 15 OR status = 'completed')
				""",
				(user_id,),
			).fetchone()
			total_sessions = totals_row["total_sessions"] if totals_row else 0
			total_duration = totals_row["total_duration"] if totals_row else 0
			completed_count = totals_row["completed_count"] if totals_row else 0

			# 2. Recent 20 sessions for history view
			recent_rows = conn.execute(
				"""
				SELECT
					id, routine_id, routine_title, started_at, completed_at,
					duration_seconds, completed_steps, total_steps, status
				FROM sessions
				WHERE user_id = ? AND is_preview = 0 AND (duration_seconds >= 15 OR status = 'completed')
				ORDER BY started_at DESC
				LIMIT 20
				""",
				(user_id,),
			).fetchall()
			recent = [dict(r) for r in recent_rows]

			# 3. Fetch qualified sessions for streaks, weekly, monthly, and movement taxonomy
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

			routine_map: dict[str, list[dict[str, Any]]] = {}
			needs_routine_map = False
			sessions = []
			for r in rows:
				d = dict(r)
				try:
					d["exercises"] = json.loads(d.get("exercises_json") or "[]")
				except Exception:
					d["exercises"] = []

				has_step_snapshot = any(
					isinstance(item, dict)
					and ("exercises" in item or "planned_duration" in item or "is_break" in item)
					for item in d["exercises"]
				)
				d["_has_snapshot"] = has_step_snapshot
				if not has_step_snapshot and d.get("routine_id"):
					needs_routine_map = True
				sessions.append(d)

			if needs_routine_map:
				routine_rows = conn.execute(
					"SELECT id, steps_json FROM routines WHERE user_id = ?", (user_id,)
				).fetchall()
				for r in routine_rows:
					try:
						routine_map[r["id"]] = json.loads(r["steps_json"])
					except Exception:
						routine_map[r["id"]] = []

		daily_stats: dict[str, dict[str, int]] = {}
		total_reps = 0

		# Exercise analytics maps
		category_stats: dict[str, dict[str, Any]] = {
			"strength": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"sets": 0,
				"label": "Strength / Force",
				"icon": "💪",
				"color": "#6366f1",
			},
			"drill": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"sets": 0,
				"label": "Drills",
				"icon": "⚡",
				"color": "#06b6d4",
			},
			"technique": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"sets": 0,
				"label": "Technique",
				"icon": "🥋",
				"color": "#8b5cf6",
			},
			"stretch": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"sets": 0,
				"label": "Stretch & Recovery",
				"icon": "🧘",
				"color": "#10b981",
			},
			"cardio": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"sets": 0,
				"label": "Cardio & Conditioning",
				"icon": "🫀",
				"color": "#ef4444",
			},
			"mobility": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"sets": 0,
				"label": "Mobility",
				"icon": "🔄",
				"color": "#f59e0b",
			},
		}

		discipline_stats: dict[str, dict[str, Any]] = {
			"muay_thai": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"sets": 0,
				"label": "Muay Thai",
				"icon": "🥊",
			},
			"boxing": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"sets": 0,
				"label": "Boxing",
				"icon": "🥊",
			},
			"calisthenics": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"sets": 0,
				"label": "Calisthenics",
				"icon": "🤸",
			},
			"general": {
				"minutes": 0,
				"reps": 0,
				"count": 0,
				"sets": 0,
				"label": "General Fitness",
				"icon": "🏋️",
			},
			"yoga": {"minutes": 0, "reps": 0, "count": 0, "sets": 0, "label": "Yoga", "icon": "🧘"},
		}

		exercise_frequency: dict[str, dict[str, Any]] = {}
		movement_records: dict[str, dict[str, Any]] = {}

		for s in sessions:
			session_ex_reps: dict[str, int] = {}
			session_ex_meta: dict[str, tuple[str, str]] = {}

			# Parse started_at with client timezone offset relative to UTC
			try:
				raw_iso = s["started_at"].replace("Z", "+00:00")
				dt = datetime.fromisoformat(raw_iso)
				if dt.tzinfo is None:
					dt = dt.replace(tzinfo=timezone.utc)
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

			# Determine steps to process
			has_snapshot = s.get("_has_snapshot")
			session_exercises = s.get("exercises") or []
			completed_steps_cnt = s.get("completed_steps")

			if has_snapshot:
				cnt = (
					completed_steps_cnt
					if (completed_steps_cnt is not None and completed_steps_cnt > 0)
					else len(session_exercises)
				)
				steps_to_count = session_exercises[:cnt] if cnt > 0 else session_exercises
			else:
				r_id = s.get("routine_id")
				steps = routine_map.get(r_id, [])
				cnt = (
					completed_steps_cnt
					if (completed_steps_cnt is not None and completed_steps_cnt > 0)
					else len(steps)
				)
				steps_to_count = steps[:cnt] if steps else []

			if not steps_to_count:
				continue

			# Calculate planned durations for proportional distribution
			planned_durations = []
			for st in steps_to_count:
				dur = (
					st.get("planned_duration")
					or st.get("targetDuration")
					or st.get("durationSeconds")
					or 0
				)
				try:
					planned_durations.append(max(0.0, float(dur)))
				except Exception:
					planned_durations.append(0.0)

			total_planned_sec = sum(planned_durations)
			use_proportional = total_planned_sec > 0

			# Reps map for legacy format
			recorded_reps_by_step: dict[int, int] = {}
			recorded_reps_by_ex: dict[tuple[int, str], int] = {}
			if not has_snapshot:
				for rec in session_exercises:
					if isinstance(rec, dict):
						s_idx = rec.get("step_index")
						reps_val = rec.get("reps")
						ex_id = rec.get("id")
						if s_idx is not None and reps_val is not None:
							recorded_reps_by_step[s_idx] = recorded_reps_by_step.get(
								s_idx, 0
							) + int(reps_val)
							if ex_id:
								recorded_reps_by_ex[(s_idx, str(ex_id))] = int(reps_val)

			for step_idx, step in enumerate(steps_to_count):
				if use_proportional:
					step_duration = s["duration_seconds"] * (
						planned_durations[step_idx] / total_planned_sec
					)
				else:
					step_duration = s["duration_seconds"] / max(1, len(steps_to_count))

				is_break = (
					step.get("is_break")
					or step.get("subtype") == "break"
					or step.get("mode") == "break"
					or str(step.get("label", "")).strip().lower() in ("rest", "break")
				)

				step_exercises = step.get("exercises") or []
				step_mode = (
					step.get("mode")
					or step.get("stepMode")
					or ("reps" if step.get("targetReps") else "time")
				)

				if has_snapshot:
					step_reps = int(step.get("reps") or 0)
					if step_reps == 0 and step_mode == "reps":
						step_reps = int(step.get("target_reps") or step.get("targetReps") or 0)
				else:
					if step_idx in recorded_reps_by_step:
						step_reps = recorded_reps_by_step[step_idx]
					else:
						step_reps = int(step.get("targetReps", 0)) if step_mode == "reps" else 0

				total_reps += step_reps

				# If this is a rest/break step without specific exercises, do NOT count towards movement taxonomy
				if is_break and not step_exercises:
					continue

				if not step_exercises:
					lbl = str(step.get("label", "")).lower()
					inf_cat = "stretch" if ("stretch" in lbl or "pose" in lbl) else "strength"
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

				ex_share_sec = step_duration / max(1, len(step_exercises))

				for ex in step_exercises:
					cat = (ex.get("category") or "strength").lower()
					disc = (ex.get("discipline") or "general").lower()
					ex_name = ex.get("name") or "Exercise"
					ex_id = str(ex.get("id") or "")

					if has_snapshot and ex.get("reps") is not None and ex.get("reps") > 0:
						ex_share_reps = int(ex["reps"])
					elif not has_snapshot and (step_idx, ex_id) in recorded_reps_by_ex:
						ex_share_reps = recorded_reps_by_ex[(step_idx, ex_id)]
					else:
						ex_share_reps = round(step_reps / max(1, len(step_exercises)))

					if ex_share_reps > 0:
						session_ex_reps[ex_name] = session_ex_reps.get(ex_name, 0) + ex_share_reps
						session_ex_meta[ex_name] = (cat, disc)

					if cat not in category_stats:
						category_stats[cat] = {
							"minutes": 0,
							"reps": 0,
							"count": 0,
							"sets": 0,
							"label": cat.title(),
							"icon": "💪",
							"color": "#6366f1",
						}
					category_stats[cat]["minutes"] += round(ex_share_sec / 60, 1)
					category_stats[cat]["reps"] += ex_share_reps
					category_stats[cat]["count"] += 1
					category_stats[cat]["sets"] += 1

					if disc not in discipline_stats:
						discipline_stats[disc] = {
							"minutes": 0,
							"reps": 0,
							"count": 0,
							"sets": 0,
							"label": disc.replace("_", " ").title(),
							"icon": "🏋️",
						}
					discipline_stats[disc]["minutes"] += round(ex_share_sec / 60, 1)
					discipline_stats[disc]["reps"] += ex_share_reps
					discipline_stats[disc]["count"] += 1
					discipline_stats[disc]["sets"] += 1

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

			# Aggregate session-level movement PRs
			for ex_name, s_reps in session_ex_reps.items():
				cat, disc = session_ex_meta.get(ex_name, ("strength", "general"))
				if ex_name not in movement_records:
					movement_records[ex_name] = {
						"name": ex_name,
						"category": cat,
						"discipline": disc,
						"total_reps": 0,
						"max_session_reps": 0,
						"max_session_date": "",
						"sessions_count": 0,
					}
				mrec = movement_records[ex_name]
				mrec["total_reps"] += s_reps
				mrec["sessions_count"] += 1
				if s_reps > mrec["max_session_reps"]:
					mrec["max_session_reps"] = s_reps
					mrec["max_session_date"] = day_str

		# Compute streaks using UTC-anchored client date
		active_dates = sorted(daily_stats.keys())
		current_streak, longest_streak = self._calculate_streaks(
			active_dates, timezone_offset_minutes
		)

		# Build auto-detected rep leaderboard
		rep_leaderboard = []
		for mrec in movement_records.values():
			if mrec["total_reps"] > 0:
				mrec["avg_reps"] = round(mrec["total_reps"] / max(1, mrec["sessions_count"]))
				rep_leaderboard.append(mrec)

		# Sort by highest PR first, then lifetime volume
		rep_leaderboard.sort(key=lambda x: (x["max_session_reps"], x["total_reps"]), reverse=True)

		# Build milestone badges
		pushup_total = sum(
			m["total_reps"]
			for m in rep_leaderboard
			if "pushup" in m["name"].lower() or "push-up" in m["name"].lower()
		)
		pushup_pr = max(
			[
				m["max_session_reps"]
				for m in rep_leaderboard
				if "pushup" in m["name"].lower() or "push-up" in m["name"].lower()
			]
			or [0]
		)
		max_any_pr = max([m["max_session_reps"] for m in rep_leaderboard] or [0])

		milestones = [
			{
				"id": "pushup_century",
				"title": "Pushup Century",
				"desc": "100 lifetime pushups",
				"icon": "💪",
				"tier": "bronze",
				"category": "pushup",
				"unlocked": pushup_total >= 100,
				"progress": min(pushup_total, 100),
				"target": 100,
				"progress_pct": min(100, round((pushup_total / 100) * 100)),
			},
			{
				"id": "pushup_500",
				"title": "500 Pushup Club",
				"desc": "500 lifetime pushups",
				"icon": "⚡",
				"tier": "silver",
				"category": "pushup",
				"unlocked": pushup_total >= 500,
				"progress": min(pushup_total, 500),
				"target": 500,
				"progress_pct": min(100, round((pushup_total / 500) * 100)),
			},
			{
				"id": "pushup_1k",
				"title": "1,000 Pushup Titan",
				"desc": "1,000 lifetime pushups",
				"icon": "👑",
				"tier": "gold",
				"category": "pushup",
				"unlocked": pushup_total >= 1000,
				"progress": min(pushup_total, 1000),
				"target": 1000,
				"progress_pct": min(100, round((pushup_total / 1000) * 100)),
			},
			{
				"id": "pushup_storm",
				"title": "Pushup Storm",
				"desc": "50+ pushups in a single workout",
				"icon": "🌪️",
				"tier": "silver",
				"category": "pushup",
				"unlocked": pushup_pr >= 50,
				"progress": min(pushup_pr, 50),
				"target": 50,
				"progress_pct": min(100, round((pushup_pr / 50) * 100)),
			},
			{
				"id": "reps_century_session",
				"title": "Century Session",
				"desc": "100+ reps of a movement in one workout",
				"icon": "🎯",
				"tier": "gold",
				"category": "pr",
				"unlocked": max_any_pr >= 100,
				"progress": min(max_any_pr, 100),
				"target": 100,
				"progress_pct": min(100, round((max_any_pr / 100) * 100)),
			},
			{
				"id": "total_reps_1k",
				"title": "1K Total Reps",
				"desc": "1,000 total reps across all movements",
				"icon": "🏆",
				"tier": "silver",
				"category": "volume",
				"unlocked": total_reps >= 1000,
				"progress": min(total_reps, 1000),
				"target": 1000,
				"progress_pct": min(100, round((total_reps / 1000) * 100)),
			},
			{
				"id": "streak_3",
				"title": "Ignition",
				"desc": "3-day workout streak",
				"icon": "🔥",
				"tier": "bronze",
				"category": "streak",
				"unlocked": longest_streak >= 3,
				"progress": min(longest_streak, 3),
				"target": 3,
				"progress_pct": min(100, round((longest_streak / 3) * 100)),
			},
			{
				"id": "streak_7",
				"title": "Iron Discipline",
				"desc": "7-day workout streak",
				"icon": "🛡️",
				"tier": "silver",
				"category": "streak",
				"unlocked": longest_streak >= 7,
				"progress": min(longest_streak, 7),
				"target": 7,
				"progress_pct": min(100, round((longest_streak / 7) * 100)),
			},
			{
				"id": "streak_30",
				"title": "Monthly Warrior",
				"desc": "30-day workout streak",
				"icon": "⚔️",
				"tier": "gold",
				"category": "streak",
				"unlocked": longest_streak >= 30,
				"progress": min(longest_streak, 30),
				"target": 30,
				"progress_pct": min(100, round((longest_streak / 30) * 100)),
			},
			{
				"id": "workouts_10",
				"title": "Decathlete",
				"desc": "10 completed workouts",
				"icon": "🏅",
				"tier": "bronze",
				"category": "workouts",
				"unlocked": completed_count >= 10,
				"progress": min(completed_count, 10),
				"target": 10,
				"progress_pct": min(100, round((completed_count / 10) * 100)),
			},
		]

		# Client local now: UTC now minus timezone_offset_minutes
		client_now = datetime.now(timezone.utc) - timedelta(minutes=timezone_offset_minutes)
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

		top_exercises = sorted(
			exercise_frequency.values(),
			key=lambda x: (x["count"], x["total_reps"], x["total_minutes"]),
			reverse=True,
		)[:10]

		result = {
			"current_streak": current_streak,
			"longest_streak": longest_streak,
			"total_sessions": total_sessions,
			"total_minutes": round(total_duration / 60),
			"total_reps": total_reps,
			"completed_count": completed_count,
			"categories": category_stats,
			"disciplines": discipline_stats,
			"top_exercises": top_exercises,
			"rep_leaderboard": rep_leaderboard[:8],
			"milestones": milestones,
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

		self._stats_cache[cache_key] = result
		return result

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

		# Current streak calculation:
		# Anchor to UTC now and shift by client's timezone offset
		client_now = datetime.now(timezone.utc) - timedelta(minutes=timezone_offset_minutes)
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
