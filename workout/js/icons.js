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

export function getShareIcon(size = 16) {
	return `<svg class="icon-svg icon-share" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
}

export function getSaveIcon(size = 16) {
	return `<svg class="icon-svg icon-save" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
}

export function getComboIcon(size = 16) {
	return `<svg class="icon-svg icon-combo" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
}

export function getDuplicateIcon(size = 14) {
	return `<svg class="icon-svg icon-duplicate" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="13" height="13" x="9" y="9" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
}

export function getPlusIcon(size = 14) {
	return `<svg class="icon-svg icon-plus" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
}

export function getMusicIcon(size = 16) {
	return `<svg class="icon-svg icon-music" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
}

export function getMusicPlayIcon(size = 16) {
	return `<svg class="icon-svg icon-music-play" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>`;
}

export function getMusicPauseIcon(size = 16) {
	return `<svg class="icon-svg icon-music-pause" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>`;
}

export function getMusicPrevIcon(size = 16) {
	return `<svg class="icon-svg icon-music-prev" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/><rect x="5" y="4" width="3" height="16" rx="1"/></svg>`;
}

export function getMusicNextIcon(size = 16) {
	return `<svg class="icon-svg icon-music-next" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="16" y="4" width="3" height="16" rx="1"/></svg>`;
}

export function getVolumeIcon(size = 16) {
	return `<svg class="icon-svg icon-volume" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
}

export function getVolumeMuteIcon(size = 16) {
	return `<svg class="icon-svg icon-volume-mute" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
}

export function getSearchIcon(size = 16) {
	return `<svg class="icon-svg icon-search" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
}

export function getRepsIcon(size = 16) {
	return `<svg class="icon-svg icon-reps" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1a5 5 0 0 0-7.07 0l-.93.93a5 5 0 0 1-7.07 0l-1.86-1.86a5 5 0 0 1 0-7.07l.93-.93a5 5 0 0 0 0-7.07l-1-1"/><path d="m3 3 1 1a5 5 0 0 0 7.07 0l.93-.93a5 5 0 0 1 7.07 0l1.86 1.86a5 5 0 0 1 0 7.07l-.93.93a5 5 0 0 0 0 7.07l1 1"/></svg>`;
}

export function getAnatomyIcon(size = 16) {
	return `<svg class="icon-svg icon-anatomy" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4c0 1.5.8 2.8 2 3.5V14l-3 4v4h2v-3.5l2-3.5 2 3.5V22h2v-4l-3-4V9.5c1.2-.7 2-2 2-3.5a4 4 0 0 0-4-4Z"/><path d="M8 8H5a2 2 0 0 0-2 2v2"/><path d="M16 8h3a2 2 0 0 1 2 2v2"/></svg>`;
}

export function getExerciseIcon(size = 16) {
	return `<svg class="icon-svg icon-exercise" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 6.5 11 11"/><circle cx="12" cy="12" r="9"/></svg>`;
}

