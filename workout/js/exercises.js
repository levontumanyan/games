/**
 * Exercises Module - Taxonomy, DB sync, memory caching, and custom exercise operations.
 */

import { fetchServerExercises, saveCustomExerciseOnServer, deleteCustomExerciseOnServer } from './storage.js';
import { MUSCLE_DEFINITIONS } from './body_map.js';

export {
	renderExercisesCatalog,
	showExerciseVariationsModal,
	showEditExerciseModal,
	showCreateExerciseModal,
	highlightExerciseCard,
} from './exercises_view.js';

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
