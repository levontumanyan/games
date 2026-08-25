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
