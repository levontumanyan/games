from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def create_app() -> FastAPI:
	app = FastAPI(title="Workout Routine Player")

	static_dir = Path(__file__).parent

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
