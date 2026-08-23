"""
Unit tests for Room Manager and Room lifecycle.
"""

import pytest

from app.engine.room_manager import RoomManager
from app.models.room import RoomStatus, TeamId


@pytest.fixture
def manager():
	return RoomManager()


def test_create_room(manager):
	room, host = manager.create_room("host_123", "Alice")
	assert room.code.startswith("BEE-")
	assert host.id == "host_123"
	assert host.nickname == "Alice"
	assert host.is_host is True
	assert host.team == TeamId.TEAM_A
	assert room.status == RoomStatus.LOBBY


def test_join_and_team_assignment(manager):
	room, _ = manager.create_room("p1", "Alice")
	# Bob joins - should auto-balance to Team B
	_, bob = manager.join_room(room.code, "p2", "Bob")
	assert bob.id == "p2"
	assert bob.team == TeamId.TEAM_B

	# Charlie joins with preferred team
	_, charlie = manager.join_room(room.code, "p3", "Charlie", TeamId.TEAM_A)
	assert charlie.team == TeamId.TEAM_A

	assert len(room.players) == 3


def test_player_ready_and_team_switch(manager):
	room, _ = manager.create_room("p1", "Alice")
	_, bob = manager.join_room(room.code, "p2", "Bob")

	room.set_ready("p2", True)
	assert room.players["p2"].is_ready is True

	room.switch_team("p2", TeamId.TEAM_A)
	assert room.players["p2"].team == TeamId.TEAM_A


def test_leave_room_and_cleanup(manager):
	room, _ = manager.create_room("p1", "Alice")
	manager.join_room(room.code, "p2", "Bob")

	# P1 (host) leaves -> P2 should become host
	manager.leave_room(room.code, "p1")
	assert len(room.players) == 1
	assert room.players["p2"].is_host is True
	assert room.host_id == "p2"

	# P2 leaves -> room is deleted from manager
	manager.leave_room(room.code, "p2")
	assert manager.get_room(room.code) is None


def test_room_snapshot_includes_host_id(manager):
	room, host = manager.create_room("host_123", "Alice")
	snapshot = room.get_snapshot()
	assert snapshot.host_id == "host_123"
	assert snapshot.code == room.code


def test_update_config_variants(manager):
	from app.models.room import GameVariant, RoomConfig

	room, _ = manager.create_room("host_123", "Alice")
	# Update to classic variant
	classic_cfg = RoomConfig(variant=GameVariant.CLASSIC)
	room.update_config(classic_cfg)
	assert room.config.mutations_enabled is False
	assert room.config.lockouts_enabled is False

	# Update to dynamic variant
	dynamic_cfg = RoomConfig(variant=GameVariant.DYNAMIC)
	room.update_config(dynamic_cfg)
	assert room.config.mutations_enabled is True
	assert room.config.lockouts_enabled is True
