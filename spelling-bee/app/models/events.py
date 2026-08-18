"""
WebSocket event models for Spelling Bee multiplayer.
"""

from typing import Any

from pydantic import BaseModel, Field

from app.models.room import RoomConfig, RoomSnapshot, TeamId


class WSMessage(BaseModel):
	type: str
	payload: dict[str, Any] = Field(default_factory=dict)


# ── Client -> Server Event Payloads ──────────────────────────────────────────

class JoinPayload(BaseModel):
	player_id: str
	nickname: str
	preferred_team: TeamId | None = None


class ReadyPayload(BaseModel):
	is_ready: bool


class SwitchTeamPayload(BaseModel):
	team: TeamId


class UpdateConfigPayload(BaseModel):
	config: RoomConfig


class SubmitGuessPayload(BaseModel):
	word: str
	center_letter: str | None = None
	grace_letter: str | None = None


# ── Server -> Client Event Payloads ──────────────────────────────────────────

class RoomStatePayload(BaseModel):
	snapshot: RoomSnapshot


class GameStartPayload(BaseModel):
	snapshot: RoomSnapshot
	center: str
	outer: list[str]
	max_score: int
	duration: int
	target_score: int


class HiveMutationPayload(BaseModel):
	slot_idx: int
	old_letter: str
	new_letter: str
	grace_letter: str
	outer: list[str]


class HiveLockoutPayload(BaseModel):
	phase: str                     # "idle" | "warning" | "locked"
	letter: str | None = None
	duration: int = 0


class GuessResultPayload(BaseModel):
	valid: bool
	word: str
	score: int
	pangram: bool
	message: str
	player_id: str


class OpponentEventPayload(BaseModel):
	player_id: str
	player_name: str
	team_id: TeamId
	message: str
	score_diff: int
	word: str | None = None
	pangram: bool = False


class GameOverPayload(BaseModel):
	winner_team: TeamId | None = None
	winner_player_name: str | None = None
	reason: str
	snapshot: RoomSnapshot
