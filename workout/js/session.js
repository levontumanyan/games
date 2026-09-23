/**
 * Session Tracker module - Live session recording, heartbeat, and persistence during active workouts.
 */

import { generateId } from './utils.js';
import { saveSession } from './storage.js';
import { getActiveUserId } from './user.js';

let activeSession = null;
let heartbeatInterval = null;
let lastActiveTimestamp = null;

/**
 * Check if a live session is currently active.
 * @returns {boolean}
 */
export function isSessionActive() {
	return Boolean(activeSession);
}

/**
 * Start tracking a new live workout session.
 * @param {Object} routine
 */
export function startSession(routine) {
	stopHeartbeat();

	const nowIso = new Date().toISOString();
	activeSession = {
		id: generateId(),
		routine_id: routine.id,
		routine_title: routine.title,
		started_at: nowIso,
		completed_at: null,
		duration_seconds: 0,
		completed_steps: 0,
		total_steps: routine.steps ? routine.steps.length : 0,
		status: 'in_progress',
		is_paused: false,
		exercises: [],
	};

	lastActiveTimestamp = Date.now();
	flushSession();
	startHeartbeat();
}

/**
 * Update step progress in active session.
 * @param {number} completedSteps
 */
export function updateSessionStep(completedSteps) {
	if (!activeSession) return;
	updateActiveDuration();
	activeSession.completed_steps = completedSteps;
	flushSession();
}

/**
 * Pause session tracking.
 */
export function pauseSession() {
	if (!activeSession || activeSession.is_paused) return;
	updateActiveDuration();
	activeSession.is_paused = true;
	flushSession();
}

/**
 * Resume session tracking.
 */
export function resumeSession() {
	if (!activeSession) return;
	activeSession.is_paused = false;
	lastActiveTimestamp = Date.now();
	flushSession();
}

/**
 * Complete the active session.
 * @returns {Promise<Object|null>}
 */
export async function completeSession() {
	if (!activeSession) return null;
	updateActiveDuration();
	stopHeartbeat();

	activeSession.status = 'completed';
	activeSession.completed_at = new Date().toISOString();
	activeSession.completed_steps = activeSession.total_steps;

	const sessionToSave = { ...activeSession };
	activeSession = null;

	try {
		await saveSession(sessionToSave);
	} catch (e) {
		console.warn('Failed to save completed session:', e);
	}
	return sessionToSave;
}

/**
 * Stop or cancel active session (saved as partial if duration > 10s).
 * @returns {Promise<Object|null>}
 */
export async function stopSession() {
	if (!activeSession) return null;
	updateActiveDuration();
	stopHeartbeat();

	activeSession.completed_at = new Date().toISOString();
	if (activeSession.status === 'in_progress') {
		activeSession.status = 'partial';
	}

	const sessionToSave = { ...activeSession };
	activeSession = null;

	if (sessionToSave.duration_seconds >= 10 || sessionToSave.completed_steps > 0) {
		try {
			await saveSession(sessionToSave);
		} catch (e) {
			console.warn('Failed to save partial session:', e);
		}
	}
	return sessionToSave;
}

/**
 * Update active duration accumulator.
 */
function updateActiveDuration() {
	if (!activeSession) return;
	if (!activeSession.is_paused && lastActiveTimestamp) {
		const now = Date.now();
		const diffSeconds = Math.round((now - lastActiveTimestamp) / 1000);
		if (diffSeconds > 0) {
			activeSession.duration_seconds += diffSeconds;
		}
		lastActiveTimestamp = now;
	}
}

/**
 * Start periodic heartbeat to persist live progress.
 */
function startHeartbeat() {
	heartbeatInterval = setInterval(() => {
		if (activeSession && !activeSession.is_paused) {
			updateActiveDuration();
			flushSession();
		}
	}, 5000);
}

/**
 * Stop periodic heartbeat.
 */
function stopHeartbeat() {
	if (heartbeatInterval) {
		clearInterval(heartbeatInterval);
		heartbeatInterval = null;
	}
}

/**
 * Record actual completed reps for a step or exercise.
 * @param {number} stepIndex
 * @param {number} reps
 * @param {Object} [exercise]
 */
export function recordStepReps(stepIndex, reps, exercise = null) {
	if (!activeSession) return;
	if (!Array.isArray(activeSession.exercises)) {
		activeSession.exercises = [];
	}
	const exId = exercise?.id || `step-${stepIndex}`;
	const exName = exercise?.name || 'Exercise';
	const existing = activeSession.exercises.find(
		e => e.step_index === stepIndex && (exercise?.id ? e.id === exercise.id : true)
	);
	if (existing) {
		existing.reps = reps;
	} else {
		activeSession.exercises.push({
			step_index: stepIndex,
			id: exId,
			name: exName,
			reps: reps,
		});
	}
	flushSession();
}

/**
 * Serialize a session into the persistable API payload shape.
 * @param {Object} session
 * @returns {Object}
 */
function toSessionPayload(session) {
	return {
		id: session.id,
		routine_id: session.routine_id,
		routine_title: session.routine_title,
		started_at: session.started_at,
		completed_at: session.completed_at,
		duration_seconds: session.duration_seconds,
		completed_steps: session.completed_steps,
		total_steps: session.total_steps,
		status: session.status,
		exercises: session.exercises || [],
	};
}

/**
 * Send current session state to backend.
 */
function flushSession() {
	if (!activeSession) return;
	saveSession(toSessionPayload(activeSession)).catch(e => {
		// Silent catch for background heartbeat
	});
}

// Window unload handler to guarantee partial session save if tab is closed midway
window.addEventListener('beforeunload', () => {
	if (activeSession && (activeSession.duration_seconds >= 10 || activeSession.completed_steps > 0)) {
		updateActiveDuration();
		activeSession.status = activeSession.status === 'completed' ? 'completed' : 'partial';
		activeSession.completed_at = new Date().toISOString();

		const path = window.location.pathname.startsWith('/workout') ? '/workout/api/sessions' : '/api/sessions';
		const payload = JSON.stringify(toSessionPayload(activeSession));

		try {
			if (navigator.sendBeacon) {
				const blob = new Blob([payload], { type: 'application/json' });
				navigator.sendBeacon(path, blob);
			} else {
				fetch(path, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-User-Id': getActiveUserId()
					},
					body: payload,
					keepalive: true
				});
			}
		} catch (e) {}
	}
});
