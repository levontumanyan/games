"""
End-to-End multi-client automated validation for Spelling Bee 1v1 Multiplayer.
Tests room creation, dual-route subpath WebSocket joining, synchronized puzzle start,
real-time opponent guessing events, center changes, and rematch flows.
"""

from fastapi.testclient import TestClient

from app.engine.room_manager import room_manager
from app.main import app
from app.models.room import GameMode, WordClaimMode


def test_full_1v1_multiplayer_duel_lifecycle():
	client = TestClient(app)

	# 1. Host creates a 1v1 room
	res = client.post(
		"/api/rooms",
		json={
			"host_id": "alice_id",
			"host_name": "Alice",
			"config": {
				"mode": GameMode.DUEL_1V1.value,
				"duration_seconds": 300,
			},
		},
	)
	assert res.status_code == 200
	room_data = res.json()
	code = room_data["code"]
	assert code.startswith("BEE-")

	# 2. Connect Alice (Host) via WebSocket (testing standard route)
	with client.websocket_connect(f"/ws/room/{code}?player_id=alice_id") as ws_alice:
		alice_init = ws_alice.receive_json()
		assert alice_init["type"] == "room_state"
		assert alice_init["payload"]["snapshot"]["host_id"] == "alice_id"
		assert alice_init["payload"]["snapshot"]["players"][0]["is_host"] is True

		# Alice updates config
		ws_alice.send_json(
			{
				"type": "update_config",
				"payload": {
					"config": {
						"mode": GameMode.DUEL_1V1.value,
						"duration_seconds": 180,
						"variant": "classic",
					}
				},
			}
		)
		cfg_update = ws_alice.receive_json()
		assert cfg_update["type"] == "room_state"
		assert cfg_update["payload"]["snapshot"]["config"]["duration_seconds"] == 180

		# 3. Connect Bob (Guest) via WebSocket (testing /spelling/ subpath proxy route)
		with client.websocket_connect(f"/spelling/ws/room/{code}?player_id=bob_id") as ws_bob:
			bob_init = ws_bob.receive_json()
			assert bob_init["type"] == "room_state"
			assert bob_init["payload"]["snapshot"]["host_id"] == "alice_id"

			# Bob sends join payload with his nickname
			ws_bob.send_json(
				{
					"type": "join",
					"payload": {"nickname": "Bob"},
				}
			)

			# Both Alice and Bob should receive the updated room_state
			alice_room_update = ws_alice.receive_json()
			bob_room_update = ws_bob.receive_json()

			assert alice_room_update["type"] == "room_state"
			assert bob_room_update["type"] == "room_state"

			players = alice_room_update["payload"]["snapshot"]["players"]
			assert len(players) == 2
			p_alice = next(p for p in players if p["id"] == "alice_id")
			p_bob = next(p for p in players if p["id"] == "bob_id")

			assert p_alice["nickname"] == "Alice"
			assert p_alice["is_host"] is True
			assert p_bob["nickname"] == "Bob"
			assert p_bob["is_host"] is False
			assert p_bob["is_ready"] is False

			# Guest attempts to start game (should be ignored)
			ws_bob.send_json({"type": "start_game", "payload": {}})

			# Bob toggles ready
			ws_bob.send_json({"type": "set_ready", "payload": {"is_ready": True}})
			alice_ready_update = ws_alice.receive_json()
			bob_ready_update = ws_bob.receive_json()
			assert alice_ready_update["payload"]["snapshot"]["players"][1]["is_ready"] is True
			assert bob_ready_update["payload"]["snapshot"]["players"][1]["is_ready"] is True

			# 4. Alice (Host) starts the match
			ws_alice.send_json({"type": "start_game", "payload": {}})

			start_alice = ws_alice.receive_json()
			start_bob = ws_bob.receive_json()

			assert start_alice["type"] == "game_start"
			assert start_bob["type"] == "game_start"

			# Verify synchronized puzzle on both screens
			center = start_alice["payload"]["center"]
			outer = start_alice["payload"]["outer"]
			assert start_bob["payload"]["center"] == center
			assert start_bob["payload"]["outer"] == outer
			assert start_alice["payload"]["duration"] == 180

			# 5. Word Guessing & Real-time Opponent Events
			# Inject a known valid word for testing
			active_room = room_manager.get_room(code)
			assert active_room is not None
			assert active_room.session is not None

			active_session = active_room.session
			active_session.center = "a"
			active_session.outer = ["b", "c", "d", "e", "f", "g"]
			active_session.puzzle["valid_words"] = ["bead", "badge", "cafe", "deaf"]

			# Alice submits valid word "bead"
			ws_alice.send_json(
				{
					"type": "submit_guess",
					"payload": {"word": "bead", "center_letter": "a"},
				}
			)

			# Alice receives guess_result
			alice_guess_res = ws_alice.receive_json()
			assert alice_guess_res["type"] == "guess_result"
			assert alice_guess_res["payload"]["valid"] is True
			assert alice_guess_res["payload"]["word"] == "bead"

			# Bob receives opponent_event & score_update
			bob_opp_event = ws_bob.receive_json()
			assert bob_opp_event["type"] == "opponent_event"
			assert "Alice found a 4-letter word" in bob_opp_event["payload"]["message"]
			assert bob_opp_event["payload"]["word"] is None

			bob_score_update = ws_bob.receive_json()
			alice_score_update = ws_alice.receive_json()
			assert bob_score_update["type"] == "score_update"
			assert alice_score_update["type"] == "score_update"
			assert bob_score_update["payload"]["players"][0]["words"] == []

			# 6. Center Swap Penalty
			# Alice gives herself 10 points and swaps center
			active_room.players["alice_id"].score = 10
			ws_alice.send_json({"type": "change_center", "payload": {}})

			alice_center_res = ws_alice.receive_json()
			assert alice_center_res["type"] == "center_changed"
			assert alice_center_res["payload"]["score"] == 5

			bob_swap_event = ws_bob.receive_json()
			assert bob_swap_event["type"] == "opponent_event"
			assert "swapped center" in bob_swap_event["payload"]["message"]

			alice_swap_score = ws_alice.receive_json()
			bob_swap_score = ws_bob.receive_json()
			assert alice_swap_score["type"] == "score_update"
			assert bob_swap_score["type"] == "score_update"

			# 7. Rematch Flow
			# Trigger game over then rematch
			active_room.status = active_room.status.__class__.GAME_OVER
			ws_alice.send_json({"type": "rematch", "payload": {}})

			alice_rematch_state = ws_alice.receive_json()
			bob_rematch_state = ws_bob.receive_json()

			assert alice_rematch_state["type"] == "room_state"
			assert bob_rematch_state["type"] == "room_state"
			assert alice_rematch_state["payload"]["snapshot"]["status"] == "lobby"


