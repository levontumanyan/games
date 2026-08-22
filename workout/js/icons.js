/**
 * SVG Icons module for unified workout step types and UI actions.
 */

export function getClipIcon(size = 16) {
	return `<svg class="icon-svg icon-clip" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`;
}

export function getTimerIcon(size = 16) {
	return `<svg class="icon-svg icon-timer" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/><path d="m19 5-1.5 1.5"/></svg>`;
}

export function getBreakIcon(size = 16) {
	return `<svg class="icon-svg icon-break" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2h-4a1 1 0 0 0-1 1v2h6V3a1 1 0 0 0-1-1z"/><path d="M15 2a3 3 0 0 1 3 3v0"/><rect x="7" y="6" width="10" height="15" rx="2"/><line x1="7" y1="10" x2="17" y2="10" stroke-width="1.5" opacity="0.6"/></svg>`;
}

export function getStepsIcon(size = 16) {
	return `<svg class="icon-svg icon-steps" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`;
}
