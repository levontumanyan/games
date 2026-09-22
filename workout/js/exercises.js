/**
 * Exercises Module - Data layer, server synchronization, caching, and exercise queries.
 */

import { fetchServerExercises, saveCustomExerciseOnServer, deleteCustomExerciseOnServer } from './storage.js';
import { escapeHtml, parseYouTubeId, isBreakStep, isRepsStep, isClipStep, isTimerStep, getStepMode, getStepDuration, formatModeQuantity } from './utils.js';
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
	getCategoryOptionsHtml,
	getDisciplineOptionsHtml,
	getDisciplineFilterPillsHtml,
} from './taxonomy.js';
import { getMediaKindIcon } from './icons.js';

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
	getCategoryOptionsHtml,
	getDisciplineOptionsHtml,
	getDisciplineFilterPillsHtml,
};

let cachedExercises = [];
let exerciseIdMap = new Map();
let isLoaded = false;
let comboResolver = null;

function rebuildExerciseMap() {
	exerciseIdMap = new Map();
	for (const ex of cachedExercises) {
		if (ex && ex.id) {
			exerciseIdMap.set(String(ex.id).trim().toLowerCase(), ex);
		}
	}
}

/**
 * Register a combo lookup function to prevent circular imports with combos.js.
 * @param {Function} fn
 */
export function registerComboResolver(fn) {
	comboResolver = fn;
}

