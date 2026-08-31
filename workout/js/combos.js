/**
 * Combos module - Compound movements, repeating alternating flows, supersets, and combo catalog.
 */

import { fetchServerCombos, saveCustomComboOnServer, deleteCustomComboOnServer } from './storage.js';
import { getExerciseById, getExercises, getCategoryBadgeHtml, getDisciplineBadgeHtml, inferMusclesForExercise, getMuscleBadgeHtml, showExerciseVariationsModal } from './exercises.js';
import { escapeHtml, formatTime, parseYouTubeId } from './utils.js';
import { showConfirm, showAlert } from './modal.js';

export const FLOW_TYPES = {
	alternating: { label: 'Alternating Cadence', icon: '⮀', color: '#6aa3a9', bg: 'rgba(106, 163, 169, 0.14)' },
	sequence: { label: 'Combination Flow', icon: '➔', color: '#cbb07a', bg: 'rgba(203, 176, 122, 0.14)' },
	superset: { label: 'Burnout Superset', icon: '⚡', color: '#c77953', bg: 'rgba(199, 121, 83, 0.14)' },
};

let cachedCombos = [];
let isCombosLoaded = false;

/**
 * Load combos from server into memory cache.
 * @returns {Promise<Array>}
 */
export async function loadCombos() {
	try {
		const list = await fetchServerCombos();
		cachedCombos = list || [];
		isCombosLoaded = true;
		return cachedCombos;
	} catch (err) {
		console.warn('Failed to fetch combos from server:', err);
		cachedCombos = [];
		isCombosLoaded = false;
		return cachedCombos;
	}
}

/**
 * Get all cached combos.
 * @returns {Array}
 */
export function getCombos() {
	return cachedCombos;
}

/**
 * Find a combo by its ID.
 * @param {string} id
 * @returns {Object|null}
 */
export function getComboById(id) {
	if (!id) return null;
	const clean = String(id).trim().toLowerCase();
	return getCombos().find(c => String(c.id).toLowerCase() === clean) || null;
}

/**
 * Filter combos by search query, flow type, category, or discipline.
 * @param {string} query
 * @param {string} [flowType]
 * @param {string} [category]
 * @param {string} [discipline]
 * @returns {Array}
 */
export function filterCombos(query = '', flowType = '', category = '', discipline = '') {
	const all = getCombos();
	const q = (query || '').trim().toLowerCase();
	const flow = (flowType || '').trim().toLowerCase();
	const cat = (category || '').trim().toLowerCase();
	const disc = (discipline || '').trim().toLowerCase();

	return all.filter(c => {
		if (flow && flow !== 'all' && (c.flow_type || '').toLowerCase() !== flow) return false;
		if (cat && cat !== 'all' && (c.category || '').toLowerCase() !== cat) return false;
		if (disc && disc !== 'all' && (c.discipline || '').toLowerCase() !== disc) return false;
		if (q) {
			const nameMatch = (c.name || '').toLowerCase().includes(q);
			const descMatch = (c.description || '').toLowerCase().includes(q);
			const catMatch = (c.category || '').toLowerCase().includes(q);
			const discMatch = (c.discipline || '').toLowerCase().includes(q);
			return nameMatch || descMatch || catMatch || discMatch;
		}
		return true;
	});
}

/**
 * Create a new custom combo.
 * @param {Object} comboData
 * @returns {Promise<Object>}
 */
export async function createCustomCombo(comboData) {
	const saved = await saveCustomComboOnServer(comboData);
	cachedCombos = [saved, ...cachedCombos.filter(c => c.id !== saved.id)];
	return saved;
}

/**
 * Delete a custom combo.
 * @param {string} comboId
 * @returns {Promise<boolean>}
 */
export async function deleteCustomCombo(comboId) {
	await deleteCustomComboOnServer(comboId);
	cachedCombos = cachedCombos.filter(c => c.id !== comboId);
	return true;
}

/**
 * Format a flow type badge HTML.
 * @param {string} flowType
 * @returns {string}
 */
