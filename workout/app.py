import secrets
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import (
	APIRouter,
	Depends,
	FastAPI,
	File,
	Header,
	HTTPException,
	Query,
	Request,
	UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from db import Database
from schemas import (
	ComboCreate,
	ExerciseCreate,
	ExerciseMediaAdd,
	ExerciseUpdate,
	MusicTrack,
	MusicTrackAdd,
	RoutineArchiveUpdate,
	RoutineStep,
	RoutineUpsert,
	ScheduledWorkoutCreate,
	ScheduledWorkoutOut,
	ScheduledWorkoutUpdate,
	SessionUpsert,
	StepPatch,
	StepReorder,
	UserCreate,
)
from taxonomy import get_taxonomy_payload


def create_app(data_dir: Path | None = None) -> FastAPI:
	app = FastAPI(title="Workout Routine Player")

	static_dir = Path(__file__).parent
	if data_dir is None:
		data_dir = static_dir / "data"
	data_dir.mkdir(parents=True, exist_ok=True)

	uploads_dir = data_dir / "uploads"
	uploads_dir.mkdir(parents=True, exist_ok=True)

	db_path = data_dir / "workout.db"
	db = Database(db_path)

	@app.exception_handler(RequestValidationError)
	async def validation_exception_handler(request: Request, exc: RequestValidationError):
		return JSONResponse(
			status_code=400,
			content={"detail": exc.errors()},
		)

	def get_user_id(
		request: Request,
		x_user_id: str | None = Header(
			default=None, alias="X-User-Id", description="Active user ID (defaults to 'levon')"
		),
	) -> str:
		user_id = x_user_id or request.query_params.get("user_id") or "levon"
		clean = user_id.strip().lower()
		return clean if clean else "levon"

	api_router = APIRouter()

	# ── Users API ─────────────────────────────────────────────────────────────

	@api_router.get("/users")
	async def list_users():
		return JSONResponse(content=db.list_users())

	@api_router.post("/users")
	async def create_user(payload: UserCreate):
		raw_id = payload.id or payload.username or payload.display_name
		if not raw_id or not raw_id.strip():
			raise HTTPException(status_code=400, detail="User id/name is required")

		user_id = raw_id.strip().lower()
		display_name = payload.display_name or raw_id.strip()
		user = db.get_or_create_user(user_id=user_id, display_name=display_name)
		return JSONResponse(content=user)

	# ── Routines API ──────────────────────────────────────────────────────────

	@api_router.get("/routines")
	async def get_routines(user_id: str = Depends(get_user_id)):
		return JSONResponse(content=db.get_routines(user_id))

	@api_router.post("/routines")
	async def create_routine(
		payload: RoutineUpsert | list[RoutineUpsert],
		user_id: str = Depends(get_user_id),
	):
		if isinstance(payload, list):
			data = [r.model_dump(by_alias=True) for r in payload]
			saved_list = [db.upsert_routine(user_id, item) for item in data]
			return JSONResponse(content={"status": "ok", "count": len(saved_list)})
		data = payload.model_dump(by_alias=True)
		saved = db.upsert_routine(user_id, data)
		return JSONResponse(content={"status": "ok", "routine": saved})

	@api_router.get("/routines/{routine_id}")
	async def get_single_routine(
		routine_id: str,
		user_id: str | None = Query(default=None, description="Optional user ID override"),
		active_user: str = Depends(get_user_id),
	):
		effective_user = (user_id or active_user).strip().lower()
		routine = db.get_routine(effective_user, routine_id)
		if not routine:
			raise HTTPException(status_code=404, detail="Routine not found")
		return JSONResponse(content=routine)

	@api_router.put("/routines/{routine_id}")
	@api_router.post("/routines/{routine_id}", include_in_schema=False)
	async def upsert_single_routine(
		routine_id: str,
		payload: RoutineUpsert,
		user_id: str = Depends(get_user_id),
	):
		data = payload.model_dump(by_alias=True)
		if not data.get("id"):
			data["id"] = routine_id
		saved = db.upsert_routine(user_id, data)
		return JSONResponse(content={"status": "ok", "routine": saved})

	@api_router.delete("/routines/{routine_id}")
	async def delete_single_routine(routine_id: str, user_id: str = Depends(get_user_id)):
		success = db.delete_routine(user_id, routine_id)
		if not success:
			raise HTTPException(status_code=404, detail="Routine not found")
		return {"status": "ok"}

	@api_router.post("/routines/{routine_id}/archive")
	async def archive_routine(
		routine_id: str,
		payload: RoutineArchiveUpdate | None = None,
		user_id: str = Depends(get_user_id),
	):
		is_arch = True if payload is None else payload.is_archived
		routine = db.archive_routine(user_id, routine_id, is_archived=is_arch)
		if not routine:
			raise HTTPException(status_code=404, detail="Routine not found")
		return JSONResponse(content={"status": "ok", "routine": routine})

	@api_router.post("/routines/{routine_id}/unarchive")
	async def unarchive_routine(
		routine_id: str,
		user_id: str = Depends(get_user_id),
	):
		routine = db.archive_routine(user_id, routine_id, is_archived=False)
		if not routine:
			raise HTTPException(status_code=404, detail="Routine not found")
		return JSONResponse(content={"status": "ok", "routine": routine})

	@api_router.post("/routines/{routine_id}/steps")
	async def add_routine_step(
		routine_id: str,
		payload: RoutineStep | dict[str, Any],
		index: int | None = Query(default=None, description="0-based insertion index"),
		user_id: str = Depends(get_user_id),
	):
		data = payload.model_dump(by_alias=True) if hasattr(payload, "model_dump") else payload
		routine = db.add_routine_step(user_id, routine_id, data, index=index)
		if not routine:
			raise HTTPException(status_code=404, detail="Routine not found")
		return JSONResponse(content={"status": "ok", "routine": routine})

	@api_router.patch("/routines/{routine_id}/steps/{step_id}")
	async def patch_routine_step(
		routine_id: str,
		step_id: str,
		payload: StepPatch,
		user_id: str = Depends(get_user_id),
	):
		data = payload.model_dump(exclude_none=True, by_alias=True)
		routine = db.patch_routine_step(user_id, routine_id, step_id, data)
		if not routine:
			raise HTTPException(status_code=404, detail="Routine or step not found")
		return JSONResponse(content={"status": "ok", "routine": routine})

	@api_router.delete("/routines/{routine_id}/steps/{step_id}")
	async def delete_routine_step(
		routine_id: str,
		step_id: str,
		user_id: str = Depends(get_user_id),
	):
		routine = db.delete_routine_step(user_id, routine_id, step_id)
		if not routine:
			raise HTTPException(status_code=404, detail="Routine or step not found")
		return JSONResponse(content={"status": "ok", "routine": routine})

	@api_router.delete("/routines/{routine_id}/steps")
	async def delete_routine_steps_by_exercise(
		routine_id: str,
		exercise_id: str = Query(..., description="Exercise ID to remove across all steps"),
		user_id: str = Depends(get_user_id),
	):
		result = db.delete_routine_steps_by_exercise(user_id, routine_id, exercise_id)
		if not result:
			raise HTTPException(status_code=404, detail="Routine not found")
		return JSONResponse(content=result)

	@api_router.post("/routines/{routine_id}/steps/reorder")
	async def reorder_routine_steps(
		routine_id: str,
		payload: StepReorder,
		user_id: str = Depends(get_user_id),
	):
		routine = db.reorder_routine_steps(user_id, routine_id, payload.step_ids)
		if not routine:
			raise HTTPException(status_code=404, detail="Routine not found")
		return JSONResponse(content={"status": "ok", "routine": routine})

	@api_router.get("/routines/{routine_id}/music")
	async def get_routine_music(
		routine_id: str,
		user_id: str | None = Query(default=None, description="Optional user ID override"),
		active_user: str = Depends(get_user_id),
	):
		effective_user = (user_id or active_user).strip().lower()
		tracks = db.get_routine_music_tracks(effective_user, routine_id)
		if tracks is None:
			raise HTTPException(status_code=404, detail="Routine not found")
		return JSONResponse(content=tracks)

	@api_router.post("/routines/{routine_id}/music")
	async def add_routine_music(
		routine_id: str,
		payload: MusicTrackAdd | MusicTrack | dict[str, Any],
		user_id: str = Depends(get_user_id),
	):
		data = payload.model_dump(by_alias=True) if hasattr(payload, "model_dump") else payload
		track = db.add_routine_music_track(user_id, routine_id, data)
		if not track:
			raise HTTPException(status_code=404, detail="Routine not found")
		return JSONResponse(content={"status": "ok", "track": track})

	@api_router.delete("/routines/{routine_id}/music/{track_id}")
	async def delete_routine_music(
		routine_id: str,
		track_id: str,
		user_id: str = Depends(get_user_id),
	):
		success = db.delete_routine_music_track(user_id, routine_id, track_id)
		if not success:
			raise HTTPException(status_code=404, detail="Routine or music track not found")
		return JSONResponse(content={"status": "ok", "deleted_track_id": track_id})

	# ── Sessions API ──────────────────────────────────────────────────────────

	@api_router.post("/sessions")
	async def save_session(payload: SessionUpsert, user_id: str = Depends(get_user_id)):
		try:
			data = payload.model_dump(exclude_none=True)
			saved = db.upsert_session(user_id, data)
			return JSONResponse(content={"status": "ok", "session": saved})
		except Exception as e:
			raise HTTPException(status_code=400, detail=str(e))

	@api_router.get("/sessions")
	async def get_sessions(
		limit: int = Query(default=50, description="Max number of sessions to return"),
		order: str = Query(
			default="desc",
			description="Sort order by started_at: 'desc' (newest first) or 'asc' (oldest first)",
		),
		user_id: str = Depends(get_user_id),
	):
		return JSONResponse(content=db.get_sessions(user_id, limit=limit, order=order))

	@api_router.delete("/sessions/{session_id}")
	async def delete_session(session_id: str, user_id: str = Depends(get_user_id)):
		success = db.delete_session(user_id, session_id)
		if not success:
			raise HTTPException(status_code=404, detail="Session not found")
		return {"status": "ok"}

	# ── Schedule / Calendar API ───────────────────────────────────────────────

	@api_router.get("/schedule", response_model=list[ScheduledWorkoutOut])
	async def get_schedule(
		start_date: str | None = Query(default=None, description="Start date (YYYY-MM-DD)"),
		end_date: str | None = Query(default=None, description="End date (YYYY-MM-DD)"),
		status: str | None = Query(
			default=None, description="Status filter: scheduled, completed, skipped"
		),
		user_id: str = Depends(get_user_id),
	):
		items = db.get_scheduled_workouts(
			user_id, start_date=start_date, end_date=end_date, status=status
		)
		return JSONResponse(content=items)

	@api_router.post("/schedule", response_model=ScheduledWorkoutOut)
	async def create_schedule(
		payload: ScheduledWorkoutCreate,
		user_id: str = Depends(get_user_id),
	):
		created = db.create_scheduled_workout(user_id, payload.model_dump())
		return JSONResponse(content=created, status_code=201)

	@api_router.get("/schedule/{schedule_id}", response_model=ScheduledWorkoutOut)
	async def get_schedule_item(
		schedule_id: str,
		user_id: str = Depends(get_user_id),
	):
		item = db.get_scheduled_workout(user_id, schedule_id)
		if not item:
			raise HTTPException(status_code=404, detail="Scheduled workout not found")
		return JSONResponse(content=item)

	@api_router.put("/schedule/{schedule_id}", response_model=ScheduledWorkoutOut)
	async def update_schedule_item(
		schedule_id: str,
		payload: ScheduledWorkoutUpdate,
		user_id: str = Depends(get_user_id),
	):
		updates = payload.model_dump(exclude_unset=True)
		updated = db.update_scheduled_workout(user_id, schedule_id, updates)
		if not updated:
			raise HTTPException(status_code=404, detail="Scheduled workout not found")
		return JSONResponse(content=updated)

	@api_router.delete("/schedule/{schedule_id}")
	async def delete_schedule_item(
		schedule_id: str,
		user_id: str = Depends(get_user_id),
	):
		success = db.delete_scheduled_workout(user_id, schedule_id)
		if not success:
			raise HTTPException(status_code=404, detail="Scheduled workout not found")
		return {"status": "ok"}

	@api_router.post("/schedule/{schedule_id}/complete", response_model=ScheduledWorkoutOut)
	async def complete_schedule_item(
		schedule_id: str,
		session_id: str | None = Query(default=None, description="Optional linked session ID"),
		user_id: str = Depends(get_user_id),
	):
		completed = db.complete_scheduled_workout(user_id, schedule_id, session_id=session_id)
		if not completed:
			raise HTTPException(status_code=404, detail="Scheduled workout not found")
		return JSONResponse(content=completed)

	# ── Stats API ─────────────────────────────────────────────────────────────

	@api_router.get("/stats")
	async def get_stats(
		tz_offset: int = Query(default=0, description="Timezone offset in minutes"),
		user_id: str = Depends(get_user_id),
	):
		return JSONResponse(content=db.get_stats(user_id, timezone_offset_minutes=tz_offset))

	# ── Taxonomy API ──────────────────────────────────────────────────────────

	@api_router.get("/taxonomy")
	async def get_taxonomy():
		return JSONResponse(content=get_taxonomy_payload())

	# ── Exercises API ─────────────────────────────────────────────────────────

	@api_router.get("/exercises")
	async def list_exercises(
		category: str | None = Query(
			default=None,
			description="Filter by category (e.g. strength, cardio, technique, mobility, drill)",
		),
		discipline: str | None = Query(
			default=None,
			description="Filter by discipline (e.g. general, boxing, muay_thai, kickboxing, bjj)",
		),
		search: str | None = Query(default=None, description="Search term for name or description"),
		muscle: str | None = Query(default=None, description="Filter by targeted muscle"),
		user_id: str = Depends(get_user_id),
	):
		return JSONResponse(
			content=db.list_exercises(
				user_id=user_id,
				category=category,
				discipline=discipline,
				search=search,
				muscle=muscle,
			)
		)

	@api_router.post("/exercises")
	async def create_exercise(payload: ExerciseCreate, user_id: str = Depends(get_user_id)):
		try:
			data = payload.model_dump(exclude_none=True)
			created = db.create_exercise(user_id, data)
			return JSONResponse(content=created)
		except ValueError as e:
			raise HTTPException(status_code=400, detail=str(e))
		except Exception as e:
			raise HTTPException(status_code=500, detail=str(e))

	@api_router.patch("/exercises/{exercise_id}")
	async def patch_exercise(
		exercise_id: str,
		payload: ExerciseUpdate,
		user_id: str = Depends(get_user_id),
	):
		updates = payload.model_dump(exclude_unset=True)
		if not updates:
			raise HTTPException(status_code=400, detail="No fields provided for update")
		try:
			updated = db.update_exercise(user_id, exercise_id, updates)
			if not updated:
				raise HTTPException(status_code=404, detail="Exercise not found")
			return JSONResponse(content=updated)
		except HTTPException:
			raise
		except ValueError as e:
			raise HTTPException(status_code=400, detail=str(e))
		except Exception as e:
			raise HTTPException(status_code=500, detail=str(e))

	@api_router.post("/exercises/{exercise_id}/media")
	async def add_exercise_media(
		exercise_id: str,
		payload: ExerciseMediaAdd,
		user_id: str = Depends(get_user_id),
	):
		try:
			updated = db.add_exercise_media(
				user_id=user_id,
				exercise_id=exercise_id,
				url=payload.url,
				kind=payload.kind,
				media_type=payload.type,
				title=payload.title,
				set_as_primary=payload.set_as_primary,
			)
			if not updated:
				raise HTTPException(status_code=404, detail="Exercise not found")
			return JSONResponse(content=updated)
		except HTTPException:
			raise
		except ValueError as e:
			raise HTTPException(status_code=400, detail=str(e))
		except Exception as e:
			raise HTTPException(status_code=500, detail=str(e))

	@api_router.delete("/exercises/{exercise_id}")
	async def delete_exercise(exercise_id: str, user_id: str = Depends(get_user_id)):
		success = db.delete_exercise(user_id, exercise_id)
		if not success:
			raise HTTPException(status_code=404, detail="Exercise not found or cannot be deleted")
		return {"status": "ok"}

	# ── Combos API ────────────────────────────────────────────────────────────

	@api_router.get("/combos")
	async def list_combos(
		category: str | None = Query(default=None, description="Filter by combo category"),
		discipline: str | None = Query(default=None, description="Filter by discipline"),
		search: str | None = Query(default=None, description="Search by name or description"),
		user_id: str = Depends(get_user_id),
	):
		return JSONResponse(
			content=db.list_combos(
				user_id=user_id, category=category, discipline=discipline, search=search
			)
		)

	@api_router.post("/combos")
	async def create_combo(payload: ComboCreate, user_id: str = Depends(get_user_id)):
		try:
			data = payload.model_dump(exclude_none=True)
			created = db.create_combo(user_id, data)
			return JSONResponse(content=created)
		except ValueError as e:
			raise HTTPException(status_code=400, detail=str(e))
		except Exception as e:
			raise HTTPException(status_code=500, detail=str(e))

	@api_router.delete("/combos/{combo_id}")
	async def delete_combo(combo_id: str, user_id: str = Depends(get_user_id)):
		success = db.delete_combo(combo_id, user_id)
		if not success:
			raise HTTPException(status_code=404, detail="Combo not found or cannot be deleted")
		return {"status": "ok"}

	# ── Uploads API ───────────────────────────────────────────────────────────

	@api_router.post("/upload")
	async def upload_media_file(file: UploadFile = File(...)):
		if not file.filename:
			raise HTTPException(status_code=400, detail="No file uploaded")

		content_type = (file.content_type or "").lower()
		allowed_types = {
			"image/jpeg": ".jpg",
			"image/jpg": ".jpg",
			"image/png": ".png",
			"image/webp": ".webp",
			"image/gif": ".gif",
			"image/svg+xml": ".svg",
		}

		ext = Path(file.filename).suffix.lower()
		if content_type not in allowed_types and ext not in [
			".jpg",
			".jpeg",
			".png",
			".webp",
			".gif",
			".svg",
		]:
			raise HTTPException(
				status_code=400,
				detail="Unsupported file format. Please upload an image (PNG, JPG, WEBP, GIF, SVG).",
			)

		target_ext = allowed_types.get(content_type, ".jpg" if ext == ".jpeg" else ext)
		unique_name = f"img_{int(datetime.now().timestamp())}_{secrets.token_hex(4)}{target_ext}"
		dest = uploads_dir / unique_name

		contents = await file.read()
		if len(contents) > 25 * 1024 * 1024:  # 25MB limit
			raise HTTPException(status_code=400, detail="File too large (maximum size is 25MB)")

		dest.write_bytes(contents)

		return JSONResponse(
			content={
				"url": f"/workout/uploads/{unique_name}",
				"filename": unique_name,
				"size": len(contents),
				"type": "image",
			}
		)

	# Mount API router to both standard root /api and subpath /workout/api
	app.include_router(api_router, prefix="/api")
	app.include_router(api_router, prefix="/workout/api")

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
	app.mount("/workout/uploads", StaticFiles(directory=uploads_dir), name="workout_uploads")
	app.mount("/css", StaticFiles(directory=static_dir / "css"), name="css")
	app.mount("/js", StaticFiles(directory=static_dir / "js"), name="js")
	app.mount("/media", StaticFiles(directory=media_dir), name="media")
	app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

	@app.get("/workout/openapi.json", include_in_schema=False)
	async def get_workout_openapi():
		return JSONResponse(content=app.openapi())

	preview_pages = (
		"icons_preview.html",
		"tabs_preview.html",
		"reps_ui_review.html",
		"design_video_slice.html",
		"design_add_to_workout.html",
	)

	async def preview_page(request: Request) -> FileResponse:
		name = request.url.path.rsplit("/", 1)[-1]
		preview_path = static_dir / name
		if name in preview_pages and preview_path.exists():
			return FileResponse(preview_path)
		raise HTTPException(status_code=404, detail="Preview page not found")

	for _page in preview_pages:
		app.add_api_route(
			f"/{_page}", preview_page, methods=["GET", "HEAD"], include_in_schema=False
		)
		app.add_api_route(
			f"/workout/{_page}", preview_page, methods=["GET", "HEAD"], include_in_schema=False
		)

	@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
	@app.api_route("/workout", methods=["GET", "HEAD"], include_in_schema=False)
	@app.api_route("/workout/", methods=["GET", "HEAD"], include_in_schema=False)
	async def index():
		return FileResponse(static_dir / "index.html")

	return app