function resolveCombo(id) {
	return comboResolver ? comboResolver(id) : null;
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
		const ex = typeof item === 'string'
			? getExerciseById(item)
			: ((item && (item.media_assets !== undefined || item.media_url !== undefined)) ? item : (getExerciseById(item?.id) || item));
		if (!ex) return;

		const list = Array.isArray(ex.media_assets) ? ex.media_assets : [];
		list.forEach(asset => {
			if (!asset || seenIds.has(asset.id)) return;
			seenIds.add(asset.id);
			const kind = asset.kind === 'drill' ? 'demonstration' : (asset.kind || 'demonstration');
			assets.push({
				...asset,
				kind,
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
				const isYt = Boolean(parseYouTubeId(ex.media_url));
				assets.push({
					id: fallbackId,
					kind: 'demonstration',
					type: isYt ? 'video' : 'image',
					title: `${ex.name} ${isYt ? 'Video' : 'Visual'}`,
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
	// 1. Prefer explicit demonstration / follow-along video
	const demo = assets.find(a => (a.kind === 'demonstration' || a.kind === 'drill') && (a.type === 'video' || Boolean(a.videoId)));
	if (demo) return demo;
	// 2. Prefer looping visual animation or photo (or demonstration image)
	const visual = assets.find(a => (a.kind === 'demonstration' && a.type === 'image') || a.kind === 'animation' || a.kind === 'photo' || a.type === 'image');
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

	const updatedPayload = {
		...ex,
		media_url: media_url,
		media_assets: existingAssets
	};

	// If timed mode and this asset has video slice timestamps, sync default_quantity
	if (ex.default_mode === 'time' && asset && typeof asset.startSeconds === 'number' && typeof asset.endSeconds === 'number' && asset.endSeconds > asset.startSeconds) {
		const snippetDur = asset.endSeconds - asset.startSeconds;
		if (!ex.default_quantity || ex.default_quantity === 20 || ex.default_quantity === 30 || ex.default_quantity === 60 || existingAssets.length === 1) {
			updatedPayload.default_quantity = snippetDur;
		}
	}

	const updated = await createCustomExercise(updatedPayload);

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
		rebuildExerciseMap();
		return cachedExercises;
	} catch (err) {
		console.warn('Failed to fetch exercises from server:', err);
		cachedExercises = [];
		isLoaded = false;
		rebuildExerciseMap();
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
		rebuildExerciseMap();
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
	rebuildExerciseMap();
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
			primary: ex.primary_muscles.map(m => m === 'groin' ? 'adductors' : m),
			secondary: (Array.isArray(ex.secondary_muscles) ? ex.secondary_muscles : []).map(m => m === 'groin' ? 'adductors' : m),
		};
	}
	const name = (ex.name || '').toLowerCase();
	const desc = (ex.description || '').toLowerCase();
	const combined = `${name} ${desc}`;

	if (/\b(pelvic|kegel|perineal|diaphragm)\b/.test(combined)) {
		return { primary: ['pelvic_floor', 'abs'], secondary: ['glutes', 'lower_back', 'adductors'] };
	}
	if (/\b(bridge)\b/.test(combined)) {
		return { primary: ['glutes', 'pelvic_floor'], secondary: ['hamstrings', 'abs', 'adductors'] };
	}
	if (/\b(overhead\s*press|shoulder\s*press|military\s*press)\b/.test(combined)) {
		return { primary: ['shoulders', 'triceps'], secondary: ['chest', 'abs', 'forearms'] };
	}
	if (/\b(push[- ]?up|pushups?|bench\s*press|chest\s*press|floor\s*press|push)\b/.test(combined)) {
		return { primary: ['chest', 'triceps'], secondary: ['shoulders', 'abs', 'forearms'] };
	}
	if (/\b(squat|squats|lunge|lunges|jump|jumping)\b/.test(combined)) {
		return { primary: ['quads', 'calves', 'adductors'], secondary: ['glutes', 'abs', 'pelvic_floor'] };
	}
	if (/\b(high\s*knee|knee\s*strike|knee\s*drive|kick|kicking|kicks)\b/.test(combined)) {
		return { primary: ['hip_flexors', 'abs', 'quads'], secondary: ['glutes', 'calves', 'adductors', 'pelvic_floor'] };
	}
	if (/\b(jab|cross|punch|punching|hook|uppercut|elbow)\b/.test(combined)) {
		return { primary: ['shoulders', 'obliques'], secondary: ['triceps', 'forearms', 'calves'] };
	}
	if (/\b(plank|climber|mountain\s*climber|shoulder\s*tap|bird[- ]?dog)\b/.test(combined)) {
		return { primary: ['abs', 'obliques', 'shoulders'], secondary: ['chest', 'triceps', 'forearms', 'pelvic_floor'] };
	}
	if (/\b(cobra|child|pose|stretch|stretching)\b/.test(combined)) {
		return { primary: ['abs', 'hip_flexors', 'lower_back'], secondary: ['adductors', 'shoulders', 'lats', 'pelvic_floor'] };
	}
	if (/\b(pigeon)\b/.test(combined)) {
		return { primary: ['glutes', 'adductors', 'hip_flexors'], secondary: ['hamstrings', 'lower_back', 'pelvic_floor'] };
	}
	if (/\b(fold|hamstring|hamstrings)\b/.test(combined)) {
		return { primary: ['hamstrings', 'lower_back'], secondary: ['calves', 'adductors'] };
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
			const queryMus = mus === 'groin' ? 'adductors' : mus;
			if (!allExMuscles.includes(queryMus) && !allExMuscles.includes(mus)) return false;
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
	if (exerciseIdMap.size === 0) {
		getExercises();
	}
	return exerciseIdMap.get(clean) || null;
}

/**
 * Create a new custom exercise.
 * @param {Object} exerciseData
 * @returns {Promise<Object>}
 */
export async function createCustomExercise(exerciseData) {
	const saved = await saveCustomExerciseOnServer(exerciseData);
	cachedExercises = [saved, ...cachedExercises.filter(e => e.id !== saved.id)];
	rebuildExerciseMap();
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
	rebuildExerciseMap();
	return true;
}

/**
 * Calculate effective quantity (seconds or reps) for an exercise.
 * If timed and a video asset has startSeconds & endSeconds, derives duration from the snippet.
 * @param {Object} ex
 * @returns {number}
 */
export function getEffectiveExerciseQuantity(ex) {
	if (!ex) return 30;
	if (ex.default_mode === 'reps') {
		return ex.default_quantity || 20;
	}
	const assets = getExerciseMediaAssets([ex]);
	const vid = assets.find(a => (a.kind === 'demonstration' || a.type === 'video' || Boolean(a.videoId)) && typeof a.startSeconds === 'number' && typeof a.endSeconds === 'number' && a.endSeconds > a.startSeconds) || assets[0];
	if (vid && typeof vid.startSeconds === 'number' && typeof vid.endSeconds === 'number' && vid.endSeconds > vid.startSeconds) {
		return vid.endSeconds - vid.startSeconds;
	}
	return ex.default_quantity || 30;
}

/**
 * Render a single Exercise Library card element with form preview and actions.
 * @param {Object} ex - Exercise object
 * @param {Object} [options]
 * @param {Function} [options.onSelect]
 * @param {Function} [options.onPreview]
 * @param {Function} [options.onAddToRoutine]
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
	const demoCount = assets.filter(a => (a.kind === 'demonstration' || a.kind === 'drill') && (a.type === 'video' || a.videoId)).length;
	const animCount = assets.filter(a => (a.kind === 'demonstration' && a.type === 'image') || a.kind === 'animation' || a.kind === 'photo').length;

	const effectiveQty = getEffectiveExerciseQuantity(ex);
	const modeStr = formatModeQuantity(ex.default_mode || 'reps', effectiveQty);

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
			${instructionCount > 0 ? `<span class="ex-media-mini-pill pill-inst"><span class="chip-svg-wrap">${getMediaKindIcon('instruction', 11)}</span> ${instructionCount} Tutorial${instructionCount > 1 ? 's' : ''}</span>` : ''}
			${demoCount > 0 ? `<span class="ex-media-mini-pill pill-demo"><span class="chip-svg-wrap">${getMediaKindIcon('demonstration', 11)}</span> ${demoCount} Drill${demoCount > 1 ? 's' : ''}</span>` : ''}
			${animCount > 0 ? `<span class="ex-media-mini-pill pill-anim"><span class="chip-svg-wrap">${getMediaKindIcon('animation', 11)}</span> Visual Form</span>` : ''}
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

/**
 * Resolves the active video asset for a step dynamically.
 * Dynamic inheritance hierarchy:
 * 1. Explicit user override for this specific step (customMedia: true && step.videoId).
 * 2. Compound combo dynamic resolution: resolves combo demonstration video if step.combo_id exists.
 * 3. Curated routine video clip: preserves explicit clip slice (type === 'clip' with videoId and start/end seconds).
 * 4. Dynamic exercise inheritance: resolves demonstration follow-along video from attached exercise reference.
 * 5. Fallback: Standalone or curated step video (step.videoId).
 * @param {Object} step
 * @returns {{ videoId: string, startSeconds: number, endSeconds: number } | null}
 */
export function resolveStepVideo(step) {
	if (!step || isBreakStep(step) || isRepsStep(step)) return null;

	// 1. Explicit user override for this specific step
	if (step.customMedia && step.videoId) {
		return {
			videoId: step.videoId,
			startSeconds: typeof step.startSeconds === 'number' ? step.startSeconds : 0,
			endSeconds: typeof step.endSeconds === 'number' ? step.endSeconds : ((step.startSeconds || 0) + (step.durationSeconds || 60))
		};
	}

	// 2. Tutorial breakdown resolution (coaching / form tutorial videos)
	const isTutorial = Boolean(step.isTutorial || (step.label && step.label.includes('[Tutorial]')));
	if (isTutorial) {
		if (step.videoId) {
			return {
				videoId: step.videoId,
				startSeconds: typeof step.startSeconds === 'number' ? step.startSeconds : 0,
				endSeconds: typeof step.endSeconds === 'number' ? step.endSeconds : ((step.startSeconds || 0) + (step.durationSeconds || 60))
			};
		}
		if (Array.isArray(step.exercises) && step.exercises.length > 0) {
			for (const exRef of step.exercises) {
				const fullEx = exRef && exRef.id ? getExerciseById(exRef.id) : null;
				const target = fullEx || (typeof exRef === 'object' ? exRef : null);
				if (target) {
					const inst = getExerciseInstructionMedia(target);
					if (inst && (inst.type === 'video' || inst.videoId)) {
						const vid = inst.videoId || parseYouTubeId(inst.url);
						if (vid) {
							const start = typeof inst.startSeconds === 'number' ? inst.startSeconds : 0;
							const end = typeof inst.endSeconds === 'number' ? inst.endSeconds : (start + (step.durationSeconds || target.default_quantity || 60));
							return {
								videoId: vid,
								startSeconds: start,
								endSeconds: end
							};
						}
					}
				}
			}
		}
		return null;
	}

	// 2. Compound combo dynamic resolution (never fall through to individual sub-exercises)
	if (step.combo_id) {
		const combo = resolveCombo(step.combo_id);
		if (combo) {
			const comboAsset = Array.isArray(combo.media_assets)
				? combo.media_assets.find(a => (a.kind === 'demonstration' || a.kind === 'drill' || !a.kind) && (a.type === 'video' || Boolean(a.videoId)))
				: null;
			if (comboAsset && (comboAsset.videoId || comboAsset.url)) {
				const vid = comboAsset.videoId || parseYouTubeId(comboAsset.url);
				if (vid) {
					const start = typeof step.startSeconds === 'number' ? step.startSeconds : (comboAsset.startSeconds || 0);
					const end = typeof step.endSeconds === 'number' ? step.endSeconds : (comboAsset.endSeconds || (start + (step.durationSeconds || combo.default_quantity || 190)));
					return {
						videoId: vid,
						startSeconds: start,
						endSeconds: end
					};
				}
			}
			if (combo.media_url) {
				const vid = parseYouTubeId(combo.media_url);
				if (vid) {
					const start = typeof step.startSeconds === 'number' ? step.startSeconds : 0;
					const end = typeof step.endSeconds === 'number' ? step.endSeconds : (start + (step.durationSeconds || combo.default_quantity || 190));
					return {
						videoId: vid,
						startSeconds: start,
						endSeconds: end
					};
				}
			}
		}
		// If step itself has curated clip videoId and timestamps, preserve them!
		if (step.videoId) {
			return {
				videoId: step.videoId,
				startSeconds: step.startSeconds || 0,
				endSeconds: step.endSeconds || ((step.startSeconds || 0) + (step.durationSeconds || 60))
			};
		}
		return null;
	}

	// 3. Dynamic exercise inheritance (for single exercise steps)
	if (Array.isArray(step.exercises) && step.exercises.length > 0) {
		let foundAnyInLibrary = false;
		for (const exRef of step.exercises) {
			const fullEx = exRef && exRef.id ? getExerciseById(exRef.id) : null;
			const target = fullEx || (typeof exRef === 'object' ? exRef : null);
			if (target) {
				if (fullEx) foundAnyInLibrary = true;
				// Check follow-along demonstration video (excludes instruction kind)
				const followAlong = getExerciseFollowAlongMedia(target);
				if (followAlong && (followAlong.type === 'video' || followAlong.videoId)) {
					const vid = followAlong.videoId || parseYouTubeId(followAlong.url);
					if (vid) {
						const start = typeof followAlong.startSeconds === 'number' ? followAlong.startSeconds : (step.startSeconds || 0);
						const end = typeof followAlong.endSeconds === 'number' ? followAlong.endSeconds : (start + (step.durationSeconds || target.default_quantity || 60));
						return {
							videoId: vid,
							startSeconds: start,
							endSeconds: end
						};
					}
				}
			}
		}
		// If backing exercise was found in library and has no follow-along demo video:
		// Do NOT fallback to raw media_url at 0s, and do NOT play instruction breakdown as follow-along!
		// The exercise library is authoritative (e.g. if updated to GIF or no video, remove video).
		if (foundAnyInLibrary) {
			return null;
		}
	}

	// 4. Standalone or curated step video (when no backing exercise in library)
	if (step.videoId) {
		return {
			videoId: step.videoId,
			startSeconds: step.startSeconds || 0,
			endSeconds: step.endSeconds || ((step.startSeconds || 0) + (step.durationSeconds || 60))
		};
	}

	return null;
}

/**
 * Resolves the visual image, SVG, or GIF for a step dynamically.
 * Prioritizes live exercise media over static copies.
 * @param {Object} step
 * @returns {string|null}
 */
export function resolveStepVisual(step) {
	if (!step || isBreakStep(step)) return null;

	// 1. Combo visual inheritance
	if (!step.customMedia && step.combo_id) {
		const combo = resolveCombo(step.combo_id);
		if (combo) {
			const visual = (combo.media_assets || []).find(a => (a.kind === 'animation' || a.kind === 'photo' || a.type === 'image') && a.url && !parseYouTubeId(a.url));
			if (visual) return visual.url;
			if (combo.media_url && !parseYouTubeId(combo.media_url)) return combo.media_url;
		}
	}

	// 2. Dynamic exercise inheritance (unless customMedia is flagged)
	if (!step.customMedia && Array.isArray(step.exercises) && step.exercises.length > 0) {
		let foundAnyInLibrary = false;
		for (const exRef of step.exercises) {
			const fullEx = exRef && exRef.id ? getExerciseById(exRef.id) : null;
			if (fullEx) {
				foundAnyInLibrary = true;
				const visual = getExerciseFollowAlongMedia(fullEx);
				if (visual && visual.type === 'image' && visual.url && !parseYouTubeId(visual.url)) {
					return visual.url;
				}
				if (fullEx.media_url && !parseYouTubeId(fullEx.media_url)) {
					return fullEx.media_url;
				}
			} else if (exRef && typeof exRef === 'object') {
				const visual = getExerciseFollowAlongMedia(exRef);
				if (visual && visual.type === 'image' && visual.url && !parseYouTubeId(visual.url)) {
					return visual.url;
				}
				if (exRef.media_url && !parseYouTubeId(exRef.media_url)) {
					return exRef.media_url;
				}
			}
		}
		// If backing exercise was found in library and has no visual media, exercise library is authoritative
		if (foundAnyInLibrary) {
			return null;
		}
	}

	// 2. Direct step media (if not a YouTube URL)
	const direct = step.gifUrl || step.mediaUrl || step.imageUrl;
	if (direct && typeof direct === 'string' && direct.trim()) {
		const trimmed = direct.trim();
		if (!parseYouTubeId(trimmed)) {
			return trimmed;
		}
	}

	// 3. Fallback to name heuristics
	if (step.type === 'timer' && step.label) {
		const l = step.label.toLowerCase();
		if (l.includes('diamond pushup') || l.includes('diamond push-up') || l.includes('diamond-pushup') || l.includes('diamond')) {
			return '/workout/media/diamond-pushups.gif';
		}
		if (l.includes('pike pushup') || l.includes('pike push-up') || l.includes('pike-pushup') || l.includes('pike')) {
			return '/workout/media/pike-pushups.svg';
		}
		if (l.includes('decline pushup') || l.includes('decline push-up') || l.includes('decline-pushup') || l.includes('decline')) {
			return '/workout/media/decline-pushups.svg';
		}
		if (l.includes('mountain climber') || l.includes('climber')) {
			return '/workout/media/mountain-climbers.svg';
		}
		if (l.includes('shoulder tap') || l.includes('shoulder-tap') || l.includes('shouldertap')) {
			return '/workout/media/shoulder-taps.svg';
		}
		if (l.includes('pushup') || l.includes('push-up') || l.includes('push up')) {
			return '/workout/media/pushups.svg';
		}
		if (l.includes('cobra')) {
			return '/workout/media/cobra-stretch.jpg';
		}
		if (l.includes('tricep') || (l.includes('shoulder') && (l.includes('stretch') || l.includes('mobility')))) {
			return '/workout/media/overhead-tricep-stretch.jpg';
		}
		if (l.includes('pigeon')) {
			return '/workout/media/pigeon-pose.jpg';
		}
		if (l.includes('child')) {
			return '/workout/media/childs-pose.jpg';
		}
		if (l.includes('hamstring') || l.includes('forward fold') || l.includes('forward bend')) {
			return '/workout/media/seated-hamstring-fold.jpg';
		}
	}

	return null;
}

/**
 * Classify a step into its normalized execution + media model.
 * This is the single entry point for "what is this step and what does it show".
 * @param {Object} step
 * @returns {{
 *   mode: 'break'|'reps'|'time',
 *   targetDuration: number,
 *   targetReps: number,
 *   video: { videoId: string, startSeconds: number, endSeconds: number } | null,
 *   visual: string | null
 * }}
 */
export function classifyStep(step) {
	const mode = getStepMode(step);
	const video = mode === 'time' ? resolveStepVideo(step) : null;
	const visual = mode !== 'break' ? resolveStepVisual(step) : null;

	if (mode === 'reps') {
		return {
			mode,
			targetReps: Number(step.targetReps) || 20,
			targetDuration: 0,
			video: null,
			visual,
		};
	}

	return {
		mode,
		targetReps: 0,
		targetDuration: getStepDuration(step, video),
		video,
		visual,
	};
}

/**
 * Does this step play a follow-along video (resolved dynamically)?
 * @param {Object} step
 * @returns {boolean}
 */
export function hasStepVideo(step) {
	return Boolean(classifyStep(step).video);
}

/**
 * Does this step break into multiple sub-exercises (compound flow)?
 * A break step or a step that plays a video never sub-steps.
 * @param {Object} step
 * @returns {boolean}
 */
export function hasSubSteps(step) {
	if (!step || isBreakStep(step)) return false;
	if (hasStepVideo(step)) return false;
	return Array.isArray(step.exercises) && step.exercises.length > 1;
}
