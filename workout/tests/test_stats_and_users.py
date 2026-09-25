from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app
from db import Database


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
	app = create_app(data_dir=tmp_path)
	return TestClient(app)


def test_default_user_created_on_init(client: TestClient):
	res = client.get("/api/users")
	assert res.status_code == 200
	users = res.json()
	assert len(users) >= 1
	assert any(u["id"] == "levon" for u in users)


def test_create_and_switch_users(client: TestClient):
	# Create new user
	res = client.post("/api/users", json={"id": "alex", "display_name": "Alex"})
	assert res.status_code == 200
	user_data = res.json()
	assert user_data["id"] == "alex"
	assert user_data["display_name"] == "Alex"

	# Add routine for levon
	levon_routine = [{"id": "r-levon", "title": "Levon Routine", "steps": [], "musicTracks": []}]
	client.post("/api/routines", json=levon_routine, headers={"X-User-Id": "levon"})

	# Add routine for alex
	alex_routine = [{"id": "r-alex", "title": "Alex Routine", "steps": [], "musicTracks": []}]
	client.post("/api/routines", json=alex_routine, headers={"X-User-Id": "alex"})

	# Verify isolation
	res_levon = client.get("/api/routines", headers={"X-User-Id": "levon"})
	assert res_levon.json() == levon_routine

	res_alex = client.get("/api/routines", headers={"X-User-Id": "alex"})
	assert res_alex.json() == alex_routine


def test_identical_routine_id_across_users_does_not_collide(client: TestClient):
	# Both users import a template with identical ID 'template-001'
	shared_template_id = "template-001"
	levon_template = [
		{"id": shared_template_id, "title": "HIIT by Levon", "steps": [], "musicTracks": []}
	]
	alex_template = [
		{"id": shared_template_id, "title": "HIIT by Alex", "steps": [], "musicTracks": []}
	]

	# Levon saves template
	res1 = client.post("/api/routines", json=levon_template, headers={"X-User-Id": "levon"})
	assert res1.status_code == 200

	# Alex saves template with same ID
	res2 = client.post("/api/routines", json=alex_template, headers={"X-User-Id": "alex"})
	assert res2.status_code == 200

	# Both users see their own version with no collision
	assert (
		client.get("/api/routines", headers={"X-User-Id": "levon"}).json()[0]["title"]
		== "HIIT by Levon"
	)
	assert (
		client.get("/api/routines", headers={"X-User-Id": "alex"}).json()[0]["title"]
		== "HIIT by Alex"
	)


def test_session_recording_live_progress_and_partial_completion(client: TestClient):
	# Start a session
	session_id = "sess-001"
	start_iso = datetime.now().isoformat()

	# In-progress update (step 1 done, 45 seconds)
	progress_payload = {
		"id": session_id,
		"routine_id": "r-1",
		"routine_title": "Upper Body Blast",
		"started_at": start_iso,
		"duration_seconds": 45,
		"completed_steps": 1,
		"total_steps": 5,
		"status": "in_progress",
	}
	res = client.post("/api/sessions", json=progress_payload, headers={"X-User-Id": "levon"})
	assert res.status_code == 200

	# Check session list shows live progress
	res_list = client.get("/api/sessions", headers={"X-User-Id": "levon"})
	assert res_list.status_code == 200
	sessions = res_list.json()
	assert len(sessions) == 1
	assert sessions[0]["id"] == session_id
	assert sessions[0]["duration_seconds"] == 45
	assert sessions[0]["completed_steps"] == 1
	assert sessions[0]["status"] == "in_progress"

	# User closes browser or stops halfway (e.g. 120 seconds, 3 steps)
	partial_payload = {
		"id": session_id,
		"routine_id": "r-1",
		"routine_title": "Upper Body Blast",
		"started_at": start_iso,
		"completed_at": datetime.now().isoformat(),
		"duration_seconds": 120,
		"completed_steps": 3,
		"total_steps": 5,
		"status": "partial",
	}
	res2 = client.post("/api/sessions", json=partial_payload, headers={"X-User-Id": "levon"})
	assert res2.status_code == 200

	# Check session is updated
	res_list2 = client.get("/api/sessions", headers={"X-User-Id": "levon"})
	assert res_list2.json()[0]["duration_seconds"] == 120
	assert res_list2.json()[0]["completed_steps"] == 3
	assert res_list2.json()[0]["status"] == "partial"


def test_streak_calculation_and_weekly_monthly_stats(client: TestClient, tmp_path: Path):
	db_path = tmp_path / "workout.db"
	db = Database(db_path)

	today = datetime.now().date()
	yesterday = today - timedelta(days=1)
	two_days_ago = today - timedelta(days=2)

	# Record sessions across days
	sessions_to_add = [
		("s-1", two_days_ago.isoformat() + "T10:00:00", 600, "completed"),
		("s-2", yesterday.isoformat() + "T10:00:00", 900, "completed"),
		("s-3", today.isoformat() + "T08:00:00", 1200, "completed"),
	]
	for s_id, start_time, duration, status in sessions_to_add:
		db.upsert_session(
			"levon",
			{
				"id": s_id,
				"routine_title": "Workout",
				"started_at": start_time,
				"duration_seconds": duration,
				"status": status,
			},
		)

	stats = db.get_stats("levon")
	assert stats["current_streak"] == 3
	assert stats["longest_streak"] == 3
	assert stats["total_sessions"] == 3
	assert stats["total_minutes"] == round((600 + 900 + 1200) / 60)
	assert len(stats["weekly"]) == 7
	assert stats["monthly"]["year"] == today.year
	assert stats["monthly"]["month"] == today.month


