/**
 * Utility functions for YouTube URL parsing and time formatting.
 */

/**
 * Extract YouTube video ID and optional start timestamp from various URL formats.
 * @param {string} input - YouTube URL or video ID
 * @returns {{ videoId: string, startSeconds: number|null } | null}
 */
export function parseYouTubeInfo(input) {
	if (!input) return null;
	input = input.trim();

	// Raw 11-character ID
	if (/^[A-Za-z0-9_-]{11}$/.test(input)) {
		return { videoId: input, startSeconds: null };
	}

	try {
		const url = new URL(input);
		const hostname = url.hostname.replace('www.', '');
		let videoId = null;

		if ((hostname === 'youtube.com' || hostname === 'music.youtube.com') && url.pathname === '/watch') {
			const v = url.searchParams.get('v');
			if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) videoId = v;
		} else if (hostname === 'youtube.com' && url.pathname.startsWith('/embed/')) {
			const id = url.pathname.split('/embed/')[1]?.split(/[?/]/)[0];
			if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) videoId = id;
		} else if (hostname === 'youtube.com' && url.pathname.startsWith('/shorts/')) {
			const id = url.pathname.split('/shorts/')[1]?.split(/[?/]/)[0];
			if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) videoId = id;
		} else if (hostname === 'youtu.be') {
			const id = url.pathname.slice(1).split(/[?/]/)[0];
			if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) videoId = id;
		}

		if (!videoId) return null;

		// Extract timestamp if present in query params or fragment
		let timeParam = url.searchParams.get('t') || url.searchParams.get('start') || url.searchParams.get('time_continue');
		if (!timeParam && url.hash && url.hash.includes('t=')) {
			const match = url.hash.match(/t=([^&]+)/);
			if (match) timeParam = match[1];
		}

		const startSeconds = timeParam ? parseTime(timeParam) : null;
		return { videoId, startSeconds };
	} catch {
		// Not a valid URL
	}

	return null;
}

/**
 * Legacy wrapper: Extract YouTube video ID.
 * @param {string} input - YouTube URL or video ID
 * @returns {string|null}
 */
export function parseYouTubeId(input) {
	const info = parseYouTubeInfo(input);
	return info ? info.videoId : null;
}

/**
 * Parse a time input string in various formats:
 * - MM:SS (e.g. "1:30" -> 90)
 * - HH:MM:SS (e.g. "1:02:30" -> 3750)
 * - Pure seconds (e.g. "90", "90s" -> 90)
 * - Human units (e.g. "1m30s", "1m 30s", "2m", "1h 5m" -> 3900)
 * @param {string|number} input
 * @returns {number} - Total seconds, or 0 if invalid
 */
export function parseTime(input) {
	if (typeof input === 'number') return Math.max(0, Math.floor(input));
	if (!input) return 0;
	input = String(input).trim().toLowerCase();

	// Check if human format: e.g. "1h 20m 30s", "1m30s", "45s"
	if (/[hms]/.test(input)) {
		let total = 0;
		const hoursMatch = input.match(/(\d+)\s*h/);
		const minutesMatch = input.match(/(\d+)\s*m/);
		const secondsMatch = input.match(/(\d+)\s*s/);

		if (hoursMatch) total += parseInt(hoursMatch[1], 10) * 3600;
		if (minutesMatch) total += parseInt(minutesMatch[1], 10) * 60;
		if (secondsMatch) total += parseInt(secondsMatch[1], 10);

		if (hoursMatch || minutesMatch || secondsMatch) {
			return total;
		}
	}

	// Colon-separated: MM:SS or HH:MM:SS
	if (input.includes(':')) {
		const parts = input.split(':').map(p => parseInt(p, 10) || 0);
		if (parts.length === 2) {
			return parts[0] * 60 + parts[1];
		}
		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}
	}

	// Pure seconds (with or without 's')
	const clean = input.replace(/[^0-9]/g, '');
	const num = parseInt(clean, 10);
	return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Format seconds into MM:SS display string (or HH:MM:SS if >= 1 hour).
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTime(totalSeconds) {
	totalSeconds = Math.max(0, Math.floor(totalSeconds || 0));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Format seconds into compact friendly string like "45s", "1m 30s", "2m".
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatFriendlyDuration(totalSeconds) {
	totalSeconds = Math.max(0, Math.floor(totalSeconds || 0));
	if (totalSeconds === 0) return '0s';

	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	const parts = [];
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

	return parts.join(' ');
}

/**
 * Generate a short unique ID.
 * @returns {string}
 */
export function generateId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Copy text to clipboard with fallback.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch (e) {
		console.warn('navigator.clipboard failed, using fallback:', e);
	}

	try {
		const textArea = document.createElement('textarea');
		textArea.value = text;
		textArea.style.position = 'fixed';
		textArea.style.left = '-999999px';
		textArea.style.top = '-999999px';
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();
		const successful = document.execCommand('copy');
		document.body.removeChild(textArea);
		return Boolean(successful);
	} catch (err) {
		console.error('Fallback clipboard copy failed:', err);
		return false;
	}
}

/**
 * Show a sleek floating toast notification for a brief duration.
 * @param {string} message
 * @param {number} [duration=3000]
 */
export function showToast(message, duration = 3000) {
	let container = document.getElementById('toast-container');
	if (!container) {
		container = document.createElement('div');
		container.id = 'toast-container';
		container.className = 'toast-container';
		document.body.appendChild(container);
	}

	const toast = document.createElement('div');
	toast.className = 'toast-pill';
	toast.innerHTML = message;
	container.appendChild(toast);

	requestAnimationFrame(() => {
		toast.classList.add('show');
	});

	setTimeout(() => {
		toast.classList.remove('show');
		setTimeout(() => {
			toast.remove();
		}, 300);
	}, duration);
}


