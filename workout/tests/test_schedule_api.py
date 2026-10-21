from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
	app = create_app(data_dir=tmp_path)
	return TestClient(app)


def test_schedule_crud(client: TestClient):
	# 1. Create a scheduled workout
	payload = {
		"routine_id": "routine-123",
		"routine_title": "Full Body Blast",
		"scheduled_date": "2026-10-25",
		"scheduled_time": "08:30",
		"notes": "Bring resistance bands",
	}
	res = client.post("/api/schedule", json=payload, headers={"X-User-Id": "levon"})
	assert res.status_code == 201
	item = res.json()
	assert item["routine_title"] == "Full Body Blast"
	assert item["scheduled_date"] == "2026-10-25"
	assert item["scheduled_time"] == "08:30"
	assert item["status"] == "scheduled"
	assert item["user_id"] == "levon"
	schedule_id = item["id"]

	# 2. Get single scheduled workout
	res = client.get(f"/api/schedule/{schedule_id}", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	assert res.json()["id"] == schedule_id

	# 3. List scheduled workouts
	res = client.get(
		"/api/schedule",
		params={"start_date": "2026-10-01", "end_date": "2026-10-31"},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 200
	items = res.json()
	assert len(items) == 1
	assert items[0]["id"] == schedule_id

	# 4. Update scheduled workout
	update_payload = {
		"scheduled_date": "2026-10-26",
		"scheduled_time": "09:00",
		"notes": "Updated note",
	}
	res = client.put(
		f"/api/schedule/{schedule_id}", json=update_payload, headers={"X-User-Id": "levon"}
	)
	assert res.status_code == 200
	updated = res.json()
	assert updated["scheduled_date"] == "2026-10-26"
	assert updated["scheduled_time"] == "09:00"
	assert updated["notes"] == "Updated note"

	# 4b. Clear nullable field (scheduled_time back to null/Anytime)
	res = client.put(
		f"/api/schedule/{schedule_id}",
		json={"scheduled_time": None},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 200
	assert res.json()["scheduled_time"] is None

	# 5. Complete scheduled workout
	res = client.post(
		f"/api/schedule/{schedule_id}/complete",
		params={"session_id": "sess-999"},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 200
	completed = res.json()
	assert completed["status"] == "completed"
	assert completed["session_id"] == "sess-999"

	# 6. Delete scheduled workout
	res = client.delete(f"/api/schedule/{schedule_id}", headers={"X-User-Id": "levon"})
	assert res.status_code == 200

	# 7. Verify deletion
	res = client.get(f"/api/schedule/{schedule_id}", headers={"X-User-Id": "levon"})
	assert res.status_code == 404


def test_schedule_user_isolation(client: TestClient):
	# User levon creates a schedule
	res = client.post(
		"/api/schedule",
		json={"routine_title": "Levon Day", "scheduled_date": "2026-10-21"},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 201
	item_id = res.json()["id"]

	# User alex lists schedules
	res = client.get("/api/schedule", headers={"X-User-Id": "alex"})
	assert res.status_code == 200
	assert len(res.json()) == 0

	# User alex cannot get levon's schedule
	res = client.get(f"/api/schedule/{item_id}", headers={"X-User-Id": "alex"})
	assert res.status_code == 404

	# User alex cannot delete levon's schedule
	res = client.delete(f"/api/schedule/{item_id}", headers={"X-User-Id": "alex"})
	assert res.status_code == 404


def test_schedule_date_validation(client: TestClient):
	# Invalid date format
	res = client.post(
		"/api/schedule",
		json={"routine_title": "Bad Date", "scheduled_date": "not-a-date"},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 400

	# Invalid status value
	res = client.post(
		"/api/schedule",
		json={
			"routine_title": "Bad Status",
			"scheduled_date": "2026-10-25",
			"status": "bogus_status",
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 400
