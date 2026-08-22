import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


def create_app(data_dir: Path | None = None) -> FastAPI:
	app = FastAPI(title="Workout Routine Player")

	static_dir = Path(__file__).parent
	if data_dir is None:
		data_dir = static_dir / "data"
	routines_file = data_dir / "routines.json"

	data_dir.mkdir(parents=True, exist_ok=True)

	def load_routines_from_disk() -> list[Any]:
		if not routines_file.exists():
			return []
		try:
			content = routines_file.read_text(encoding="utf-8")
			data = json.loads(content)
			if isinstance(data, list):
				return data
			return []
		except Exception:
			return []

	def save_routines_to_disk(routines: list[Any]) -> None:
		temp_file = routines_file.with_suffix(".tmp")
		with open(temp_file, "w", encoding="utf-8") as f:
			json.dump(routines, f, indent="\t", ensure_ascii=False)
		os.replace(temp_file, routines_file)

	@app.get("/api/routines")
	@app.get("/workout/api/routines")
	async def get_routines():
		return JSONResponse(content=load_routines_from_disk())

	@app.post("/api/routines")
	@app.post("/workout/api/routines")
	async def save_routines(request: Request):
		try:
			data = await request.json()
		except Exception:
			raise HTTPException(status_code=400, detail="Invalid JSON body")
		if not isinstance(data, list):
			raise HTTPException(status_code=400, detail="Expected a list of routines")

		save_routines_to_disk(data)
		return {"status": "ok", "count": len(data)}

	# Mount static directories (both root and subpath for reverse proxy flexibility)
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
