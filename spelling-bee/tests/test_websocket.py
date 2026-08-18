"""
Integration tests for WebSocket game flows.
"""

from fastapi.testclient import TestClient

from app.main import app


def test_rest_create_and_get_room():
	client = TestClient(app)
	res = client.post(
		"/api/rooms",
		json={
			"host_id": "host1",
			"host_name": "Alice",
			"config": {"mode": "1v1", "duration_seconds": 120},
		},
	)
	assert res.status_code == 200
	data = res.json()
	assert "code" in data
	code = data["code"]

	res_get = client.get(f"/api/rooms/{code}")
	assert res_get.status_code == 200
	assert res_get.json()["code"] == code


def test_websocket_duel_flow():
	client = TestClient(app)

	# 1. Create Room via REST
	res = client.post(
		"/api/rooms",
		json={
			"host_id": "host_p1",
			"host_name": "Player 1",
			"config": {"mode": "1v1", "duration_seconds": 180},
		},
	)
	code = res.json()["code"]

	# 2. Connect P1 via WebSocket
	with client.websocket_connect(f"/ws/room/{code}?player_id=host_p1") as ws_p1:
		msg1 = ws_p1.receive_json()
		assert msg1["type"] == "room_state"

		# 3. Connect P2 via WebSocket
		with client.websocket_connect(f"/ws/room/{code}?player_id=p2") as ws_p2:
			msg2_init = ws_p2.receive_json()
			assert msg2_init["type"] == "room_state"

			# P2 sends join message
			ws_p2.send_json({"type": "join", "payload": {"nickname": "Player 2"}})
			p1_join_update = ws_p1.receive_json()
			p2_join_update = ws_p2.receive_json()
			assert p1_join_update["type"] == "room_state"
			assert p2_join_update["type"] == "room_state"

			# P1 starts the game
			ws_p1.send_json({"type": "start_game", "payload": {}})

			start_p1 = ws_p1.receive_json()
			start_p2 = ws_p2.receive_json()
			assert start_p1["type"] == "game_start"
			assert start_p2["type"] == "game_start"
			assert start_p1["payload"]["center"] == start_p2["payload"]["center"]
			assert start_p1["payload"]["outer"] == start_p2["payload"]["outer"]

			# P1 submits an invalid guess
			ws_p1.send_json({
				"type": "submit_guess",
				"payload": {"word": "xyz", "center_letter": start_p1["payload"]["center"]},
			})
			guess_res = ws_p1.receive_json()
			assert guess_res["type"] == "guess_result"
			assert guess_res["payload"]["valid"] is False
