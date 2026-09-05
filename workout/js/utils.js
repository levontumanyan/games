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
		return { videoId: input, playlistId: null, startSeconds: null, isPlaylist: false };
	}

	try {
		const url = new URL(input);
		const hostname = url.hostname.replace('www.', '');
		let videoId = null;
		let playlistId = url.searchParams.get('list') || null;

		if ((hostname === 'youtube.com' || hostname === 'music.youtube.com')) {
			if (url.pathname === '/watch') {
				const v = url.searchParams.get('v');
				if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) videoId = v;
			} else if (url.pathname === '/playlist') {
				// Pure playlist page (e.g. https://music.youtube.com/playlist?list=OLAK5uy...)
				if (playlistId) {
					// playlistId is already set
				}
			} else if (url.pathname.startsWith('/embed/')) {
				const id = url.pathname.split('/embed/')[1]?.split(/[?/]/)[0];
				if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) videoId = id;
			} else if (url.pathname.startsWith('/shorts/')) {
				const id = url.pathname.split('/shorts/')[1]?.split(/[?/]/)[0];
				if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) videoId = id;
			}
		} else if (hostname === 'youtu.be') {
			const id = url.pathname.slice(1).split(/[?/]/)[0];
			if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) videoId = id;
		}

		if (!videoId && !playlistId) return null;

		// Extract timestamp if present in query params or fragment
		let timeParam = url.searchParams.get('t') || url.searchParams.get('start') || url.searchParams.get('time_continue');
		if (!timeParam && url.hash && url.hash.includes('t=')) {
			const match = url.hash.match(/t=([^&]+)/);
			if (match) timeParam = match[1];
		}

		const startSeconds = timeParam ? parseTime(timeParam) : null;
		return {
			videoId,
			playlistId,
			startSeconds,
			isPlaylist: Boolean(playlistId && !videoId)
		};
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
 * Extract YouTube playlist ID if present.
 * @param {string} input - YouTube URL or playlist ID
 * @returns {string|null}
 */
export function parseYouTubePlaylistId(input) {
	const info = parseYouTubeInfo(input);
	return info ? info.playlistId : null;
}

/**
 * Return a canonical YouTube video thumbnail URL.
 * @param {string} videoIdOrUrl - Video ID or YouTube URL
 * @param {'default'|'mq'|'hq'|'maxres'} [quality='mq']
 * @returns {string}
 */
export function getYouTubeThumbnailUrl(videoIdOrUrl, quality = 'mq') {
	const vid = parseYouTubeId(videoIdOrUrl) || (videoIdOrUrl && /^[A-Za-z0-9_-]{11}$/.test(videoIdOrUrl) ? videoIdOrUrl : '');
	if (!vid) return '';
	const suffix = quality === 'default' ? 'default.jpg' : `${quality}default.jpg`;
	return `https://img.youtube.com/vi/${vid}/${suffix}`;
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

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
	if (!str && str !== 0) return '';
	const div = document.createElement('div');
	div.textContent = String(str);
	return div.innerHTML;
}

/**
 * Calculate the effective target reps for a sub-exercise within a compound step.
 * Respects explicit sub-exercise reps, or evenly/proportionally divides parent targetReps.
 * @param {Object} step - Parent step
 * @param {number} subIndex - Index of the sub-exercise (0-based)
 * @param {number} totalSubSteps - Total count of sub-exercises in this step
 * @param {Object} [subEx] - Resolved sub-exercise object
 * @returns {number}
 */
export function getEffectiveSubStepReps(step, subIndex = 0, totalSubSteps = 1, subEx = null) {
	if (subEx) {
		const explicit = subEx.targetReps ?? subEx.reps;
		if (explicit !== undefined && explicit !== null && Number(explicit) > 0) {
			return Number(explicit);
		}
	}
	const count = Math.max(1, totalSubSteps || (step?.exercises?.length || 1));
	const isRepsMode = step?.stepMode === 'reps' || (!step?.stepMode && Boolean(step?.targetReps) && Number(step?.targetReps) > 0);

	if (isRepsMode) {
		const totalReps = Math.max(1, Number(step.targetReps) || 20);
		const base = Math.floor(totalReps / count);
		const remainder = totalReps % count;
		const allocated = subIndex < remainder ? base + 1 : base;
		return Math.max(1, allocated);
	}

	if (subEx && subEx.default_mode === 'reps' && subEx.default_quantity) {
		return Number(subEx.default_quantity);
	}

	return 20;
}

