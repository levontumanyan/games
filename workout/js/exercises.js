/**
 * Exercises module - Taxonomy, definitions, local caching, and custom exercise creation.
 */

import { fetchServerExercises, saveCustomExerciseOnServer, deleteCustomExerciseOnServer, uploadImageFile } from './storage.js';
import { escapeHtml, formatTime, parseYouTubeId, showToast } from './utils.js';
import { showConfirm, showAlert } from './modal.js';
import { createBodyMap, MUSCLE_DEFINITIONS } from './body_map.js';

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
	yoga: { label: 'Yoga & Recovery', icon: '🧘', color: '#78a88a' },
};

export const MEDIA_KINDS = {
	instruction: { label: 'Instruction & Tutorial', icon: '🎬', color: '#6aa3a9', bg: 'rgba(106, 163, 169, 0.14)' },
	demonstration: { label: 'Exercise Execution', icon: '⚡', color: '#cbb07a', bg: 'rgba(203, 176, 122, 0.14)' },
	animation: { label: 'Looping GIF / SVG', icon: '✨', color: '#8195a2', bg: 'rgba(129, 149, 162, 0.14)' },
	photo: { label: 'Form Photo & Cue', icon: '📷', color: '#78a88a', bg: 'rgba(120, 168, 138, 0.14)' },
};

let cachedExercises = [];
let isLoaded = false;

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
 * Retrieve all media assets attached to a given list of exercise objects or IDs.
 * @param {Array} exercisesOrIds
 * @returns {Array}
 */
export function getExerciseMediaAssets(exercisesOrIds = []) {
	const assets = [];
	const seenIds = new Set();

	(exercisesOrIds || []).forEach(item => {
		const ex = typeof item === 'string' ? getExerciseById(item) : (getExerciseById(item.id) || item);
		if (!ex) return;

		const list = Array.isArray(ex.media_assets) ? ex.media_assets : [];
		list.forEach(asset => {
			if (!asset || seenIds.has(asset.id)) return;
			seenIds.add(asset.id);
			assets.push({
				...asset,
				exerciseName: ex.name,
				exerciseCategory: ex.category,
				exerciseDiscipline: ex.discipline,
			});
		});

		// Fallback single media_url if no structured assets array exists
		if (list.length === 0 && ex.media_url) {
			const fallbackId = `fb-${ex.id}`;
			if (!seenIds.has(fallbackId)) {
				seenIds.add(fallbackId);
				const isYt = ex.media_url.includes('youtube') || ex.media_url.includes('youtu.be');
				const vid = isYt ? parseYouTubeId(ex.media_url) : null;
				assets.push({
					id: fallbackId,
					kind: isYt ? 'demonstration' : 'animation',
					type: isYt ? 'video' : 'image',
					title: isYt ? `${ex.name} Video` : `${ex.name} Animation`,
					url: ex.media_url,
					videoId: vid || undefined,
					exerciseName: ex.name,
					exerciseCategory: ex.category,
					exerciseDiscipline: ex.discipline,
				});
			}
		}
	});

	return assets;
}

/**
 * Retrieve the primary follow-along execution media for an exercise.
 * Prioritizes demonstration videos -> looping animations -> form photos.
 * Explicitly ignores instruction tutorials for workout execution.
 * @param {Object|string} exerciseOrId
 * @returns {Object|null}
 */
export function getExerciseFollowAlongMedia(exerciseOrId) {
	if (!exerciseOrId) return null;
	const assets = getExerciseMediaAssets([exerciseOrId]);
	// 1. Prefer explicit demonstration follow-along video
	const demo = assets.find(a => (a.kind === 'demonstration' || a.kind === 'drill') && (a.type === 'video' || Boolean(a.videoId)));
	if (demo) return demo;
	// 2. Prefer looping visual animation or photo
	const visual = assets.find(a => a.kind === 'animation' || a.kind === 'photo');
	if (visual) return visual;
	// 3. Fallback: Any non-instruction video asset
	const nonInst = assets.find(a => a.kind !== 'instruction');
	if (nonInst) return nonInst;
	return null;
}

/**
 * Retrieve any instructional tutorial / coaching breakdown asset for an exercise.
 * @param {Object|string} exerciseOrId
 * @returns {Object|null}
 */
export function getExerciseInstructionMedia(exerciseOrId) {
	if (!exerciseOrId) return null;
	const assets = getExerciseMediaAssets([exerciseOrId]);
	return assets.find(a => a.kind === 'instruction') || null;
}

/**
 * Add a new media asset to an exercise and persist to server.
 * @param {string} exerciseId
 * @param {Object} asset
 * @returns {Promise<Object>}
 */
export async function addMediaAssetToExercise(exerciseId, asset) {
	const ex = getExerciseById(exerciseId);
	if (!ex) throw new Error('Exercise not found');

	const existingAssets = Array.isArray(ex.media_assets) ? [...ex.media_assets] : [];
	existingAssets.push(asset);

	let media_url = ex.media_url;
	if (!media_url && asset.url) {
		media_url = asset.url;
	}

	const updated = await createCustomExercise({
		...ex,
		media_url: media_url,
		media_assets: existingAssets
	});

	return updated;
}

/**
 * Remove a media asset from an exercise and persist to server.
 * @param {string} exerciseId
 * @param {string} assetId
 * @returns {Promise<Object>}
 */
export async function removeMediaAssetFromExercise(exerciseId, assetId) {
	const ex = getExerciseById(exerciseId);
	if (!ex) throw new Error('Exercise not found');

	let existingAssets = Array.isArray(ex.media_assets) ? [...ex.media_assets] : [];

	// If existingAssets is empty but ex.media_url exists (legacy fallback)
	if (existingAssets.length === 0 && (assetId === `fb-${ex.id}` || assetId === `${ex.id}-default` || ex.media_url)) {
		const updated = await createCustomExercise({
			...ex,
			media_url: '',
			media_assets: []
		});
		return updated;
	}

	const filteredAssets = existingAssets.filter(a => a.id !== assetId && a.url !== assetId);

	let media_url = ex.media_url || '';
	if (filteredAssets.length === 0) {
		media_url = '';
	} else if (!filteredAssets.some(a => a.url === media_url)) {
		media_url = filteredAssets[0].url || '';
	}

	const updated = await createCustomExercise({
		...ex,
		media_url: media_url,
		media_assets: filteredAssets
	});

	return updated;
}

/**
 * Load exercises from server into memory cache.
 * @returns {Promise<Array>}
 */
export async function loadExercises() {
	try {
		const list = await fetchServerExercises();
		cachedExercises = list || [];
		isLoaded = true;
		return cachedExercises;
	} catch (err) {
		console.warn('Failed to fetch exercises from server:', err);
		cachedExercises = [];
		isLoaded = false;
		return cachedExercises;
	}
}

/**
 * Get all cached exercises.
 * @returns {Array}
 */
