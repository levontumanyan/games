"""
Pluggable Rule Strategies for different Spelling Bee game modes and variations.
"""

import random
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from app.models.room import FoundWord, GameVariant, PlayerState, RoomConfig, TeamId, WordClaimMode
from app.words import is_pangram, is_valid_word

if TYPE_CHECKING:
	from app.engine.game_session import GameSession

EXCLUDED = {"q", "x", "z"}
VOWELS = {"a", "e", "i", "o", "u"}
ALL_MUTATE_LETTERS = [chr(c) for c in range(ord("a"), ord("z") + 1) if chr(c) not in EXCLUDED]


class GameRuleStrategy(ABC):
	def __init__(self, config: RoomConfig):
		self.config = config

	@abstractmethod
	def validate_guess(
		self,
		session: "GameSession",
		player: PlayerState,
		word: str,
		center_letter: str | None = None,
		grace_letter: str | None = None,
	) -> tuple[bool, str, int, bool]:
		"""
		Validate a guessed word and return (valid, message, points, is_pangram).
		"""
		pass

	@abstractmethod
	def on_valid_word(self, session: "GameSession", player: PlayerState, word_obj: FoundWord) -> None:
		"""Update session state upon a valid guess."""
		pass

	@abstractmethod
	def on_center_change(
		self, session: "GameSession", player: PlayerState
	) -> tuple[bool, str, str]:
		"""Process request to change center letter. Returns (success, new_letter, message)."""
		pass

	@abstractmethod
	def check_game_over(
		self, session: "GameSession"
	) -> tuple[bool, TeamId | None, str | None, str]:
		"""
		Check if game end condition has been reached.
		Returns (is_over, winning_team, winning_player_name, reason).
		"""
		pass

	@abstractmethod
	def calculate_team_scores(self, session: "GameSession") -> dict[str, int]:
		"""Aggregate scores by team."""
		pass


