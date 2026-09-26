from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
	app = create_app(data_dir=tmp_path)
	return TestClient(app)


def test_get_routines_empty_by_default(client: TestClient):
	response = client.get("/api/routines")
	assert response.status_code == 200
	assert response.json() == []

	# Proxied subpath endpoint parity
	response_subpath = client.get("/workout/api/routines")
	assert response_subpath.status_code == 200
	assert response_subpath.json() == []


def test_save_and_fetch_routines(client: TestClient, tmp_path: Path):
	sample_routines = [
		{
			"id": "routine-1",
			"title": "Leg Day HIIT",
			"steps": [
				{
					"id": "step-1",
					"type": "timer",
					"durationSeconds": 45,
					"label": "Squats",
					"musicTracks": [],
				},
				{
					"id": "step-2",
					"type": "timer",
					"durationSeconds": 15,
					"label": "Rest",
					"musicTracks": [],
				},
			],
		}
	]

	# Save via POST
	post_res = client.post("/api/routines", json=sample_routines)
	assert post_res.status_code == 200
	assert post_res.json() == {"status": "ok", "count": 1}

	# Verify on-disk persistence
	db_file = tmp_path / "workout.db"
	assert db_file.exists()

	# Fetch via GET
	get_res = client.get("/api/routines")
	assert get_res.status_code == 200
	assert len(get_res.json()) == 1
	assert get_res.json()[0]["id"] == "routine-1"
	assert get_res.json()[0]["title"] == "Leg Day HIIT"
	assert len(get_res.json()[0]["steps"]) == 2

	# Fetch via subpath GET
	get_subpath_res = client.get("/workout/api/routines")
	assert get_subpath_res.status_code == 200
	assert len(get_subpath_res.json()) == 1
	assert get_subpath_res.json()[0]["id"] == "routine-1"


def test_invalid_payload_rejected_without_data_corruption(client: TestClient, tmp_path: Path):
	valid_routines = [{"id": "r-1", "title": "Core Workout", "steps": []}]
	client.post("/api/routines", json=valid_routines)

	# Try posting an object instead of a list
	invalid_res = client.post("/api/routines", json={"title": "Invalid Object"})
	assert invalid_res.status_code == 400

	# Ensure previous valid routines were not overwritten
	get_res = client.get("/api/routines")
	assert get_res.status_code == 200
	assert len(get_res.json()) == 1
	assert get_res.json()[0]["id"] == "r-1"
	assert get_res.json()[0]["title"] == "Core Workout"


def test_delete_all_routines(client: TestClient, tmp_path: Path):
	initial_routines = [{"id": "r-1", "title": "Morning Routine", "steps": []}]
	client.post("/workout/api/routines", json=initial_routines)
	assert len(client.get("/workout/api/routines").json()) == 1

	# Empty list (all workouts deleted)
	res = client.post("/workout/api/routines", json=[])
	assert res.status_code == 200
	assert res.json() == {"status": "ok", "count": 0}

	# Ensure persisted state is empty list
	assert client.get("/api/routines").json() == []