def test_snatch_mode_reveals_word_in_opponent_event():
	client = TestClient(app)

	res = client.post(
		"/api/rooms",
		json={
			"host_id": "alice_id",
			"host_name": "Alice",
			"config": {
				"mode": GameMode.DUEL_1V1.value,
				"word_claim_mode": WordClaimMode.SNATCH.value,
				"duration_seconds": 180,
			},
		},
	)
	assert res.status_code == 200
	code = res.json()["code"]

	with client.websocket_connect(f"/ws/room/{code}?player_id=alice_id") as ws_alice:
		ws_alice.receive_json()  # room_state

		with client.websocket_connect(f"/ws/room/{code}?player_id=bob_id") as ws_bob:
			ws_bob.receive_json()  # room_state
			ws_bob.send_json({"type": "join", "payload": {"nickname": "Bob"}})
			ws_alice.receive_json()
			ws_bob.receive_json()

			ws_bob.send_json({"type": "set_ready", "payload": {"is_ready": True}})
			ws_alice.receive_json()
			ws_bob.receive_json()

			ws_alice.send_json({"type": "start_game", "payload": {}})
			ws_alice.receive_json()  # game_start
			ws_bob.receive_json()  # game_start

			active_room = room_manager.get_room(code)
			assert active_room is not None
			assert active_room.session is not None
			active_session = active_room.session
			active_session.center = "a"
			active_session.outer = ["b", "c", "d", "e", "f", "g"]
			active_session.puzzle["valid_words"] = ["bead"]

			# Alice submits valid word "bead" in snatch mode
			ws_alice.send_json(
				{
					"type": "submit_guess",
					"payload": {"word": "bead", "center_letter": "a"},
				}
			)

			alice_guess_res = ws_alice.receive_json()
			assert alice_guess_res["type"] == "guess_result"
			assert alice_guess_res["payload"]["valid"] is True

			# Bob receives opponent_event containing the snatched word
			bob_opp_event = ws_bob.receive_json()
			assert bob_opp_event["type"] == "opponent_event"
			assert "Alice snatched BEAD" in bob_opp_event["payload"]["message"]
			assert bob_opp_event["payload"]["word"] == "bead"

			bob_score_update = ws_bob.receive_json()
			alice_score_update = ws_alice.receive_json()
			assert bob_score_update["type"] == "score_update"
			assert alice_score_update["type"] == "score_update"
			assert bob_score_update["payload"]["players"][0]["words"][0]["word"] == "bead"
