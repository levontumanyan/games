"""
Unit tests for Game Rules and Variants.
"""

import pytest

from app.engine.game_session import GameSession
from app.engine.room_manager import Room
from app.models.room import (
	FoundWord,
	GameMode,
	GameVariant,
	RoomConfig,
	TeamId,
	WordClaimMode,
)


@pytest.fixture
def mock_room():
	config = RoomConfig(
		mode=GameMode.DUEL_1V1,
		variant=GameVariant.DYNAMIC,
		word_claim_mode=WordClaimMode.INDEPENDENT,
		duration_seconds=180,
	)
	room = Room(code="TEST-1", host_id="p1", host_name="Alice", config=config)
	room.add_player("p2", "Bob", TeamId.TEAM_B)
	return room


def test_rule_independent_word_claims(mock_room):
	session = GameSession(mock_room, mock_room.config)
	# Force a known puzzle setup
	session.center = "a"
	session.outer = ["b", "c", "d", "e", "f", "g"]
	session.puzzle["valid_words"] = ["bead", "cafe", "deaf", "badge", "bagged"]

	p1 = mock_room.players["p1"]
	p2 = mock_room.players["p2"]

	# Both players should be able to claim "bead" in independent mode
	valid1, msg1, pts1, _ = session.rules.validate_guess(session, p1, "bead")
	assert valid1 is True
	assert pts1 == 1

	found1 = FoundWord(
		word="bead",
		score=pts1,
		pangram=False,
		player_id=p1.id,
		player_name=p1.nickname,
		team_id=p1.team,
		timestamp=0,
	)
	session.rules.on_valid_word(session, p1, found1)
	assert p1.score == 1

	# P1 cannot claim "bead" twice
	valid1_dup, msg1_dup, _, _ = session.rules.validate_guess(session, p1, "bead")
	assert valid1_dup is False
	assert "Already found" in msg1_dup

	# P2 CAN claim "bead" in independent mode
	valid2, _, pts2, _ = session.rules.validate_guess(session, p2, "bead")
	assert valid2 is True
	assert pts2 == 1


def test_rule_snatch_word_claims(mock_room):
	mock_room.config.word_claim_mode = WordClaimMode.SNATCH
	session = GameSession(mock_room, mock_room.config)
	session.center = "a"
	session.outer = ["b", "c", "d", "e", "f", "g"]

	p1 = mock_room.players["p1"]
	p2 = mock_room.players["p2"]

	valid1, _, pts1, _ = session.rules.validate_guess(session, p1, "bead")
	assert valid1 is True

	found1 = FoundWord(
		word="bead",
		score=pts1,
		pangram=False,
		player_id=p1.id,
		player_name=p1.nickname,
		team_id=p1.team,
		timestamp=0,
	)
	session.rules.on_valid_word(session, p1, found1)

	# In snatch mode, P2 cannot claim "bead" after P1 snatched it
	valid2, msg2, _, _ = session.rules.validate_guess(session, p2, "bead")
	assert valid2 is False
	assert "Already snatched by Alice" in msg2


def test_rule_locked_letter(mock_room):
	session = GameSession(mock_room, mock_room.config)
	session.center = "a"
	session.outer = ["b", "c", "d", "e", "f", "g"]
	session.locked_letter = "b"

	p1 = mock_room.players["p1"]

	valid, msg, _, _ = session.rules.validate_guess(session, p1, "bead")
	assert valid is False
	assert "locked" in msg.lower()


def test_team_score_aggregation():
	config = RoomConfig(mode=GameMode.TEAM_2V2)
	room = Room(code="TEAM-1", host_id="p1", host_name="Alice", config=config)
	room.add_player("p2", "Bob", TeamId.TEAM_A)
	room.add_player("p3", "Charlie", TeamId.TEAM_B)
	room.add_player("p4", "Diana", TeamId.TEAM_B)

	session = GameSession(room, config)
	room.players["p1"].score = 10
	room.players["p2"].score = 15
	room.players["p3"].score = 8
	room.players["p4"].score = 12

	scores = session.rules.calculate_team_scores(session)
	assert scores[TeamId.TEAM_A.value] == 25
	assert scores[TeamId.TEAM_B.value] == 20
