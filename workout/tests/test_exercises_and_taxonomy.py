from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
	app = create_app(data_dir=tmp_path)
	return TestClient(app)


def test_seed_exercises_loaded(client: TestClient):
	res = client.get("/api/exercises", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	exercises = res.json()
	assert len(exercises) == 16

	# Check category & discipline coverage
	names = [e["name"] for e in exercises]
	assert "Standard Pushups" in names
	assert "Diamond Pushups" in names
	assert "Star Jumps" in names
	assert "Coordination Footwork Drills" in names
	assert "Check Repeats (Lead & Rear Block)" in names
	assert "Jab-Cross Combo" in names
	assert "Cobra Pose & Hip Opener" in names

	# Test category filter
	res_stretch = client.get("/api/exercises?category=stretch", headers={"X-User-Id": "levon"})
	assert res_stretch.status_code == 200
	stretch_list = res_stretch.json()
	assert all(e["category"] == "stretch" for e in stretch_list)
	assert any(e["name"] == "Cobra Pose & Hip Opener" for e in stretch_list)

	# Test discipline filter
	res_mt = client.get("/api/exercises?discipline=muay_thai", headers={"X-User-Id": "levon"})
	assert res_mt.status_code == 200
	mt_list = res_mt.json()
	assert all(e["discipline"] == "muay_thai" for e in mt_list)


def test_create_and_delete_custom_exercise(client: TestClient):
	# Create custom exercise for levon
	payload = {
		"name": "Muay Thai Low Kick Drill",
		"category": "drill",
		"discipline": "muay_thai",
		"default_mode": "reps",
		"default_quantity": 40,
		"description": "Heavy bag low kick repetition power drill.",
	}
	res = client.post("/api/exercises", json=payload, headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	created = res.json()
	assert created["name"] == "Muay Thai Low Kick Drill"
	assert created["category"] == "drill"
	assert created["discipline"] == "muay_thai"
	assert created["default_mode"] == "reps"
	assert created["default_quantity"] == 40
	ex_id = created["id"]

	# Verify it appears in user list
	res_list = client.get("/api/exercises?discipline=muay_thai", headers={"X-User-Id": "levon"})
	assert any(e["id"] == ex_id for e in res_list.json())

	# Delete custom exercise
	res_del = client.delete(f"/api/exercises/{ex_id}", headers={"X-User-Id": "levon"})
	assert res_del.status_code == 200

	# Verify deleted
	res_list2 = client.get("/api/exercises", headers={"X-User-Id": "levon"})
	assert not any(e["id"] == ex_id for e in res_list2.json())


def test_routine_with_reps_and_multiple_exercises(client: TestClient):
	routine_data = [
		{
			"id": "r-mt-circuit",
			"title": "Muay Thai Power & Push-up Circuit",
			"steps": [
				{
					"id": "step-1",
					"type": "timer",
					"stepMode": "reps",
					"targetReps": 25,
					"label": "Push-ups & Teeps",
					"exercises": [
						{
							"id": "ex-pushups",
							"name": "Push-ups",
							"category": "strength",
							"discipline": "calisthenics",
						},
						{
							"id": "ex-mt-teep",
							"name": "Teep / Front Push Kick",
							"category": "drill",
							"discipline": "muay_thai",
						},
					],
				},
				{
					"id": "step-2",
					"type": "timer",
					"stepMode": "time",
					"durationSeconds": 60,
					"label": "Cobra Stretch",
					"exercises": [
						{
							"id": "ex-cobra-stretch",
							"name": "Cobra Stretch",
							"category": "stretch",
							"discipline": "yoga",
						},
					],
				},
			],
			"musicTracks": [],
		}
	]

	# Save routine
	res_save = client.post("/api/routines", json=routine_data, headers={"X-User-Id": "levon"})
	assert res_save.status_code == 200

	# Fetch routine back
	res_get = client.get("/api/routines", headers={"X-User-Id": "levon"})
	assert res_get.status_code == 200
	saved_routine = res_get.json()[0]
	assert len(saved_routine["steps"]) == 2
	assert saved_routine["steps"][0]["stepMode"] == "reps"
	assert saved_routine["steps"][0]["targetReps"] == 25
	assert len(saved_routine["steps"][0]["exercises"]) == 2


def test_preview_session_does_not_pollute_stats(client: TestClient):
	# Record a preview session (e.g. testing an individual row)
	preview_payload = {
		"id": "preview-001",
		"routine_id": "r-preview",
		"routine_title": "Test Row Preview",
		"started_at": datetime.now().isoformat(),
		"completed_at": datetime.now().isoformat(),
		"duration_seconds": 45,
		"status": "completed",
		"is_preview": True,
	}
	client.post("/api/sessions", json=preview_payload, headers={"X-User-Id": "levon"})

	# Preview session should NOT appear in get_sessions or count toward stats
	sessions_res = client.get("/api/sessions", headers={"X-User-Id": "levon"})
	assert len(sessions_res.json()) == 0

	stats_res = client.get("/api/stats", headers={"X-User-Id": "levon"})
	stats = stats_res.json()
	assert stats["total_sessions"] == 0
	assert stats["total_minutes"] == 0
	assert stats["current_streak"] == 0


def test_stats_category_and_discipline_breakdown(client: TestClient):
	# Save a routine with tagged exercises
	routine_id = "r-combo"
	routine_data = [
		{
			"id": routine_id,
			"title": "Muay Thai & Strength Blast",
			"steps": [
				{
					"id": "s-1",
					"type": "timer",
					"stepMode": "reps",
					"targetReps": 30,
					"durationSeconds": 60,
					"label": "Push-ups",
					"exercises": [
						{
							"id": "ex-pushups",
							"name": "Push-ups",
							"category": "strength",
							"discipline": "calisthenics",
						}
					],
				},
				{
					"id": "s-2",
					"type": "timer",
					"stepMode": "reps",
					"targetReps": 40,
					"durationSeconds": 120,
					"label": "Teep Drill",
					"exercises": [
						{
							"id": "ex-mt-teep",
							"name": "Teep / Front Push Kick",
							"category": "drill",
							"discipline": "muay_thai",
						}
					],
				},
				{
					"id": "s-3",
					"type": "timer",
					"stepMode": "time",
					"durationSeconds": 60,
					"label": "Cobra Stretch",
					"exercises": [
						{
							"id": "ex-cobra-stretch",
							"name": "Cobra Stretch",
							"category": "stretch",
							"discipline": "yoga",
						}
					],
				},
			],
			"musicTracks": [],
		}
	]
	client.post("/api/routines", json=routine_data, headers={"X-User-Id": "levon"})

	# Complete a session for this routine (4 minutes total = 240s)
	sess_payload = {
		"id": "sess-completed-1",
		"routine_id": routine_id,
		"routine_title": "Muay Thai & Strength Blast",
		"started_at": datetime.now().isoformat(),
		"completed_at": datetime.now().isoformat(),
		"duration_seconds": 240,
		"completed_steps": 3,
		"total_steps": 3,
		"status": "completed",
		"is_preview": False,
	}
	client.post("/api/sessions", json=sess_payload, headers={"X-User-Id": "levon"})

	# Fetch stats and verify exercise taxonomy breakdown
	stats_res = client.get("/api/stats", headers={"X-User-Id": "levon"})
	assert stats_res.status_code == 200
	stats = stats_res.json()

	assert stats["total_sessions"] == 1
	assert stats["total_reps"] == 70  # 30 push-ups + 40 teeps
	assert stats["categories"]["strength"]["reps"] == 30
	assert stats["categories"]["drill"]["reps"] == 40
	assert stats["disciplines"]["muay_thai"]["reps"] == 40
	assert stats["disciplines"]["calisthenics"]["reps"] == 30
	assert len(stats["top_exercises"]) >= 3


def test_exercise_multi_media_assets(client: TestClient):
	# Test default seed exercises have media assets categorized into instruction, demonstration, animation
	res = client.get("/api/exercises", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	exercises = res.json()
	pushups = next(e for e in exercises if e["id"] == "ex-standard-pushups")
	assert len(pushups["media_assets"]) >= 1

	cobra = next(e for e in exercises if e["id"] == "ex-cobra-pose")
	assert len(cobra["media_assets"]) >= 2
	cobra_kinds = [a["kind"] for a in cobra["media_assets"]]
	assert "photo" in cobra_kinds
	assert "animation" in cobra_kinds

	# Create a custom exercise with multiple categorized media assets
	payload = {
		"name": "Muay Thai Switch Kick",
		"category": "technique",
		"discipline": "muay_thai",
		"default_mode": "reps",
		"default_quantity": 20,
		"description": "Explosive switch kick for lead leg speed.",
		"media_assets": [
			{
				"id": "asset-switch-inst",
				"kind": "instruction",
				"type": "video",
				"title": "Footwork Switch & Hip Mechanics",
				"videoId": "eK2x8dJ_z38",
				"startSeconds": 15,
				"endSeconds": 75,
			},
			{
				"id": "asset-switch-demo",
				"kind": "demonstration",
				"type": "video",
				"title": "Heavy Bag Switch Kick Power Sets",
				"videoId": "eK2x8dJ_z38",
				"startSeconds": 75,
				"endSeconds": 135,
			},
			{
				"id": "asset-switch-photo",
				"kind": "photo",
				"type": "image",
				"title": "Switch Kick Stance Photo",
				"url": "/workout/media/switch-kick.jpg",
			},
		],
	}
	create_res = client.post("/api/exercises", json=payload, headers={"X-User-Id": "levon"})
	assert create_res.status_code == 200
	created = create_res.json()
	assert len(created["media_assets"]) == 3
	assert created["media_assets"][0]["kind"] == "instruction"
	assert created["media_assets"][1]["kind"] == "demonstration"
	assert created["media_assets"][2]["kind"] == "photo"


def test_combos_api_and_seeding(client: TestClient):
	# Test default seed combos
	res = client.get("/api/combos", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	combos = res.json()
	assert len(combos) == 4

	names = [c["name"] for c in combos]
	assert "Star Jumps ⮀ Coordination Drills" in names
	assert "Lateral Jumps ⮀ Plank Shoulder Taps" in names
	assert "Jab + Rear Knee / Switch Knee" in names
	assert "Jab + Lead Elbow + Rear Elbow" in names

	# Check alternating flow
	star_combo = next(c for c in combos if c["id"] == "combo-star-jumps-coord")
	assert star_combo["flow_type"] == "alternating"
	assert "ex-star-jumps" in star_combo["exercise_ids"]
	assert "ex-coordination-drills" in star_combo["exercise_ids"]
	assert len(star_combo["media_assets"]) >= 1

	# Create a custom combo
	payload = {
		"name": "Muay Thai Teep + Switch Kick Combo",
		"category": "technique",
		"discipline": "muay_thai",
		"flow_type": "sequence",
		"exercise_ids": ["ex-check-repeats", "ex-knee-strike"],
		"default_mode": "time",
		"default_quantity": 180,
		"description": "Lead teep setup flowing directly into rear switch kick.",
	}
	create_res = client.post("/api/combos", json=payload, headers={"X-User-Id": "levon"})
	assert create_res.status_code == 200
	created = create_res.json()
	assert created["name"] == "Muay Thai Teep + Switch Kick Combo"
	assert created["flow_type"] == "sequence"
	combo_id = created["id"]

	# Verify in user list
	res_list = client.get("/api/combos?discipline=muay_thai", headers={"X-User-Id": "levon"})
	assert any(c["id"] == combo_id for c in res_list.json())

	# Delete custom combo
	del_res = client.delete(f"/api/combos/{combo_id}", headers={"X-User-Id": "levon"})
	assert del_res.status_code == 200

	# Verify deleted
	res_list2 = client.get("/api/combos", headers={"X-User-Id": "levon"})
	assert not any(c["id"] == combo_id for c in res_list2.json())
