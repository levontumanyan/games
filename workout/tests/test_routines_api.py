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


def test_create_and_fetch_short_share_link(client: TestClient):
	routine = {
		"title": "Short Shared Workout",
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

	# Create share link via root API
	res = client.post("/api/share", json=routine)
	assert res.status_code == 200
	data = res.json()
	assert data["status"] == "ok"
	share_id = data["id"]
	assert len(share_id) == 6

	# Fetch share link via root API
	get_res = client.get(f"/api/share/{share_id}")
	assert get_res.status_code == 200
	fetched = get_res.json()
	assert fetched["title"] == "Short Shared Workout"
	assert len(fetched["steps"]) == 1
	assert fetched["steps"][0]["label"] == "Plank"

	# Fetch via subpath API
	get_subpath = client.get(f"/workout/api/share/{share_id}")
	assert get_subpath.status_code == 200
	assert get_subpath.json()["title"] == "Short Shared Workout"

	# Non-existent share link returns 404
	assert client.get("/api/share/nonexist").status_code == 404
