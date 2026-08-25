from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from db import Database


def create_app(data_dir: Path | None = None) -> FastAPI:
	app = FastAPI(title="Workout Routine Player")

	static_dir = Path(__file__).parent
	if data_dir is None:
		data_dir = static_dir / "data"
	data_dir.mkdir(parents=True, exist_ok=True)

	db_path = data_dir / "workout.db"
	db = Database(db_path)

	# Auto-migrate legacy routines.json if exists
	legacy_routines_file = data_dir / "routines.json"
	db.migrate_legacy_routines(legacy_routines_file)

	def get_user_id(request: Request) -> str:
		user_id = request.headers.get("X-User-Id") or request.query_params.get("user_id") or "levon"
		clean = user_id.strip().lower()
		return clean if clean else "levon"

	# ── Users API ─────────────────────────────────────────────────────────────

	@app.get("/api/users")
	@app.get("/workout/api/users")
	async def list_users():
		return JSONResponse(content=db.list_users())

	@app.post("/api/users")
	@app.post("/workout/api/users")
	async def create_user(request: Request):
		try:
			data = await request.json()
		except Exception:
			raise HTTPException(status_code=400, detail="Invalid JSON body")
		if not isinstance(data, dict):
			raise HTTPException(status_code=400, detail="Expected a JSON object")

		raw_id = data.get("id") or data.get("username") or data.get("display_name")
		if not raw_id or not isinstance(raw_id, str) or not raw_id.strip():
			raise HTTPException(status_code=400, detail="User id/name is required")

		user_id = raw_id.strip().lower()
		display_name = data.get("display_name") or raw_id.strip()
		user = db.get_or_create_user(user_id=user_id, display_name=display_name)
		return JSONResponse(content=user)

	# ── Routines API ──────────────────────────────────────────────────────────

	@app.get("/api/routines")
	@app.get("/workout/api/routines")
	async def get_routines(request: Request):
		user_id = get_user_id(request)
		return JSONResponse(content=db.get_routines(user_id))

	@app.post("/api/routines")
	@app.post("/workout/api/routines")
	async def save_routines(request: Request):
		user_id = get_user_id(request)
		try:
			data = await request.json()
		except Exception:
			raise HTTPException(status_code=400, detail="Invalid JSON body")
		if not isinstance(data, list):
			raise HTTPException(status_code=400, detail="Expected a list of routines")

		db.save_routines(user_id, data)
		return {"status": "ok", "count": len(data)}

	@app.get("/api/routines/{routine_id}")
	@app.get("/workout/api/routines/{routine_id}")
	async def get_single_routine(routine_id: str, request: Request):
		user_id = (request.query_params.get("user_id") or get_user_id(request)).strip().lower()
		routine = db.get_routine(user_id, routine_id)
		if not routine:
			raise HTTPException(status_code=404, detail="Routine not found")
		return JSONResponse(content=routine)

	@app.put("/api/routines/{routine_id}")
	@app.put("/workout/api/routines/{routine_id}")
	@app.post("/api/routines/{routine_id}")
	@app.post("/workout/api/routines/{routine_id}")
	async def upsert_single_routine(routine_id: str, request: Request):
		user_id = get_user_id(request)
		try:
			data = await request.json()
		except Exception:
			raise HTTPException(status_code=400, detail="Invalid JSON body")
		if not isinstance(data, dict):
			raise HTTPException(status_code=400, detail="Expected a routine JSON object")
		if "id" not in data or not data["id"]:
			data["id"] = routine_id
		saved = db.upsert_routine(user_id, data)
		return JSONResponse(content={"status": "ok", "routine": saved})

	@app.delete("/api/routines/{routine_id}")
	@app.delete("/workout/api/routines/{routine_id}")
	async def delete_single_routine(routine_id: str, request: Request):
		user_id = get_user_id(request)
		success = db.delete_routine(user_id, routine_id)
		if not success:
			raise HTTPException(status_code=404, detail="Routine not found")
		return {"status": "ok"}

	# ── Sessions API ──────────────────────────────────────────────────────────

	@app.post("/api/sessions")
	@app.post("/workout/api/sessions")
	async def save_session(request: Request):
		user_id = get_user_id(request)
		try:
			data = await request.json()
		except Exception:
			raise HTTPException(status_code=400, detail="Invalid JSON body")
		if not isinstance(data, dict):
			raise HTTPException(status_code=400, detail="Expected session object")

		try:
			saved = db.upsert_session(user_id, data)
			return JSONResponse(content={"status": "ok", "session": saved})
		except Exception as e:
			raise HTTPException(status_code=400, detail=str(e))

	@app.get("/api/sessions")
	@app.get("/workout/api/sessions")
	async def get_sessions(request: Request):
		user_id = get_user_id(request)
		limit = int(request.query_params.get("limit", 50))
		return JSONResponse(content=db.get_sessions(user_id, limit=limit))

	@app.delete("/api/sessions/{session_id}")
	@app.delete("/workout/api/sessions/{session_id}")
	async def delete_session(session_id: str, request: Request):
		user_id = get_user_id(request)
		success = db.delete_session(user_id, session_id)
		if not success:
			raise HTTPException(status_code=404, detail="Session not found")
		return {"status": "ok"}

	# ── Stats API ─────────────────────────────────────────────────────────────

	@app.get("/api/stats")
	@app.get("/workout/api/stats")
	async def get_stats(request: Request):
		user_id = get_user_id(request)
		tz_offset = int(request.query_params.get("tz_offset", 0))
		return JSONResponse(content=db.get_stats(user_id, timezone_offset_minutes=tz_offset))

	# ── Exercises API ─────────────────────────────────────────────────────────

	@app.get("/api/exercises")
	@app.get("/workout/api/exercises")
	async def list_exercises(request: Request):
		user_id = get_user_id(request)
		cat = request.query_params.get("category")
		disc = request.query_params.get("discipline")
		search = request.query_params.get("search")
		muscle = request.query_params.get("muscle")
		return JSONResponse(
			content=db.list_exercises(
				user_id=user_id, category=cat, discipline=disc, search=search, muscle=muscle
			)
		)

	@app.post("/api/exercises")
	@app.post("/workout/api/exercises")
	async def create_exercise(request: Request):
		user_id = get_user_id(request)
		try:
			data = await request.json()
		except Exception:
			raise HTTPException(status_code=400, detail="Invalid JSON body")
		if not isinstance(data, dict):
			raise HTTPException(status_code=400, detail="Expected a JSON object")
		try:
			created = db.create_exercise(user_id, data)
			return JSONResponse(content=created)
		except ValueError as e:
			raise HTTPException(status_code=400, detail=str(e))
		except Exception as e:
			raise HTTPException(status_code=500, detail=str(e))

	@app.delete("/api/exercises/{exercise_id}")
	@app.delete("/workout/api/exercises/{exercise_id}")
	async def delete_exercise(exercise_id: str, request: Request):
		user_id = get_user_id(request)
		success = db.delete_exercise(user_id, exercise_id)
		if not success:
			raise HTTPException(status_code=404, detail="Exercise not found or cannot be deleted")
		return {"status": "ok"}

	# ── Combos API ────────────────────────────────────────────────────────────

	@app.get("/api/combos")
	@app.get("/workout/api/combos")
	async def list_combos(request: Request):
		user_id = get_user_id(request)
		cat = request.query_params.get("category")
		disc = request.query_params.get("discipline")
		search = request.query_params.get("search")
		return JSONResponse(
			content=db.list_combos(user_id=user_id, category=cat, discipline=disc, search=search)
		)

	@app.post("/api/combos")
	@app.post("/workout/api/combos")
	async def create_combo(request: Request):
		user_id = get_user_id(request)
		try:
			data = await request.json()
		except Exception:
			raise HTTPException(status_code=400, detail="Invalid JSON body")
		if not isinstance(data, dict):
			raise HTTPException(status_code=400, detail="Expected a JSON object")
		try:
			created = db.create_combo(user_id, data)
			return JSONResponse(content=created)
		except ValueError as e:
			raise HTTPException(status_code=400, detail=str(e))
		except Exception as e:
			raise HTTPException(status_code=500, detail=str(e))

	@app.delete("/api/combos/{combo_id}")
	@app.delete("/workout/api/combos/{combo_id}")
	async def delete_combo(combo_id: str, request: Request):
		user_id = get_user_id(request)
		success = db.delete_combo(combo_id, user_id)
		if not success:
			raise HTTPException(status_code=404, detail="Combo not found or cannot be deleted")
		return {"status": "ok"}

	# ── Static & HTML ─────────────────────────────────────────────────────────

	@app.middleware("http")
	async def add_cache_control_header(request: Request, call_next):
		response = await call_next(request)
		path = request.url.path
		if path.endswith((".js", ".css", ".html")) or path in ("/", "/workout", "/workout/"):
			response.headers["Cache-Control"] = "no-cache, must-revalidate"
		return response

	# Mount static directories
	media_dir = static_dir / "media"
	media_dir.mkdir(parents=True, exist_ok=True)
	app.mount("/workout/css", StaticFiles(directory=static_dir / "css"), name="workout_css")
	app.mount("/workout/js", StaticFiles(directory=static_dir / "js"), name="workout_js")
	app.mount("/workout/media", StaticFiles(directory=media_dir), name="workout_media")
	app.mount("/css", StaticFiles(directory=static_dir / "css"), name="css")
	app.mount("/js", StaticFiles(directory=static_dir / "js"), name="js")
	app.mount("/media", StaticFiles(directory=media_dir), name="media")

	@app.api_route("/icons_preview.html", methods=["GET", "HEAD"])
	@app.api_route("/workout/icons_preview.html", methods=["GET", "HEAD"])
	async def icons_preview():
		preview_path = static_dir / "icons_preview.html"
		if preview_path.exists():
			return FileResponse(preview_path)
		raise HTTPException(status_code=404, detail="Preview page not found")

	@app.api_route("/tabs_preview.html", methods=["GET", "HEAD"])
	@app.api_route("/workout/tabs_preview.html", methods=["GET", "HEAD"])
	async def tabs_preview():
		preview_path = static_dir / "tabs_preview.html"
		if preview_path.exists():
			return FileResponse(preview_path)
		raise HTTPException(status_code=404, detail="Tabs preview page not found")

	@app.api_route("/exercise_picker_preview.html", methods=["GET", "HEAD"])
	@app.api_route("/workout/exercise_picker_preview.html", methods=["GET", "HEAD"])
	async def exercise_picker_preview():
		preview_path = static_dir / "exercise_picker_preview.html"
		if preview_path.exists():
			return FileResponse(preview_path)
		raise HTTPException(status_code=404, detail="Exercise picker preview page not found")

	@app.api_route("/", methods=["GET", "HEAD"])
	@app.api_route("/workout", methods=["GET", "HEAD"])
	@app.api_route("/workout/", methods=["GET", "HEAD"])
	async def index():
		return FileResponse(static_dir / "index.html")

	return app