def test_fetch_user_routine_as_guest(client: TestClient):
	routine = {
		"id": "morning-flow",
		"title": "Morning Flow",
		"steps": [
			{
				"id": "step-1",
				"type": "timer",
				"durationSeconds": 30,
				"label": "Plank",
				"musicTracks": [],
			}
		],
	}

	# Create routine under user levon
	res = client.put(
		"/workout/api/routines/morning-flow",
		json=routine,
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 200

	# Fetch routine as another user (guest or aj) via ?user_id=levon query param
	get_res = client.get(
		"/workout/api/routines/morning-flow?user_id=levon",
		headers={"X-User-Id": "guest"},
	)
	assert get_res.status_code == 200
	fetched = get_res.json()
	assert fetched["title"] == "Morning Flow"
	assert len(fetched["steps"]) == 1
	assert fetched["steps"][0]["label"] == "Plank"

	# Non-existent routine returns 404
	assert (
		client.get(
			"/workout/api/routines/nonexist?user_id=levon",
			headers={"X-User-Id": "guest"},
		).status_code
		== 404
	)


def test_single_routine_crud_and_slug_lookup(client: TestClient):
	pushup_routine = {
		"id": "pushup-protocol",
		"title": "Science Pushup Protocol",
		"steps": [
			{
				"id": "step-1",
				"type": "timer",
				"durationSeconds": 45,
				"label": "Standard Pushups",
				"stepMode": "reps",
				"targetReps": 15,
			},
			{
				"id": "step-2",
				"type": "timer",
				"durationSeconds": 120,
				"label": "Rest (ATP-CP Resynthesis)",
				"isBreak": True,
			},
		],
	}

	# Create / Upsert via PUT /workout/api/routines/{id}
	put_res = client.put(
		"/workout/api/routines/pushup-protocol",
		json=pushup_routine,
		headers={"X-User-Id": "levon"},
	)
	assert put_res.status_code == 200
	saved_routine = put_res.json()["routine"]
	assert saved_routine["id"] == "pushup-protocol"
	assert saved_routine["title"] == "Science Pushup Protocol"
	assert len(saved_routine["steps"]) == 2

	# Fetch by exact ID
	get_res = client.get("/workout/api/routines/pushup-protocol", headers={"X-User-Id": "levon"})
	assert get_res.status_code == 200
	assert get_res.json()["title"] == "Science Pushup Protocol"

	# Fetch by title slug
	slug_res = client.get(
		"/workout/api/routines/science-pushup-protocol", headers={"X-User-Id": "levon"}
	)
	assert slug_res.status_code == 200
	assert slug_res.json()["id"] == "pushup-protocol"

	# Modify single routine via PUT
	pushup_routine["steps"].append(
		{
			"id": "step-3",
			"type": "timer",
			"durationSeconds": 45,
			"label": "Diamond Pushups",
			"stepMode": "reps",
			"targetReps": 10,
		}
	)
	update_res = client.put(
		"/api/routines/pushup-protocol",
		json=pushup_routine,
		headers={"X-User-Id": "levon"},
	)
	assert update_res.status_code == 200
	assert len(update_res.json()["routine"]["steps"]) == 3

	# Delete single routine
	del_res = client.delete("/workout/api/routines/pushup-protocol", headers={"X-User-Id": "levon"})
	assert del_res.status_code == 200

	# Ensure 404 after deletion
	assert (
		client.get(
			"/workout/api/routines/pushup-protocol", headers={"X-User-Id": "levon"}
		).status_code
		== 404
	)


def test_dynamic_exercise_propagation_to_routines(client: TestClient, tmp_path: Path):
	# 1. Create an exercise via POST /api/exercises
	ex_res = client.post(
		"/api/exercises",
		json={
			"id": "ex-test-dyn",
			"name": "Dynamic Pushup V1",
			"category": "strength",
			"discipline": "calisthenics",
			"default_mode": "reps",
			"default_quantity": 12,
		},
		headers={"X-User-Id": "levon"},
	)
	assert ex_res.status_code == 200

	# 2. Create a routine with a step referencing the exercise
	routine_payload = {
		"id": "routine-dynamic-test",
		"title": "Dynamic Propagation Routine",
		"steps": [
			{
				"id": "s-1",
				"type": "timer",
				"durationSeconds": 30,
				"exercises": [{"id": "ex-test-dyn"}],
			}
		],
	}
	put_res = client.put(
		"/api/routines/routine-dynamic-test",
		json=routine_payload,
		headers={"X-User-Id": "levon"},
	)
	assert put_res.status_code == 200

	# 3. Verify the routine initially returns the hydrated exercise details
	get_res = client.get("/api/routines/routine-dynamic-test", headers={"X-User-Id": "levon"})
	assert get_res.status_code == 200
	step_data = get_res.json()["steps"][0]
	assert step_data["exercises"][0]["name"] == "Dynamic Pushup V1"
	assert step_data["exercises"][0]["category"] == "strength"
	assert step_data["exercises"][0]["discipline"] == "calisthenics"

	# 4. Update the backing exercise without touching the routine
	update_ex_res = client.post(
		"/api/exercises",
		json={
			"id": "ex-test-dyn",
			"name": "Dynamic Pushup V2 Renamed",
			"category": "endurance",
			"discipline": "general",
			"default_mode": "time",
			"default_quantity": 45,
		},
		headers={"X-User-Id": "levon"},
	)
	assert update_ex_res.status_code == 200

	# 5. Fetch the routine again - updates must propagate dynamically without modifying routine JSON!
	get_res_updated = client.get(
		"/api/routines/routine-dynamic-test", headers={"X-User-Id": "levon"}
	)
	assert get_res_updated.status_code == 200
	updated_step = get_res_updated.json()["steps"][0]
	assert updated_step["exercises"][0]["name"] == "Dynamic Pushup V2 Renamed"
	assert updated_step["exercises"][0]["category"] == "endurance"
	assert updated_step["exercises"][0]["discipline"] == "general"

	# Also verify list routines endpoint
	list_res = client.get("/api/routines", headers={"X-User-Id": "levon"})
	assert list_res.status_code == 200
	matching_routine = next(r for r in list_res.json() if r["id"] == "routine-dynamic-test")
	assert matching_routine["steps"][0]["exercises"][0]["name"] == "Dynamic Pushup V2 Renamed"


def test_concise_step_ingestion_and_expansion(client: TestClient):
	# 1. Create backing exercises
	client.post(
		"/api/exercises",
		json={
			"id": "ex-concise-pushup",
			"name": "Concise Pushups",
			"category": "strength",
			"discipline": "calisthenics",
			"default_mode": "reps",
			"default_quantity": 15,
			"media_url": "/workout/media/pushups.svg",
		},
		headers={"X-User-Id": "levon"},
	)
	client.post(
		"/api/exercises",
		json={
			"id": "ex-concise-plank",
			"name": "Concise Plank",
			"category": "core",
			"discipline": "general",
			"default_mode": "time",
			"default_quantity": 45,
			"media_url": "/workout/media/plank.svg",
		},
		headers={"X-User-Id": "levon"},
	)

	# 2. Ingest routine with concise steps
	concise_payload = {
		"id": "routine-concise-test",
		"title": "Concise Test Routine",
		"steps": [
			{"exercise_id": "ex-concise-pushup", "reps": 12},
			{"rest": 25},
			{"exercise_id": "ex-concise-plank"},  # Falls back to default_quantity 45 & time mode
		],
	}
	put_res = client.put(
		"/api/routines/routine-concise-test",
		json=concise_payload,
		headers={"X-User-Id": "levon"},
	)
	assert put_res.status_code == 200
	saved_routine = put_res.json()["routine"]
	assert len(saved_routine["steps"]) == 3

	# Step 1: Reps exercise
	s1 = saved_routine["steps"][0]
	assert s1["id"].startswith("s-")
	assert s1["label"] == "Concise Pushups"
	assert s1["stepMode"] == "reps"
	assert s1["targetReps"] == 12
	assert s1["mediaUrl"] == "/workout/media/pushups.svg"
	assert s1["exercises"][0]["name"] == "Concise Pushups"

	# Step 2: Rest step
	s2 = saved_routine["steps"][1]
	assert s2["id"].startswith("s-")
	assert s2["label"] == "Rest"
	assert s2["isBreak"] is True
	assert s2["subtype"] == "break"
	assert s2["stepMode"] == "time"
	assert s2["durationSeconds"] == 25
	assert s2["targetDuration"] == 25

	# Step 3: Default quantity exercise
	s3 = saved_routine["steps"][2]
	assert s3["id"].startswith("s-")
	assert s3["label"] == "Concise Plank"
	assert s3["stepMode"] == "time"
	assert s3["durationSeconds"] == 45
	assert s3["targetDuration"] == 45
	assert s3["mediaUrl"] == "/workout/media/plank.svg"

	# 3. Verify parity via GET /api/routines/{id}
	get_res = client.get("/api/routines/routine-concise-test", headers={"X-User-Id": "levon"})
	assert get_res.status_code == 200
	fetched = get_res.json()
	assert len(fetched["steps"]) == 3
	assert fetched["steps"][0]["targetReps"] == 12
	assert fetched["steps"][1]["isBreak"] is True
	assert fetched["steps"][2]["durationSeconds"] == 45


def test_granular_step_post_append_and_insert(client: TestClient):
	client.put(
		"/api/routines/r-granular-post",
		json={
			"title": "Granular Post",
			"steps": [
				{"id": "step-1", "label": "First Step", "durationSeconds": 30},
				{"id": "step-2", "label": "Second Step", "durationSeconds": 30},
			],
		},
		headers={"X-User-Id": "levon"},
	)

	# 1. Append step by default (no index specified)
	append_res = client.post(
		"/api/routines/r-granular-post/steps",
		json={"rest": 15},
		headers={"X-User-Id": "levon"},
	)
	assert append_res.status_code == 200
	routine = append_res.json()["routine"]
	assert len(routine["steps"]) == 3
	assert routine["steps"][2]["isBreak"] is True
	assert routine["steps"][2]["durationSeconds"] == 15

	# 2. Insert step at index 1
	insert_res = client.post(
		"/api/routines/r-granular-post/steps?index=1",
		json={"label": "Inserted Step", "durationSeconds": 20},
		headers={"X-User-Id": "levon"},
	)
	assert insert_res.status_code == 200
	routine_ins = insert_res.json()["routine"]
	assert len(routine_ins["steps"]) == 4
	assert routine_ins["steps"][0]["id"] == "step-1"
	assert routine_ins["steps"][1]["label"] == "Inserted Step"
	assert routine_ins["steps"][2]["id"] == "step-2"


def test_granular_step_patch(client: TestClient):
	client.put(
		"/api/routines/r-granular-patch",
		json={
			"title": "Granular Patch",
			"steps": [
				{"id": "s-target", "label": "Old Pushups", "stepMode": "reps", "targetReps": 10},
				{"id": "s-other", "label": "Other Step", "durationSeconds": 30},
			],
		},
		headers={"X-User-Id": "levon"},
	)

	# Patch targetReps and label
	patch_res = client.patch(
		"/api/routines/r-granular-patch/steps/s-target",
		json={"reps": 16, "label": "Diamond Pushups"},
		headers={"X-User-Id": "levon"},
	)
	assert patch_res.status_code == 200
	routine = patch_res.json()["routine"]
	patched_step = next(s for s in routine["steps"] if s["id"] == "s-target")
	assert patched_step["targetReps"] == 16
	assert patched_step["label"] == "Diamond Pushups"

	# Non-target step remains unchanged
	other_step = next(s for s in routine["steps"] if s["id"] == "s-other")
	assert other_step["durationSeconds"] == 30

	# 404 for non-existent step
	bad_patch = client.patch(
		"/api/routines/r-granular-patch/steps/s-nonexist",
		json={"targetReps": 20},
		headers={"X-User-Id": "levon"},
	)
	assert bad_patch.status_code == 404


def test_granular_step_delete(client: TestClient):
	client.put(
		"/api/routines/r-granular-delete",
		json={
			"title": "Granular Delete",
			"steps": [
				{"id": "s-del-1", "label": "Step 1"},
				{"id": "s-del-2", "label": "Step 2"},
				{"id": "s-del-3", "label": "Step 3"},
			],
		},
		headers={"X-User-Id": "levon"},
	)

	# Delete step 2
	del_res = client.delete(
		"/api/routines/r-granular-delete/steps/s-del-2",
		headers={"X-User-Id": "levon"},
	)
	assert del_res.status_code == 200
	routine = del_res.json()["routine"]
	assert len(routine["steps"]) == 2
	assert [s["id"] for s in routine["steps"]] == ["s-del-1", "s-del-3"]

	# Deleting again returns 404
	del_404 = client.delete(
		"/api/routines/r-granular-delete/steps/s-del-2",
		headers={"X-User-Id": "levon"},
	)
	assert del_404.status_code == 404


def test_granular_bulk_delete_by_exercise_both_top_level_and_nested(client: TestClient):
	client.put(
		"/api/routines/r-bulk-del",
		json={
			"title": "Bulk Delete Test",
			"steps": [
				{"id": "s-1", "exercise_id": "ex-target", "label": "Target Set 1"},
				{"id": "s-2", "label": "Keep Me", "durationSeconds": 30},
				{"id": "s-3", "exercises": [{"id": "ex-target"}], "label": "Target Set 2 (Legacy)"},
				{"id": "s-4", "exercise_id": "ex-other", "label": "Other Exercise"},
			],
		},
		headers={"X-User-Id": "levon"},
	)

	# Bulk delete by exercise_id=ex-target
	del_res = client.delete(
		"/api/routines/r-bulk-del/steps?exercise_id=ex-target",
		headers={"X-User-Id": "levon"},
	)
	assert del_res.status_code == 200
	data = del_res.json()
	assert data["deleted_count"] == 2
	remaining_ids = [s["id"] for s in data["routine"]["steps"]]
	assert remaining_ids == ["s-2", "s-4"]


def test_granular_step_reorder_graceful_trailing(client: TestClient):
	client.put(
		"/api/routines/r-reorder",
		json={
			"title": "Reorder Test",
			"steps": [
				{"id": "s-1", "label": "Step 1"},
				{"id": "s-2", "label": "Step 2"},
				{"id": "s-3", "label": "Step 3"},
				{"id": "s-4", "label": "Step 4"},
			],
		},
		headers={"X-User-Id": "levon"},
	)

	# Client reorders s-3 and s-1; unmentioned s-2 and s-4 must gracefully stay appended
	reorder_res = client.post(
		"/api/routines/r-reorder/steps/reorder",
		json={"step_ids": ["s-3", "s-1"]},
		headers={"X-User-Id": "levon"},
	)
	assert reorder_res.status_code == 200
	routine = reorder_res.json()["routine"]
	step_ids = [s["id"] for s in routine["steps"]]
	assert step_ids == ["s-3", "s-1", "s-2", "s-4"]
