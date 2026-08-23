/**
 * User module - Soft profile management and switching.
 */

const USER_STORAGE_KEY = 'workout_active_user';
const DISPLAY_NAME_STORAGE_KEY = 'workout_active_display_name';

let activeUser = localStorage.getItem(USER_STORAGE_KEY) || 'levon';
let activeDisplayName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) || 'Levon';

/**
 * Get the current active user ID.
 * @returns {string}
 */
export function getActiveUserId() {
	const stored = localStorage.getItem(USER_STORAGE_KEY);
	return (stored || activeUser || 'levon').trim().toLowerCase();
}

/**
 * Get the current user display name.
 * @returns {string}
 */
export function getActiveDisplayName() {
	const stored = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY);
	return stored || activeDisplayName || 'Levon';
}

/**
 * Set the current active user and notify listeners.
 * @param {string} userId
 * @param {string} [displayName]
 */
export function setActiveUser(userId, displayName) {
	const cleanId = (userId || 'levon').trim().toLowerCase();
	activeUser = cleanId;
	activeDisplayName = displayName || (cleanId.charAt(0).toUpperCase() + cleanId.slice(1));

	localStorage.setItem(USER_STORAGE_KEY, activeUser);
	localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, activeDisplayName);

	document.dispatchEvent(new CustomEvent('workout:userchanged', {
		detail: { userId: activeUser, displayName: activeDisplayName }
	}));
}

/**
 * Fetch all available soft user profiles from the server.
 * @returns {Promise<Array<{id: string, display_name: string, created_at: string}>>}
 */
export async function fetchUsers() {
	const path = window.location.pathname.startsWith('/workout') ? '/workout/api/users' : '/api/users';
	try {
		const res = await fetch(path, { headers: { 'Accept': 'application/json' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.json();
	} catch (e) {
		console.warn('Failed to fetch user profiles:', e);
		return [{ id: getActiveUserId(), display_name: getActiveDisplayName(), created_at: '' }];
	}
}

/**
 * Create a new user profile.
 * @param {string} username
 * @param {string} [displayName]
 * @returns {Promise<{id: string, display_name: string, created_at: string}>}
 */
export async function createUser(username, displayName) {
	const path = window.location.pathname.startsWith('/workout') ? '/workout/api/users' : '/api/users';
	const res = await fetch(path, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		},
		body: JSON.stringify({
			id: username.trim().toLowerCase(),
			display_name: displayName || username.trim()
		})
	});
	if (!res.ok) {
		throw new Error(`Failed to create profile: HTTP ${res.status}`);
	}
	return await res.json();
}