export const MUSCLE_SVGS = {
	chest: (s = 16) => `<svg class="muscle-svg muscle-svg-chest" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16"/><path d="M4 7c2.5-1 5.5-.5 8 2 2.5-2.5 5.5-3 8-2 0 6-3.5 11-8 13-4.5-2-8-7-8-13Z"/><path d="M6 12c2 0 4 1 6 3 2-2 4-3 6-3"/></svg>`,
	shoulders: (s = 16) => `<svg class="muscle-svg muscle-svg-shoulders" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6" r="3"/><path d="M4 14c0-3.3 3.5-5 8-5s8 1.7 8 5v5H4v-5Z"/><path d="M4 14l-2 4m18-4l2 4"/></svg>`,
	biceps: (s = 16) => `<svg class="muscle-svg muscle-svg-biceps" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17c2-1 4-3.5 4-7a4 4 0 0 1 8 0c0 3.5 2 6 4 7"/><path d="M7 17v3h10v-3"/><path d="M9 10c1-1.5 2.5-2 3-2s2 .5 3 2"/></svg>`,
	triceps: (s = 16) => `<svg class="muscle-svg muscle-svg-triceps" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v6c0 4-2.5 8-5 10-2.5-2-5-6-5-10V4Z"/><path d="M10 4v8c0 1.5 1 2.5 2 3 1-.5 2-1.5 2-3V4"/></svg>`,
	forearms: (s = 16) => `<svg class="muscle-svg muscle-svg-forearms" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="11" width="10" height="10" rx="2"/><path d="M9 11V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5"/><path d="M7 15h10"/></svg>`,
	abs: (s = 16) => `<svg class="muscle-svg muscle-svg-abs" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="3"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="5" y1="9" x2="19" y2="9"/><line x1="5" y1="15" x2="19" y2="15"/></svg>`,
	obliques: (s = 16) => `<svg class="muscle-svg muscle-svg-obliques" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l-2 16H8L6 4Z"/><path d="m8 7 8 5m-8 3 8 5m-8-12 4 3"/></svg>`,
	pelvic_floor: (s = 16) => `<svg class="muscle-svg muscle-svg-pelvic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6c3 6 5 12 8 12s5-6 8-12"/><circle cx="12" cy="7" r="2.5"/><line x1="12" y1="9.5" x2="12" y2="18"/><path d="M8 14c2 2 6 2 8 0"/></svg>`,
	adductors: (s = 16) => `<svg class="muscle-svg muscle-svg-adductors" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l4 18M18 3l-4 18"/><path d="M10 11l4 2m-4 2l4 2"/><circle cx="12" cy="7" r="2"/></svg>`,
	hip_flexors: (s = 16) => `<svg class="muscle-svg muscle-svg-hip-flexors" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-2 8 11-12h-7l2-8Z"/></svg>`,
	quads: (s = 16) => `<svg class="muscle-svg muscle-svg-quads" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10l-1.5 14a3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3L7 3Z"/><line x1="12" y1="3" x2="12" y2="17"/><path d="M8.5 10c2 1 5 1 7 0"/></svg>`,
	hamstrings: (s = 16) => `<svg class="muscle-svg muscle-svg-hamstrings" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4c2 4 2 10 0 16m10-16c-2 4-2 10 0 16"/><path d="M10 8h4m-5 4h6m-5 4h4"/></svg>`,
	glutes: (s = 16) => `<svg class="muscle-svg muscle-svg-glutes" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5c-3.5-3-8-.5-8 4.5 0 6 5 9.5 8 10.5 3-1 8-4.5 8-10.5 0-5-4.5-7.5-8-4.5Z"/><path d="M12 6v13"/></svg>`,
	calves: (s = 16) => `<svg class="muscle-svg muscle-svg-calves" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3c-3 4-3 9 0 13l1 5h4l1-5c3-4 3-9 0-13H9Z"/><path d="M10 8c1.3 1 2.7 1 4 0m-4 5c1.3 1 2.7 1 4 0"/></svg>`,
	upper_back: (s = 16) => `<svg class="muscle-svg muscle-svg-upper-back" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 7v6c0 5 4 8 8 9 4-1 8-4 8-9V7l-8-4Z"/><path d="M8 11h8M12 7v10"/></svg>`,
	lats: (s = 16) => `<svg class="muscle-svg muscle-svg-lats" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16"/><path d="M12 5C8 5 4 8 3 13c3 0 6 2 9 6 3-4 6-6 9-6-1-5-5-8-9-9Z"/></svg>`,
	lower_back: (s = 16) => `<svg class="muscle-svg muscle-svg-lower-back" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v16H8z"/><line x1="12" y1="4" x2="12" y2="20"/><path d="M8 8h8M8 12h8M8 16h8"/></svg>`,
	traps: (s = 16) => `<svg class="muscle-svg muscle-svg-traps" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 9l3 11h10l3-11-8-6Z"/><path d="M12 3v17M8 12l4 3 4-3"/></svg>`,
};

export const CATEGORY_SVGS = {
	strength: (s = 16) => `<svg class="cat-svg cat-svg-strength" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1a5 5 0 0 0-7.07 0l-.93.93a5 5 0 0 1-7.07 0l-1.86-1.86a5 5 0 0 1 0-7.07l.93-.93a5 5 0 0 0 0-7.07l-1-1"/><path d="m3 3 1 1a5 5 0 0 0 7.07 0l.93-.93a5 5 0 0 1 7.07 0l1.86 1.86a5 5 0 0 1 0 7.07l-.93.93a5 5 0 0 0 0 7.07l1 1"/></svg>`,
	drill: (s = 16) => `<svg class="cat-svg cat-svg-drill" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
	technique: (s = 16) => `<svg class="cat-svg cat-svg-technique" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>`,
	stretch: (s = 16) => `<svg class="cat-svg cat-svg-stretch" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.5"/><path d="M12 7.5v6l4 4M12 13.5l-4 4M7 10h10"/></svg>`,
	cardio: (s = 16) => `<svg class="cat-svg cat-svg-cardio" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/><path d="M3.5 12h4l2-4 3 8 2-5 2 2.5 4-.5"/></svg>`,
	mobility: (s = 16) => `<svg class="cat-svg cat-svg-mobility" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`,
};

