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
 * Encode a workout routine into a short 6-character shareable URL.
 * @param {Object} routine
 * @returns {Promise<string>}
 */
export async function encodeRoutineToShareUrl(routine) {
	if (!routine) return '';

	// Clean payload to keep shared workouts clean and portable
	const payload = {
		title: routine.title || 'Shared Workout',
		steps: (routine.steps || []).map(s => {
			const clean = {
				type: s.type,
				label: s.label || ''
			};
			if (s.type === 'clip') {
				clean.videoId = s.videoId || '';
				if (s.startSeconds) clean.startSeconds = s.startSeconds;
				if (s.endSeconds) clean.endSeconds = s.endSeconds;
			} else if (s.type === 'timer') {
				clean.durationSeconds = s.durationSeconds || 30;
				if (s.isBreak) clean.isBreak = true;
				if (s.gifUrl) clean.gifUrl = s.gifUrl;
				if (s.mediaUrl) clean.mediaUrl = s.mediaUrl;
				if (Array.isArray(s.musicTracks) && s.musicTracks.length > 0) {
					const ytTracks = s.musicTracks
						.filter(t => t.source === 'youtube' && t.videoId)
						.map(t => ({ source: 'youtube', videoId: t.videoId, label: t.label || '' }));
					if (ytTracks.length > 0) {
						clean.musicTracks = ytTracks;
					}
				}
			}
			return clean;
		})
	};

	try {
		const res = await fetch(`${getApiBase()}/share`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (res.ok) {
			const data = await res.json();
			if (data && data.id) {
				const url = new URL(window.location.href);
				url.search = '';
				url.hash = `s=${data.id}`;
				return url.toString();
			}
		}
	} catch (err) {
		console.warn('Server share creation failed, using compressed URL fallback:', err);
	}

	// Fallback to compressed hash if server is offline
	const jsonStr = JSON.stringify(payload);
	let encodedToken = '';
	if (typeof CompressionStream !== 'undefined') {
		try {
			const stream = new Blob([new TextEncoder().encode(jsonStr)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
			const buffer = await new Response(stream).arrayBuffer();
			const bytes = new Uint8Array(buffer);
			let binary = '';
			const chunk = 8192;
			for (let i = 0; i < bytes.length; i += chunk) {
				binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
			}
			encodedToken = 'c.' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		} catch (err) {
			console.warn('CompressionStream fallback failed:', err);
		}
	}

	if (!encodedToken) {
		encodedToken = 'r.' + btoa(encodeURIComponent(jsonStr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	const url = new URL(window.location.href);
	url.search = '';
	url.hash = `share=${encodedToken}`;
	return url.toString();
}

/**
 * Fetch a shared workout from the server by 6-char ID.
 * @param {string} shareId
 * @returns {Promise<Object|null>}
 */
export async function fetchSharedRoutineFromServer(shareId) {
	try {
		const res = await fetch(`${getApiBase()}/share/${encodeURIComponent(shareId)}`, {
			headers: { 'Accept': 'application/json' }
		});
		if (!res.ok) return null;
		const data = await res.json();
		if (!data || !data.title || !Array.isArray(data.steps)) return null;

		return {
			id: generateId(),
			title: data.title,
			steps: data.steps.map(s => ({
				id: generateId(),
				type: s.type || 'timer',
				label: s.label || 'Step',
				videoId: s.videoId || '',
				startSeconds: s.startSeconds || 0,
				endSeconds: s.endSeconds || 0,
				durationSeconds: s.durationSeconds || 30,
				isBreak: Boolean(s.isBreak),
				musicTracks: Array.isArray(s.musicTracks) ? s.musicTracks.map(t => ({
					id: generateId(),
					source: 'youtube',
					videoId: t.videoId,
					label: t.label || ''
				})) : []
			}))
		};
	} catch (err) {
		console.error('Failed to fetch shared routine from server:', err);
		return null;
	}
}

/**
 * Decode a workout routine from a fallback compressed payload token.
 * @param {string} token
 * @returns {Promise<Object|null>}
 */
export async function decodeRoutineFromSharePayload(token) {
	if (!token) return null;
	token = token.trim();

	try {
		let jsonStr = '';

		if (token.startsWith('c.')) {
			const base64 = token.slice(2).replace(/-/g, '+').replace(/_/g, '/');
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			if (typeof DecompressionStream !== 'undefined') {
				const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
				const buffer = await new Response(stream).arrayBuffer();
				jsonStr = new TextDecoder().decode(buffer);
			} else {
				throw new Error('DecompressionStream not supported');
			}
		} else if (token.startsWith('r.')) {
			const base64 = token.slice(2).replace(/-/g, '+').replace(/_/g, '/');
			jsonStr = decodeURIComponent(atob(base64));
		} else {
			const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
			jsonStr = decodeURIComponent(atob(base64));
		}

		const parsed = JSON.parse(jsonStr);
		if (!parsed || !parsed.title || !Array.isArray(parsed.steps)) {
			return null;
		}

		return {
			id: generateId(),
			title: parsed.title,
			steps: parsed.steps.map(s => ({
				id: generateId(),
				type: s.type || 'timer',
				label: s.label || 'Step',
				videoId: s.videoId || '',
				startSeconds: s.startSeconds || 0,
				endSeconds: s.endSeconds || 0,
				durationSeconds: s.durationSeconds || 30,
				isBreak: Boolean(s.isBreak),
				musicTracks: Array.isArray(s.musicTracks) ? s.musicTracks.map(t => ({
					id: generateId(),
					source: 'youtube',
					videoId: t.videoId,
					label: t.label || ''
				})) : []
			}))
		};
	} catch (err) {
		console.error('Failed to decode shared workout payload:', err);
		return null;
	}
}

/**
 * Extract and decode a shared routine from current window URL.
 * Supports both short codes (#s=abc123 or ?s=abc123) and full payloads (#share=... or ?share=...).
 * @returns {Promise<Object|null>}
 */
export async function getSharedRoutineFromUrl() {
	let shortCode = null;
	let fullToken = null;

	// Check hash: #s=<id> or #share=<payload>
	if (window.location.hash) {
		const sMatch = window.location.hash.match(/[#&]s=([A-Za-z0-9_-]+)/);
		if (sMatch) shortCode = sMatch[1];

		const shareMatch = window.location.hash.match(/[#&]share=([^&]+)/);
		if (shareMatch) fullToken = shareMatch[1];
	}

	// Check query params: ?s=<id> or ?share=<payload>
	if (window.location.search) {
		const params = new URLSearchParams(window.location.search);
		if (!shortCode && params.get('s')) shortCode = params.get('s');
		if (!fullToken && params.get('share')) fullToken = params.get('share');
	}

	if (shortCode) {
		const routine = await fetchSharedRoutineFromServer(shortCode);
		if (routine) return routine;
	}

	if (fullToken) {
		return await decodeRoutineFromSharePayload(fullToken);
	}

	return null;
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
							steps: routine.steps.map(step => ({
								id: step.id || generateId(),
								type: step.type || 'timer',
								label: step.label || 'Step',
								videoId: step.videoId || '',
								startSeconds: step.startSeconds || 0,
								endSeconds: step.endSeconds || 0,
								durationSeconds: step.durationSeconds || 30,
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

