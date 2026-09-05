from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
	app = create_app(data_dir=tmp_path)
	return TestClient(app)


def test_exercises_filtering_and_taxonomy(client: TestClient):
	sample_exercises = [
		{
			"name": "Standard Pushups",
			"category": "strength",
			"discipline": "calisthenics",
			"default_mode": "reps",
			"default_quantity": 20,
			"primary_muscles": ["chest", "triceps"],
			"secondary_muscles": ["shoulders", "abs"],
		},
		{
			"name": "Diamond Pushups",
			"category": "strength",
			"discipline": "calisthenics",
			"default_mode": "reps",
			"default_quantity": 15,
			"primary_muscles": ["triceps", "chest"],
			"secondary_muscles": ["shoulders"],
		},
		{
			"name": "Star Jumps",
			"category": "drill",
			"discipline": "general",
			"default_mode": "time",
			"default_quantity": 45,
			"primary_muscles": ["calves", "quads", "groin"],
			"secondary_muscles": ["shoulders"],
		},
		{
			"name": "Check Repeats (Lead & Rear Block)",
			"category": "technique",
			"discipline": "muay_thai",
			"default_mode": "time",
			"default_quantity": 60,
			"primary_muscles": ["hip_flexors", "obliques", "quads"],
			"secondary_muscles": ["calves"],
		},
		{
			"name": "Cobra Pose & Hip Opener",
			"category": "stretch",
			"discipline": "yoga",
			"default_mode": "time",
			"default_quantity": 45,
			"primary_muscles": ["abs", "hip_flexors"],
			"secondary_muscles": ["groin"],
		},
		{
			"name": "Pigeon Pose Hip Opener",
			"category": "stretch",
			"discipline": "yoga",
			"default_mode": "time",
			"default_quantity": 45,
			"primary_muscles": ["glutes", "groin", "hip_flexors"],
			"secondary_muscles": ["hamstrings"],
		},
	]

	for ex in sample_exercises:
		r = client.post("/api/exercises", json=ex, headers={"X-User-Id": "levon"})
		assert r.status_code == 200

	res = client.get("/api/exercises", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	exercises = res.json()
	assert len(exercises) == len(sample_exercises)

	# Test category filter
	res_stretch = client.get("/api/exercises?category=stretch", headers={"X-User-Id": "levon"})
	assert res_stretch.status_code == 200
	stretch_list = res_stretch.json()
	assert len(stretch_list) == 2
	assert all(e["category"] == "stretch" for e in stretch_list)
	assert any(e["name"] == "Cobra Pose & Hip Opener" for e in stretch_list)

	# Test muscle group presence and filter
	pushup = next(e for e in exercises if e["name"] == "Standard Pushups")
	assert "chest" in pushup.get("primary_muscles", [])
	assert "triceps" in pushup.get("primary_muscles", [])

	res_chest = client.get("/api/exercises?muscle=chest", headers={"X-User-Id": "levon"})
	assert res_chest.status_code == 200
	chest_list = res_chest.json()
	assert any(e["name"] == "Standard Pushups" for e in chest_list)
	assert any(e["name"] == "Diamond Pushups" for e in chest_list)

	# Test groin filter
	res_groin = client.get("/api/exercises?muscle=groin", headers={"X-User-Id": "levon"})
	assert res_groin.status_code == 200
	groin_list = res_groin.json()
	assert any(e["name"] == "Pigeon Pose Hip Opener" for e in groin_list)
	assert any(e["name"] == "Star Jumps" for e in groin_list)

	# Test hip_flexors filter
	res_hip = client.get("/api/exercises?muscle=hip_flexors", headers={"X-User-Id": "levon"})
	assert res_hip.status_code == 200
	hip_list = res_hip.json()
	assert any(e["name"] == "Check Repeats (Lead & Rear Block)" for e in hip_list)


def test_create_and_delete_custom_exercise(client: TestClient):
	# Create custom exercise for levon
	payload = {
		"name": "Muay Thai Low Kick Drill",
		"category": "drill",
		"discipline": "muay_thai",
		"default_mode": "reps",
		"default_quantity": 40,
		"description": "Heavy bag low kick repetition power drill.",
		"primary_muscles": ["quads", "glutes"],
		"secondary_muscles": ["calves", "core"],
	}
	res = client.post("/api/exercises", json=payload, headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	created = res.json()
	assert created["name"] == "Muay Thai Low Kick Drill"
	assert created["category"] == "drill"
	assert created["discipline"] == "muay_thai"
	assert created["default_mode"] == "reps"
	assert created["default_quantity"] == 40
	assert created["primary_muscles"] == ["quads", "glutes"]
	assert created["secondary_muscles"] == ["calves", "core"]
	ex_id = created["id"]

	# Verify it appears in user list
	res_list = client.get("/api/exercises?discipline=muay_thai", headers={"X-User-Id": "levon"})
	assert any(e["id"] == ex_id for e in res_list.json())

	# Verify muscle filter returns custom exercise
	res_quads = client.get("/api/exercises?muscle=quads", headers={"X-User-Id": "levon"})
	assert any(e["id"] == ex_id for e in res_quads.json())

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


def test_combos_api(client: TestClient):
	# Create constituent exercises
	ex1 = client.post(
		"/api/exercises",
		json={"name": "Star Jumps", "category": "drill", "discipline": "general"},
		headers={"X-User-Id": "levon"},
	).json()
	ex2 = client.post(
		"/api/exercises",
		json={"name": "Footwork Drills", "category": "drill", "discipline": "general"},
		headers={"X-User-Id": "levon"},
	).json()

	# Create alternating combo
	combo_payload = {
		"name": "Star Jumps ⮀ Footwork Drills",
		"category": "drill",
		"discipline": "general",
		"flow_type": "alternating",
		"exercise_ids": [ex1["id"], ex2["id"]],
		"default_mode": "time",
		"default_quantity": 190,
		"media_assets": [
			{"id": "asset-1", "kind": "demonstration", "type": "video", "videoId": "ZWZWzRnLpVM"}
		],
	}
	res = client.post("/api/combos", json=combo_payload, headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	created_combo = res.json()
	assert created_combo["name"] == "Star Jumps ⮀ Footwork Drills"
	assert created_combo["flow_type"] == "alternating"
	assert ex1["id"] in created_combo["exercise_ids"]
	assert ex2["id"] in created_combo["exercise_ids"]
	assert len(created_combo["media_assets"]) == 1

	# List combos
	list_res = client.get("/api/combos", headers={"X-User-Id": "levon"})
	assert list_res.status_code == 200
	assert len(list_res.json()) == 1

	# Delete combo
	del_res = client.delete(f"/api/combos/{created_combo['id']}", headers={"X-User-Id": "levon"})
	assert del_res.status_code == 200
	assert len(client.get("/api/combos", headers={"X-User-Id": "levon"}).json()) == 0


def test_exercise_video_removal_and_updates(client: TestClient):
	# Create exercise with a YouTube video URL
	payload = {
		"name": "Muay Thai Teep Drill",
		"category": "technique",
		"discipline": "muay_thai",
		"media_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		"media_assets": [
			{
				"id": "asset-teep-1",
				"kind": "demonstration",
				"type": "video",
				"title": "Teep Tutorial Video",
				"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			},
			{
				"id": "asset-teep-2",
				"kind": "instruction",
				"type": "video",
				"title": "Teep Footwork Breakdown",
				"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			},
		],
	}
	create_res = client.post("/api/exercises", json=payload, headers={"X-User-Id": "levon"})
	assert create_res.status_code == 200
	ex = create_res.json()
	assert len(ex["media_assets"]) == 2
	assert ex["media_url"] == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

	# Remove one video asset
	updated_assets = [a for a in ex["media_assets"] if a["id"] != "asset-teep-1"]
	update_payload = {
		"id": ex["id"],
		"name": "Muay Thai Teep Drill",
		"category": "technique",
		"discipline": "muay_thai",
		"media_url": updated_assets[0]["url"],
		"media_assets": updated_assets,
	}
	update_res = client.post("/api/exercises", json=update_payload, headers={"X-User-Id": "levon"})
	assert update_res.status_code == 200
	updated_ex = update_res.json()
	assert len(updated_ex["media_assets"]) == 1
	assert updated_ex["media_assets"][0]["id"] == "asset-teep-2"

	# Remove all video assets and clear media_url
	clear_payload = {
		"id": ex["id"],
		"name": "Muay Thai Teep Drill",
		"category": "technique",
		"discipline": "muay_thai",
		"media_url": "",
		"media_assets": [],
	}
	clear_res = client.post("/api/exercises", json=clear_payload, headers={"X-User-Id": "levon"})
	assert clear_res.status_code == 200
	cleared_ex = clear_res.json()
	assert cleared_ex["media_url"] == ""
	assert cleared_ex["media_assets"] == []

	# Get exercise by ID directly to verify persistence
	get_res = client.get("/api/exercises", headers={"X-User-Id": "levon"})
	assert get_res.status_code == 200
	found = next(e for e in get_res.json() if e["id"] == ex["id"])
	assert found["media_url"] == ""
	assert found["media_assets"] == []


def test_upload_image_endpoint(client: TestClient):
	# Test uploading a valid PNG image
	file_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
	res = client.post(
		"/api/upload",
		files={"file": ("screenshot.png", file_content, "image/png")},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 200
	data = res.json()
	assert "url" in data
	assert data["url"].startswith("/workout/uploads/img_")
	assert data["url"].endswith(".png")

	# Verify uploaded image is reachable via static endpoint
	fetch_res = client.get(data["url"])
	assert fetch_res.status_code == 200
	assert fetch_res.content == file_content

	# Test invalid file type
	bad_res = client.post(
		"/api/upload",
		files={"file": ("script.sh", b"echo hello", "text/plain")},
		headers={"X-User-Id": "levon"},
	)
	assert bad_res.status_code == 400


def test_exercise_media_kinds_and_roles(client: TestClient):
	# Test creating exercise with all 4 functional media kinds
	payload = {
		"name": "Muay Thai Roundhouse Kick",
		"category": "technique",
		"discipline": "muay_thai",
		"default_mode": "reps",
		"default_quantity": 20,
		"media_assets": [
			{
				"id": "asset-rhk-inst",
				"kind": "instruction",
				"type": "video",
				"title": "Kick Biomechanics & Hip Turn Breakdown",
				"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				"startSeconds": 15,
				"endSeconds": 75,
			},
			{
				"id": "asset-rhk-demo",
				"kind": "demonstration",
				"type": "video",
				"title": "Padwork Continuous Kicking Drill",
				"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				"startSeconds": 120,
				"endSeconds": 180,
			},
			{
				"id": "asset-rhk-anim",
				"kind": "animation",
				"type": "image",
				"title": "Looping Kick Form Visual",
				"url": "/workout/media/pushups.svg",
			},
			{
				"id": "asset-rhk-photo",
				"kind": "photo",
				"type": "image",
				"title": "Hip Elevation & Guard Hand Reference",
				"url": "/workout/media/cobra-stretch.jpg",
			},
		],
		"primary_muscles": ["hip_flexors", "quads", "obliques"],
		"secondary_muscles": ["glutes", "calves"],
	}

	create_res = client.post("/api/exercises", json=payload, headers={"X-User-Id": "levon"})
	assert create_res.status_code == 200
	created = create_res.json()

	assert len(created["media_assets"]) == 4
	kinds = [a["kind"] for a in created["media_assets"]]
	assert "instruction" in kinds
	assert "demonstration" in kinds
	assert "animation" in kinds
	assert "photo" in kinds

	# Query exercise
	get_res = client.get("/api/exercises", headers={"X-User-Id": "levon"})
	assert get_res.status_code == 200
	found = next(e for e in get_res.json() if e["id"] == created["id"])
	assert len(found["media_assets"]) == 4
	instruction_asset = next(a for a in found["media_assets"] if a["kind"] == "instruction")
	demonstration_asset = next(a for a in found["media_assets"] if a["kind"] == "demonstration")
	assert instruction_asset["title"] == "Kick Biomechanics & Hip Turn Breakdown"
	assert demonstration_asset["title"] == "Padwork Continuous Kicking Drill"


def test_update_exercise_description(client: TestClient):
	payload = {
		"name": "Single Leg RDL Balance",
		"category": "mobility",
		"discipline": "general",
		"default_mode": "reps",
		"default_quantity": 12,
		"description": "Initial setup cues and posture check.",
		"primary_muscles": ["hamstrings", "glutes"],
		"secondary_muscles": ["core", "calves"],
	}
	create_res = client.post("/api/exercises", json=payload, headers={"X-User-Id": "levon"})
	assert create_res.status_code == 200
	created = create_res.json()
	assert created["description"] == "Initial setup cues and posture check."

	# Update description
	updated_payload = {
		**created,
		"description": "Hinge at the hips with a flat back, maintaining neutral pelvic alignment and soft knee bend.",
	}
	update_res = client.post("/api/exercises", json=updated_payload, headers={"X-User-Id": "levon"})
	assert update_res.status_code == 200
	updated = update_res.json()
	assert (
		updated["description"]
		== "Hinge at the hips with a flat back, maintaining neutral pelvic alignment and soft knee bend."
	)

	# Verify via GET /api/exercises
	get_res = client.get("/api/exercises", headers={"X-User-Id": "levon"})
	assert get_res.status_code == 200
	found = next(e for e in get_res.json() if e["id"] == created["id"])
	assert (
		found["description"]
		== "Hinge at the hips with a flat back, maintaining neutral pelvic alignment and soft knee bend."
	)


def test_combo_update_cascades_to_routines(client: TestClient):
	# 1. Create two exercises
	e1 = client.post(
		"/api/exercises",
		json={
			"name": "Cascade Pushup A",
			"category": "strength",
			"discipline": "calisthenics",
			"default_mode": "reps",
			"default_quantity": 10,
			"primary_muscles": ["chest"],
			"secondary_muscles": ["triceps"],
		},
		headers={"X-User-Id": "levon"},
	).json()

	e2 = client.post(
		"/api/exercises",
		json={
			"name": "Cascade Pushup B (Diamond)",
			"category": "strength",
			"discipline": "calisthenics",
			"default_mode": "reps",
			"default_quantity": 10,
			"primary_muscles": ["triceps"],
			"secondary_muscles": ["chest"],
		},
		headers={"X-User-Id": "levon"},
	).json()

	# 2. Create combo with [e1, e2]
	combo = client.post(
		"/api/combos",
		json={
			"name": "Test Cascade Combo",
			"category": "strength",
			"discipline": "calisthenics",
			"flow_type": "superset",
			"exercise_ids": [e1["id"], e2["id"]],
			"default_mode": "reps",
			"default_quantity": 20,
		},
		headers={"X-User-Id": "levon"},
	).json()

	assert combo["exercise_ids"] == [e1["id"], e2["id"]]

	# 3. Create a routine that includes this combo as a step
	routine_id = "test-cascade-routine"
	routine_payload = {
		"id": routine_id,
		"title": "Cascade Test Routine",
		"steps": [
			{
				"id": "step-combo-1",
				"type": "timer",
				"stepMode": "reps",
				"targetReps": 20,
				"combo_id": combo["id"],
				"label": "Test Cascade Combo",
				"flow_type": "superset",
				"exercises": [{"id": e1["id"]}, {"id": e2["id"]}],
			}
		],
		"musicTracks": [],
	}
	save_res = client.put(
		f"/api/routines/{routine_id}",
		json=routine_payload,
		headers={"X-User-Id": "levon"},
	)
	assert save_res.status_code == 200

	# 4. Create exercise 3
	e3 = client.post(
		"/api/exercises",
		json={
			"name": "Cascade Pushup C (Close-Grip)",
			"category": "strength",
			"discipline": "calisthenics",
			"default_mode": "reps",
			"default_quantity": 10,
			"primary_muscles": ["triceps"],
			"secondary_muscles": ["chest"],
		},
		headers={"X-User-Id": "levon"},
	).json()

	# 5. Update combo to swap e2 for e3
	update_combo_res = client.post(
		"/api/combos",
		json={
			"id": combo["id"],
			"name": "Test Cascade Combo",
			"category": "strength",
			"discipline": "calisthenics",
			"flow_type": "superset",
			"exercise_ids": [e1["id"], e3["id"]],
			"default_mode": "reps",
			"default_quantity": 20,
		},
		headers={"X-User-Id": "levon"},
	)
	assert update_combo_res.status_code == 200

	# 6. Fetch routine via GET /api/routines/{id} and verify it automatically updated
	get_routine_res = client.get(
		f"/api/routines/{routine_id}",
		headers={"X-User-Id": "levon"},
	)
	assert get_routine_res.status_code == 200
	routine_data = get_routine_res.json()
	updated_step = routine_data["steps"][0]
	step_exercise_ids = [ex["id"] for ex in updated_step["exercises"]]
	assert step_exercise_ids == [e1["id"], e3["id"]]
	assert e2["id"] not in step_exercise_ids

	# 7. Also verify via GET /api/routines (list)
	list_routines_res = client.get(
		"/api/routines",
		headers={"X-User-Id": "levon"},
	)
	assert list_routines_res.status_code == 200
	found_r = next(r for r in list_routines_res.json() if r["id"] == routine_id)
	assert [ex["id"] for ex in found_r["steps"][0]["exercises"]] == [e1["id"], e3["id"]]
