/**
 * Taxonomy Module - Pure data definitions and badge formatters with zero external dependencies.
 * Serves as the foundational leaf module in the dependency graph.
 */

export const MUSCLE_DEFINITIONS = {
	chest: {
		id: 'chest',
		label: 'Chest (Pectorals)',
		icon: '🫁',
		region: 'upper',
		color: '#c46860',
		paths: {
			front: ['path-chest-left', 'path-chest-right'],
			back: [],
		},
	},
	shoulders: {
		id: 'shoulders',
		label: 'Shoulders (Deltoids)',
		icon: '🥋',
		region: 'upper',
		color: '#c77953',
		paths: {
			front: ['path-delt-front-left', 'path-delt-front-right'],
			back: ['path-delt-back-left', 'path-delt-back-right'],
		},
	},
	biceps: {
		id: 'biceps',
		label: 'Biceps',
		icon: '💪',
		region: 'upper',
		color: '#cbb07a',
		paths: {
			front: ['path-bicep-left', 'path-bicep-right'],
			back: [],
		},
	},
	triceps: {
		id: 'triceps',
		label: 'Triceps',
		icon: '🦾',
		region: 'upper',
		color: '#d19e5b',
		paths: {
			front: [],
			back: ['path-tricep-left', 'path-tricep-right'],
		},
	},
	forearms: {
		id: 'forearms',
		label: 'Forearms & Wrists',
		icon: '✊',
		region: 'upper',
		color: '#9ea2bd',
		paths: {
			front: ['path-forearm-front-left', 'path-forearm-front-right'],
			back: ['path-forearm-back-left', 'path-forearm-back-right'],
		},
	},
	abs: {
		id: 'abs',
		label: 'Abs & Core',
		icon: '🍫',
		region: 'core',
		color: '#5fa778',
		paths: {
			front: ['path-abs-upper', 'path-abs-mid', 'path-abs-lower'],
			back: [],
		},
	},
	obliques: {
		id: 'obliques',
		label: 'Obliques & Flanks',
		icon: '📐',
		region: 'core',
		color: '#6aa3a9',
		paths: {
			front: ['path-oblique-left', 'path-oblique-right'],
			back: [],
		},
	},
	pelvic_floor: {
		id: 'pelvic_floor',
		label: 'Pelvic Floor & Base',
		icon: '⚓',
		region: 'core',
		color: '#8195a2',
		paths: {
			front: ['path-pelvic-front'],
			back: ['path-pelvic-back'],
		},
	},
	groin: {
		id: 'groin',
		label: 'Groin & Adductors',
		icon: '🌿',
		region: 'lower',
		color: '#78a88a',
		paths: {
			front: ['path-groin-left', 'path-groin-right'],
			back: ['path-groin-back-left', 'path-groin-back-right'],
		},
	},
	hip_flexors: {
		id: 'hip_flexors',
		label: 'Hip Flexors & Psoas',
		icon: '⚡',
		region: 'core',
		color: '#d19e5b',
		paths: {
			front: ['path-hip-flexor-left', 'path-hip-flexor-right'],
			back: [],
		},
	},
	quads: {
		id: 'quads',
		label: 'Quadriceps',
		icon: '🦵',
		region: 'lower',
		color: '#c46860',
		paths: {
			front: ['path-quad-left', 'path-quad-right'],
			back: [],
		},
	},
	hamstrings: {
		id: 'hamstrings',
		label: 'Hamstrings',
		icon: '🏃',
		region: 'lower',
		color: '#c77953',
		paths: {
			front: [],
			back: ['path-hamstring-left', 'path-hamstring-right'],
		},
	},
	glutes: {
		id: 'glutes',
		label: 'Glutes',
		icon: '🍑',
		region: 'lower',
		color: '#5fa778',
		paths: {
			front: [],
			back: ['path-glute-left', 'path-glute-right'],
		},
	},
	calves: {
		id: 'calves',
		label: 'Calves & Ankles',
		icon: '🦶',
		region: 'lower',
		color: '#6aa3a9',
		paths: {
			front: ['path-calf-front-left', 'path-calf-front-right'],
			back: ['path-calf-back-left', 'path-calf-back-right'],
		},
	},
	upper_back: {
		id: 'upper_back',
		label: 'Upper Back & Rhomboids',
		icon: '🛡️',
		region: 'back',
		color: '#8195a2',
		paths: {
			front: [],
			back: ['path-rhomboids-mid'],
		},
	},
	lats: {
		id: 'lats',
		label: 'Lats (Wings)',
		icon: '🦅',
		region: 'back',
		color: '#5fa778',
		paths: {
			front: [],
			back: ['path-lats-left', 'path-lats-right'],
		},
	},
	lower_back: {
		id: 'lower_back',
		label: 'Lower Back (Erectors)',
		icon: '🪵',
		region: 'back',
		color: '#cbb07a',
		paths: {
			front: [],
			back: ['path-lower-back'],
		},
	},
	traps: {
		id: 'traps',
		label: 'Traps & Neck',
		icon: '🪨',
		region: 'upper',
		color: '#c46860',
		paths: {
			front: ['path-neck-front'],
			back: ['path-trap-left', 'path-trap-right'],
		},
	},
};