export function getExercises() {
	return cachedExercises;
}

/**
 * Infer or retrieve primary and secondary target muscle groups for an exercise.
 * @param {Object} ex
 * @returns {{ primary: Array<string>, secondary: Array<string> }}
 */
export function inferMusclesForExercise(ex) {
	if (!ex) return { primary: [], secondary: [] };
	if (Array.isArray(ex.primary_muscles) && ex.primary_muscles.length > 0) {
		return {
			primary: ex.primary_muscles,
			secondary: Array.isArray(ex.secondary_muscles) ? ex.secondary_muscles : [],
		};
	}
	const name = (ex.name || '').toLowerCase();
	const desc = (ex.description || '').toLowerCase();
	const combined = `${name} ${desc}`;

	if (combined.includes('pelvic') || combined.includes('kegel') || combined.includes('perineal') || combined.includes('diaphragm')) {
		return { primary: ['pelvic_floor', 'abs'], secondary: ['glutes', 'lower_back', 'groin'] };
	}
	if (combined.includes('bridge')) {
		return { primary: ['glutes', 'pelvic_floor'], secondary: ['hamstrings', 'abs', 'groin'] };
	}
	if (combined.includes('pushup') || combined.includes('push-up') || combined.includes('press')) {
		return { primary: ['chest', 'triceps'], secondary: ['shoulders', 'abs', 'forearms'] };
	}
	if (combined.includes('jump') || combined.includes('squat') || combined.includes('lunge')) {
		return { primary: ['quads', 'calves', 'groin'], secondary: ['glutes', 'abs', 'pelvic_floor'] };
	}
	if (combined.includes('knee') || combined.includes('kick')) {
		return { primary: ['hip_flexors', 'abs', 'quads'], secondary: ['glutes', 'calves', 'groin', 'pelvic_floor'] };
	}
	if (combined.includes('jab') || combined.includes('cross') || combined.includes('punch') || combined.includes('elbow')) {
		return { primary: ['shoulders', 'obliques'], secondary: ['triceps', 'forearms', 'calves'] };
	}
	if (combined.includes('plank') || combined.includes('climber') || combined.includes('tap') || combined.includes('bird-dog')) {
		return { primary: ['abs', 'obliques', 'shoulders'], secondary: ['chest', 'triceps', 'forearms', 'pelvic_floor'] };
	}
	if (combined.includes('cobra') || combined.includes('child') || combined.includes('pose') || combined.includes('stretch')) {
		return { primary: ['abs', 'hip_flexors', 'lower_back'], secondary: ['groin', 'shoulders', 'lats', 'pelvic_floor'] };
	}
	if (combined.includes('pigeon')) {
		return { primary: ['glutes', 'groin', 'hip_flexors'], secondary: ['hamstrings', 'lower_back', 'pelvic_floor'] };
	}
	if (combined.includes('fold') || combined.includes('hamstring')) {
		return { primary: ['hamstrings', 'lower_back'], secondary: ['calves', 'groin'] };
	}
	return { primary: ['abs'], secondary: ['shoulders', 'pelvic_floor'] };
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
 * Filter exercises by text query, category, discipline, or target muscle group.
 * @param {string} query
 * @param {string} [category]
 * @param {string} [discipline]
 * @param {string} [muscle]
 * @returns {Array}
 */
export function filterExercises(query = '', category = '', discipline = '', muscle = '') {
	const all = getExercises();
	const q = (query || '').trim().toLowerCase();
	const cat = (category || '').trim().toLowerCase();
	const disc = (discipline || '').trim().toLowerCase();
	const mus = (muscle || '').trim().toLowerCase();

	return all.filter(ex => {
		if (cat && cat !== 'all' && (ex.category || '').toLowerCase() !== cat) return false;
		if (disc && disc !== 'all' && (ex.discipline || '').toLowerCase() !== disc) return false;
		if (mus && mus !== 'all') {
			const targetMuscles = inferMusclesForExercise(ex);
			const allExMuscles = [...(targetMuscles.primary || []), ...(targetMuscles.secondary || [])].map(m => m.toLowerCase());
			if (!allExMuscles.includes(mus)) return false;
		}
		if (q) {
			const nameMatch = (ex.name || '').toLowerCase().includes(q);
			const descMatch = (ex.description || '').toLowerCase().includes(q);
			const catMatch = (ex.category || '').toLowerCase().includes(q);
			const discMatch = (ex.discipline || '').toLowerCase().includes(q);
			const targetMuscles = inferMusclesForExercise(ex);
			const musMatch = [...(targetMuscles.primary || []), ...(targetMuscles.secondary || [])].some(m => m.toLowerCase().includes(q));
			return nameMatch || descMatch || catMatch || discMatch || musMatch;
		}
		return true;
	});
}

/**
 * Find an exercise by its ID.
 * @param {string} id
 * @returns {Object|null}
 */
export function getExerciseById(id) {
	if (!id) return null;
	const clean = String(id).trim().toLowerCase();
	return getExercises().find(e => String(e.id).toLowerCase() === clean) || null;
}

/**
 * Create a new custom exercise.
 * @param {Object} exerciseData
 * @returns {Promise<Object>}
 */
export async function createCustomExercise(exerciseData) {
	const saved = await saveCustomExerciseOnServer(exerciseData);
	cachedExercises = [saved, ...cachedExercises.filter(e => e.id !== saved.id)];
	return saved;
}

/**
 * Delete a custom exercise.
 * @param {string} exerciseId
 * @returns {Promise<boolean>}
 */
export async function deleteCustomExercise(exerciseId) {
	await deleteCustomExerciseOnServer(exerciseId);
	cachedExercises = cachedExercises.filter(e => e.id !== exerciseId);
	return true;
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
 * Render the full Exercise Library / Catalog view.
 * @param {HTMLElement} container
 * @param {Object} [options]
 */
export function renderExercisesCatalog(container, options = {}) {
	const onPlayExercise = options.onPlayExercise || (() => {});
	const onAddToRoutine = options.onAddToRoutine || (() => {});
	const onOpenAnatomy = options.onOpenAnatomy || (() => {});

	container.innerHTML = `
		<div class="exercises-catalog-container">
			<div class="exercises-catalog-header">
				<div>
					<h2 class="exercises-title">🥋 Exercise & Movement Library</h2>
					<p class="exercises-subtitle">Biomechanical movements, skill taxonomy, and looping form animations</p>
				</div>
				<div class="exercises-header-actions">
					<button id="btn-create-exercise" class="btn btn-primary btn-sm">+ New Exercise</button>
				</div>
			</div>

			<!-- Search & Filter Bar -->
			<div class="exercises-filter-bar">
				<div class="search-box-wrapper">
					<span class="search-icon">🔍</span>
					<input type="text" id="exercise-search-input" class="input exercise-search-input" placeholder="Search exercises, muscles, techniques, cues...">
				</div>
				<div class="exercise-filter-chips" id="exercise-filter-chips"></div>
			</div>

			<!-- Exercises Grid -->
			<div id="exercises-cards-grid" class="exercises-cards-grid"></div>
		</div>
	`;

	let currentSearch = '';
	let currentFilter = 'all';
	let currentMuscleFilter = null;

	const searchInput = container.querySelector('#exercise-search-input');
	const filterChipsContainer = container.querySelector('#exercise-filter-chips');
	const gridContainer = container.querySelector('#exercises-cards-grid');
	const createBtn = container.querySelector('#btn-create-exercise');

	createBtn.addEventListener('click', () => {
		showCreateExerciseModal({
			onCreated: () => {
				renderGrid();
			}
		});
	});

	const filterOptions = [
		{ id: 'all', label: 'All Movements' },
		{ id: 'disc:muay_thai', label: 'Muay Thai' },
		{ id: 'disc:boxing', label: 'Boxing' },
		{ id: 'disc:calisthenics', label: 'Calisthenics' },
		{ id: 'disc:yoga', label: 'Yoga & Recovery' },
		{ id: 'cat:strength', label: 'Strength' },
		{ id: 'cat:drill', label: 'Drills' },
		{ id: 'cat:technique', label: 'Technique' },
		{ id: 'cat:stretch', label: 'Stretch' },
		{ id: 'cat:cardio', label: 'Cardio' },
	];

	function renderFilterChips() {
		filterChipsContainer.innerHTML = '';

		// If muscle filter is active, prepend an active muscle filter chip
		if (currentMuscleFilter && MUSCLE_DEFINITIONS[currentMuscleFilter]) {
			const mDef = MUSCLE_DEFINITIONS[currentMuscleFilter];
			const mBtn = document.createElement('button');
			mBtn.type = 'button';
			mBtn.className = 'ex-chip-btn active muscle-active-chip';
			mBtn.innerHTML = `<span>${mDef.icon}</span> <span>${mDef.label}</span> <span class="chip-clear-x">✕</span>`;
			mBtn.addEventListener('click', () => {
				currentMuscleFilter = null;
				renderFilterChips();
				renderGrid();
			});
			filterChipsContainer.appendChild(mBtn);
		}

		filterOptions.forEach(opt => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = `ex-chip-btn ${currentFilter === opt.id ? 'active' : ''}`;
			btn.textContent = opt.label;
			btn.addEventListener('click', () => {
				currentFilter = opt.id;
				renderFilterChips();
				renderGrid();
			});
			filterChipsContainer.appendChild(btn);
		});
	}

	function renderGrid() {
		let cat = '';
		let disc = '';
		if (currentFilter.startsWith('cat:')) {
			cat = currentFilter.replace('cat:', '');
		} else if (currentFilter.startsWith('disc:')) {
			disc = currentFilter.replace('disc:', '');
		}

		const list = filterExercises(currentSearch, cat, disc, currentMuscleFilter);

		if (list.length === 0) {
			gridContainer.innerHTML = `
				<div class="empty-sessions">
					<p>No exercises found matching your filter${currentMuscleFilter ? ` for ${MUSCLE_DEFINITIONS[currentMuscleFilter]?.label || currentMuscleFilter}` : ''}.</p>
					<p class="empty-sub">Try selecting another filter or search with a different keyword.</p>
				</div>
			`;
			return;
		}

		gridContainer.innerHTML = '';
		list.forEach(ex => {
			const assets = getExerciseMediaAssets([ex]);

			const card = document.createElement('div');
			card.className = 'exercise-library-card';

			const instructionCount = assets.filter(a => a.kind === 'instruction').length;
			const demoCount = assets.filter(a => a.kind === 'demonstration').length;
			const animCount = assets.filter(a => a.kind === 'animation' || a.kind === 'photo').length;

			const modeStr = (ex.default_mode || 'reps') === 'reps'
				? `${ex.default_quantity || 20} Reps`
				: formatTime(ex.default_quantity || 30);

			card.dataset.id = ex.id;
			card.innerHTML = `
				<div class="ex-lib-header">
					<div class="ex-lib-badges">
						${getCategoryBadgeHtml(ex.category)}
						${ex.discipline ? getDisciplineBadgeHtml(ex.discipline) : ''}
					</div>
					<span class="ex-lib-mode-tag">${modeStr}</span>
				</div>

				<div class="ex-lib-title-row">
					<h3 class="ex-lib-title">${escapeHtml(ex.name)}</h3>
				</div>

				<p class="ex-lib-desc">${escapeHtml(ex.description || 'Movement and technique practice.')}</p>

				<div class="ex-lib-media-pills">
					${instructionCount > 0 ? `<span class="ex-media-mini-pill pill-inst">🎬 ${instructionCount} Tutorial${instructionCount > 1 ? 's' : ''}</span>` : ''}
					${demoCount > 0 ? `<span class="ex-media-mini-pill pill-demo">⚡ ${demoCount} Drill${demoCount > 1 ? 's' : ''}</span>` : ''}
					${animCount > 0 ? `<span class="ex-media-mini-pill pill-anim">✨ Visual Form</span>` : ''}
					${assets.length === 0 ? `<span class="ex-media-mini-pill pill-none">No media</span>` : ''}
				</div>

				<div class="ex-lib-actions">
					<button class="btn btn-sm btn-ghost btn-play-ex" title="Test in Preview Mode">
						▶ Preview
					</button>
					<button class="btn btn-sm btn-primary btn-add-routine" title="Add to current workout">
						+ Add to Workout
					</button>
				</div>
			`;

			const playBtn = card.querySelector('.btn-play-ex');
			playBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const followAlong = getExerciseFollowAlongMedia(ex);
				onPlayExercise(ex, followAlong || null);
			});

			const addRoutineBtn = card.querySelector('.btn-add-routine');
			addRoutineBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				onAddToRoutine(ex);
			});

			// Entire card is clickable to open top-layer detail & variations overlay
			card.addEventListener('click', () => {
				showExerciseVariationsModal(ex, {
					onPlayAsset: (asset) => onPlayExercise(ex, asset),
					onAddToRoutine: () => onAddToRoutine(ex),
					onUpdated: () => renderGrid()
				});
			});

			gridContainer.appendChild(card);
		});
	}

	searchInput.addEventListener('input', (e) => {
		currentSearch = e.target.value;
		renderGrid();
	});

	renderFilterChips();
	renderGrid();
}

