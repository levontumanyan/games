/**
 * Exercises module - Taxonomy, definitions, local caching, and custom exercise creation.
 */

import { fetchServerExercises, saveCustomExerciseOnServer, deleteCustomExerciseOnServer } from './storage.js';
import { escapeHtml, formatTime, parseYouTubeId } from './utils.js';
import { showConfirm, showAlert } from './modal.js';
import { createBodyMap, MUSCLE_DEFINITIONS } from './body_map.js';

export const MUSCLE_GROUPS = MUSCLE_DEFINITIONS;

export const CATEGORIES = {
	strength: { label: 'Strength / Force', icon: '💪', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' },
	drill: { label: 'Drills & Speed', icon: '⚡', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
	technique: { label: 'Technique & Form', icon: '🥋', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
	stretch: { label: 'Stretch & Recovery', icon: '🧘', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
	cardio: { label: 'Cardio & HIIT', icon: '🫀', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
	mobility: { label: 'Mobility & Joints', icon: '🔄', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
};

export const DISCIPLINES = {
	muay_thai: { label: 'Muay Thai', icon: '🥊', color: '#f43f5e' },
	boxing: { label: 'Boxing', icon: '🥊', color: '#ef4444' },
	calisthenics: { label: 'Calisthenics', icon: '🤸', color: '#3b82f6' },
	general: { label: 'General Fitness', icon: '🏋️', color: '#10b981' },
	yoga: { label: 'Yoga & Recovery', icon: '🧘', color: '#8b5cf6' },
};

export const MEDIA_KINDS = {
	instruction: { label: 'Instruction & Tutorial', icon: '🎬', color: '#38bdf8', bg: 'rgba(6, 182, 212, 0.15)' },
	demonstration: { label: 'Exercise Execution', icon: '⚡', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
	animation: { label: 'Looping GIF / SVG', icon: '✨', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
	photo: { label: 'Form Photo & Cue', icon: '📷', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
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

	const updated = await createCustomExercise({
		...ex,
		media_assets: existingAssets
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
		console.warn('Failed to fetch exercises from server, using local fallback:', err);
		if (cachedExercises.length === 0) {
			cachedExercises = getDefaultFallbackExercises();
		}
		return cachedExercises;
	}
}

/**
 * Get all cached exercises.
 * @returns {Array}
 */
export function getExercises() {
	if (cachedExercises.length === 0) {
		cachedExercises = getDefaultFallbackExercises();
	}
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

	if (combined.includes('pushup') || combined.includes('push-up') || combined.includes('press')) {
		return { primary: ['chest', 'triceps'], secondary: ['shoulders', 'abs', 'forearms'] };
	}
	if (combined.includes('jump') || combined.includes('squat') || combined.includes('lunge')) {
		return { primary: ['quads', 'calves', 'groin'], secondary: ['glutes', 'abs'] };
	}
	if (combined.includes('knee') || combined.includes('kick')) {
		return { primary: ['hip_flexors', 'abs', 'quads'], secondary: ['glutes', 'calves', 'groin'] };
	}
	if (combined.includes('jab') || combined.includes('cross') || combined.includes('punch') || combined.includes('elbow')) {
		return { primary: ['shoulders', 'obliques'], secondary: ['triceps', 'forearms', 'calves'] };
	}
	if (combined.includes('plank') || combined.includes('climber') || combined.includes('tap')) {
		return { primary: ['abs', 'obliques', 'shoulders'], secondary: ['chest', 'triceps', 'forearms'] };
	}
	if (combined.includes('cobra') || combined.includes('child') || combined.includes('pose') || combined.includes('stretch')) {
		return { primary: ['abs', 'hip_flexors', 'lower_back'], secondary: ['groin', 'shoulders', 'lats'] };
	}
	if (combined.includes('pigeon')) {
		return { primary: ['glutes', 'groin', 'hip_flexors'], secondary: ['hamstrings', 'lower_back'] };
	}
	if (combined.includes('fold') || combined.includes('hamstring')) {
		return { primary: ['hamstrings', 'lower_back'], secondary: ['calves', 'groin'] };
	}
	return { primary: ['abs'], secondary: ['shoulders', 'core'] };
}

/**
 * Render HTML badge for a muscle group.
 * @param {string} muscleKey
 * @param {boolean} [isPrimary=true]
 * @returns {string}
 */
export function getMuscleBadgeHtml(muscleKey, isPrimary = true) {
	const def = MUSCLE_DEFINITIONS[muscleKey] || { label: muscleKey, icon: '🧬', color: '#9ea2bd' };
	const typeClass = isPrimary ? 'muscle-badge-primary' : 'muscle-badge-secondary';
	return `<span class="ex-muscle-badge ${typeClass}" title="${isPrimary ? 'Primary Target' : 'Secondary Synergist'}: ${def.label}">
		<span class="muscle-icon">${def.icon}</span>
		<span class="muscle-label">${def.label}</span>
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
					<button id="btn-open-anatomy-tab" class="btn btn-ghost btn-sm" title="Open Interactive Anatomy & Muscle Map">🧬 Anatomy Map</button>
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
	const anatomyBtn = container.querySelector('#btn-open-anatomy-tab');

	if (anatomyBtn) {
		anatomyBtn.addEventListener('click', () => {
			onOpenAnatomy();
		});
	}

	createBtn.addEventListener('click', () => {
		showCreateExerciseModal({
			onCreated: () => {
				renderGrid();
			}
		});
	});

	const filterOptions = [
		{ id: 'all', label: 'All Movements', icon: '🏋️' },
		{ id: 'disc:muay_thai', label: 'Muay Thai', icon: '🥊' },
		{ id: 'disc:boxing', label: 'Boxing', icon: '🥊' },
		{ id: 'disc:calisthenics', label: 'Calisthenics', icon: '🤸' },
		{ id: 'disc:yoga', label: 'Yoga & Recovery', icon: '🧘' },
		{ id: 'cat:strength', label: 'Strength', icon: '💪' },
		{ id: 'cat:drill', label: 'Drills', icon: '⚡' },
		{ id: 'cat:technique', label: 'Technique', icon: '🥋' },
		{ id: 'cat:stretch', label: 'Stretch', icon: '🧘' },
		{ id: 'cat:cardio', label: 'Cardio', icon: '🫀' },
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
			btn.innerHTML = `<span>${opt.icon}</span> <span>${opt.label}</span>`;
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
					<p class="empty-sub">Try selecting another muscle group on the body map or search with a different keyword.</p>
				</div>
			`;
			return;
		}

		gridContainer.innerHTML = '';
		list.forEach(ex => {
			const assets = getExerciseMediaAssets([ex]);
			const isCustom = Boolean(ex.user_id && ex.user_id !== 'system');
			const muscles = inferMusclesForExercise(ex);

			const card = document.createElement('div');
			card.className = 'exercise-library-card';

			const instructionCount = assets.filter(a => a.kind === 'instruction').length;
			const demoCount = assets.filter(a => a.kind === 'demonstration').length;
			const animCount = assets.filter(a => a.kind === 'animation' || a.kind === 'photo').length;

			const modeStr = (ex.default_mode || 'reps') === 'reps'
				? `🔢 ${ex.default_quantity || 20} Reps`
				: `⏱️ ${formatTime(ex.default_quantity || 30)}`;

			const muscleBadgesHtml = [
				...(muscles.primary || []).map(m => getMuscleBadgeHtml(m, true)),
				...(muscles.secondary || []).map(m => getMuscleBadgeHtml(m, false)),
			].join('');

			card.innerHTML = `
				<div class="ex-lib-header">
					<div class="ex-lib-badges">
						${getCategoryBadgeHtml(ex.category)}
						${ex.discipline ? getDisciplineBadgeHtml(ex.discipline) : ''}
					</div>
					${isCustom ? `
						<button class="btn btn-ghost btn-xs btn-del-ex" title="Delete custom exercise" data-id="${ex.id}">✕</button>
					` : ''}
				</div>

				<div class="ex-lib-title-row">
					<h3 class="ex-lib-title">${escapeHtml(ex.name)}</h3>
					<span class="ex-lib-mode-tag">${modeStr}</span>
				</div>

				<div class="ex-lib-muscles-row">
					${muscleBadgesHtml}
				</div>

				<p class="ex-lib-desc">${escapeHtml(ex.description || 'Movement and technique practice.')}</p>

				<div class="ex-lib-media-pills">
					${instructionCount > 0 ? `<span class="ex-media-mini-pill pill-inst">🎬 ${instructionCount} Instruction${instructionCount > 1 ? 's' : ''}</span>` : ''}
					${demoCount > 0 ? `<span class="ex-media-mini-pill pill-demo">⚡ ${demoCount} Drill${demoCount > 1 ? 's' : ''}</span>` : ''}
					${animCount > 0 ? `<span class="ex-media-mini-pill pill-anim">✨ Visual Form</span>` : ''}
					${assets.length === 0 ? `<span class="ex-media-mini-pill pill-none">No media</span>` : ''}
				</div>

				<div class="ex-lib-actions">
					<button class="btn btn-sm btn-primary btn-play-ex" title="Test in Preview Mode">
						▶ Test / Play
					</button>
					<button class="btn btn-sm btn-ghost btn-view-vars" title="View video tutorials and variations">
						🎬 Variations (${assets.length})
					</button>
					<button class="btn btn-sm btn-ghost btn-add-routine" title="Add to current workout">
						+ Add to Workout
					</button>
				</div>
			`;

			const playBtn = card.querySelector('.btn-play-ex');
			playBtn.addEventListener('click', () => {
				onPlayExercise(ex, assets[0] || null);
			});

			const varsBtn = card.querySelector('.btn-view-vars');
			varsBtn.addEventListener('click', () => {
				showExerciseVariationsModal(ex, {
					onPlayAsset: (asset) => onPlayExercise(ex, asset),
					onUpdated: () => renderGrid()
				});
			});

			const addRoutineBtn = card.querySelector('.btn-add-routine');
			addRoutineBtn.addEventListener('click', () => {
				onAddToRoutine(ex);
			});

			const delBtn = card.querySelector('.btn-del-ex');
			if (delBtn) {
				delBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					const confirmed = await showConfirm({
						title: 'Delete Exercise',
						message: `Are you sure you want to delete "${ex.name}" from your custom exercise library?`,
						confirmText: 'Delete',
						danger: true
					});
					if (confirmed) {
						await deleteCustomExercise(ex.id);
						renderGrid();
					}
				});
			}

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
 * Show a modal displaying all media variations for an exercise, with option to play or add more.
 * @param {Object} exercise
 * @param {Object} [options]
 */
export function showExerciseVariationsModal(exercise, options = {}) {
	const onPlayAsset = options.onPlayAsset || (() => {});
	const onUpdated = options.onUpdated || (() => {});

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-exercise-variations';

	function renderModalContent() {
		const assets = getExerciseMediaAssets([exercise]);

		modal.innerHTML = `
			<div class="modal-header">
				<div>
					<div class="modal-badges-row">
						${getCategoryBadgeHtml(exercise.category)}
						${exercise.discipline ? getDisciplineBadgeHtml(exercise.discipline) : ''}
					</div>
					<h3 class="modal-title">${escapeHtml(exercise.name)} — Media Variations</h3>
				</div>
				<button class="modal-close-btn" title="Close">✕</button>
			</div>

			<div class="modal-body">
				<p class="modal-subtitle">${escapeHtml(exercise.description || 'Instruction breakdowns, demonstrations, and looping forms.')}</p>

				<div class="modal-section-title">Attached Media Assets (${assets.length})</div>
				<div class="modal-assets-list">
					${assets.length === 0 ? '<p class="empty-chip-hint">No media attached yet. Add a tutorial video or looping GIF below!</p>' : ''}
					${assets.map((a, idx) => {
						const isVideo = a.type === 'video' || Boolean(a.videoId);
						const vid = a.videoId || (a.url ? parseYouTubeId(a.url) : null);
						const thumb = isVideo && vid
							? `https://img.youtube.com/vi/${vid}/mqdefault.jpg`
							: (a.url || '/workout/media/pushups.svg');

						return `
							<div class="modal-asset-row" data-idx="${idx}">
								<div class="modal-asset-thumb">
									<img src="${thumb}" alt="${escapeHtml(a.title || '')}">
									${isVideo ? '<span class="modal-play-badge">▶</span>' : ''}
								</div>
								<div class="modal-asset-info">
									<div class="modal-asset-badge-row">
										${getMediaKindBadgeHtml(a.kind)}
										${a.startSeconds !== undefined && a.endSeconds ? `<span class="asset-timestamp">${formatTime(a.startSeconds)} - ${formatTime(a.endSeconds)}</span>` : ''}
									</div>
									<div class="modal-asset-title">${escapeHtml(a.title || 'Media Asset')}</div>
								</div>
								<button class="btn btn-sm btn-primary btn-play-asset-now" data-idx="${idx}">▶ Play</button>
							</div>
						`;
					}).join('')}
				</div>

				<!-- Add Media Asset Form -->
				<div class="add-asset-collapse-section">
					<button id="toggle-add-asset-btn" class="btn btn-ghost btn-sm">+ Add New Video or Photo Asset</button>
					<div id="add-asset-form" class="add-asset-form hidden">
						<div class="field-group">
							<label>Media Role / Kind</label>
							<select id="new-asset-kind" class="input">
								<option value="instruction">🎬 Instruction & Tutorial</option>
								<option value="demonstration">⚡ Exercise Execution / Follow-Along</option>
								<option value="animation">✨ Looping GIF / Animation</option>
								<option value="photo">📷 Form Reference Photo</option>
							</select>
						</div>

						<div class="field-group">
							<label>Asset Title</label>
							<input type="text" id="new-asset-title" class="input" placeholder="e.g., Coach Breakdown & Cueing">
						</div>

						<div class="field-group">
							<label>Video URL or Image URL</label>
							<input type="text" id="new-asset-url" class="input" placeholder="https://youtube.com/watch?v=... or /workout/media/...">
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

			<div class="modal-footer">
				<button class="btn btn-ghost modal-btn-close">Close</button>
			</div>
		`;

		modal.querySelectorAll('.modal-close-btn, .modal-btn-close').forEach(b => {
			b.addEventListener('click', () => backdrop.remove());
		});

		modal.querySelectorAll('.btn-play-asset-now').forEach(btn => {
			btn.addEventListener('click', () => {
				const idx = parseInt(btn.getAttribute('data-idx'), 10);
				if (assets[idx]) {
					backdrop.remove();
					onPlayAsset(assets[idx]);
				}
			});
		});

		const toggleAddBtn = modal.querySelector('#toggle-add-asset-btn');
		const addForm = modal.querySelector('#add-asset-form');
		toggleAddBtn.addEventListener('click', () => {
			addForm.classList.toggle('hidden');
		});

		const saveAssetBtn = modal.querySelector('#btn-save-new-asset');
		saveAssetBtn.addEventListener('click', async () => {
			const kind = modal.querySelector('#new-asset-kind').value;
			const title = modal.querySelector('#new-asset-title').value.trim() || 'Media Asset';
			const url = modal.querySelector('#new-asset-url').value.trim();
			const start = parseInt(modal.querySelector('#new-asset-start').value, 10) || 0;
			const end = parseInt(modal.querySelector('#new-asset-end').value, 10) || 60;

			if (!url) {
				await showAlert({ title: 'Missing URL', message: 'Please enter a valid YouTube URL or image link.' });
				return;
			}

			const vid = parseYouTubeId(url);
			const newAsset = {
				id: `asset-${Date.now()}`,
				kind,
				type: vid ? 'video' : 'image',
				title,
				url,
				videoId: vid || undefined,
				startSeconds: vid ? start : undefined,
				endSeconds: vid ? end : undefined,
			};

			try {
				const updated = await addMediaAssetToExercise(exercise.id, newAsset);
				exercise.media_assets = updated.media_assets;
				renderModalContent();
				onUpdated();
			} catch (err) {
				await showAlert({ title: 'Error', message: 'Could not add media asset: ' + err.message });
			}
		});
	}

	backdrop.appendChild(modal);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) backdrop.remove();
	});

	renderModalContent();
	document.body.appendChild(backdrop);
}

/**
 * Show modal to create a new custom exercise.
 * @param {Object} [options]
 */
export function showCreateExerciseModal(options = {}) {
	const onCreated = options.onCreated || (() => {});

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-create-exercise';

	modal.innerHTML = `
		<div class="modal-header">
			<h3 class="modal-title">➕ Create Custom Exercise</h3>
			<button class="modal-close-btn" title="Close">✕</button>
		</div>

		<div class="modal-body">
			<div class="field-group">
				<label>Exercise Name</label>
				<input type="text" id="create-ex-name" class="input" placeholder="e.g., Muay Thai Switch Kick, Diamond Push-ups...">
			</div>

			<div class="field-row">
				<div class="field-group">
					<label>Category</label>
					<select id="create-ex-category" class="input">
						<option value="strength">💪 Strength / Force</option>
						<option value="drill">⚡ Drills & Speed</option>
						<option value="technique">🥋 Technique & Form</option>
						<option value="stretch">🧘 Stretch & Recovery</option>
						<option value="cardio">🫀 Cardio & HIIT</option>
						<option value="mobility">🔄 Mobility & Joints</option>
					</select>
				</div>

				<div class="field-group">
					<label>Discipline</label>
					<select id="create-ex-discipline" class="input">
						<option value="general">🏋️ General Fitness</option>
						<option value="muay_thai">🥊 Muay Thai</option>
						<option value="boxing">🥊 Boxing</option>
						<option value="calisthenics">🤸 Calisthenics</option>
						<option value="yoga">🧘 Yoga & Mobility</option>
					</select>
				</div>
			</div>

			<div class="field-row">
				<div class="field-group">
					<label>Default Execution Mode</label>
					<select id="create-ex-mode" class="input">
						<option value="reps">🔢 Target Reps</option>
						<option value="time">⏱️ Timed Interval</option>
					</select>
				</div>

				<div class="field-group">
					<label>Default Quantity (reps or sec)</label>
					<input type="number" id="create-ex-quantity" class="input" min="1" value="20">
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
				<textarea id="create-ex-desc" class="input" rows="2" placeholder="Key form cues, tempo, or setup instructions..."></textarea>
			</div>

			<div class="field-group">
				<label>Video or Image URL (Optional)</label>
				<input type="text" id="create-ex-media" class="input" placeholder="https://youtube.com/watch?v=... or image URL">
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-ghost modal-btn-cancel">Cancel</button>
			<button id="btn-submit-create-ex" class="btn btn-primary">Create Exercise</button>
		</div>
	`;

	const close = () => backdrop.remove();

	modal.querySelectorAll('.modal-close-btn, .modal-btn-cancel').forEach(b => {
		b.addEventListener('click', close);
	});

	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	const priContainer = modal.querySelector('#create-ex-primary-muscles');
	const secContainer = modal.querySelector('#create-ex-secondary-muscles');

	const selectedPrimary = new Set(['core']);
	const selectedSecondary = new Set();

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

		try {
			const created = await createCustomExercise({
				name,
				category,
				discipline,
				default_mode,
				default_quantity,
				description,
				media_url,
				primary_muscles,
				secondary_muscles,
			});
			close();
			onCreated(created);
		} catch (err) {
			await showAlert({ title: 'Error', message: 'Could not create exercise: ' + err.message });
		}
	});

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);
}

/**
 * Default fallback exercises if server is offline on first cold boot.
 */
function getDefaultFallbackExercises() {
	return [
		{ id: 'ex-star-jumps', name: 'Star Jumps + Coordination Drills', category: 'drill', discipline: 'general', default_mode: 'time', default_quantity: 190, media_url: 'https://www.youtube.com/watch?v=ZWZWzRnLpVM', primary_muscles: ['calves', 'quads'], secondary_muscles: ['shoulders', 'core'] },
		{ id: 'ex-check-repeats', name: 'Check Repeats (Lead & Rear Block)', category: 'technique', discipline: 'muay_thai', default_mode: 'time', default_quantity: 60, media_url: 'https://www.youtube.com/watch?v=wPGC3uFIOBA', primary_muscles: ['core', 'quads'], secondary_muscles: ['glutes', 'calves'] },
		{ id: 'ex-lateral-jumps', name: 'Lateral Jumps + Shoulder Taps', category: 'drill', discipline: 'general', default_mode: 'time', default_quantity: 185, media_url: 'https://www.youtube.com/watch?v=ZWZWzRnLpVM', primary_muscles: ['quads', 'calves'], secondary_muscles: ['glutes', 'core'] },
		{ id: 'ex-mountain-climbers', name: 'Mountain Climbers', category: 'cardio', discipline: 'general', default_mode: 'time', default_quantity: 60, media_url: 'https://www.youtube.com/watch?v=7sLw5dHdRG4', primary_muscles: ['core', 'shoulders'], secondary_muscles: ['quads', 'chest'] },
		{ id: 'ex-jab-cross', name: 'Jab-Cross Technique', category: 'technique', discipline: 'boxing', default_mode: 'time', default_quantity: 184, media_url: 'https://www.youtube.com/watch?v=7sLw5dHdRG4', primary_muscles: ['shoulders', 'core'], secondary_muscles: ['triceps', 'chest', 'calves'] },
		{ id: 'ex-jab-knee', name: 'Jab + Rear Knee / Switch Knee', category: 'technique', discipline: 'muay_thai', default_mode: 'time', default_quantity: 244, media_url: 'https://www.youtube.com/watch?v=z37V3X6tPG4', primary_muscles: ['core', 'glutes', 'quads'], secondary_muscles: ['calves'] },
		{ id: 'ex-jab-elbow', name: 'Jab + Lead Elbow + Rear Elbow', category: 'technique', discipline: 'muay_thai', default_mode: 'time', default_quantity: 243, media_url: 'https://www.youtube.com/watch?v=z37V3X6tPG4', primary_muscles: ['shoulders', 'core', 'back'], secondary_muscles: ['triceps', 'biceps'] },
		{ id: 'ex-standard-pushups', name: 'Standard Pushups', category: 'strength', discipline: 'calisthenics', default_mode: 'reps', default_quantity: 20, media_url: '/workout/media/pushups.svg', primary_muscles: ['chest', 'triceps'], secondary_muscles: ['shoulders', 'core'] },
		{ id: 'ex-diamond-pushups', name: 'Diamond Pushups', category: 'strength', discipline: 'calisthenics', default_mode: 'reps', default_quantity: 15, media_url: '/workout/media/diamond-pushups.svg', primary_muscles: ['triceps', 'chest'], secondary_muscles: ['shoulders', 'core'] },
		{ id: 'ex-plank-shoulder-taps', name: 'Plank Shoulder Taps', category: 'strength', discipline: 'calisthenics', default_mode: 'reps', default_quantity: 20, media_url: '/workout/media/shoulder-taps.svg', primary_muscles: ['core', 'shoulders'], secondary_muscles: ['chest', 'triceps', 'glutes'] },
		{ id: 'ex-cobra-pose', name: 'Cobra Pose & Hip Opener', category: 'stretch', discipline: 'yoga', default_mode: 'time', default_quantity: 45, media_url: '/workout/media/cobra-stretch.jpg', primary_muscles: ['back', 'core'], secondary_muscles: ['chest', 'shoulders'] },
		{ id: 'ex-overhead-tricep-stretch', name: 'Overhead Tricep & Shoulder Stretch', category: 'stretch', discipline: 'general', default_mode: 'time', default_quantity: 30, media_url: '/workout/media/overhead-tricep-stretch.jpg', primary_muscles: ['triceps', 'shoulders'], secondary_muscles: ['back'] },
		{ id: 'ex-pigeon-pose', name: 'Pigeon Pose Hip Opener', category: 'stretch', discipline: 'yoga', default_mode: 'time', default_quantity: 45, media_url: '/workout/media/pigeon-pose.jpg', primary_muscles: ['glutes'], secondary_muscles: ['hamstrings', 'back'] },
		{ id: 'ex-seated-hamstring-fold', name: 'Seated Forward Hamstring Fold', category: 'stretch', discipline: 'yoga', default_mode: 'time', default_quantity: 45, media_url: '/workout/media/seated-hamstring-fold.jpg', primary_muscles: ['hamstrings'], secondary_muscles: ['back', 'calves'] },
		{ id: 'ex-childs-pose', name: 'Extended Child’s Pose Spine & Lat Stretch', category: 'stretch', discipline: 'yoga', default_mode: 'time', default_quantity: 60, media_url: '/workout/media/childs-pose.jpg', primary_muscles: ['back', 'shoulders'], secondary_muscles: ['glutes'] },
	];
}
