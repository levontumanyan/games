/**
 * Storage module - localStorage persistence, soft user isolation, session tracking, and server sync.
 */

import { generateId } from './utils.js';
import { getActiveUserId } from './user.js';

const STORAGE_PREFIX = 'custom_workout_routines_';

function getApiBase() {
	const path = window.location.pathname;
	return path.startsWith('/workout') ? '/workout/api' : '/api';
}

function getHeaders(extraHeaders = {}) {
	return {
		'X-User-Id': getActiveUserId(),
		...extraHeaders
	};
}

/**
 * Fetch routines from the server for the active user.
 * @returns {Promise<Array>}
 */
export async function fetchServerRoutines() {
	const res = await fetch(`${getApiBase()}/routines`, {
		headers: getHeaders({ 'Accept': 'application/json' })
	});
	if (!res.ok) {
		throw new Error(`Server returned HTTP ${res.status}`);
	}
	const data = await res.json();
	if (!Array.isArray(data)) {
		throw new Error('Server returned invalid data format');
	}
	return data;
}

/**
 * Save routines to the server for the active user.
 * @param {Array} routines
 * @returns {Promise<{status: string, count: number}>}
 */
export async function saveServerRoutines(routines) {
	const res = await fetch(`${getApiBase()}/routines`, {
		method: 'POST',
		headers: getHeaders({
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		}),
		body: JSON.stringify(routines)
	});
	if (!res.ok) {
		throw new Error(`Failed to save to server: HTTP ${res.status}`);
	}
	return await res.json();
}

/**
 * Load all routines from localStorage for the active user.
 * @returns {Array} Array of Routine objects
 */
export function loadRoutines() {
	try {
		const key = `${STORAGE_PREFIX}${getActiveUserId()}`;
		let raw = localStorage.getItem(key);
		if (!raw && getActiveUserId() === 'levon') {
			// One-time migration for levon from legacy single-user key
			const legacy = localStorage.getItem('custom_workout_routines');
			if (legacy) {
				localStorage.setItem(key, legacy);
				localStorage.removeItem('custom_workout_routines');
				raw = legacy;
			}
		}
		if (raw) {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				const cleaned = parsed.filter(r => !(r.title === 'Quick Full Body Warmup' && r.steps?.some(s => s.videoId === 'JOhAdqQLEFI')));
				return cleaned;
			}
		}
	} catch (e) {
		console.error('Failed to load routines from localStorage:', e);
	}
	return [];
}

/**
 * Save all routines to localStorage for the active user.
 * @param {Array} routines
 */
export function saveRoutines(routines) {
	try {
		const key = `${STORAGE_PREFIX}${getActiveUserId()}`;
		localStorage.setItem(key, JSON.stringify(routines));
	} catch (e) {
		console.error('Failed to save routines to localStorage:', e);
	}
}

// ── Session & Stats Persistence ─────────────────────────────────────────────

/**
 * Record or update a workout session in the database.
 * @param {Object} session
 * @returns {Promise<Object>}
 */
export async function saveSession(session) {
	const res = await fetch(`${getApiBase()}/sessions`, {
		method: 'POST',
		headers: getHeaders({
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		}),
		body: JSON.stringify(session)
	});
	if (!res.ok) {
		throw new Error(`Failed to save session: HTTP ${res.status}`);
	}
	return await res.json();
}

/**
 * Fetch stats, streaks, weekly and monthly summary for active user.
 * @returns {Promise<Object>}
 */
export async function fetchStats() {
	const tzOffset = new Date().getTimezoneOffset();
	const res = await fetch(`${getApiBase()}/stats?tz_offset=${tzOffset}`, {
		headers: getHeaders({ 'Accept': 'application/json' })
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch stats: HTTP ${res.status}`);
	}
	return await res.json();
}

/**
 * Fetch session history list for active user.
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
export async function fetchSessions(limit = 50) {
	const res = await fetch(`${getApiBase()}/sessions?limit=${limit}`, {
		headers: getHeaders({ 'Accept': 'application/json' })
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch sessions: HTTP ${res.status}`);
	}
	return await res.json();
}

/**
 * Delete a session by ID.
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function deleteSession(sessionId) {
	const res = await fetch(`${getApiBase()}/sessions/${encodeURIComponent(sessionId)}`, {
		method: 'DELETE',
		headers: getHeaders({ 'Accept': 'application/json' })
	});
	if (!res.ok) {
		throw new Error(`Failed to delete session: HTTP ${res.status}`);
	}
	return true;
}

// ── Exercises API ───────────────────────────────────────────────────────────

/**
 * Fetch all available exercises from the server for the active user.
 * @param {string} [category]
 * @param {string} [discipline]
 * @param {string} [search]
 * @returns {Promise<Array>}
 */