/**
 * Highlight a specific exercise card in the library catalog and scroll to it.
 * @param {string} exerciseIdOrName
 */
export function highlightExerciseCard(exerciseIdOrName) {
	if (!exerciseIdOrName) return;
	const clean = String(exerciseIdOrName).toLowerCase();
	const cards = document.querySelectorAll('.exercise-library-card');
	for (const card of cards) {
		const id = (card.dataset.id || '').toLowerCase();
		const title = (card.querySelector('.ex-lib-title')?.textContent || '').toLowerCase();
		if (id === clean || title === clean || title.includes(clean)) {
			card.classList.add('card-highlighted-pulse');
			card.scrollIntoView({ behavior: 'smooth', block: 'center' });
			setTimeout(() => {
				card.classList.remove('card-highlighted-pulse');
			}, 2500);
			break;
		}
	}
}

/**
 * Show a Split HUD modal displaying all media variations for an exercise, with option to play, remove, or add more.
 * @param {Object} exercise
 * @param {Object} [options]
 */
export function showExerciseVariationsModal(exercise, options = {}) {
	const onPlayAsset = options.onPlayAsset || (() => {});
	const onAddToRoutine = options.onAddToRoutine || (() => {});
	const onUpdated = options.onUpdated || (() => {});
	const onOpenInLibrary = options.onOpenInLibrary || null;

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop modal-exercise-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-window modal-combo-hud-split';

	const close = () => {
		document.removeEventListener('keydown', handleEsc);
		document.removeEventListener('paste', handleGlobalPaste);
		backdrop.remove();
	};

	const handleEsc = (e) => {
		if (e.key === 'Escape' || e.keyCode === 27) {
			close();
		}
	};
	document.addEventListener('keydown', handleEsc);

	const handleGlobalPaste = (e) => {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (let i = 0; i < items.length; i++) {
			if (items[i].type.startsWith('image/')) {
				const file = items[i].getAsFile();
				if (file) {
					e.preventDefault();
					const kindSelect = modal.querySelector('#new-asset-kind');
					if (kindSelect && kindSelect.value !== 'photo' && kindSelect.value !== 'animation') {
						kindSelect.value = 'photo';
						const timeRow = modal.querySelector('#new-asset-time-row');
						const uploadZone = modal.querySelector('#new-asset-upload-zone');
						const urlLabel = modal.querySelector('#new-asset-url-label');
						const urlInput = modal.querySelector('#new-asset-url');
						const titleInput = modal.querySelector('#new-asset-title');
						if (timeRow) timeRow.classList.add('hidden');
						if (uploadZone) uploadZone.classList.remove('hidden');
						if (urlLabel) urlLabel.textContent = 'Or Enter Direct Image URL / Path';
						if (urlInput) urlInput.placeholder = 'https://example.com/photo.jpg or /workout/media/exercise.jpg';
						if (titleInput && !titleInput.value) titleInput.placeholder = 'e.g., Stance & Setup Reference Photo';
					}
					const addForm = modal.querySelector('#add-asset-form');
					if (addForm) addForm.classList.remove('hidden');
					const dropzoneInner = modal.querySelector('#new-asset-dropzone-inner');
					const previewBox = modal.querySelector('#new-asset-preview-box');
					const previewImg = modal.querySelector('#new-asset-preview-img');
					const previewFilename = modal.querySelector('#new-asset-preview-filename');
					const urlInput = modal.querySelector('#new-asset-url');
					const titleInput = modal.querySelector('#new-asset-title');

					uploadImageFile(file).then((uploaded) => {
						if (urlInput) urlInput.value = uploaded.url;
						if (previewImg) previewImg.src = uploaded.url;
						if (previewFilename) previewFilename.textContent = 'Pasted Screenshot';
						if (dropzoneInner) dropzoneInner.classList.add('hidden');
						if (previewBox) previewBox.classList.remove('hidden');
						if (titleInput && !titleInput.value) titleInput.value = 'Form Reference Photo';
						showToast('📷 Screenshot pasted & uploaded!');
					}).catch((err) => {
						showAlert({ title: 'Upload Failed', message: err.message });
					});
					break;
				}
			}
		}
	};
	document.addEventListener('paste', handleGlobalPaste);

	function renderModalContent() {
		// Sync exercise object from memory cache if available
		const freshEx = getExerciseById(exercise.id) || exercise;
		Object.assign(exercise, freshEx);

		const assets = getExerciseMediaAssets([exercise]);
		const muscles = inferMusclesForExercise(exercise);
		const primaryMuscles = (muscles.primary || []).map(m => getMuscleBadgeHtml(m, true));
		const secondaryMuscles = (muscles.secondary || []).map(m => getMuscleBadgeHtml(m, false));

		const primaryAsset = getExerciseFollowAlongMedia(exercise) || assets[0];
		let previewVid = primaryAsset?.videoId || (primaryAsset?.url ? parseYouTubeId(primaryAsset.url) : null);
		if (!previewVid && exercise.media_url) {
			previewVid = parseYouTubeId(exercise.media_url);
		}

		let previewImgUrl = null;
		if (primaryAsset?.url && !parseYouTubeId(primaryAsset.url)) {
			previewImgUrl = primaryAsset.url;
		} else if (exercise.media_url && !parseYouTubeId(exercise.media_url)) {
			previewImgUrl = exercise.media_url;
		}

		const modeStr = (exercise.default_mode || 'reps') === 'reps'
			? `🔢 ${exercise.default_quantity || 20} Target Reps`
			: `⏱️ ${formatTime(exercise.default_quantity || 30)}`;

		modal.innerHTML = `
			<div class="hud-left-panel">
				<div class="hud-badges-row">
					${getCategoryBadgeHtml(exercise.category)}
					${exercise.discipline ? getDisciplineBadgeHtml(exercise.discipline) : ''}
					<button class="btn btn-ghost btn-xs btn-edit-this-ex" title="Edit exercise name, category, muscles, or cues" style="margin-left:auto;">✏️ Edit Details</button>
				</div>

				<h2 class="hud-combo-title">${escapeHtml(exercise.name)}</h2>

				<div class="hud-visual-card">
					${previewVid ? `
						<div class="hud-video-thumb">
							<img src="https://img.youtube.com/vi/${previewVid}/mqdefault.jpg" alt="${escapeHtml(exercise.name)}">
							<span class="modal-play-badge">▶</span>
						</div>
					` : `
						<div class="hud-img-thumb">
							<img src="${escapeHtml(previewImgUrl || '/workout/media/pushups.svg')}" alt="${escapeHtml(exercise.name)}" onerror="this.src='/workout/media/pushups.svg'">
						</div>
					`}
					<div class="hud-visual-caption">Form Reference & Execution</div>
				</div>

				<div class="hud-muscles-section">
					<div class="hud-section-label">Target Anatomy</div>
					<div class="hud-muscles-row">
						${primaryMuscles.join('')}
						${secondaryMuscles.slice(0, 3).join('')}
					</div>
				</div>

				<div class="hud-left-actions">
					<button class="btn btn-primary btn-hud-play-ex" style="width:100%;">▶ Preview Follow-Along</button>
					<button class="btn btn-ghost btn-hud-add-ex" style="width:100%;">+ Add to Workout</button>
					${onOpenInLibrary ? `<button class="btn btn-ghost btn-hud-open-lib" style="width:100%;">📂 Open in Exercises Tab ➔</button>` : ''}
				</div>
			</div>

			<div class="hud-right-panel">
				<div class="hud-right-header">
					<div class="hud-stat-pills">
						<span class="hud-stat-pill">${modeStr}</span>
						<span class="hud-stat-pill">🎬 ${assets.length} Media Variation${assets.length !== 1 ? 's' : ''}</span>
					</div>
					<button class="modal-close-btn" title="Close (ESC)">✕</button>
				</div>

				<div class="hud-description-box">
					<p class="hud-desc-text">${escapeHtml(exercise.description || 'Movement execution, coaching cues, and form tutorials.')}</p>
				</div>

				<div class="hud-constituents-deck">
					<div class="hud-section-label">🎬 Available Tutorials, Drills & Photo Guides (${assets.length})</div>
					
					<div class="modal-assets-list">
						${assets.length === 0 ? '<p class="empty-chip-hint">No extra media attached yet. Add a tutorial video or photo guide below!</p>' : ''}
						${assets.map((a, idx) => {
							const isVideo = a.type === 'video' || Boolean(a.videoId);
							const vid = a.videoId || (a.url ? parseYouTubeId(a.url) : null);
							const thumb = isVideo && vid
								? `https://img.youtube.com/vi/${vid}/mqdefault.jpg`
								: (a.url || '/workout/media/pushups.svg');

							let actionBtnLabel = '📷 View';
							if (a.kind === 'instruction') {
								actionBtnLabel = '🎬 Tutorial';
							} else if (a.kind === 'demonstration' || isVideo) {
								actionBtnLabel = '⚡ Follow-Along';
							}

							return `
								<div class="modal-asset-row" data-idx="${idx}">
									<div class="modal-asset-thumb">
										<img src="${thumb}" alt="${escapeHtml(a.title || '')}" onerror="this.src='/workout/media/pushups.svg'">
										${isVideo ? '<span class="modal-play-badge">▶</span>' : '<span class="modal-play-badge" style="font-size:0.75rem;">📷</span>'}
									</div>
									<div class="modal-asset-info">
										<div class="modal-asset-badge-row">
											${getMediaKindBadgeHtml(a.kind)}
											${isVideo && a.startSeconds !== undefined && a.endSeconds ? `<span class="asset-timestamp">${formatTime(a.startSeconds)} - ${formatTime(a.endSeconds)}</span>` : ''}
										</div>
										<div class="modal-asset-title">${escapeHtml(a.title || (isVideo ? 'Video Variation' : 'Form Image'))}</div>
									</div>
									<div class="modal-asset-actions">
										<button class="btn btn-sm btn-primary btn-play-asset-now" data-idx="${idx}" title="${isVideo ? (a.kind === 'instruction' ? 'Watch technique tutorial' : 'Preview follow-along video') : 'View image reference'}">${actionBtnLabel}</button>
										<button class="btn btn-sm btn-ghost btn-remove-asset-now" data-idx="${idx}" title="Remove this media variation">🗑️</button>
									</div>
								</div>
							`;
						}).join('')}
					</div>

					<!-- Add Media Asset Form -->
					<div class="add-asset-collapse-section" style="margin-top:12px;">
						<button id="toggle-add-asset-btn" class="btn btn-ghost btn-sm">+ Add New Video or Photo Variation</button>
						<div id="add-asset-form" class="add-asset-form hidden">
							<div class="field-group">
								<label>Media Role / Kind</label>
								<select id="new-asset-kind" class="input">
									<option value="instruction">🎬 Instruction & Tutorial (YouTube Video)</option>
									<option value="demonstration">⚡ Exercise Execution / Follow-Along (YouTube Video)</option>
									<option value="photo">📷 Form Reference Photo (Upload / Screenshot / URL)</option>
									<option value="animation">✨ Looping GIF / Visual (Upload / URL)</option>
								</select>
							</div>

							<!-- Image Upload & Dropzone Area (shown for photo/animation) -->
							<div id="new-asset-upload-zone" class="media-upload-dropzone hidden">
								<input type="file" id="new-asset-file-input" accept="image/*" class="hidden-file-input">
								<div class="dropzone-inner" id="new-asset-dropzone-inner">
									<span class="dropzone-icon">📷</span>
									<div class="dropzone-text">
										<strong>Choose photo / screenshot</strong> or drag & drop here
									</div>
									<div class="dropzone-hint">
										Or paste screenshot directly from clipboard (⌘V / Ctrl+V)
									</div>
								</div>
								<div id="new-asset-preview-box" class="dropzone-preview hidden">
									<img id="new-asset-preview-img" src="" alt="Preview">
									<div class="dropzone-preview-meta">
										<span id="new-asset-preview-filename" class="preview-filename"></span>
										<button type="button" id="btn-clear-uploaded-asset" class="btn btn-ghost btn-xs">✕ Remove</button>
									</div>
								</div>
							</div>

							<div class="field-group" id="new-asset-title-group">
								<label id="new-asset-title-label">Asset Title</label>
								<input type="text" id="new-asset-title" class="input" placeholder="e.g., Coach Breakdown & Cueing">
							</div>

							<div class="field-group" id="new-asset-url-group">
								<label id="new-asset-url-label">YouTube Video URL</label>
								<input type="text" id="new-asset-url" class="input" placeholder="https://youtube.com/watch?v=... or https://youtu.be/...">
							</div>

							<div class="field-row" id="new-asset-time-row">
								<div class="field-group">
									<label>Start Time (sec)</label>
									<input type="number" id="new-asset-start" class="input" min="0" value="0">
								</div>
								<div class="field-group">
									<label>End Time (sec)</label>
									<input type="number" id="new-asset-end" class="input" min="1" value="60">
								</div>
							</div>

							<div class="add-asset-actions">
								<button id="btn-save-new-asset" class="btn btn-sm btn-primary">Save Asset</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;

		modal.querySelectorAll('.modal-close-btn').forEach(b => {
			b.addEventListener('click', close);
		});

		const editExBtn = modal.querySelector('.btn-edit-this-ex');
		if (editExBtn) {
			editExBtn.addEventListener('click', () => {
				close();
				showEditExerciseModal(exercise, {
					onUpdated: (updatedEx) => {
						Object.assign(exercise, updatedEx);
						onUpdated();
						showExerciseVariationsModal(exercise, options);
					}
				});
			});
		}

		modal.querySelectorAll('.btn-play-asset-now').forEach(btn => {
			btn.addEventListener('click', () => {
				const idx = parseInt(btn.getAttribute('data-idx'), 10);
				if (assets[idx]) {
					close();
					onPlayAsset(assets[idx]);
				}
			});
		});

		modal.querySelectorAll('.btn-remove-asset-now').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const idx = parseInt(btn.getAttribute('data-idx'), 10);
				const assetToRemove = assets[idx];
				if (!assetToRemove) return;

				const confirmed = await showConfirm({
					title: 'Remove Video / Media',
					message: `Are you sure you want to remove "${assetToRemove.title || 'this video'}" from ${exercise.name}?`,
					confirmText: 'Remove',
					danger: true
				});
				if (!confirmed) return;

				try {
					const updated = await removeMediaAssetFromExercise(exercise.id, assetToRemove.id);
					Object.assign(exercise, updated);
					renderModalContent();
					onUpdated();
					showToast(`Removed media from "${exercise.name}".`);
				} catch (err) {
					await showAlert({ title: 'Error', message: 'Could not remove video: ' + err.message });
				}
			});
		});

		const playExBtn = modal.querySelector('.btn-hud-play-ex');
		if (playExBtn) {
			playExBtn.addEventListener('click', () => {
				close();
				onPlayAsset(primaryAsset || null);
			});
		}

		const addExBtn = modal.querySelector('.btn-hud-add-ex');
		if (addExBtn) {
			addExBtn.addEventListener('click', () => {
				close();
				onAddToRoutine();
			});
		}

		const openLibBtn = modal.querySelector('.btn-hud-open-lib');
		if (openLibBtn && onOpenInLibrary) {
			openLibBtn.addEventListener('click', () => {
				close();
				onOpenInLibrary(exercise);
			});
		}

		const toggleAddBtn = modal.querySelector('#toggle-add-asset-btn');
		const addForm = modal.querySelector('#add-asset-form');
		if (toggleAddBtn && addForm) {
			toggleAddBtn.addEventListener('click', () => {
				addForm.classList.toggle('hidden');
			});
		}

		const kindSelect = modal.querySelector('#new-asset-kind');
		const uploadZone = modal.querySelector('#new-asset-upload-zone');
		const dropzoneInner = modal.querySelector('#new-asset-dropzone-inner');
		const fileInput = modal.querySelector('#new-asset-file-input');
		const previewBox = modal.querySelector('#new-asset-preview-box');
		const previewImg = modal.querySelector('#new-asset-preview-img');
		const previewFilename = modal.querySelector('#new-asset-preview-filename');
		const clearUploadBtn = modal.querySelector('#btn-clear-uploaded-asset');
		const urlLabel = modal.querySelector('#new-asset-url-label');
		const urlInput = modal.querySelector('#new-asset-url');
		const titleInput = modal.querySelector('#new-asset-title');
		const timeRow = modal.querySelector('#new-asset-time-row');

		function updateAddFormFields() {
			if (!kindSelect || !urlLabel || !urlInput || !titleInput || !timeRow) return;
			const kind = kindSelect.value;
			const isImage = kind === 'photo' || kind === 'animation';

			if (isImage) {
				timeRow.classList.add('hidden');
				if (uploadZone) uploadZone.classList.remove('hidden');
				if (kind === 'photo') {
					urlLabel.textContent = 'Or Enter Direct Image URL / Path';
					urlInput.placeholder = 'https://example.com/photo.jpg or /workout/media/exercise.jpg';
					if (!titleInput.value) titleInput.placeholder = 'e.g., Stance & Setup Reference Photo';
				} else {
					urlLabel.textContent = 'Or Enter Looping GIF / Animation URL';
					urlInput.placeholder = 'https://example.com/animation.gif or /workout/media/pushups.svg';
					if (!titleInput.value) titleInput.placeholder = 'e.g., Looping Execution Visual';
				}
			} else {
				timeRow.classList.remove('hidden');
				if (uploadZone) uploadZone.classList.add('hidden');
				if (kind === 'instruction') {
					urlLabel.textContent = 'YouTube Video URL (Tutorial & Breakdown)';
					urlInput.placeholder = 'https://youtube.com/watch?v=... or https://youtu.be/...';
					if (!titleInput.value) titleInput.placeholder = 'e.g., Coach Breakdown & Form Cues';
				} else {
					urlLabel.textContent = 'YouTube Video URL (Follow-Along Drill)';
					urlInput.placeholder = 'https://youtube.com/watch?v=... or https://youtu.be/...';
					if (!titleInput.value) titleInput.placeholder = 'e.g., Full Speed Follow-Along Drill';
				}
			}
		}

		async function handleUploadedFile(file) {
			if (!file || !file.type.startsWith('image/')) {
				await showAlert({ title: 'Invalid File', message: 'Please select or paste an image file (PNG, JPG, WEBP, GIF, SVG).' });
				return;
			}
			try {
				if (uploadZone) uploadZone.classList.add('uploading');
				const uploaded = await uploadImageFile(file);
				urlInput.value = uploaded.url;
				if (previewImg) previewImg.src = uploaded.url;
				if (previewFilename) previewFilename.textContent = file.name || 'Uploaded photo';
				if (dropzoneInner) dropzoneInner.classList.add('hidden');
				if (previewBox) previewBox.classList.remove('hidden');
				if (!titleInput.value) {
					titleInput.value = (kindSelect.value === 'photo') ? 'Form Reference Photo' : 'Looping Form Visual';
				}
				showToast('📷 Photo uploaded successfully!');
			} catch (err) {
				await showAlert({ title: 'Upload Failed', message: err.message });
			} finally {
				if (uploadZone) uploadZone.classList.remove('uploading');
			}
		}

		if (dropzoneInner && fileInput) {
			dropzoneInner.addEventListener('click', () => fileInput.click());
			fileInput.addEventListener('change', (e) => {
				const file = e.target.files?.[0];
				if (file) handleUploadedFile(file);
			});
		}

		if (uploadZone) {
			uploadZone.addEventListener('dragover', (e) => {
				e.preventDefault();
				uploadZone.classList.add('dragover');
			});
			uploadZone.addEventListener('dragleave', () => {
				uploadZone.classList.remove('dragover');
			});
			uploadZone.addEventListener('drop', (e) => {
				e.preventDefault();
				uploadZone.classList.remove('dragover');
				const file = e.dataTransfer.files?.[0];
				if (file) handleUploadedFile(file);
			});
		}

		if (clearUploadBtn) {
			clearUploadBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				urlInput.value = '';
				if (previewImg) previewImg.src = '';
				if (previewBox) previewBox.classList.add('hidden');
				if (dropzoneInner) dropzoneInner.classList.remove('hidden');
				if (fileInput) fileInput.value = '';
			});
		}

		if (kindSelect) {
			kindSelect.addEventListener('change', updateAddFormFields);
			updateAddFormFields();
		}

		const saveAssetBtn = modal.querySelector('#btn-save-new-asset');
		if (saveAssetBtn) {
			saveAssetBtn.addEventListener('click', async () => {
				const kind = modal.querySelector('#new-asset-kind').value;
				const isImage = kind === 'photo' || kind === 'animation';
				const defaultTitle = isImage
					? (kind === 'photo' ? 'Form Reference Photo' : 'Looping Form Visual')
					: (kind === 'instruction' ? 'Instruction Tutorial' : 'Exercise Demonstration');
				const title = modal.querySelector('#new-asset-title').value.trim() || defaultTitle;
				const url = modal.querySelector('#new-asset-url').value.trim();
				const start = parseInt(modal.querySelector('#new-asset-start')?.value, 10) || 0;
				const end = parseInt(modal.querySelector('#new-asset-end')?.value, 10) || 60;

				if (!url) {
					await showAlert({
						title: 'Missing URL or Photo',
						message: isImage
							? 'Please choose/paste a photo or enter an image URL.'
							: 'Please enter a valid YouTube video link.'
					});
					return;
				}

				const vid = isImage ? null : parseYouTubeId(url);
				const finalType = isImage ? 'image' : (vid ? 'video' : 'image');

				const newAsset = {
					id: `asset-${Date.now()}`,
					kind,
					type: finalType,
					title,
					url,
					videoId: vid || undefined,
					startSeconds: finalType === 'video' ? start : undefined,
					endSeconds: finalType === 'video' ? end : undefined,
				};

				try {
					const updated = await addMediaAssetToExercise(exercise.id, newAsset);
					Object.assign(exercise, updated);
					renderModalContent();
					onUpdated();
					showToast(`Added "${title}" to ${exercise.name}!`);
				} catch (err) {
					await showAlert({ title: 'Error', message: 'Could not add media asset: ' + err.message });
				}
			});
		}
	}

	backdrop.appendChild(modal);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	renderModalContent();
	document.body.appendChild(backdrop);
}

