"""
Active game session runner for multiplayer matches.
Handles authoritative ticks, synchronized mutations, lockout state machine,
and guess validation broadcasts.
"""

import asyncio
import logging
import random
import time
from typing import TYPE_CHECKING

from app.engine.rules_engine import ALL_MUTATE_LETTERS, VOWELS, get_rule_strategy
from app.engine.ws_manager import ws_manager
from app.models.events import (
	GameOverPayload,
	GuessResultPayload,
	HiveLockoutPayload,
	HiveMutationPayload,
	OpponentEventPayload,
)
from app.models.room import FoundWord, RoomConfig, RoomSnapshot, RoomStatus, TeamId
from app.puzzle import generate_puzzle

if TYPE_CHECKING:
	from app.engine.room_manager import Room

logger = logging.getLogger(__name__)

MUTATE_INTERVAL = 20
LOCKOUT_INTERVAL_BASE = 25
LOCKOUT_INTERVAL_JITTER = 3
LOCKOUT_WARN_DURATION = 2
LOCKOUT_LOCK_DURATION = 10


def _get_next_lockout_delay() -> int:
	return (
		LOCKOUT_INTERVAL_BASE
		+ random.randint(-LOCKOUT_INTERVAL_JITTER, LOCKOUT_INTERVAL_JITTER)
	)