export async function fetchServerExercises(category = '', discipline = '', search = '') {
	const params = new URLSearchParams();
	if (category) params.set('category', category);
	if (discipline) params.set('discipline', discipline);
	if (search) params.set('search', search);

	const qs = params.toString() ? `?${params.toString()}` : '';
	const res = await fetch(`${getApiBase()}/exercises${qs}`, {
		headers: getHeaders({ 'Accept': 'application/json' })
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch exercises: HTTP ${res.status}`);
	}
	return await res.json();
}

/**
 * Save or update a custom exercise on the server.
 * @param {Object} exercise
 * @returns {Promise<Object>}
 */
export async function saveCustomExerciseOnServer(exercise) {
	const res = await fetch(`${getApiBase()}/exercises`, {
		method: 'POST',
		headers: getHeaders({
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		}),
		body: JSON.stringify(exercise)
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.detail || `Failed to save exercise: HTTP ${res.status}`);
	}
	return await res.json();
}

/**
 * Delete a custom exercise by ID on the server.
 * @param {string} exerciseId
 * @returns {Promise<boolean>}
 */
export async function deleteCustomExerciseOnServer(exerciseId) {
	const res = await fetch(`${getApiBase()}/exercises/${encodeURIComponent(exerciseId)}`, {
		method: 'DELETE',
		headers: getHeaders({ 'Accept': 'application/json' })
	});
	if (!res.ok) {
		throw new Error(`Failed to delete exercise: HTTP ${res.status}`);
	}
	return true;
}

// ── Combos API ────────────────────────────────────────────────────────────

/**
 * Fetch combos library from server.
 * @param {string} [category]
 * @param {string} [discipline]
 * @param {string} [search]
 * @returns {Promise<Array>}
 */
export async function fetchServerCombos(category = '', discipline = '', search = '') {
	const params = new URLSearchParams();
	if (category) params.set('category', category);
	if (discipline) params.set('discipline', discipline);
	if (search) params.set('search', search);

	const qs = params.toString() ? `?${params.toString()}` : '';
	const res = await fetch(`${getApiBase()}/combos${qs}`, {
		headers: getHeaders({ 'Accept': 'application/json' })
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch combos: HTTP ${res.status}`);
	}
	return await res.json();
}

/**
 * Save or update a custom combo on the server.
 * @param {Object} combo
 * @returns {Promise<Object>}
 */
export async function saveCustomComboOnServer(combo) {
	const res = await fetch(`${getApiBase()}/combos`, {
		method: 'POST',
		headers: getHeaders({
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		}),
		body: JSON.stringify(combo)
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.detail || `Failed to save combo: HTTP ${res.status}`);
	}
	return await res.json();
}

/**
 * Delete a custom combo by ID on the server.
 * @param {string} comboId
 * @returns {Promise<boolean>}
 */
export async function deleteCustomComboOnServer(comboId) {
	const res = await fetch(`${getApiBase()}/combos/${encodeURIComponent(comboId)}`, {
		method: 'DELETE',
		headers: getHeaders({ 'Accept': 'application/json' })
	});
	if (!res.ok) {
		throw new Error(`Failed to delete combo: HTTP ${res.status}`);
	}
	return true;
}

// ── Import / Export & Sharing ───────────────────────────────────────────────

/**
 * Export a single routine as a JSON file download.
 * @param {Object} routine
 */