/**
 * Show modal to create or edit a custom exercise.
 * @param {Object} [exercise] - Exercise object if editing, null if creating
 * @param {Object} [options]
 */
export function showEditExerciseModal(exercise = null, options = {}) {
	const isEdit = Boolean(exercise && exercise.id);
	const onSaved = options.onUpdated || options.onCreated || (() => {});

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-window modal-create-exercise';

	const currentPri = isEdit
		? new Set(exercise.primary_muscles || inferMusclesForExercise(exercise).primary || ['core'])
		: new Set(['core']);
	const currentSec = isEdit
		? new Set(exercise.secondary_muscles || inferMusclesForExercise(exercise).secondary || [])
		: new Set();

	const currentMediaUrl = isEdit ? (exercise.media_url || (exercise.media_assets?.[0]?.url || '')) : '';

	modal.innerHTML = `
		<div class="modal-header">
			<h3 class="modal-title">${isEdit ? '✏️ Edit Custom Exercise' : '➕ Create Custom Exercise'}</h3>
			<button class="modal-close-btn" title="Close">✕</button>
		</div>

		<div class="modal-body">
			<div class="field-group">
				<label>Exercise Name</label>
				<input type="text" id="create-ex-name" class="input" placeholder="e.g., Muay Thai Switch Kick, Diamond Push-ups..." value="${isEdit ? escapeHtml(exercise.name || '') : ''}">
			</div>

			<div class="field-row">
				<div class="field-group">
					<label>Category</label>
					<select id="create-ex-category" class="input">
						<option value="strength" ${isEdit && exercise.category === 'strength' ? 'selected' : ''}>💪 Strength / Force</option>
						<option value="drill" ${isEdit && exercise.category === 'drill' ? 'selected' : ''}>⚡ Drills & Speed</option>
						<option value="technique" ${isEdit && exercise.category === 'technique' ? 'selected' : ''}>🥋 Technique & Form</option>
						<option value="stretch" ${isEdit && exercise.category === 'stretch' ? 'selected' : ''}>🧘 Stretch & Recovery</option>
						<option value="cardio" ${isEdit && exercise.category === 'cardio' ? 'selected' : ''}>🫀 Cardio & HIIT</option>
						<option value="mobility" ${isEdit && exercise.category === 'mobility' ? 'selected' : ''}>🔄 Mobility & Joints</option>
					</select>
				</div>

				<div class="field-group">
					<label>Discipline</label>
					<select id="create-ex-discipline" class="input">
						<option value="general" ${isEdit && exercise.discipline === 'general' ? 'selected' : ''}>🏋️ General Fitness</option>
						<option value="muay_thai" ${isEdit && exercise.discipline === 'muay_thai' ? 'selected' : ''}>🥊 Muay Thai</option>
						<option value="boxing" ${isEdit && exercise.discipline === 'boxing' ? 'selected' : ''}>🥊 Boxing</option>
						<option value="calisthenics" ${isEdit && exercise.discipline === 'calisthenics' ? 'selected' : ''}>🤸 Calisthenics</option>
						<option value="yoga" ${isEdit && exercise.discipline === 'yoga' ? 'selected' : ''}>🧘 Yoga & Mobility</option>
					</select>
				</div>
			</div>

			<div class="field-row">
				<div class="field-group">
					<label>Default Execution Mode</label>
					<select id="create-ex-mode" class="input">
						<option value="reps" ${isEdit && exercise.default_mode === 'reps' ? 'selected' : ''}>🔢 Target Reps</option>
						<option value="time" ${isEdit && exercise.default_mode === 'time' ? 'selected' : ''}>⏱️ Timed Interval</option>
					</select>
				</div>

				<div class="field-group">
					<label>Default Quantity (reps or sec)</label>
					<input type="number" id="create-ex-quantity" class="input" min="1" value="${isEdit ? (exercise.default_quantity || 20) : 20}">
				</div>
			</div>

			<div class="field-group">
				<label>Primary Target Muscles</label>
				<div class="muscle-selector-chips" id="create-ex-primary-muscles"></div>
			</div>

			<div class="field-group">
				<label>Secondary Synergist Muscles (Optional)</label>
				<div class="muscle-selector-chips" id="create-ex-secondary-muscles"></div>
			</div>

			<div class="field-group">
				<label>Description & Technical Cues</label>
				<textarea id="create-ex-desc" class="input" rows="5" placeholder="Key form cues, tempo, or setup instructions...">${isEdit ? escapeHtml(exercise.description || '') : ''}</textarea>
			</div>

			<div class="field-group">
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
					<label style="margin-bottom:0;">Exercise Visual / Media (YouTube Link, Photo, or Screenshot)</label>
					${isEdit && currentMediaUrl ? '<button type="button" id="btn-clear-ex-media" class="btn btn-ghost btn-xs" style="color:var(--text-danger,#ef4444);padding:1px 6px;">✕ Clear Video/Media</button>' : ''}
				</div>
				<div class="media-input-with-upload">
					<input type="text" id="create-ex-media" class="input" placeholder="YouTube URL, image link, or upload/paste screenshot..." value="${escapeHtml(currentMediaUrl)}">
					<input type="file" id="create-ex-file-input" accept="image/*" class="hidden-file-input">
					<button type="button" id="btn-browse-ex-photo" class="btn btn-ghost btn-sm" title="Upload local image / screenshot">📷 Upload</button>
				</div>
				<div id="create-ex-upload-preview" class="create-upload-preview ${currentMediaUrl && !currentMediaUrl.includes('youtube') && !currentMediaUrl.includes('youtu.be') ? '' : 'hidden'}">
					<img id="create-ex-preview-img" src="${escapeHtml(currentMediaUrl || '')}" onerror="this.parentElement.classList.add('hidden')">
					<span class="preview-hint">Image / Screenshot Preview</span>
				</div>
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-ghost modal-btn-cancel">Cancel</button>
			<button id="btn-submit-create-ex" class="btn btn-primary">${isEdit ? '✓ Save Changes' : 'Create Exercise'}</button>
		</div>
	`;

	const close = () => {
		document.removeEventListener('paste', handleEditPaste);
		backdrop.remove();
	};

	modal.querySelectorAll('.modal-close-btn, .modal-btn-cancel').forEach(b => {
		b.addEventListener('click', close);
	});

	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	const mediaInput = modal.querySelector('#create-ex-media');
	const fileInput = modal.querySelector('#create-ex-file-input');
	const browseBtn = modal.querySelector('#btn-browse-ex-photo');
	const previewBox = modal.querySelector('#create-ex-upload-preview');
	const previewImg = modal.querySelector('#create-ex-preview-img');

	async function handleEditUploadedFile(file) {
		if (!file || !file.type.startsWith('image/')) {
			await showAlert({ title: 'Invalid File', message: 'Please select an image file.' });
			return;
		}
		try {
			const uploaded = await uploadImageFile(file);
			mediaInput.value = uploaded.url;
			if (previewImg) previewImg.src = uploaded.url;
			if (previewBox) previewBox.classList.remove('hidden');
			showToast('📷 Photo uploaded successfully!');
		} catch (err) {
			await showAlert({ title: 'Upload Failed', message: err.message });
		}
	}

	if (browseBtn && fileInput) {
		browseBtn.addEventListener('click', () => fileInput.click());
		fileInput.addEventListener('change', (e) => {
			const file = e.target.files?.[0];
			if (file) handleEditUploadedFile(file);
		});
	}

	const handleEditPaste = (e) => {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (let i = 0; i < items.length; i++) {
			if (items[i].type.startsWith('image/')) {
				const file = items[i].getAsFile();
				if (file) {
					e.preventDefault();
					handleEditUploadedFile(file);
					break;
				}
			}
		}
	};
	document.addEventListener('paste', handleEditPaste);

	const clearMediaBtn = modal.querySelector('#btn-clear-ex-media');
	if (clearMediaBtn) {
		clearMediaBtn.addEventListener('click', () => {
			mediaInput.value = '';
			if (previewBox) previewBox.classList.add('hidden');
			clearMediaBtn.style.display = 'none';
		});
	}

	const priContainer = modal.querySelector('#create-ex-primary-muscles');
	const secContainer = modal.querySelector('#create-ex-secondary-muscles');

	const selectedPrimary = new Set(currentPri);
	const selectedSecondary = new Set(currentSec);

	function renderMusclePickers() {
		priContainer.innerHTML = '';
		secContainer.innerHTML = '';

		Object.values(MUSCLE_DEFINITIONS).forEach(m => {
			// Primary Chip
			const priBtn = document.createElement('button');
			priBtn.type = 'button';
			priBtn.className = `muscle-pick-chip ${selectedPrimary.has(m.id) ? 'selected-pri' : ''}`;
			priBtn.innerHTML = `<span>${m.icon}</span> <span>${m.label}</span>`;
			priBtn.addEventListener('click', () => {
				if (selectedPrimary.has(m.id)) {
					selectedPrimary.delete(m.id);
				} else {
					selectedPrimary.add(m.id);
					selectedSecondary.delete(m.id);
				}
				renderMusclePickers();
			});
			priContainer.appendChild(priBtn);

			// Secondary Chip
			const secBtn = document.createElement('button');
			secBtn.type = 'button';
			secBtn.className = `muscle-pick-chip ${selectedSecondary.has(m.id) ? 'selected-sec' : ''}`;
			secBtn.innerHTML = `<span>${m.icon}</span> <span>${m.label}</span>`;
			secBtn.addEventListener('click', () => {
				if (selectedSecondary.has(m.id)) {
					selectedSecondary.delete(m.id);
				} else {
					selectedSecondary.add(m.id);
					selectedPrimary.delete(m.id);
				}
				renderMusclePickers();
			});
			secContainer.appendChild(secBtn);
		});
	}

	renderMusclePickers();

	const submitBtn = modal.querySelector('#btn-submit-create-ex');
	submitBtn.addEventListener('click', async () => {
		const name = modal.querySelector('#create-ex-name').value.trim();
		const category = modal.querySelector('#create-ex-category').value;
		const discipline = modal.querySelector('#create-ex-discipline').value;
		const default_mode = modal.querySelector('#create-ex-mode').value;
		const default_quantity = parseInt(modal.querySelector('#create-ex-quantity').value, 10) || 20;
		const description = modal.querySelector('#create-ex-desc').value.trim();
		const media_url = modal.querySelector('#create-ex-media').value.trim();
		const primary_muscles = Array.from(selectedPrimary);
		const secondary_muscles = Array.from(selectedSecondary);

		if (!name) {
			await showAlert({ title: 'Missing Name', message: 'Please provide a name for the exercise.' });
			return;
		}

		let media_assets = isEdit ? (Array.isArray(exercise.media_assets) ? [...exercise.media_assets] : []) : [];
		if (!media_url) {
			media_assets = [];
		} else if (media_url !== currentMediaUrl) {
			const isYt = media_url.includes('youtube') || media_url.includes('youtu.be');
			const vid = isYt ? parseYouTubeId(media_url) : null;
			media_assets = [{
				id: `asset-${Date.now()}`,
				kind: isYt ? 'demonstration' : 'animation',
				type: isYt ? 'video' : 'image',
				title: `${name} ${isYt ? 'Video' : 'Visual'}`,
				url: media_url,
				videoId: vid || undefined,
			}];
		}

		try {
			const payload = {
				name,
				category,
				discipline,
				default_mode,
				default_quantity,
				description,
				media_url,
				media_assets,
				primary_muscles,
				secondary_muscles,
			};
			if (isEdit) {
				payload.id = exercise.id;
			}
			const saved = await createCustomExercise(payload);
			close();
			onSaved(saved);
			showToast(isEdit ? `Saved changes to "${name}".` : `Created "${name}"!`);
		} catch (err) {
			await showAlert({ title: 'Error', message: `Could not save exercise: ${err.message}` });
		}
	});

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);
}

/**
 * Show modal to create a new custom exercise.
 * @param {Object} [options]
 */
export function showCreateExerciseModal(options = {}) {
	showEditExerciseModal(null, options);
}