/**
 * Calculate the effective duration in seconds for a sub-exercise within a compound step.
 * Respects explicit sub-exercise duration, or evenly divides parent step duration.
 * @param {Object} step - Parent step
 * @param {number} subIndex - Index of the sub-exercise (0-based)
 * @param {number} totalSubSteps - Total count of sub-exercises in this step
 * @param {Object} [subEx] - Resolved sub-exercise object
 * @returns {number}
 */
export function getEffectiveSubStepDuration(step, subIndex = 0, totalSubSteps = 1, subEx = null) {
	if (subEx) {
		const explicit = subEx.durationSeconds ?? subEx.duration;
		if (explicit !== undefined && explicit !== null && Number(explicit) > 0) {
			return Number(explicit);
		}
	}
	const count = Math.max(1, totalSubSteps || (step?.exercises?.length || 1));
	const isTimeMode = step?.stepMode === 'time' || (step?.stepMode !== 'reps' && (!step?.targetReps || Number(step?.targetReps) === 0));

	if (isTimeMode && count > 1) {
		const totalSec = Math.max(1, Number(step?.durationSeconds) || 30);
		const base = Math.floor(totalSec / count);
		const remainder = totalSec % count;
		const allocated = subIndex < remainder ? base + 1 : base;
		return Math.max(1, allocated);
	}

	if (subEx && subEx.default_mode === 'time' && subEx.default_quantity) {
		return Number(subEx.default_quantity);
	}

	return Number(step?.durationSeconds) || 30;
}

/**
 * Configure an input or textarea element with standard attributes to disable
 * browser autocomplete suggestions, autocorrect, autocapitalize, and spellcheck.
 * @param {HTMLElement} el
 */
export function applyCleanInputAttributes(el) {
	if (!el || !(el instanceof HTMLElement)) return;
	const tag = el.tagName.toLowerCase();
	if (tag !== 'input' && tag !== 'textarea') return;
	if (tag === 'input') {
		const type = (el.getAttribute('type') || 'text').toLowerCase();
		if (['file', 'checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'hidden', 'color'].includes(type)) {
			return;
		}
	}

	if (!el.classList.contains('clean-input')) {
		el.classList.add('clean-input');
	}
	el.setAttribute('autocomplete', 'off');
	el.setAttribute('autocorrect', 'off');
	el.setAttribute('autocapitalize', 'off');
	el.setAttribute('spellcheck', 'false');
}

/**
 * Initialize automatic enforcement of clean input attributes across all current
 * and dynamically added inputs in the document.
 */
export function initInputCleanlinessEnforcer() {
	if (typeof document === 'undefined') return;

	const selector = 'input:not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]):not([type="color"]), textarea';

	// Enforce on all existing matching elements
	document.querySelectorAll(selector).forEach(applyCleanInputAttributes);

	// Enforce on focusin so dynamically added/rendered inputs are guaranteed clean before first keystroke
	document.addEventListener('focusin', (e) => {
		if (e.target && e.target.matches && e.target.matches(selector)) {
			applyCleanInputAttributes(e.target);
		}
	}, true);

	// MutationObserver to catch elements as soon as they are inserted into the DOM
	if (typeof MutationObserver !== 'undefined') {
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node.nodeType !== Node.ELEMENT_NODE) continue;
					if (node.matches && node.matches(selector)) {
						applyCleanInputAttributes(node);
					}
					if (node.querySelectorAll) {
						node.querySelectorAll(selector).forEach(applyCleanInputAttributes);
					}
				}
			}
		});

		observer.observe(document.body || document.documentElement, {
			childList: true,
			subtree: true
		});
	}
}


