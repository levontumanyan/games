from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
	app = create_app(data_dir=tmp_path)
	return TestClient(app)


def test_scenario_a_auto_link_without_schedule_id(client: TestClient):
	"""User schedules a workout, then completes it from Home or Routine Library without schedule_id."""
	today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

	# Schedule it
	res = client.post(
		"/api/schedule",
		json={
			"routine_id": "wednesday-muay-thai-combat-flow",
			"routine_title": "Muay Thai Flow",
			"scheduled_date": today,
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 201
	schedule_id = res.json()["id"]

	# Complete session without schedule_id
	res = client.post(
		"/api/sessions",
		json={
			"id": "sess-scenario-a",
			"routine_id": "wednesday-muay-thai-combat-flow",
			"routine_title": "Muay Thai Flow",
			"started_at": f"{today}T14:00:00Z",
			"completed_at": f"{today}T14:45:00Z",
			"duration_seconds": 2700,
			"completed_steps": 30,
			"total_steps": 30,
			"status": "completed",
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 200

	# Verify schedule was automatically marked completed
	res = client.get(f"/api/schedule/{schedule_id}", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	item = res.json()
	assert item["status"] == "completed"
	assert item["session_id"] == "sess-scenario-a"


def test_scenario_b_explicit_schedule_id_link(client: TestClient):
	"""User launches from Schedule view which passes explicit scheduled_id."""
	today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

	res = client.post(
		"/api/schedule",
		json={
			"routine_id": "monday-upper-body-hypertrophy",
			"routine_title": "Upper Body Hypertrophy",
			"scheduled_date": today,
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 201
	schedule_id = res.json()["id"]

	# Pass explicit scheduled_id
	res = client.post(
		"/api/sessions",
		json={
			"id": "sess-scenario-b",
			"routine_id": "monday-upper-body-hypertrophy",
			"scheduled_id": schedule_id,
			"started_at": f"{today}T10:00:00Z",
			"completed_at": f"{today}T10:45:00Z",
			"duration_seconds": 2700,
			"status": "completed",
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 200

	res = client.get(f"/api/schedule/{schedule_id}", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	assert res.json()["status"] == "completed"
	assert res.json()["session_id"] == "sess-scenario-b"


def test_scenario_c_timezone_boundary_auto_link(client: TestClient):
	"""User works out late at night (local date != UTC date, e.g. 11:30 PM local)."""
	# Scheduled for 2026-11-10 local
	res = client.post(
		"/api/schedule",
		json={
			"routine_id": "tuesday-lower-body-hypertrophy",
			"routine_title": "Lower Body",
			"scheduled_date": "2026-11-10",
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 201
	schedule_id = res.json()["id"]

	# Session timestamp is UTC 03:30 AM on 2026-11-11
	res = client.post(
		"/api/sessions",
		json={
			"id": "sess-scenario-c",
			"routine_id": "tuesday-lower-body-hypertrophy",
			"routine_title": "Lower Body",
			"started_at": "2026-11-11T03:30:00Z",
			"completed_at": "2026-11-11T04:15:00Z",
			"duration_seconds": 2700,
			"status": "completed",
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 200

	# Auto-link ±1 day slack should link it
	res = client.get(f"/api/schedule/{schedule_id}", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	assert res.json()["status"] == "completed"
	assert res.json()["session_id"] == "sess-scenario-c"


def test_scenario_d_missed_workout_and_recommendation_catchup(client: TestClient):
	"""Yesterday had a scheduled workout that was missed; recommendation offers catch-up."""
	now = datetime.now(timezone.utc)
	yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

	# Schedule yesterday's workout (missed)
	res = client.post(
		"/api/schedule",
		json={
			"routine_id": "monday-upper-body-hypertrophy",
			"routine_title": "Upper Body Hypertrophy",
			"scheduled_date": yesterday,
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 201

	# Check recommendation
	res = client.get("/api/schedule/next", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	data = res.json()

	# Missed list should include yesterday
	missed_ids = [m["routine_id"] for m in data.get("missed_scheduled", [])]
	assert "monday-upper-body-hypertrophy" in missed_ids

	# Recommendation should offer catch-up alternative
	rec = data["recommendation"]
	assert rec["status"] == "ready_to_start"
	if rec["routine_id"] != "monday-upper-body-hypertrophy":
		assert rec["alternative"] is not None
		assert rec["alternative"]["routine_id"] == "monday-upper-body-hypertrophy"


def test_scenario_e_already_completed_workout_today(client: TestClient):
	"""If user already completed a workout today, recommendation advises recovery."""
	now = datetime.now(timezone.utc)
	today = now.strftime("%Y-%m-%d")
	now_iso = now.isoformat()

	res = client.post(
		"/api/sessions",
		json={
			"id": "sess-scenario-e",
			"routine_id": "tuesday-lower-body-hypertrophy",
			"routine_title": "Lower Body & Hip Hypertrophy",
			"started_at": now_iso,
			"completed_at": now_iso,
			"duration_seconds": 2400,
			"status": "completed",
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 200

	# Get recommendation
	res = client.get("/api/schedule/next", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	data = res.json()
	assert data["as_of_date"] == today
	assert data["recommendation"]["status"] == "already_worked_out_today"
	assert "routine-relaxed-stretching-10min" in data["recommendation"]["routine_id"]


def test_scenario_f_custom_title_schedule_without_routine_id(client: TestClient):
	"""Scheduled event with custom title (e.g. '5k Run') doesn't false-positive match gym sessions."""
	today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

	res = client.post(
		"/api/schedule",
		json={
			"routine_title": "5k Outdoor Run",
			"routine_id": None,
			"scheduled_date": today,
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 201
	run_id = res.json()["id"]

	# Complete a gym routine
	res = client.post(
		"/api/sessions",
		json={
			"id": "sess-gym-1",
			"routine_id": "monday-upper-body-hypertrophy",
			"routine_title": "Upper Body Hypertrophy",
			"started_at": f"{today}T12:00:00Z",
			"completed_at": f"{today}T12:45:00Z",
			"duration_seconds": 2700,
			"status": "completed",
		},
		headers={"X-User-Id": "levon"},
	)
	assert res.status_code == 200

	# 5k Outdoor Run should still be scheduled (not false-linked to upper body)
	res = client.get(f"/api/schedule/{run_id}", headers={"X-User-Id": "levon"})
	assert res.status_code == 200
	assert res.json()["status"] == "scheduled"
	assert res.json()["session_id"] is None
