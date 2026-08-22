/**
 * Utility functions for YouTube URL parsing and time formatting.
 */

/**
 * Extract YouTube video ID from various URL formats or a raw 11-char ID.
 * Supports: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/embed/, raw ID.
 * @param {string} input - YouTube URL or video ID
 * @returns {string|null} - 11-character video ID or null if invalid
 */
export function parseYouTubeId(input) {
	if (!input) return null;
	input = input.trim();

	// Raw 11-character ID
	if (/^[A-Za-z0-9_-]{11}$/.test(input)) {
		return input;
	}

	try {
		const url = new URL(input);
		const hostname = url.hostname.replace('www.', '');

		// youtube.com/watch?v=VIDEO_ID or music.youtube.com/watch?v=VIDEO_ID
		if ((hostname === 'youtube.com' || hostname === 'music.youtube.com') && url.pathname === '/watch') {
			const v = url.searchParams.get('v');
			if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
		}

		// youtube.com/embed/VIDEO_ID
		if (hostname === 'youtube.com' && url.pathname.startsWith('/embed/')) {
			const id = url.pathname.split('/embed/')[1]?.split(/[?/]/)[0];
			if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
		}

		// youtube.com/shorts/VIDEO_ID
		if (hostname === 'youtube.com' && url.pathname.startsWith('/shorts/')) {
			const id = url.pathname.split('/shorts/')[1]?.split(/[?/]/)[0];
			if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
		}

		// youtu.be/VIDEO_ID
		if (hostname === 'youtu.be') {
			const id = url.pathname.slice(1).split(/[?/]/)[0];
			if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
		}
	} catch {
		// Not a valid URL, check if it looks like a video ID with extra chars
	}

	return null;
}

/**
 * Parse a time input string in MM:SS or pure seconds format.
 * @param {string} input - Time string (e.g., "1:30", "90", "02:15")
 * @returns {number} - Total seconds, or 0 if invalid
 */
export function parseTime(input) {
	if (!input) return 0;
	input = input.trim();

	// MM:SS format
	if (input.includes(':')) {
		const parts = input.split(':');
		if (parts.length === 2) {
			const minutes = parseInt(parts[0], 10) || 0;
			const seconds = parseInt(parts[1], 10) || 0;
			return minutes * 60 + seconds;
		}
	}

	// Pure seconds
	const num = parseInt(input, 10);
	return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Format seconds into MM:SS display string.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTime(totalSeconds) {
	totalSeconds = Math.max(0, Math.floor(totalSeconds));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Generate a short unique ID.
 * @returns {string}
 */
export function generateId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
