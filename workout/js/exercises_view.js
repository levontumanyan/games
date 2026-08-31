/**
 * Exercises View Module - UI components, catalog grid, modals, and variations HUD.
 */

import {
	getExercises,
	getExerciseById,
	filterExercises,
	createCustomExercise,
	deleteCustomExercise,
	addMediaAssetToExercise,
	getCategoryBadgeHtml,
	getDisciplineBadgeHtml,
	getMuscleBadgeHtml,
	getMediaKindBadgeHtml,
	getExerciseMediaAssets,
	inferMusclesForExercise,
} from './exercises.js';
import { MUSCLE_DEFINITIONS } from './body_map.js';
import { showConfirm, showAlert } from './modal.js';
import { escapeHtml, formatTime, parseYouTubeId } from './utils.js';

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
			const muscles = inferMusclesForExercise(ex);

			const card = document.createElement('div');
			card.className = 'exercise-library-card';

			const instructionCount = assets.filter(a => a.kind === 'instruction').length;
			const demoCount = assets.filter(a => a.kind === 'demonstration').length;
			const animCount = assets.filter(a => a.kind === 'animation' || a.kind === 'photo').length;

			const modeStr = (ex.default_mode || 'reps') === 'reps'
				? `🔢 ${ex.default_quantity || 20} Reps`
				: `⏱️ ${formatTime(ex.default_quantity || 30)}`;

			const primaryList = (muscles.primary || []).map(m => getMuscleBadgeHtml(m, true));
			const secondaryList = (muscles.secondary || []).map(m => getMuscleBadgeHtml(m, false));
			let displayedBadges = [...primaryList, ...secondaryList];
			let moreCount = 0;
			if (displayedBadges.length > 4) {
				moreCount = displayedBadges.length - 3;
				displayedBadges = displayedBadges.slice(0, 3);
			}
			const muscleBadgesHtml = displayedBadges.join('') + (moreCount > 0 ? `<span class="ex-muscle-more-pill">+${moreCount} more</span>` : '');

			card.innerHTML = `
				<div class="ex-lib-header">
					<div class="ex-lib-badges">
						${getCategoryBadgeHtml(ex.category)}
						${ex.discipline ? getDisciplineBadgeHtml(ex.discipline) : ''}
					</div>
					<button class="btn btn-ghost btn-xs btn-del-ex" title="Delete exercise" data-id="${ex.id}">✕</button>
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
				onPlayExercise(ex, assets[0] || null);
			});

			const addRoutineBtn = card.querySelector('.btn-add-routine');
			addRoutineBtn.addEventListener('click', (e) => {
				e.stopPropagation();
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
 * Show a Split HUD modal displaying all media variations for an exercise, with option to play or add more.
 * @param {Object} exercise
 * @param {Object} [options]
 */
export function showExerciseVariationsModal(exercise, options = {}) {
	const onPlayAsset = options.onPlayAsset || (() => {});
	const onAddToRoutine = options.onAddToRoutine || (() => {});
	const onUpdated = options.onUpdated || (() => {});

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop modal-exercise-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-combo-hud-split';

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

	function renderModalContent() {
		const assets = getExerciseMediaAssets([exercise]);
		const muscles = inferMusclesForExercise(exercise);
		const primaryMuscles = (muscles.primary || []).map(m => getMuscleBadgeHtml(m, true));
		const secondaryMuscles = (muscles.secondary || []).map(m => getMuscleBadgeHtml(m, false));

		const primaryAsset = assets[0];
		const isVid = primaryAsset && (primaryAsset.type === 'video' || Boolean(primaryAsset.videoId));
		const vid = primaryAsset?.videoId || (primaryAsset?.url ? parseYouTubeId(primaryAsset.url) : null);

		const modeStr = (exercise.default_mode || 'reps') === 'reps'
			? `🔢 ${exercise.default_quantity || 20} Target Reps`
			: `⏱️ ${formatTime(exercise.default_quantity || 30)}`;

		modal.innerHTML = `
			<div class="hud-left-panel">
				<div class="hud-badges-row">
					${getCategoryBadgeHtml(exercise.category)}
					${exercise.discipline ? getDisciplineBadgeHtml(exercise.discipline) : ''}
				</div>

				<h2 class="hud-combo-title">${escapeHtml(exercise.name)}</h2>

				<div class="hud-visual-card">
					${isVid && vid ? `
						<div class="hud-video-thumb">
							<img src="https://img.youtube.com/vi/${vid}/mqdefault.jpg" alt="${escapeHtml(exercise.name)}">
							<span class="modal-play-badge">▶</span>
						</div>
					` : `
						<div class="hud-img-thumb">
							<img src="${exercise.media_url || '/workout/media/pushups.svg'}" alt="${escapeHtml(exercise.name)}" onerror="this.src='/workout/media/pushups.svg'">
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
					<button class="btn btn-primary btn-hud-play-ex" style="width:100%;">▶ Preview Movement</button>
					<button class="btn btn-ghost btn-hud-add-ex" style="width:100%;">+ Add to Workout</button>
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
						${assets.length === 0 ? '<p class="empty-chip-hint">No extra media attached yet. Add a tutorial video or looping visual below!</p>' : ''}
						${assets.map((a, idx) => {
							const isVideo = a.type === 'video' || Boolean(a.videoId);
							const vid = a.videoId || (a.url ? parseYouTubeId(a.url) : null);
							const thumb = isVideo && vid
								? `https://img.youtube.com/vi/${vid}/mqdefault.jpg`
								: (a.url || '/workout/media/pushups.svg');

							return `
								<div class="modal-asset-row" data-idx="${idx}">
									<div class="modal-asset-thumb">
										<img src="${thumb}" alt="${escapeHtml(a.title || '')}" onerror="this.src='/workout/media/pushups.svg'">
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
					<div class="add-asset-collapse-section" style="margin-top:12px;">
						<button id="toggle-add-asset-btn" class="btn btn-ghost btn-sm">+ Add New Video or Photo Variation</button>
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
			</div>
		`;

		modal.querySelectorAll('.modal-close-btn').forEach(b => {
			b.addEventListener('click', close);
		});

		modal.querySelectorAll('.btn-play-asset-now').forEach(btn => {
			btn.addEventListener('click', () => {
				const idx = parseInt(btn.getAttribute('data-idx'), 10);
				if (assets[idx]) {
					close();
					onPlayAsset(assets[idx]);
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

		const toggleAddBtn = modal.querySelector('#toggle-add-asset-btn');
		const addForm = modal.querySelector('#add-asset-form');
		if (toggleAddBtn && addForm) {
			toggleAddBtn.addEventListener('click', () => {
				addForm.classList.toggle('hidden');
			});
		}

		const saveAssetBtn = modal.querySelector('#btn-save-new-asset');
		if (saveAssetBtn) {
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
	}

	backdrop.appendChild(modal);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
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

	const selectedPrimary = new Set(['abs']);
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
