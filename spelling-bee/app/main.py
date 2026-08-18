"""
FastAPI server for Spelling Bee game.
Serves the static frontend and exposes a JSON API for word validation.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.puzzle import get_puzzle, new_puzzle
from app.words import is_valid_word

app = FastAPI(title="Spelling Bee")

STATIC_DIR = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
async def index():
	return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/puzzle")
async def api_get_puzzle():
	"""Return the current puzzle metadata (no answers)."""
	p = get_puzzle()
	return {
		"center":        p["center"],
		"outer":         p["outer"],
		"max_score":     p["max_score"],
		"word_count":    len(p["valid_words"]),
		"pangram_count": len(p["pangrams"]),
	}


@app.post("/api/new-game")
async def api_new_game():
	"""Discard the current puzzle and generate a fresh random one."""
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
	# Client sends its current live letter set (outer letters mutate every 20s)
	current_letters: list[str] | None = None
	center_letter: str | None = None
	grace_letter: str | None = None


@app.post("/api/guess")
async def submit_guess(payload: GuessPayload):
	"""
	Validate a guessed word and return score/feedback.
	Validates against the client's live letter set when provided,
	plus an optional 1-time grace letter from the most recent mutation.
	The center letter is taken from the client's live state if provided,
	falling back to the server's current puzzle.
	"""
	p = get_puzzle()
	center = payload.center_letter.lower().strip() if payload.center_letter else p["center"]
	word   = payload.word.lower().strip()

	# Use client's live letter set if provided, fall back to server puzzle
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

	# Pangram check: uses all 7 live letters OR at least 7 distinct letters with the grace letter
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
