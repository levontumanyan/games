"""
In-memory room registry and lifecycle management.
"""

import random
import time

from app.engine.game_session import GameSession
from app.engine.ws_manager import ws_manager
from app.models.events import GameStartPayload, RoomStatePayload
from app.models.room import (
	GameVariant,
	PlayerState,
	RoomConfig,
	RoomSnapshot,
	RoomStatus,
	TeamId,
)

ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _generate_room_code() -> str:
	prefix = "BEE"
	suffix = "".join(random.choices(ROOM_CODE_CHARS, k=3))
	return f"{prefix}-{suffix}"


class Room:
	def __init__(self, code: str, host_id: str, host_name: str, config: RoomConfig | None = None):
		self.code = code
		self.host_id = host_id
		self.config = config or RoomConfig()
		self.status = RoomStatus.LOBBY
		self.players: dict[str, PlayerState] = {}
		self.session: GameSession | None = None
		self.created_at = time.time()
		self.last_active = time.time()

		# Add host player
		host_player = PlayerState(
			id=host_id,
			nickname=host_name,
			team=TeamId.TEAM_A,
			is_host=True,
			is_ready=True,
			connected=True,
		)
		self.players[host_id] = host_player

	def touch(self) -> None:
		self.last_active = time.time()

	def add_player(
		self, player_id: str, nickname: str, preferred_team: TeamId | None = None
	) -> PlayerState:
		self.touch()
		if player_id in self.players:
			player = self.players[player_id]
			player.nickname = nickname
			player.connected = True
			return player

		# Auto-assign team based on balance
		if preferred_team and preferred_team != TeamId.SPECTATOR:
			assigned_team = preferred_team
		else:
			team_a_count = sum(1 for p in self.players.values() if p.team == TeamId.TEAM_A)
			team_b_count = sum(1 for p in self.players.values() if p.team == TeamId.TEAM_B)
			assigned_team = TeamId.TEAM_B if team_a_count > team_b_count else TeamId.TEAM_A

		player = PlayerState(
			id=player_id,
			nickname=nickname,
			team=assigned_team,
			is_host=(player_id == self.host_id),
			is_ready=False,
			connected=True,
		)
		self.players[player_id] = player
		return player

	def remove_player(self, player_id: str) -> bool:
		self.touch()
		if player_id in self.players:
			del self.players[player_id]
			# If host left, elect new host
			if self.players and player_id == self.host_id:
				new_host = next(iter(self.players.values()))
				new_host.is_host = True
				self.host_id = new_host.id
		return len(self.players) == 0

	def set_ready(self, player_id: str, is_ready: bool) -> None:
		self.touch()
		if player_id in self.players:
			self.players[player_id].is_ready = is_ready

	def switch_team(self, player_id: str, team: TeamId) -> None:
		self.touch()
		if player_id in self.players:
			self.players[player_id].team = team

	def update_config(self, new_config: RoomConfig) -> None:
		self.touch()
		if new_config.variant == GameVariant.CLASSIC:
			new_config.mutations_enabled = False
			new_config.lockouts_enabled = False
		else:
			new_config.mutations_enabled = True
			new_config.lockouts_enabled = True
		self.config = new_config

	async def start_game(self) -> bool:
		self.touch()
		if self.status == RoomStatus.IN_PROGRESS:
			return False

		self.status = RoomStatus.IN_PROGRESS
		if self.session:
			await self.session.stop()

		self.session = GameSession(self, self.config)
		self.session.start()

		snapshot = self.get_snapshot()
		start_payload = GameStartPayload(
			snapshot=snapshot,
			center=self.session.center,
			outer=list(self.session.outer),
			max_score=self.session.max_score,
			duration=self.config.duration_seconds,
			target_score=self.config.target_score,
		)
		await ws_manager.broadcast(
			self.code,
			{"type": "game_start", "payload": start_payload.model_dump()},
		)
		return True

	async def rematch(self) -> None:
		self.touch()
		if self.session:
			await self.session.stop()
			self.session = None

		self.status = RoomStatus.LOBBY
		for p in self.players.values():
			p.score = 0
			p.words = []
			p.is_ready = p.is_host  # Host is ready by default

		await self.broadcast_state()

	async def broadcast_state(self) -> None:
		snapshot = self.get_snapshot()
		payload = RoomStatePayload(snapshot=snapshot)
		await ws_manager.broadcast(
			self.code,
			{"type": "room_state", "payload": payload.model_dump()},
		)

	def get_snapshot(self) -> RoomSnapshot:
		if self.session and self.status == RoomStatus.IN_PROGRESS:
			return self.session.get_snapshot()

		team_scores: dict[str, int] = {
			TeamId.TEAM_A.value: sum(
				p.score for p in self.players.values() if p.team == TeamId.TEAM_A
			),
			TeamId.TEAM_B.value: sum(
				p.score for p in self.players.values() if p.team == TeamId.TEAM_B
			),
		}

		return RoomSnapshot(
			code=self.code,
			host_id=self.host_id,
			status=self.status,
			config=self.config,
			players=list(self.players.values()),
			time_left=self.config.duration_seconds,
			team_scores=team_scores,
		)


class RoomManager:
	def __init__(self):
		self._rooms: dict[str, Room] = {}

	def create_room(
		self, host_id: str, host_name: str, config: RoomConfig | None = None
	) -> tuple[Room, PlayerState]:
		code = _generate_room_code()
		while code in self._rooms:
			code = _generate_room_code()

		room = Room(code=code, host_id=host_id, host_name=host_name, config=config)
		self._rooms[code] = room
		return room, room.players[host_id]

	def get_room(self, code: str) -> Room | None:
		return self._rooms.get(code.upper().strip())

	def join_room(
		self,
		code: str,
		player_id: str,
		nickname: str,
		preferred_team: TeamId | None = None,
	) -> tuple[Room, PlayerState] | None:
		room = self.get_room(code)
		if not room:
			return None

		player = room.add_player(player_id, nickname, preferred_team)
		return room, player

	def leave_room(self, code: str, player_id: str) -> None:
		room = self.get_room(code)
		if not room:
			return

		empty = room.remove_player(player_id)
		if empty:
			if room.session:
				import asyncio

				asyncio.create_task(room.session.stop())
			del self._rooms[room.code]

	def cleanup_inactive_rooms(self, max_idle_seconds: int = 7200) -> int:
		now = time.time()
		to_delete = []
		for code, r in self._rooms.items():
			if now - r.last_active > max_idle_seconds:
				to_delete.append(code)

		for code in to_delete:
			r = self._rooms[code]
			if r.session:
				import asyncio

				asyncio.create_task(r.session.stop())
			del self._rooms[code]
		return len(to_delete)


room_manager = RoomManager()
