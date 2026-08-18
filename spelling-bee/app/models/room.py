"""
Room, player, and configuration data models for multiplayer Spelling Bee.
"""

from enum import Enum

from pydantic import BaseModel, Field


class TeamId(str, Enum):
	TEAM_A = "team_a"
	TEAM_B = "team_b"
	SPECTATOR = "spectator"


class GameMode(str, Enum):
	DUEL_1V1 = "1v1"
	TEAM_2V2 = "2v2"
	FFA = "ffa"


class GameVariant(str, Enum):
	DYNAMIC = "dynamic"
	CLASSIC = "classic"


class WordClaimMode(str, Enum):
	INDEPENDENT = "independent"
	SNATCH = "snatch"


class RoomStatus(str, Enum):
	LOBBY = "lobby"
	STARTING = "starting"
	IN_PROGRESS = "in_progress"
	GAME_OVER = "game_over"


class FoundWord(BaseModel):
	word: str
	score: int
	pangram: bool
	player_id: str
	player_name: str
	team_id: TeamId
	timestamp: float


class PlayerState(BaseModel):
	id: str
	nickname: str
	team: TeamId = TeamId.TEAM_A
	score: int = 0
	words: list[FoundWord] = Field(default_factory=list)
	is_host: bool = False
	is_ready: bool = False
	connected: bool = True
	center_letter: str | None = None
	grace_letter: str | None = None


class RoomConfig(BaseModel):
	mode: GameMode = GameMode.DUEL_1V1
	variant: GameVariant = GameVariant.DYNAMIC
	word_claim_mode: WordClaimMode = WordClaimMode.INDEPENDENT
	duration_seconds: int = 180
	target_score: int = 0
	mutations_enabled: bool = True
	lockouts_enabled: bool = True
	max_players: int = 2


class RoomSnapshot(BaseModel):
	code: str
	status: RoomStatus
	config: RoomConfig
	players: list[PlayerState]
	time_left: int = 0
	team_scores: dict[str, int] = Field(default_factory=dict)
	center_letter: str | None = None
	outer_letters: list[str] = Field(default_factory=list)
	locked_letter: str | None = None
	lockout_warning_letter: str | None = None
	lockout_phase: str = "idle"
	mutate_secs_left: int = 20
	max_score: int = 0