def test_delete_session(client: TestClient):
	session_payload = {
		"id": "del-test-1",
		"started_at": datetime.now().isoformat(),
		"duration_seconds": 60,
		"status": "completed",
	}
	client.post("/api/sessions", json=session_payload, headers={"X-User-Id": "levon"})
	assert len(client.get("/api/sessions", headers={"X-User-Id": "levon"}).json()) == 1

	del_res = client.delete("/api/sessions/del-test-1", headers={"X-User-Id": "levon"})
	assert del_res.status_code == 200
	assert len(client.get("/api/sessions", headers={"X-User-Id": "levon"}).json()) == 0


def test_session_snapshot_survives_routine_deletion(client: TestClient, tmp_path: Path):
	db_path = tmp_path / "workout.db"
	db = Database(db_path)

	# Session with full step snapshot (as created by session.js)
	session_data = {
		"id": "sess-snap-1",
		"routine_id": "deleted-routine-99",
		"routine_title": "Pushup Power",
		"started_at": datetime.now().isoformat(),
		"duration_seconds": 180,
		"completed_steps": 2,
		"total_steps": 2,
		"status": "completed",
		"exercises": [
			{
				"step_index": 0,
				"label": "Pushups",
				"mode": "reps",
				"is_break": False,
				"planned_duration": 60,
				"target_reps": 20,
				"reps": 25,
				"exercises": [
					{
						"id": "ex-pushups",
						"name": "Pushups",
						"category": "strength",
						"discipline": "calisthenics",
					}
				],
			},
			{
				"step_index": 1,
				"label": "Rest & Hydrate",
				"mode": "break",
				"is_break": True,
				"planned_duration": 30,
				"target_reps": 0,
				"reps": 0,
				"exercises": [],
			},
		],
	}

	db.upsert_session("levon", session_data)

	# Note: deleted-routine-99 does NOT exist in routines table
	stats = db.get_stats("levon")
	assert stats["total_sessions"] == 1
	assert stats["total_reps"] == 25
	# Strength category must be counted
	assert stats["categories"]["strength"]["reps"] == 25
	assert stats["categories"]["strength"]["count"] == 1
	# Rest step must NOT be counted as stretch
	assert stats["categories"]["stretch"]["count"] == 0
	assert stats["categories"]["stretch"]["minutes"] == 0


def test_stats_cache_invalidation_on_upsert_and_delete(client: TestClient, tmp_path: Path):
	db_path = tmp_path / "workout.db"
	db = Database(db_path)

	db.upsert_session(
		"levon",
		{
			"id": "s-c-1",
			"started_at": datetime.now().isoformat(),
			"duration_seconds": 100,
			"status": "completed",
		},
	)
	stats1 = db.get_stats("levon")
	assert stats1["total_sessions"] == 1

	# Add another session -> cache must invalidate
	db.upsert_session(
		"levon",
		{
			"id": "s-c-2",
			"started_at": datetime.now().isoformat(),
			"duration_seconds": 120,
			"status": "completed",
		},
	)
	stats2 = db.get_stats("levon")
	assert stats2["total_sessions"] == 2

	# Delete session -> cache must invalidate
	db.delete_session("levon", "s-c-1")
	stats3 = db.get_stats("levon")
	assert stats3["total_sessions"] == 1


def test_rep_leaderboard_and_milestones(client: TestClient, tmp_path: Path):
	db_path = tmp_path / "workout.db"
	db = Database(db_path)

	# Session 1: 30 pushups and 10 pullups
	s1 = {
		"id": "sess-lead-1",
		"started_at": "2026-09-20T10:00:00",
		"duration_seconds": 300,
		"status": "completed",
		"exercises": [
			{
				"step_index": 0,
				"label": "Standard Pushups",
				"mode": "reps",
				"is_break": False,
				"reps": 30,
				"exercises": [{"id": "ex-pushups", "name": "Pushups", "category": "strength"}],
			},
			{
				"step_index": 1,
				"label": "Pull-ups",
				"mode": "reps",
				"is_break": False,
				"reps": 10,
				"exercises": [{"id": "ex-pullups", "name": "Pull-ups", "category": "strength"}],
			},
		],
	}
	# Session 2: 45 pushups (PR)
	s2 = {
		"id": "sess-lead-2",
		"started_at": "2026-09-22T10:00:00",
		"duration_seconds": 300,
		"status": "completed",
		"exercises": [
			{
				"step_index": 0,
				"label": "Pushups",
				"mode": "reps",
				"is_break": False,
				"reps": 45,
				"exercises": [{"id": "ex-pushups", "name": "Pushups", "category": "strength"}],
			}
		],
	}

	db.upsert_session("levon", s1)
	db.upsert_session("levon", s2)

	stats = db.get_stats("levon")
	leaderboard = stats.get("rep_leaderboard", [])
	assert len(leaderboard) >= 2

	pushup_entry = next((e for e in leaderboard if e["name"] == "Pushups"), None)
	assert pushup_entry is not None
	assert pushup_entry["total_reps"] == 75  # 30 + 45
	assert pushup_entry["max_session_reps"] == 45  # PR
	assert pushup_entry["sessions_count"] == 2
	assert pushup_entry["avg_reps"] == 38  # round(75 / 2)

	# Verify milestones exist and have pushup tracking
	milestones = stats.get("milestones", [])
	assert len(milestones) > 0
	pushup_cent = next((m for m in milestones if m["id"] == "pushup_century"), None)
	assert pushup_cent is not None
	assert pushup_cent["progress"] == 75
	assert pushup_cent["target"] == 100
	assert pushup_cent["unlocked"] is False
