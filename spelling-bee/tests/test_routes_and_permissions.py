"""
Integration tests for route subpaths, Cache-Control headers, and host/guest permissions.
"""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app


def test_index_cache_control_headers():
	client = TestClient(app)

	for path in ["/", "/spelling", "/spelling/"]:
		res = client.get(path)
		assert res.status_code == 200
		assert "no-cache" in res.headers.get("Cache-Control", "")
		assert "no-store" in res.headers.get("Cache-Control", "")


def test_subpath_api_parity():
	client = TestClient(app)

	# 1. Puzzle endpoint on both paths
	res1 = client.get("/api/puzzle")
	res2 = client.get("/spelling/api/puzzle")
	assert res1.status_code == 200
	assert res2.status_code == 200
	assert res1.json()["center"] == res2.json()["center"]

	# 2. Rooms endpoint on both paths
	res_r1 = client.post("/api/rooms", json={"host_id": "h1", "host_name": "Host1"})
	res_r2 = client.post("/spelling/api/rooms", json={"host_id": "h2", "host_name": "Host2"})
	assert res_r1.status_code == 200
	assert res_r2.status_code == 200
	assert "code" in res_r1.json()
	assert "code" in res_r2.json()

	# 3. Favicon endpoints
	for fav_path in ["/favicon.svg", "/spelling/favicon.svg", "/favicon.ico", "/spelling/favicon.ico"]:
		res_fav = client.get(fav_path)
		assert res_fav.status_code == 200


def test_subpath_websocket_connect():
	client = TestClient(app)

	res = client.post("/spelling/api/rooms", json={"host_id": "h_sub", "host_name": "HostSub"})
	code = res.json()["code"]

	# Connect via /spelling/ws/room/{code}
	with client.websocket_connect(f"/spelling/ws/room/{code}?player_id=h_sub") as ws:
		msg = ws.receive_json()
		assert msg["type"] == "room_state"
		assert msg["payload"]["snapshot"]["code"] == code
		assert msg["payload"]["snapshot"]["host_id"] == "h_sub"


def test_host_vs_guest_permission_boundaries():
	client = TestClient(app)

	# 1. Create Room
	res = client.post("/api/rooms", json={
		"host_id": "host_user",
		"host_name": "Alice",
		"config": {"mode": "1v1", "duration_seconds": 300},
	})
	code = res.json()["code"]

	with client.websocket_connect(f"/ws/room/{code}?player_id=host_user") as ws_host:
		host_init = ws_host.receive_json()
		assert host_init["payload"]["snapshot"]["host_id"] == "host_user"

		with client.websocket_connect(f"/ws/room/{code}?player_id=guest_user") as ws_guest:
			guest_init = ws_guest.receive_json()
			snapshot = guest_init["payload"]["snapshot"]
			assert snapshot["host_id"] == "host_user"

			# Guest joins
			ws_guest.send_json({"type": "join", "payload": {"nickname": "Bob"}})
			ws_host.receive_json()
			guest_joined = ws_guest.receive_json()
			players = guest_joined["payload"]["snapshot"]["players"]
			host_p = next(p for p in players if p["id"] == "host_user")
			guest_p = next(p for p in players if p["id"] == "guest_user")
			assert host_p["is_host"] is True
			assert guest_p["is_host"] is False

			# Guest attempts to update config -> MUST BE IGNORED
			ws_guest.send_json({
				"type": "update_config",
				"payload": {"config": {"mode": "1v1", "duration_seconds": 600}},
			})
			# Guest attempts to start game -> MUST BE IGNORED
			ws_guest.send_json({"type": "start_game", "payload": {}})

			# Host updates config -> SUCCEEDS
			ws_host.send_json({
				"type": "update_config",
				"payload": {"config": {"mode": "1v1", "duration_seconds": 600}},
			})
			update_host = ws_host.receive_json()
			update_guest = ws_guest.receive_json()
			assert update_host["payload"]["snapshot"]["config"]["duration_seconds"] == 600
			assert update_guest["payload"]["snapshot"]["config"]["duration_seconds"] == 600

			# Host starts game -> SUCCEEDS
			ws_host.send_json({"type": "start_game", "payload": {}})
			start_host = ws_host.receive_json()
			start_guest = ws_guest.receive_json()
			assert start_host["type"] == "game_start"
			assert start_guest["type"] == "game_start"


def test_nonexistent_room_websocket_4004():
	client = TestClient(app)
	with pytest.raises(WebSocketDisconnect) as exc_info:
		with client.websocket_connect("/ws/room/INVALID999?player_id=user1"):
			pass
	assert exc_info.value.code == 4004
