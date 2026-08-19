"""
FastAPI server for Spelling Bee game.
Supports Solo Play and Scalable Real-time Multiplayer (1v1, 2v2, Custom Variants).
"""

import json
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.engine.room_manager import room_manager
from app.engine.ws_manager import ws_manager
from app.models.room import (
	RoomConfig,
	RoomStatus,
	TeamId,
)
from app.puzzle import get_puzzle, new_puzzle
from app.words import is_valid_word

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Spelling Bee")

STATIC_DIR = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ── Static Routes ─────────────────────────────────────────────────────────────

@app.get("/")
@app.get("/spelling")
@app.get("/spelling/")
async def index():
	return FileResponse(
		STATIC_DIR / "index.html",
		headers={
			"Cache-Control": "no-cache, no-store, must-revalidate",
			"Pragma": "no-cache",
			"Expires": "0",
		},
	)


@app.get("/favicon.ico", include_in_schema=False)
@app.get("/spelling/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
@app.get("/spelling/favicon.svg", include_in_schema=False)
async def favicon():
	return FileResponse(STATIC_DIR / "favicon.svg", media_type="image/svg+xml")


# ── Solo Play API ─────────────────────────────────────────────────────────────

@app.get("/api/puzzle")
@app.get("/spelling/api/puzzle")
async def api_get_puzzle():
	"""Return current solo puzzle metadata."""
	p = get_puzzle()
	return {
		"center":        p["center"],
		"outer":         p["outer"],
		"max_score":     p["max_score"],
		"word_count":    len(p["valid_words"]),
		"pangram_count": len(p["pangrams"]),
	}


@app.post("/api/new-game")
@app.post("/spelling/api/new-game")
async def api_new_game():
	"""Discard the solo puzzle and generate a fresh random one."""
	p = new_puzzle()
	return {
		"center":        p["center"],
		"outer":         p["outer"],
		"max_score":     p["max_score"],
		"word_count":    len(p["valid_words"]),
		"pangram_count": len(p["pangrams"]),
	}


class GuessPayload(BaseModel):
	word: str
	current_letters: list[str] | None = None
	center_letter: str | None = None
	grace_letter: str | None = None


@app.post("/api/guess")
@app.post("/spelling/api/guess")
async def submit_guess(payload: GuessPayload):
	"""Solo mode word validation."""
	p = get_puzzle()
	center = payload.center_letter.lower().strip() if payload.center_letter else p["center"]
	word   = payload.word.lower().strip()

	if payload.current_letters:
		live_letters = {char.lower().strip() for char in payload.current_letters} | {center}
	else:
		live_letters = set(p["all_letters"])

	allowed_letters = set(live_letters)
	if payload.grace_letter:
		allowed_letters.add(payload.grace_letter.lower().strip())

	valid, reason = is_valid_word(word, allowed_letters, center)

	if not valid:
		return {"valid": False, "message": reason}

	pangram = live_letters.issubset(set(word))
	if not pangram and payload.grace_letter:
		if len(set(word) & allowed_letters) >= 7:
			pangram = True

	pts = len(word) if len(word) > 4 else 1
	if pangram:
		pts += 7

	return {
		"valid":   True,
		"pangram": pangram,
		"score":   pts,
		"message": "Pangram! 🌟" if pangram else f"+{pts}",
	}


# ── Multiplayer Room API ──────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
	host_id: str
	host_name: str
	config: RoomConfig | None = None


@app.post("/api/rooms")
@app.post("/spelling/api/rooms")
async def create_room(req: CreateRoomRequest):
	"""Create a new multiplayer room."""
	room, host = room_manager.create_room(
		host_id=req.host_id, host_name=req.host_name, config=req.config
	)
	return {
		"code": room.code,
		"player": host.model_dump(),
		"snapshot": room.get_snapshot().model_dump(),
	}


@app.get("/api/rooms/{code}")
@app.get("/spelling/api/rooms/{code}")
async def get_room_info(code: str):
	"""Get current snapshot for a room."""
	room = room_manager.get_room(code)
	if not room:
		raise HTTPException(status_code=404, detail="Room not found")
	return room.get_snapshot().model_dump()


# ── WebSocket Endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws/room/{code}")
@app.websocket("/spelling/ws/room/{code}")
async def websocket_room_endpoint(websocket: WebSocket, code: str):
	code = code.upper().strip()
	room = room_manager.get_room(code)
	if not room:
		await websocket.close(code=4004, reason="Room not found")
		return

	player_id = websocket.query_params.get("player_id", "")
	if not player_id:
		await websocket.close(code=4000, reason="Missing player_id")
		return

	await ws_manager.connect(code, player_id, websocket)

	try:
		# Send initial snapshot immediately upon connect
		await websocket.send_json({
			"type": "room_state",
			"payload": {"snapshot": room.get_snapshot().model_dump()},
		})

		while True:
			raw_data = await websocket.receive_text()
			try:
				msg = json.loads(raw_data)
			except Exception:
				continue

			msg_type = msg.get("type")
			payload = msg.get("payload", {})

			if msg_type == "join":
				nickname = payload.get("nickname", "Player")
				preferred_team = payload.get("preferred_team")
				team_enum = TeamId(preferred_team) if preferred_team else None
				room.add_player(player_id, nickname, team_enum)
				await room.broadcast_state()

			elif msg_type == "set_ready":
				is_ready = bool(payload.get("is_ready", True))
				room.set_ready(player_id, is_ready)
				await room.broadcast_state()

			elif msg_type == "switch_team":
				team_str = payload.get("team")
				if team_str:
					room.switch_team(player_id, TeamId(team_str))
					await room.broadcast_state()

			elif msg_type == "update_config":
				if player_id == room.host_id and room.status == RoomStatus.LOBBY:
					try:
						cfg = RoomConfig(**payload.get("config", {}))
						room.update_config(cfg)
						await room.broadcast_state()
					except Exception as exc:
						logger.warning(f"Invalid config payload: {exc}")

			elif msg_type == "start_game":
				if player_id == room.host_id and room.status != RoomStatus.IN_PROGRESS:
					await room.start_game()

			elif msg_type == "submit_guess":
				if room.session and room.status == RoomStatus.IN_PROGRESS:
					word = payload.get("word", "")
					center_letter = payload.get("center_letter")
					grace_letter = payload.get("grace_letter")
					await room.session.handle_guess(player_id, word, center_letter, grace_letter)

			elif msg_type == "change_center":
				if room.session and room.status == RoomStatus.IN_PROGRESS:
					await room.session.handle_center_change(player_id)

			elif msg_type == "rematch":
				if room.status == RoomStatus.GAME_OVER:
					await room.rematch()

			elif msg_type == "ping":
				await websocket.send_json({"type": "pong"})

	except WebSocketDisconnect:
		ws_manager.disconnect(code, player_id)
		if player_id in room.players:
			room.players[player_id].connected = False
			await room.broadcast_state()
	except Exception as exc:
		logger.error(f"WebSocket error in room {code} for player {player_id}: {exc}", exc_info=True)
		ws_manager.disconnect(code, player_id)