class DynamicDuelRule(GameRuleStrategy):
	"""
	Rule strategy for Dynamic 1v1 and 2v2 matches with letter mutations and lockout penalties.
	"""

	def validate_guess(
		self,
		session: "GameSession",
		player: PlayerState,
		word: str,
		center_letter: str | None = None,
		grace_letter: str | None = None,
	) -> tuple[bool, str, int, bool]:
		clean_word = word.lower().strip()
		if not clean_word:
			return False, "Word cannot be empty", 0, False

		# Center letter priority: player's personal center if set, else session live center
		effective_center = (player.center_letter or center_letter or session.center).lower().strip()

		# Build allowed letters set from live session outer letters + center
		live_letters = set(session.outer) | {effective_center}

		# Remove locked letter if currently locked
		if session.locked_letter:
			live_letters.discard(session.locked_letter)

		allowed_letters = set(live_letters)
		effective_grace = grace_letter or session.grace_letter
		if effective_grace:
			allowed_letters.add(effective_grace.lower().strip())

		# Check if locked letter is used
		if session.locked_letter and session.locked_letter in clean_word:
			return False, f'Letter "{session.locked_letter.upper()}" is currently locked! 🔒', 0, False

		# Check duplicate / snatch claim policies
		if self.config.word_claim_mode == WordClaimMode.SNATCH:
			if clean_word in session.claimed_words:
				claimed_by = session.claimed_words[clean_word]
				return False, f'Already snatched by {claimed_by}!', 0, False
		else:
			if any(w.word == clean_word for w in player.words):
				return False, "Already found!", 0, False

		valid, reason = is_valid_word(clean_word, allowed_letters, effective_center)
		if not valid:
			return False, reason, 0, False

		# Pangram calculation
		pangram = live_letters.issubset(set(clean_word))
		if not pangram and effective_grace:
			if len(set(clean_word) & allowed_letters) >= 7:
				pangram = True

		pts = len(clean_word) if len(clean_word) > 4 else 1
		if pangram:
			pts += 7

		msg = "Pangram! 🌟" if pangram else f"+{pts}"
		return True, msg, pts, pangram

	def on_valid_word(self, session: "GameSession", player: PlayerState, word_obj: FoundWord) -> None:
		player.score += word_obj.score
		player.words.append(word_obj)
		session.claimed_words[word_obj.word] = player.nickname

	def on_center_change(
		self, session: "GameSession", player: PlayerState
	) -> tuple[bool, str, str]:
		if player.score < 5:
			return False, "", "Need at least 5 points to change center letter"

		# Sample a new center letter maintaining vowel balance
		current_letters = set(session.outer) | {session.center}
		outer_vowels = len([char for char in session.outer if char in VOWELS])
		available = [char for char in ALL_MUTATE_LETTERS if char not in current_letters]

		if outer_vowels < 2:
			vowel_cands = [char for char in available if char in VOWELS]
			if vowel_cands:
				available = vowel_cands
		elif outer_vowels >= 3:
			cons_cands = [char for char in available if char not in VOWELS]
			if cons_cands:
				available = cons_cands

		if not available:
			available = [char for char in ALL_MUTATE_LETTERS if char != session.center]

		new_center = random.choice(available)
		player.score = max(0, player.score - 5)
		player.center_letter = new_center
		return True, new_center, f"{new_center.upper()} (−5 pts)"

	def check_game_over(
		self, session: "GameSession"
	) -> tuple[bool, TeamId | None, str | None, str]:
		team_scores = self.calculate_team_scores(session)

		# 1. Target score win condition
		if self.config.target_score > 0:
			for team, score in team_scores.items():
				if score >= self.config.target_score:
					top_player = max(session.players.values(), key=lambda p: p.score, default=None)
					top_name = top_player.nickname if top_player else None
					return True, TeamId(team), top_name, f"Target score of {self.config.target_score} reached!"

		# 2. Time limit expired
		if session.time_left <= 0 and self.config.duration_seconds > 0:
			team_a_score = team_scores.get(TeamId.TEAM_A.value, 0)
			team_b_score = team_scores.get(TeamId.TEAM_B.value, 0)

			if team_a_score > team_b_score:
				winner_team = TeamId.TEAM_A
			elif team_b_score > team_a_score:
				winner_team = TeamId.TEAM_B
			else:
				winner_team = None  # Draw

			top_player = max(session.players.values(), key=lambda p: p.score, default=None)
			top_name = top_player.nickname if top_player and winner_team else None
			reason = "Time expired!" if winner_team else "Time expired! Match ended in a draw!"
			return True, winner_team, top_name, reason

		return False, None, None, ""

	def calculate_team_scores(self, session: "GameSession") -> dict[str, int]:
		scores: dict[str, int] = {
			TeamId.TEAM_A.value: 0,
			TeamId.TEAM_B.value: 0,
		}
		for p in session.players.values():
			team_key = p.team.value
			if team_key in scores:
				scores[team_key] += p.score
			else:
				scores[team_key] = p.score
		return scores


class ClassicRule(DynamicDuelRule):
	"""Classic mode: no mutations, no lockouts, standard NYT rules."""

	def validate_guess(
		self,
		session: "GameSession",
		player: PlayerState,
		word: str,
		center_letter: str | None = None,
		grace_letter: str | None = None,
	) -> tuple[bool, str, int, bool]:
		clean_word = word.lower().strip()
		if not clean_word:
			return False, "Word cannot be empty", 0, False

		if self.config.word_claim_mode == WordClaimMode.SNATCH:
			if clean_word in session.claimed_words:
				claimed_by = session.claimed_words[clean_word]
				return False, f'Already snatched by {claimed_by}!', 0, False
		else:
			if any(w.word == clean_word for w in player.words):
				return False, "Already found!", 0, False

		letters_set = set(session.outer) | {session.center}
		valid, reason = is_valid_word(clean_word, letters_set, session.center)
		if not valid:
			return False, reason, 0, False

		pangram = is_pangram(clean_word, letters_set)
		pts = len(clean_word) if len(clean_word) > 4 else 1
		if pangram:
			pts += 7

		msg = "Pangram! 🌟" if pangram else f"+{pts}"
		return True, msg, pts, pangram


def get_rule_strategy(config: RoomConfig) -> GameRuleStrategy:
	if config.variant == GameVariant.CLASSIC:
		return ClassicRule(config)
	return DynamicDuelRule(config)