export function exportSingleRoutine(routine) {
	const safeName = (routine.title || 'workout').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
	const blob = new Blob([JSON.stringify(routine, null, '\t')], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${safeName}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Export routines as a JSON file download.
 * @param {Array} routines
 */
export function exportRoutines(routines) {
	const blob = new Blob([JSON.stringify(routines, null, '\t')], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `workout_routines_${getActiveUserId()}_${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Build a canonical live URL for a routine.
 * @param {Object} routine
 * @param {string|null} userId
 * @returns {string}
 */
export function buildRoutineUrl(routine, userId = null) {
	if (!routine || !routine.id) return window.location.origin + window.location.pathname;
	const user = (userId || getActiveUserId() || 'levon').trim().toLowerCase();
	const url = new URL(window.location.href);
	url.search = '';
	url.hash = `u=${encodeURIComponent(user)}&r=${encodeURIComponent(routine.id)}`;
	return url.toString();
}

/**
 * Resolve target routine from the current URL (hash or search params).
 * Supports #u=levon&r=pushup-protocol or #r=pushup-protocol.
 * @returns {Promise<{isOwner: boolean, routineId: string, userId: string, routine?: Object}|null>}
 */
export async function getRoutineTargetFromUrl() {
	let routineId = null;
	let userId = null;

	if (window.location.hash) {
		const raw = window.location.hash.replace(/^#/, '');
		const params = new URLSearchParams(raw);
		routineId = params.get('r');
		userId = params.get('u');
	}

	if (!routineId && window.location.search) {
		const params = new URLSearchParams(window.location.search);
		routineId = params.get('r');
		userId = params.get('u');
	}

	if (!routineId) return null;

	const activeUser = getActiveUserId().trim().toLowerCase();
	const targetUser = (userId || activeUser || 'levon').trim().toLowerCase();

	if (targetUser === activeUser) {
		return {
			isOwner: true,
			routineId,
			userId: targetUser
		};
	}

	// Fetch another user's public routine from server
	try {
		const res = await fetch(`${getApiBase()}/routines/${encodeURIComponent(routineId)}?user_id=${encodeURIComponent(targetUser)}`, {
			headers: { 'Accept': 'application/json' }
		});
		if (res.ok) {
			const routine = await res.json();
			if (routine && routine.title) {
				return {
					isOwner: false,
					routineId,
					userId: targetUser,
					routine: {
						...routine,
						creatorUser: targetUser
					}
				};
			}
		}
	} catch (err) {
		console.error('Failed to fetch remote shared routine:', err);
	}

	return {
		isOwner: false,
		routineId,
		userId: targetUser
	};
}

/**
 * Import routines from a JSON file (supports single routine or array of routines).
 * @returns {Promise<{routines: Array, isSingle: boolean}>} Parsed routines array and flag
 */
export function importRoutines() {
	return new Promise((resolve, reject) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = (e) => {
			const file = e.target.files[0];
			if (!file) return reject(new Error('No file selected'));

			const reader = new FileReader();
			reader.onload = (evt) => {
				try {
					let data = JSON.parse(evt.target.result);
					let isSingle = false;

					if (!Array.isArray(data)) {
						if (data && typeof data === 'object' && data.title && Array.isArray(data.steps)) {
							data = [data];
							isSingle = true;
						} else {
							return reject(new Error('Invalid format: expected a routine or an array of routines'));
						}
					}

					const normalized = data.map(routine => {
						if (!routine.title || !Array.isArray(routine.steps)) {
							throw new Error('Invalid routine structure');
						}
						return {
							id: routine.id || generateId(),
							title: routine.title,
							musicTracks: Array.isArray(routine.musicTracks) ? routine.musicTracks : [],
							steps: routine.steps.map(step => ({
								id: step.id || generateId(),
								type: step.type || 'timer',
								stepMode: step.stepMode || (step.targetReps ? 'reps' : 'time'),
								targetReps: step.targetReps || 0,
								exercises: Array.isArray(step.exercises) ? step.exercises : [],
								label: step.label || 'Step',
								videoId: step.videoId || '',
								startSeconds: step.startSeconds || 0,
								endSeconds: step.endSeconds || 0,
								durationSeconds: step.durationSeconds || 30,
								gifUrl: step.gifUrl || step.mediaUrl || '',
								mediaUrl: step.mediaUrl || step.gifUrl || '',
								isBreak: Boolean(step.isBreak),
								musicTracks: Array.isArray(step.musicTracks) ? step.musicTracks : []
							}))
						};
					});

					resolve({ routines: normalized, isSingle });
				} catch (err) {
					reject(new Error('Failed to parse JSON: ' + err.message));
				}
			};
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsText(file);
		};
		input.click();
	});
}

/**
 * Upload an image file (PNG, JPG, WEBP, GIF, SVG) to the server.
 * @param {File|Blob} file
 * @returns {Promise<{url: string, filename: string, size: number, type: string}>}
 */
export async function uploadImageFile(file) {
	const formData = new FormData();
	const filename = file.name || `screenshot_${Date.now()}.png`;
	formData.append('file', file, filename);

	const res = await fetch(`${getApiBase()}/upload`, {
		method: 'POST',
		headers: {
			'X-User-Id': getActiveUserId(),
		},
		body: formData
	});

	if (!res.ok) {
		let errMsg = `Upload failed (HTTP ${res.status})`;
		try {
			const errData = await res.json();
			if (errData && errData.detail) errMsg = errData.detail;
		} catch (_) {}
		throw new Error(errMsg);
	}

	return await res.json();
}