export const MUSCLE_GROUPS = MUSCLE_DEFINITIONS;

export const CATEGORIES = {
	strength: { label: 'Strength / Force', icon: '💪', color: '#5fa778', bg: 'rgba(95, 167, 120, 0.14)' },
	drill: { label: 'Drills & Speed', icon: '⚡', color: '#6aa3a9', bg: 'rgba(106, 163, 169, 0.14)' },
	technique: { label: 'Technique & Form', icon: '🥋', color: '#8195a2', bg: 'rgba(129, 149, 162, 0.14)' },
	stretch: { label: 'Stretch & Recovery', icon: '🧘', color: '#78a88a', bg: 'rgba(120, 168, 138, 0.14)' },
	cardio: { label: 'Cardio & HIIT', icon: '🫀', color: '#c46860', bg: 'rgba(196, 104, 96, 0.14)' },
	mobility: { label: 'Mobility & Joints', icon: '🔄', color: '#cbb07a', bg: 'rgba(203, 176, 122, 0.14)' },
};

export const DISCIPLINES = {
	muay_thai: { label: 'Muay Thai', icon: '🥊', color: '#c46860' },
	boxing: { label: 'Boxing', icon: '🥊', color: '#c77953' },
	calisthenics: { label: 'Calisthenics', icon: '🤸', color: '#6aa3a9' },
	general: { label: 'General Fitness', icon: '🏋️', color: '#5fa778' },
	yoga: { label: 'Yoga', icon: '🧘', color: '#78a88a' },
};

export const MEDIA_KINDS = {
	instruction: { label: 'Instruction & Tutorial', icon: '🎬', color: '#6aa3a9', bg: 'rgba(106, 163, 169, 0.14)' },
	demonstration: { label: 'Exercise Execution', icon: '⚡', color: '#cbb07a', bg: 'rgba(203, 176, 122, 0.14)' },
	animation: { label: 'Looping GIF / SVG', icon: '✨', color: '#8195a2', bg: 'rgba(129, 149, 162, 0.14)' },
	photo: { label: 'Form Photo & Cue', icon: '📷', color: '#78a88a', bg: 'rgba(120, 168, 138, 0.14)' },
};

/**
 * Get display info for a media asset kind.
 * @param {string} kind
 * @returns {Object}
 */
export function getMediaKindInfo(kind) {
	const k = (kind || 'demonstration').toLowerCase();
	return MEDIA_KINDS[k] || { label: 'Media', icon: '🎬', color: '#9ea2bd', bg: 'rgba(255,255,255,0.1)' };
}