class GameSession:
	def __init__(self, room: "Room", config: RoomConfig):
		self.room = room
		self.room_code = room.code
		self.config = config
		self.players = room.players
		self.rules = get_rule_strategy(config)

		# Generate dedicated puzzle for this session
		self.puzzle = generate_puzzle()
		self.center = self.puzzle["center"]
		self.outer = list(self.puzzle["outer"])
		self.max_score = self.puzzle["max_score"]

		self.grace_letter: str | None = None
		self.time_left = config.duration_seconds
		self.claimed_words: dict[str, str] = {}  # word -> player_name

		# Authoritative Mutation state
		self.mutate_secs_left = MUTATE_INTERVAL

		# Authoritative Lockout state
		self.lockout_phase = "idle"  # "idle" | "warning" | "locked"
		self.lockout_secs_until_next = _get_next_lockout_delay()
		self.lockout_phase_secs_left = 0
		self.lockout_warning_letter: str | None = None
		self.locked_letter: str | None = None

		self._loop_task: asyncio.Task | None = None
		self._is_running = False

	def start(self) -> None:
		self._is_running = True
		# Reset player in-game scores and personal words
		for p in self.players.values():
			p.score = 0
			p.words = []
			p.center_letter = None
			p.grace_letter = None

		self._loop_task = asyncio.create_task(self._session_loop())

	async def stop(self) -> None:
		self._is_running = False
		if self._loop_task and not self._loop_task.done():
			self._loop_task.cancel()
			try:
				await self._loop_task
			except asyncio.CancelledError:
				pass

	def _pick_mutation_letter(self, slot_idx: int) -> str:
		current_letters = [self.center, *self.outer]
		current_set = set(current_letters)
		# Count remaining vowels excluding slot being mutated
		remaining_vowels = len(
			[char for i, char in enumerate(self.outer) if i != slot_idx and char in VOWELS]
		) + (1 if self.center in VOWELS else 0)

		available = [char for char in ALL_MUTATE_LETTERS if char not in current_set]
		if remaining_vowels < 2:
			vowel_cands = [char for char in available if char in VOWELS]
			if vowel_cands:
				available = vowel_cands
		elif remaining_vowels >= 3:
			cons_cands = [char for char in available if char not in VOWELS]
			if cons_cands:
				available = cons_cands

		if not available:
			available = [char for char in ALL_MUTATE_LETTERS if char != self.outer[slot_idx]]

		return random.choice(available)

	async def _trigger_mutation(self) -> None:
		if not self.outer:
			return
		slot_idx = random.randint(0, len(self.outer) - 1)
		old_letter = self.outer[slot_idx]

		# If the mutated letter was currently locking/locked, reset lockout
		if self.locked_letter == old_letter or self.lockout_warning_letter == old_letter:
			self.locked_letter = None
			self.lockout_warning_letter = None
			self.lockout_phase = "idle"
			self.lockout_secs_until_next = _get_next_lockout_delay()

		new_letter = self._pick_mutation_letter(slot_idx)
		self.outer[slot_idx] = new_letter
		self.grace_letter = old_letter

		payload = HiveMutationPayload(
			slot_idx=slot_idx,
			old_letter=old_letter,
			new_letter=new_letter,
			grace_letter=old_letter,
			outer=list(self.outer),
		)
		await ws_manager.broadcast(
			self.room_code,
			{"type": "hive_mutation", "payload": payload.model_dump()},
		)

	async def _tick_lockout(self) -> None:
		if self.lockout_phase == "idle":
			self.lockout_secs_until_next -= 1
			if self.lockout_secs_until_next <= 0:
				if not self.outer:
					return
				slot_idx = random.randint(0, len(self.outer) - 1)
				letter = self.outer[slot_idx]
				self.lockout_warning_letter = letter
				self.lockout_phase = "warning"
				self.lockout_phase_secs_left = LOCKOUT_WARN_DURATION

				payload = HiveLockoutPayload(
					phase="warning", letter=letter, duration=LOCKOUT_WARN_DURATION
				)
				await ws_manager.broadcast(
					self.room_code,
					{"type": "hive_lockout", "payload": payload.model_dump()},
				)

		elif self.lockout_phase == "warning":
			self.lockout_phase_secs_left -= 1
			if self.lockout_phase_secs_left <= 0:
				letter = self.lockout_warning_letter
				self.locked_letter = letter
				self.lockout_warning_letter = None
				self.lockout_phase = "locked"
				self.lockout_phase_secs_left = LOCKOUT_LOCK_DURATION

				payload = HiveLockoutPayload(
					phase="locked", letter=letter, duration=LOCKOUT_LOCK_DURATION
				)
				await ws_manager.broadcast(
					self.room_code,
					{"type": "hive_lockout", "payload": payload.model_dump()},
				)

		elif self.lockout_phase == "locked":
			self.lockout_phase_secs_left -= 1
			if self.lockout_phase_secs_left <= 0:
				self.locked_letter = None
				self.lockout_phase = "idle"
				self.lockout_secs_until_next = _get_next_lockout_delay()

				payload = HiveLockoutPayload(phase="idle", letter=None, duration=0)
				await ws_manager.broadcast(
					self.room_code,
					{"type": "hive_lockout", "payload": payload.model_dump()},
				)

	async def _session_loop(self) -> None:
		try:
			while self._is_running:
				await asyncio.sleep(1)

				# Decrement match timer
				if self.config.duration_seconds > 0:
					self.time_left -= 1

				# Dynamic variations: letter mutations & lockouts
				if self.config.mutations_enabled:
					self.mutate_secs_left -= 1
					if self.mutate_secs_left <= 0:
						await self._trigger_mutation()
						self.mutate_secs_left = MUTATE_INTERVAL

				if self.config.lockouts_enabled:
					await self._tick_lockout()

				# Check game end
				is_over, win_team, win_player, reason = self.rules.check_game_over(self)
				if is_over:
					await self.end_game(win_team, win_player, reason)
					break
		except asyncio.CancelledError:
			pass
		except Exception as exc:
			logger.error(f"Error in GameSession loop for {self.room_code}: {exc}", exc_info=True)

	async def handle_guess(
		self,
		player_id: str,
		word: str,
		center_letter: str | None = None,
		grace_letter: str | None = None,
	) -> None:
		player = self.players.get(player_id)
		if not player:
			return

		valid, msg, pts, pangram = self.rules.validate_guess(
			self, player, word, center_letter, grace_letter
		)

		if valid:
			found = FoundWord(
				word=word.lower().strip(),
				score=pts,
				pangram=pangram,
				player_id=player.id,
				player_name=player.nickname,
				team_id=player.team,
				timestamp=time.time(),
			)
			self.rules.on_valid_word(self, player, found)

			# 1. Send personal result to player
			res_payload = GuessResultPayload(
				valid=True,
				word=found.word,
				score=pts,
				pangram=pangram,
				message=msg,
				player_id=player_id,
			)
			await ws_manager.send_personal(
				self.room_code,
				player_id,
				{"type": "guess_result", "payload": res_payload.model_dump()},
			)

			# 2. Broadcast opponent event to others
			opp_payload = OpponentEventPayload(
				player_id=player.id,
				player_name=player.nickname,
				team_id=player.team,
				message=f"{player.nickname} found {found.word.upper()} (+{pts} pts)!",
				score_diff=pts,
				word=found.word,
				pangram=pangram,
			)
			await ws_manager.broadcast(
				self.room_code,
				{"type": "opponent_event", "payload": opp_payload.model_dump()},
				exclude_player_id=player_id,
			)

			# 3. Broadcast updated score and room state
			await self.broadcast_score_update()

			# 4. Check if this guess triggered an instant win (e.g. target score)
			is_over, win_team, win_player, reason = self.rules.check_game_over(self)
			if is_over:
				await self.end_game(win_team, win_player, reason)
		else:
			res_payload = GuessResultPayload(
				valid=False,
				word=word,
				score=0,
				pangram=False,
				message=msg,
				player_id=player_id,
			)
			await ws_manager.send_personal(
				self.room_code,
				player_id,
				{"type": "guess_result", "payload": res_payload.model_dump()},
			)

	async def handle_center_change(self, player_id: str) -> None:
		player = self.players.get(player_id)
		if not player:
			return

		success, new_center, msg = self.rules.on_center_change(self, player)
		if success:
			await ws_manager.send_personal(
				self.room_code,
				player_id,
				{
					"type": "center_changed",
					"payload": {"center": new_center, "message": msg, "score": player.score},
				},
			)
			opp_payload = OpponentEventPayload(
				player_id=player.id,
				player_name=player.nickname,
				team_id=player.team,
				message=f"{player.nickname} swapped center to {new_center.upper()} (−5 pts)",
				score_diff=-5,
			)
			await ws_manager.broadcast(
				self.room_code,
				{"type": "opponent_event", "payload": opp_payload.model_dump()},
				exclude_player_id=player_id,
			)
			await self.broadcast_score_update()
		else:
			await ws_manager.send_personal(
				self.room_code,
				player_id,
				{"type": "error", "payload": {"message": msg}},
			)

	async def broadcast_score_update(self) -> None:
		snapshot = self.get_snapshot()
		await ws_manager.broadcast(
			self.room_code,
			{
				"type": "score_update",
				"payload": {
					"players": [p.model_dump() for p in snapshot.players],
					"team_scores": snapshot.team_scores,
				},
			},
		)

	async def end_game(
		self,
		winner_team: TeamId | None,
		winner_player_name: str | None,
		reason: str,
	) -> None:
		self._is_running = False
		self.room.status = RoomStatus.GAME_OVER

		snapshot = self.get_snapshot()
		payload = GameOverPayload(
			winner_team=winner_team,
			winner_player_name=winner_player_name,
			reason=reason,
			snapshot=snapshot,
		)
		await ws_manager.broadcast(
			self.room_code,
			{"type": "game_over", "payload": payload.model_dump()},
		)

	def get_snapshot(self) -> RoomSnapshot:
		team_scores = self.rules.calculate_team_scores(self)
		return RoomSnapshot(
			code=self.room_code,
			host_id=self.room.host_id,
			status=self.room.status,
			config=self.config,
			players=list(self.players.values()),
			time_left=max(0, self.time_left),
			team_scores=team_scores,
			center_letter=self.center,
			outer_letters=list(self.outer),
			locked_letter=self.locked_letter,
			lockout_warning_letter=self.lockout_warning_letter,
			lockout_phase=self.lockout_phase,
			mutate_secs_left=self.mutate_secs_left,
			max_score=self.max_score,
		)
