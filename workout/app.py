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

	# ── Share API ─────────────────────────────────────────────────────────────

	@app.post("/api/share")
	@app.post("/workout/api/share")
	async def create_share_link(request: Request):
		try:
			data = await request.json()
		except Exception:
			raise HTTPException(status_code=400, detail="Invalid JSON body")
		if not isinstance(data, dict) or "title" not in data or "steps" not in data:
			raise HTTPException(
				status_code=400, detail="Expected a routine object with title and steps"
			)

		try:
			code = db.create_shared_routine(data)
			return JSONResponse(content={"status": "ok", "id": code})
		except Exception as e:
			raise HTTPException(status_code=500, detail=str(e))

	@app.get("/api/share/{share_id}")
	@app.get("/workout/api/share/{share_id}")
	async def get_shared_link(share_id: str):
		routine = db.get_shared_routine(share_id)
		if not routine:
			raise HTTPException(status_code=404, detail="Shared workout not found")
		return JSONResponse(content=routine)

	# ── Static & HTML ─────────────────────────────────────────────────────────

	@app.middleware("http")
	async def add_cache_control_header(request: Request, call_next):
		response = await call_next(request)
		path = request.url.path
		if path.endswith((".js", ".css", ".html")) or path in ("/", "/workout", "/workout/"):
			response.headers["Cache-Control"] = "no-cache, must-revalidate"
		return response

	# Mount static directories
	app.mount("/workout/css", StaticFiles(directory=static_dir / "css"), name="workout_css")
	app.mount("/workout/js", StaticFiles(directory=static_dir / "js"), name="workout_js")
	app.mount("/css", StaticFiles(directory=static_dir / "css"), name="css")
	app.mount("/js", StaticFiles(directory=static_dir / "js"), name="js")

	@app.api_route("/", methods=["GET", "HEAD"])
	@app.api_route("/workout", methods=["GET", "HEAD"])
	@app.api_route("/workout/", methods=["GET", "HEAD"])
	async def index():
		return FileResponse(static_dir / "index.html")

	return app