/**
 * Render HTML badge for a media asset kind.
 * @param {string} kind
 * @returns {string}
 */
export function getMediaKindBadgeHtml(kind) {
	const info = getMediaKindInfo(kind);
	return `<span class="ex-media-kind-badge" style="--kind-color:${info.color};--kind-bg:${info.bg}">
		<span class="kind-icon">${info.icon}</span>
		<span class="kind-label">${info.label}</span>
	</span>`;
}

/**
 * Format a category badge HTML.
 * @param {string} category
 * @returns {string}
 */
export function getCategoryBadgeHtml(category) {
	const cat = (category || 'strength').toLowerCase();
	const info = CATEGORIES[cat] || { label: cat, icon: '💪', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' };
	return `<span class="ex-cat-badge ex-cat-${cat}" style="--badge-color:${info.color};--badge-bg:${info.bg}">
		<span class="ex-cat-icon">${info.icon}</span>
		<span class="ex-cat-label">${info.label}</span>
	</span>`;
}

/**
 * Format a discipline badge HTML.
 * @param {string} discipline
 * @returns {string}
 */
export function getDisciplineBadgeHtml(discipline) {
	const disc = (discipline || 'general').toLowerCase();
	const info = DISCIPLINES[disc] || { label: disc.replace('_', ' ').toUpperCase(), icon: '🏋️', color: '#9ea2bd' };
	return `<span class="ex-disc-badge ex-disc-${disc}" title="${info.label}">
		<span class="ex-disc-icon">${info.icon}</span>
		<span class="ex-disc-label">${info.label}</span>
	</span>`;
}

/**
 * Render HTML badge for a muscle group.
 * @param {string} muscleKey
 * @param {boolean} [isPrimary=true]
 * @returns {string}
 */
export function getMuscleBadgeHtml(muscleKey, isPrimary = true) {
	const def = MUSCLE_DEFINITIONS[muscleKey] || { label: muscleKey };
	const typeClass = isPrimary ? 'muscle-badge-primary' : 'muscle-badge-secondary';
	return `<span class="ex-muscle-badge ${typeClass}" title="${isPrimary ? 'Primary Target' : 'Secondary Synergist'}: ${def.label}">
		<span class="muscle-label">${isPrimary ? '• ' : ''}${def.label}</span>
	</span>`;
}

/**
 * Generate <option> markup for category selection dropdowns.
 * @param {string} [selected='strength']
 * @returns {string}
 */
export function getCategoryOptionsHtml(selected = 'strength') {
	const current = (selected || 'strength').toLowerCase();
	return Object.entries(CATEGORIES)
		.map(([key, info]) => `<option value="${key}" ${key === current ? 'selected' : ''}>${info.icon} ${info.label}</option>`)
		.join('\n');
}

/**
 * Generate <option> markup for discipline selection dropdowns.
 * @param {string} [selected='general']
 * @returns {string}
 */
export function getDisciplineOptionsHtml(selected = 'general') {
	const current = (selected || 'general').toLowerCase();
	return Object.entries(DISCIPLINES)
		.map(([key, info]) => `<option value="${key}" ${key === current ? 'selected' : ''}>${info.icon} ${info.label}</option>`)
		.join('\n');
}

/**
 * Generate filter pill buttons for discipline navigation.
 * @param {string} [activeDisc='all']
 * @returns {string}
 */
export function getDisciplineFilterPillsHtml(activeDisc = 'all') {
	const pills = [`<button type="button" class="nav-filter-pill ${activeDisc === 'all' ? 'active' : ''}" data-disc="all">All</button>`];
	Object.entries(DISCIPLINES).forEach(([key, info]) => {
		pills.push(`<button type="button" class="nav-filter-pill ${activeDisc === key ? 'active' : ''}" data-disc="${key}">${info.icon} ${info.label}</button>`);
	});
	return pills.join('\n');
}
