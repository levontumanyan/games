/**
 * Exercises Module - Data layer, server synchronization, caching, and exercise queries.
 */

import { fetchServerExercises, saveCustomExerciseOnServer, deleteCustomExerciseOnServer } from './storage.js';
import { escapeHtml, formatTime } from './utils.js';
import {
	MUSCLE_DEFINITIONS,
	MUSCLE_GROUPS,
	CATEGORIES,
	DISCIPLINES,
	MEDIA_KINDS,
	getMediaKindInfo,
	getMediaKindBadgeHtml,
	getCategoryBadgeHtml,
	getDisciplineBadgeHtml,
	getMuscleBadgeHtml,
} from './taxonomy.js';

// Re-export taxonomy definitions and badge helpers for seamless compatibility
export {
	MUSCLE_DEFINITIONS,
	MUSCLE_GROUPS,
	CATEGORIES,
	DISCIPLINES,
	MEDIA_KINDS,
	getMediaKindInfo,
	getMediaKindBadgeHtml,
	getCategoryBadgeHtml,
	getDisciplineBadgeHtml,
	getMuscleBadgeHtml,
};

let cachedExercises = [];
let isLoaded = false;

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
				assets.push({
					id: fallbackId,
					kind: 'animation',
					type: 'image',
					title: `${ex.name} Animation`,
					url: ex.media_url,
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
 * Retrieve the best video/visual follow-along asset for an exercise.
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
export async function removeMediaAssetFromExercise(exerciseOrId, assetId, assetUrl = null) {
	const ex = typeof exerciseOrId === 'string' ? getExerciseById(exerciseOrId) : (getExerciseById(exerciseOrId?.id) || exerciseOrId);
	if (!ex) throw new Error('Exercise not found');

	let existingAssets = Array.isArray(ex.media_assets) ? [...ex.media_assets] : [];

	// If existingAssets is empty but ex.media_url exists (legacy fallback)
	if (existingAssets.length === 0 && (assetId === `fb-${ex.id}` || assetId === `${ex.id}-default` || (assetUrl && ex.media_url === assetUrl) || ex.media_url)) {
		const updated = await createCustomExercise({
			...ex,
			media_url: '',
			media_assets: []
		});
		return updated;
	}

	const filteredAssets = existingAssets.filter(a => {
		if (assetId && a.id && a.id === assetId) return false;
		if (assetUrl && a.url && a.url === assetUrl) return false;
		if (assetId && !a.id && a.url === assetId) return false;
		return true;
	});

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
 * Update an exercise's description and persist to server.
 * @param {string|Object} exerciseOrId
 * @param {string} description
 * @returns {Promise<Object>}
 */
export async function updateExerciseDescription(exerciseOrId, description) {
	const ex = typeof exerciseOrId === 'string' ? getExerciseById(exerciseOrId) : (getExerciseById(exerciseOrId?.id) || exerciseOrId);
	if (!ex) throw new Error('Exercise not found');

	const updated = await createCustomExercise({
		...ex,
		description: (description || '').trim()
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
	if (cachedExercises.length === 0 && typeof window !== 'undefined' && Array.isArray(window.__INITIAL_EXERCISES__)) {
		cachedExercises = window.__INITIAL_EXERCISES__;
	}
	return cachedExercises;
}

/**
 * Set cached exercises in memory.
 * @param {Array} list
 */
export function setExercises(list = []) {
	cachedExercises = list || [];
	isLoaded = true;
}

/**
 * Retrieve primary and secondary target muscle groups for an exercise.
 * Prioritizes explicit database definitions, falling back to name heuristics if needed.
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
 * Render a standardized exercise library card element.
 * @param {Object} ex
 * @param {Object} [options]
 * @param {Function} [options.onPlay]
 * @param {Function} [options.onAddToRoutine]
 * @param {Function} [options.onClick]
 * @param {Function} [options.onMouseEnter]
 * @param {Function} [options.onMouseLeave]
 * @returns {HTMLElement}
 */
export function renderExerciseCardElement(ex, options = {}) {
	const assets = getExerciseMediaAssets([ex]);
	const card = document.createElement('div');
	card.className = 'exercise-library-card';
	card.dataset.id = ex.id;

	const instructionCount = assets.filter(a => a.kind === 'instruction').length;
	const demoCount = assets.filter(a => a.kind === 'demonstration').length;
	const animCount = assets.filter(a => a.kind === 'animation' || a.kind === 'photo').length;

	const modeStr = (ex.default_mode || 'reps') === 'reps'
		? `${ex.default_quantity || 20} Reps`
		: formatTime(ex.default_quantity || 30);

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
			<button class="btn btn-sm btn-primary btn-add-routine" title="Add to workout">
				+ Add to Workout ▾
			</button>
		</div>
	`;

	const playBtn = card.querySelector('.btn-play-ex');
	if (playBtn && options.onPlay) {
		playBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const followAlong = getExerciseFollowAlongMedia(ex);
			options.onPlay(ex, followAlong || null);
		});
	}

	const addRoutineBtn = card.querySelector('.btn-add-routine');
	if (addRoutineBtn && options.onAddToRoutine) {
		addRoutineBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			options.onAddToRoutine(ex, addRoutineBtn);
		});
	}

	if (options.onClick) {
		card.addEventListener('click', () => options.onClick(ex));
	}
	if (options.onMouseEnter) {
		card.addEventListener('mouseenter', () => options.onMouseEnter(ex));
	}
	if (options.onMouseLeave) {
		card.addEventListener('mouseleave', () => options.onMouseLeave(ex));
	}

	return card;
}