export function getFlowTypeBadgeHtml(flowType) {
	const f = (flowType || 'alternating').toLowerCase();
	const info = FLOW_TYPES[f] || { label: f, icon: '🔗', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' };
	return `<span class="combo-flow-badge combo-flow-${f}" style="--flow-color:${info.color};--flow-bg:${info.bg}">
		<span class="combo-flow-icon">${info.icon}</span>
		<span class="combo-flow-label">${info.label}</span>
	</span>`;
}

/**
 * Render the full Combos & Flow Library catalog view.
 * @param {HTMLElement} container
 * @param {Object} [options]
 */
export function renderCombosCatalog(container, options = {}) {
	const onPlayCombo = options.onPlayCombo || (() => {});
	const onBreakDownCombo = options.onBreakDownCombo || (() => {});
	const onAddToRoutine = options.onAddToRoutine || (() => {});

	container.innerHTML = `
		<div class="combos-catalog-container">
			<div class="combos-catalog-header">
				<div>
					<h2 class="combos-title">🔗 Combos & Flow Library</h2>
					<p class="combos-subtitle">Repeating alternating cadences, striking combinations, and compound superset flows</p>
				</div>
				<button id="btn-create-combo" class="btn btn-primary btn-sm">+ New Combo</button>
			</div>

			<!-- Search & Filter Bar -->
			<div class="combos-filter-bar">
				<div class="search-box-wrapper">
					<span class="search-icon">🔍</span>
					<input type="text" id="combo-search-input" class="input combo-search-input" placeholder="Search combos, alternating flows, supersets...">
				</div>
				<div class="combo-filter-chips" id="combo-filter-chips"></div>
			</div>

			<!-- Combos Grid -->
			<div id="combos-cards-grid" class="combos-cards-grid"></div>
		</div>
	`;

	let currentSearch = '';
	let currentFilter = 'all';

	const searchInput = container.querySelector('#combo-search-input');
	const filterChipsContainer = container.querySelector('#combo-filter-chips');
	const gridContainer = container.querySelector('#combos-cards-grid');
	const createBtn = container.querySelector('#btn-create-combo');

	createBtn.addEventListener('click', () => {
		showCreateComboModal({
			onCreated: () => {
				renderGrid();
			}
		});
	});

	const filterOptions = [
		{ id: 'all', label: 'All Combos' },
		{ id: 'flow:alternating', label: 'Alternating' },
		{ id: 'flow:sequence', label: 'Flow' },
		{ id: 'flow:superset', label: 'Superset' },
		{ id: 'disc:muay_thai', label: 'Muay Thai' },
		{ id: 'disc:boxing', label: 'Boxing' },
		{ id: 'disc:calisthenics', label: 'Calisthenics' },
	];

	function renderFilterChips() {
		filterChipsContainer.innerHTML = '';
		filterOptions.forEach(opt => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = `combo-chip-btn ${currentFilter === opt.id ? 'active' : ''}`;
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
		let flow = '';
		let cat = '';
		let disc = '';
		if (currentFilter.startsWith('flow:')) {
			flow = currentFilter.replace('flow:', '');
		} else if (currentFilter.startsWith('cat:')) {
			cat = currentFilter.replace('cat:', '');
		} else if (currentFilter.startsWith('disc:')) {
			disc = currentFilter.replace('disc:', '');
		}

		const list = filterCombos(currentSearch, flow, cat, disc);

		if (list.length === 0) {
			gridContainer.innerHTML = `
				<div class="empty-sessions">
					<p>No combos found matching your filter.</p>
					<p class="empty-sub">Create a new combo or select a different filter.</p>
				</div>
			`;
			return;
		}

		gridContainer.innerHTML = '';
		list.forEach(combo => {
			const isCustom = Boolean(combo.user_id && combo.user_id !== 'system');
			const exList = (combo.exercise_ids || []).map(id => getExerciseById(id)).filter(Boolean);

			const card = document.createElement('div');
			card.className = 'combo-library-card';

			const modeStr = (combo.default_mode || 'time') === 'reps'
				? `${combo.default_quantity || 20} Reps`
				: formatTime(combo.default_quantity || 190);

			card.innerHTML = `
				<div class="combo-card-header">
					<div class="combo-card-badges">
						${getFlowTypeBadgeHtml(combo.flow_type || 'alternating')}
						${combo.discipline ? getDisciplineBadgeHtml(combo.discipline) : ''}
					</div>
					<span class="combo-card-mode-tag">${modeStr}</span>
				</div>

				<div class="combo-card-title-row">
					<h3 class="combo-card-title">${escapeHtml(combo.name)}</h3>
				</div>

				<p class="combo-card-desc">${escapeHtml(combo.description || 'Compound movement flow.')}</p>

				<div class="combo-exercises-pill-row">
					<span class="combo-ex-label">Movements:</span>
					${exList.map(e => `
						<span class="combo-constituent-pill">
							<span class="pill-dot">●</span> ${escapeHtml(e.name)}
						</span>
					`).join('')}
					${exList.length === 0 ? '<span class="text-muted" style="font-size:0.75rem">No linked exercises</span>' : ''}
				</div>

				<div class="combo-card-actions">
					<button class="btn btn-sm btn-ghost btn-play-combo" title="Play as continuous video flow">
						▶ Play Flow
					</button>
					<button class="btn btn-sm btn-primary btn-add-combo-routine" title="Add continuous combo to current workout">
						+ Add to Workout
					</button>
				</div>
			`;

			const playBtn = card.querySelector('.btn-play-combo');
			playBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				onPlayCombo(combo, false); // continuous
			});

			const addRoutineBtn = card.querySelector('.btn-add-combo-routine');
			addRoutineBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				onAddToRoutine(combo);
			});

			const delBtn = card.querySelector('.btn-del-combo');
			if (delBtn) {
				delBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					const confirmed = await showConfirm({
						title: 'Delete Combo',
						message: `Are you sure you want to delete "${combo.name}" from your custom combo library?`,
						confirmText: 'Delete',
						danger: true
					});
					if (confirmed) {
						await deleteCustomCombo(combo.id);
						renderGrid();
					}
				});
			}

			// Entire card is clickable to open top-layer breakdown overlay
			card.addEventListener('click', () => {
				showComboDetailModal(combo, {
					onPlayCombo,
					onBreakDownCombo,
					onAddToRoutine,
					onPlayExercise: options.onPlayExercise
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
 * Show a top-layer Split HUD modal detailing a combo, its visual flow, and all constituent exercise instructions.
 * @param {Object} combo
 * @param {Object} [options]
 */
export function showComboDetailModal(combo, options = {}) {
	const onPlayCombo = options.onPlayCombo || (() => {});
	const onBreakDownCombo = options.onBreakDownCombo || (() => {});
	const onAddToRoutine = options.onAddToRoutine || (() => {});
	const onPlayExercise = options.onPlayExercise || (() => {});

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop modal-combo-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-window modal-combo-hud-split';

	const exList = (combo.exercise_ids || []).map(id => getExerciseById(id)).filter(Boolean);
	const primaryAsset = (combo.media_assets || [])[0];
	const isVideo = primaryAsset && (primaryAsset.type === 'video' || Boolean(primaryAsset.videoId));
	const vid = primaryAsset?.videoId || parseYouTubeId(primaryAsset?.url || combo.media_url);

	const modeStr = (combo.default_mode || 'time') === 'reps'
		? `🔢 ${combo.default_quantity || 20} Total Reps`
		: `⏱️ ${formatTime(combo.default_quantity || 190)}`;

	// Collect aggregated muscles
	const primarySet = new Set();
	const secondarySet = new Set();
	exList.forEach(e => {
		const m = inferMusclesForExercise(e);
		(m.primary || []).forEach(p => primarySet.add(p));
		(m.secondary || []).forEach(s => secondarySet.add(s));
	});
	const primaryList = Array.from(primarySet).map(m => getMuscleBadgeHtml(m, true));
	const secondaryList = Array.from(secondarySet).filter(m => !primarySet.has(m)).map(m => getMuscleBadgeHtml(m, false));

	modal.innerHTML = `
		<div class="hud-left-panel">
			<div class="hud-badges-row">
				${getFlowTypeBadgeHtml(combo.flow_type)}
				${getCategoryBadgeHtml(combo.category)}
				${combo.discipline ? getDisciplineBadgeHtml(combo.discipline) : ''}
			</div>

			<h2 class="hud-combo-title">${escapeHtml(combo.name)}</h2>

			<div class="hud-visual-card">
				${vid ? `
					<div class="hud-video-thumb">
						<img src="https://img.youtube.com/vi/${vid}/mqdefault.jpg" alt="${escapeHtml(combo.name)}">
						<span class="modal-play-badge">▶</span>
					</div>
				` : `
					<div class="hud-img-thumb">
						<img src="${combo.media_url || '/workout/media/pushups.svg'}" alt="${escapeHtml(combo.name)}" onerror="this.src='/workout/media/pushups.svg'">
					</div>
				`}
				<div class="hud-visual-caption">Continuous Flow & Movement Form</div>
			</div>

			<div class="hud-muscles-section">
				<div class="hud-section-label">Target Anatomy</div>
				<div class="hud-muscles-row">
					${primaryList.join('')}
					${secondaryList.slice(0, 3).join('')}
				</div>
			</div>

			<div class="hud-left-actions">
				<button class="btn btn-primary btn-hud-play" style="width:100%;">▶ Play Continuous Flow</button>
				<button class="btn btn-ghost btn-hud-breakdown" style="width:100%;">⚡ Break Down into Steps</button>
				<button class="btn btn-ghost btn-hud-add" style="width:100%;">+ Add to Workout</button>
				${(combo.user_id && combo.user_id !== 'system') ? '<button class="btn btn-danger btn-sm btn-hud-del" style="width:100%;margin-top:8px;">🗑 Delete Combo</button>' : ''}
			</div>
		</div>

		<div class="hud-right-panel">
			<div class="hud-right-header">
				<div class="hud-stat-pills">
					<span class="hud-stat-pill">${modeStr}</span>
					<span class="hud-stat-pill">🥋 ${exList.length} Constituents</span>
				</div>
				<button class="modal-close-btn" title="Close (ESC)">✕</button>
			</div>

			<div class="hud-description-box">
				<p class="hud-desc-text">${escapeHtml(combo.description || 'Compound movement flow and alternating cadence.')}</p>
			</div>

			<div class="hud-constituents-deck">
				<div class="hud-section-label">🥋 Constituent Movement Sequence (${exList.length} Steps)</div>
				
				<div class="hud-steps-list">
					${exList.length === 0 ? '<p class="empty-chip-hint">No constituent exercises linked.</p>' : ''}
					${exList.map((ex, idx) => {
						const muscles = inferMusclesForExercise(ex);
						const exModeStr = (ex.default_mode || 'reps') === 'reps'
							? `${ex.default_quantity || 20} Reps`
							: formatTime(ex.default_quantity || 30);

						return `
							<div class="hud-step-card hud-step-card-clickable" data-idx="${idx}" title="Click to view ${escapeHtml(ex.name)} exercise guide & videos" style="cursor:pointer;">
								<div class="hud-step-num">#${idx + 1}</div>
								<div class="hud-step-body">
									<div class="hud-step-header-row">
										<div class="hud-step-name-group">
											<h4 class="hud-step-name">${escapeHtml(ex.name)}</h4>
											${getCategoryBadgeHtml(ex.category)}
										</div>
										<span class="hud-step-target-pill">${exModeStr}</span>
									</div>

									<div class="hud-step-muscles">
										${(muscles.primary || []).map(m => getMuscleBadgeHtml(m, true)).join('')}
									</div>

									<p class="hud-step-desc">${escapeHtml(ex.description || 'Focus on controlled tempo and kinetic alignment.')}</p>
								</div>
								<span class="hud-step-goto-icon" title="View Exercise">🥋 ↗</span>
							</div>
						`;
					}).join('')}
				</div>
			</div>
		</div>
	`;

	const close = () => {
		document.removeEventListener('keydown', handleEsc);
		backdrop.remove();
	};

	const handleEsc = (e) => {
		if (e.key === 'Escape' || e.keyCode === 27) {
			close();
		}
	};
	document.addEventListener('keydown', handleEsc);

	modal.querySelectorAll('.modal-close-btn').forEach(b => {
		b.addEventListener('click', close);
	});

	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	modal.querySelectorAll('.hud-step-card-clickable').forEach(card => {
		card.addEventListener('click', () => {
			const idx = parseInt(card.getAttribute('data-idx'), 10);
			const ex = exList[idx];
			if (ex) {
				const fullEx = getExerciseById(ex.id) || ex;
				showExerciseVariationsModal(fullEx, {
					onPlayAsset: (asset) => onPlayExercise(fullEx, asset),
					onAddToRoutine: () => onAddToRoutine(combo),
				});
			}
		});
	});

	const playFlowBtn = modal.querySelector('.btn-hud-play');
	if (playFlowBtn) {
		playFlowBtn.addEventListener('click', () => {
			close();
			onPlayCombo(combo, false);
		});
	}

	const breakdownBtn = modal.querySelector('.btn-hud-breakdown');
	if (breakdownBtn) {
		breakdownBtn.addEventListener('click', () => {
			close();
			onBreakDownCombo(combo);
		});
	}

	const addRoutineBtn = modal.querySelector('.btn-hud-add');
	const delComboBtn = modal.querySelector('.btn-hud-del');
	if (delComboBtn) {
		delComboBtn.addEventListener('click', async () => {
			const confirmed = await showConfirm({
				title: 'Delete Combo',
				message: `Are you sure you want to delete "${combo.name}" from your custom combo library?`,
				confirmText: 'Delete',
				danger: true,
			});
			if (confirmed) {
				await deleteCustomCombo(combo.id);
				close();
				options.onUpdated?.();
			}
		});
	}

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);
}

/**
 * Show modal to create a new custom combo.
 * @param {Object} [options]
 */
export function showCreateComboModal(options = {}) {
	const onCreated = options.onCreated || (() => {});
	const allExercises = getExercises();

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-window modal-create-combo';

	modal.innerHTML = `
		<div class="modal-header">
			<h3 class="modal-title">➕ Create Custom Combo</h3>
			<button class="modal-close-btn" title="Close">✕</button>
		</div>

		<div class="modal-body">
			<div class="field-group">
				<label>Combo Name</label>
				<input type="text" id="create-combo-name" class="input" placeholder="e.g., Star Jumps ⮀ Coordination Drills, Jab + Knee Flurry...">
			</div>

			<div class="field-row">
				<div class="field-group">
					<label>Flow Pattern</label>
					<select id="create-combo-flow" class="input">
						<option value="alternating">⮀ Alternating Cadence (A ⮀ B ⮀ A...)</option>
						<option value="sequence">➔ Sequential Combination (A ➔ B)</option>
						<option value="superset">⚡ Burnout Superset (A ➔ B ➔ C)</option>
					</select>
				</div>

				<div class="field-group">
					<label>Discipline</label>
					<select id="create-combo-discipline" class="input">
						<option value="general">🏋️ General Fitness</option>
						<option value="muay_thai">🥊 Muay Thai</option>
						<option value="boxing">🥊 Boxing</option>
						<option value="calisthenics">🤸 Calisthenics</option>
						<option value="yoga">🧘 Yoga & Mobility</option>
					</select>
				</div>
			</div>

			<div class="field-group">
				<label>Constituent Movements (Select 2 or more)</label>
				<div id="combo-exercise-checkboxes" class="combo-exercise-checkboxes-grid">
					${allExercises.map(e => `
						<label class="combo-ex-checkbox-label">
							<input type="checkbox" value="${e.id}" class="combo-ex-check">
							<span>${escapeHtml(e.name)}</span>
						</label>
					`).join('')}
				</div>
			</div>

			<div class="field-row">
				<div class="field-group">
					<label>Execution Mode</label>
					<select id="create-combo-mode" class="input">
						<option value="time">⏱️ Continuous Timed Interval</option>
						<option value="reps">🔢 Target Reps</option>
					</select>
				</div>

				<div class="field-group">
					<label>Duration / Reps (sec or count)</label>
					<input type="number" id="create-combo-quantity" class="input" min="1" value="190">
				</div>
			</div>

			<div class="field-group">
				<label>Video URL (Optional YouTube link)</label>
				<input type="text" id="create-combo-video-url" class="input" placeholder="https://youtube.com/watch?v=...">
			</div>

			<div class="field-row">
				<div class="field-group">
					<label>Start Time (sec)</label>
					<input type="number" id="create-combo-start" class="input" min="0" value="0">
				</div>
				<div class="field-group">
					<label>End Time (sec)</label>
					<input type="number" id="create-combo-end" class="input" min="1" value="190">
				</div>
			</div>

			<div class="field-group">
				<label>Description</label>
				<textarea id="create-combo-desc" class="input" rows="2" placeholder="Flow structure, cadence instructions, or technical pairing notes..."></textarea>
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-ghost modal-btn-cancel">Cancel</button>
			<button id="btn-submit-create-combo" class="btn btn-primary">Create Combo</button>
		</div>
	`;

	const close = () => backdrop.remove();

	modal.querySelectorAll('.modal-close-btn, .modal-btn-cancel').forEach(b => {
		b.addEventListener('click', close);
	});

	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	const submitBtn = modal.querySelector('#btn-submit-create-combo');
	submitBtn.addEventListener('click', async () => {
		const name = modal.querySelector('#create-combo-name').value.trim();
		const flow_type = modal.querySelector('#create-combo-flow').value;
		const discipline = modal.querySelector('#create-combo-discipline').value;
		const default_mode = modal.querySelector('#create-combo-mode').value;
		const default_quantity = parseInt(modal.querySelector('#create-combo-quantity').value, 10) || 190;
		const videoUrl = modal.querySelector('#create-combo-video-url').value.trim();
		const start = parseInt(modal.querySelector('#create-combo-start').value, 10) || 0;
		const end = parseInt(modal.querySelector('#create-combo-end').value, 10) || default_quantity;
		const description = modal.querySelector('#create-combo-desc').value.trim();

		const selectedExIds = Array.from(modal.querySelectorAll('.combo-ex-check:checked')).map(cb => cb.value);

		if (!name) {
			await showAlert({ title: 'Missing Name', message: 'Please provide a name for this combo.' });
			return;
		}

		if (selectedExIds.length === 0) {
			await showAlert({ title: 'No Exercises Selected', message: 'Please select at least 1 or 2 constituent exercises.' });
			return;
		}

		const vid = videoUrl ? parseYouTubeId(videoUrl) : null;
		const media_assets = vid ? [
			{
				id: `asset-combo-${Date.now()}`,
				kind: 'demonstration',
				type: 'video',
				title: `${name} Flow`,
				videoId: vid,
				startSeconds: start,
				endSeconds: end
			}
		] : [];

		try {
			const created = await createCustomCombo({
				name,
				category: flow_type === 'superset' ? 'strength' : 'drill',
				discipline,
				flow_type,
				exercise_ids: selectedExIds,
				default_mode,
				default_quantity,
				description,
				media_url: videoUrl,
				media_assets
			});
			close();
			onCreated(created);
		} catch (err) {
			await showAlert({ title: 'Error', message: 'Could not create combo: ' + err.message });
		}
	});

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);
}