export const DISCIPLINE_SVGS = {
	muay_thai: (s = 16) => `<svg class="disc-svg disc-svg-muay-thai" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="6" r="3"/><circle cx="17" cy="6" r="3"/><path d="M4 14c0 3 3 6 8 6s8-3 8-6v-2H4v2Z"/><line x1="12" y1="12" x2="12" y2="20"/></svg>`,
	boxing: (s = 16) => `<svg class="disc-svg disc-svg-boxing" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10a5 5 0 0 1 10 0v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-5Z"/><path d="M16 12h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2"/><rect x="7" y="18" width="8" height="4" rx="1"/></svg>`,
	calisthenics: (s = 16) => `<svg class="disc-svg disc-svg-calisthenics" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M7 6v14m10-14v14"/><circle cx="12" cy="11" r="2.5"/><path d="M10 15h4"/></svg>`,
	general: (s = 16) => `<svg class="disc-svg disc-svg-general" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 6.5 11 11"/><rect x="2" y="6" width="3" height="12" rx="1"/><rect x="19" y="6" width="3" height="12" rx="1"/><rect x="5" y="9" width="2" height="6" rx="0.5"/><rect x="17" y="9" width="2" height="6" rx="0.5"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`,
	yoga: (s = 16) => `<svg class="disc-svg disc-svg-yoga" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.5"/><path d="M12 7.5v6l4 4M12 13.5l-4 4M7 10h10"/></svg>`,
};

export const MEDIA_KIND_SVGS = {
	instruction: (s = 14) => `<svg class="media-kind-svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`,
	demonstration: (s = 14) => `<svg class="media-kind-svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
	photo: (s = 14) => `<svg class="media-kind-svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
	animation: (s = 14) => `<svg class="media-kind-svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
};

export function getMuscleIcon(muscleKey, size = 16) {
	const key = (muscleKey || '').toLowerCase();
	const norm = key === 'groin' ? 'adductors' : key;
	if (MUSCLE_SVGS[norm]) {
		return MUSCLE_SVGS[norm](size);
	}
	return `<svg class="muscle-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></svg>`;
}

export function getCategoryIcon(catKey, size = 16) {
	const key = (catKey || '').toLowerCase();
	if (CATEGORY_SVGS[key]) {
		return CATEGORY_SVGS[key](size);
	}
	return getExerciseIcon(size);
}

export function getDisciplineIcon(discKey, size = 16) {
	const key = (discKey || '').toLowerCase();
	if (DISCIPLINE_SVGS[key]) {
		return DISCIPLINE_SVGS[key](size);
	}
	return getExerciseIcon(size);
}

export function getMediaKindIcon(kindKey, size = 14) {
	let key = (kindKey || 'demonstration').toLowerCase();
	if (key === 'drill') key = 'demonstration';
	if (MEDIA_KIND_SVGS[key]) {
		return MEDIA_KIND_SVGS[key](size);
	}
	return MEDIA_KIND_SVGS.demonstration(size);
}

export function getFlameIcon(size = 16) {
	return `<svg class="icon-svg icon-flame" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/></svg>`;
}

export function getTrophyIcon(size = 16) {
	return `<svg class="icon-svg icon-trophy" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H8v4h8v-4h-1c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
}

export function getChartIcon(size = 16) {
	return `<svg class="icon-svg icon-chart" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`;
}

export function getCalendarIcon(size = 16) {
	return `<svg class="icon-svg icon-calendar" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
}

export function getHistoryIcon(size = 16) {
	return `<svg class="icon-svg icon-history" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`;
}

export function getTargetIcon(size = 16) {
	return `<svg class="icon-svg icon-target" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
}




