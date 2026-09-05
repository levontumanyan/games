/**
 * Interactive Human Body Muscle Visualization & Anatomy Explorer Module.
 * Provides scalable Anterior (Front) and Posterior (Back) vector diagrams
 * with detailed muscle taxonomy (including groin, hip flexors, obliques, traps, lats, etc.),
 * interactive muscle hover/click filtering, and full exercise library cards grid.
 */

import {
	MUSCLE_DEFINITIONS,
	getMuscleBadgeHtml,
	getCategoryBadgeHtml,
	getDisciplineBadgeHtml,
} from './taxonomy.js';
import {
	getExercises,
	getExerciseMediaAssets,
	getExerciseFollowAlongMedia,
	inferMusclesForExercise,
	filterExercises,
	deleteCustomExercise,
	renderExerciseCardElement,
} from './exercises.js';
import { escapeHtml, formatTime } from './utils.js';
import { showConfirm } from './modal.js';
export { MUSCLE_DEFINITIONS };

/**
 * Clean, proportionate SVG markup for the Anterior (Front) body view with expanded anatomy.
 */
export function getFrontBodySvg() {
	return `
	<svg class="body-svg front-svg" viewBox="0 0 200 380" xmlns="http://www.w3.org/2000/svg">
		<!-- Base Silhouette Outlines -->
		<g class="body-silhouette">
			<path class="body-base" d="M 92 20 C 92 12 108 12 108 20 C 108 28 92 28 92 20 Z M 95 28 L 95 42 L 105 42 L 105 28 Z" />
			<path class="body-base" d="
				M 95 42 L 68 49 L 52 75 L 42 120 L 36 170 L 46 172 L 54 128 L 62 82 L 72 75 L 72 165
				L 80 200 L 70 270 L 68 335 L 73 365 L 87 365 L 88 330 L 92 265 L 97 210
				L 103 210 L 108 265 L 112 330 L 113 365 L 127 365 L 132 335 L 130 270 L 120 200
				L 128 165 L 128 75 L 138 82 L 146 128 L 154 172 L 164 170 L 158 120 L 148 75
				L 132 49 L 105 42 Z" />
		</g>

		<!-- Interactive Muscle Vectors (Front) -->
		<g class="muscle-paths">
			<!-- Shoulders (Anterior Deltoids) -->
			<path id="path-delt-front-left" data-muscle="shoulders" class="muscle-group-path" d="M 68 49 C 55 55 50 68 52 82 C 57 80 64 74 69 70 Z" />
			<path id="path-delt-front-right" data-muscle="shoulders" class="muscle-group-path" d="M 132 49 C 145 55 150 68 148 82 C 143 80 136 74 131 70 Z" />

			<!-- Chest (Pectorals) -->
			<path id="path-chest-left" data-muscle="chest" class="muscle-group-path" d="M 72 58 C 82 56 97 58 98 76 C 98 88 84 94 72 88 C 66 84 66 65 72 58 Z" />
			<path id="path-chest-right" data-muscle="chest" class="muscle-group-path" d="M 128 58 C 118 56 103 58 102 76 C 102 88 116 94 128 88 C 134 84 134 65 128 58 Z" />

			<!-- Biceps -->
			<path id="path-bicep-left" data-muscle="biceps" class="muscle-group-path" d="M 52 86 C 47 98 44 116 50 124 C 54 122 58 108 60 92 Z" />
			<path id="path-bicep-right" data-muscle="biceps" class="muscle-group-path" d="M 148 86 C 153 98 156 116 150 124 C 146 122 142 108 140 92 Z" />

			<!-- Forearms & Wrists (Front) -->
			<path id="path-forearm-front-left" data-muscle="forearms" class="muscle-group-path" d="M 49 128 C 43 140 38 158 43 166 C 46 166 50 152 53 134 Z" />
			<path id="path-forearm-front-right" data-muscle="forearms" class="muscle-group-path" d="M 151 128 C 157 140 162 158 157 166 C 154 166 150 152 147 134 Z" />

			<!-- Abs (Rectus Abdominis) -->
			<path id="path-abs-upper" data-muscle="abs" class="muscle-group-path" d="M 88 82 L 98 82 L 98 97 L 88 97 Z M 102 82 L 112 82 L 112 97 L 102 97 Z" />
			<path id="path-abs-mid" data-muscle="abs" class="muscle-group-path" d="M 88 101 L 98 101 L 98 116 L 88 116 Z M 102 101 L 112 101 L 112 116 L 102 116 Z" />
			<path id="path-abs-lower" data-muscle="abs" class="muscle-group-path" d="M 89 120 L 98 120 L 98 136 L 89 133 Z M 102 120 L 111 120 L 111 133 L 102 136 Z" />

			<!-- Obliques (Side Core) -->
			<path id="path-oblique-left" data-muscle="obliques" class="muscle-group-path" d="M 74 95 C 73 115 75 135 83 142 L 85 106 Z" />
			<path id="path-oblique-right" data-muscle="obliques" class="muscle-group-path" d="M 126 95 C 127 115 125 135 117 142 L 115 106 Z" />

			<!-- Hip Flexors (Psoas & Iliacus) -->
			<path id="path-hip-flexor-left" data-muscle="hip_flexors" class="muscle-group-path" d="M 87 140 C 81 146 76 156 75 166 L 86 162 C 90 154 90 144 87 140 Z" />
			<path id="path-hip-flexor-right" data-muscle="hip_flexors" class="muscle-group-path" d="M 113 140 C 119 146 124 156 125 166 L 114 162 C 110 154 110 144 113 140 Z" />

			<!-- Pelvic Floor (Anterior Sub-Pubic Basin) -->
			<path id="path-pelvic-front" data-muscle="pelvic_floor" class="muscle-group-path" d="M 91 140 L 109 140 C 108 152 105 167 100 172 C 95 167 92 152 91 140 Z" />

			<!-- Adductors (Inner Thigh) -->
			<path id="path-adductor-left" data-muscle="adductors" class="muscle-group-path" d="M 97 210 C 96 226 94 245 91 258 C 88 250 87 232 88 210 Z" />
			<path id="path-adductor-right" data-muscle="adductors" class="muscle-group-path" d="M 103 210 C 104 226 106 245 109 258 C 112 250 113 232 112 210 Z" />

			<!-- Quads (Quadriceps Femoris) -->
			<path id="path-quad-left" data-muscle="quads" class="muscle-group-path" d="M 75 172 C 68 198 69 238 73 262 C 80 262 87 242 88 200 C 89 176 83 168 75 172 Z" />
			<path id="path-quad-right" data-muscle="quads" class="muscle-group-path" d="M 125 172 C 132 198 131 238 127 262 C 120 262 113 242 112 200 C 111 176 117 168 125 172 Z" />

			<!-- Calves & Shins (Front) -->
			<path id="path-calf-front-left" data-muscle="calves" class="muscle-group-path" d="M 73 282 C 68 302 70 326 75 345 C 80 345 84 330 84 300 C 84 285 78 280 73 282 Z" />
			<path id="path-calf-front-right" data-muscle="calves" class="muscle-group-path" d="M 127 282 C 132 302 130 326 125 345 C 120 345 116 330 116 300 C 116 285 122 280 127 282 Z" />
		</g>
	</svg>
	`;
}

/**
 * Clean, proportionate SVG markup for the Posterior (Back) body view with expanded anatomy.
 */
export function getBackBodySvg() {
	return `
	<svg class="body-svg back-svg" viewBox="0 0 200 380" xmlns="http://www.w3.org/2000/svg">
		<!-- Base Silhouette Outlines -->
		<g class="body-silhouette">
			<path class="body-base" d="M 92 20 C 92 12 108 12 108 20 C 108 28 92 28 92 20 Z M 95 28 L 95 42 L 105 42 L 105 28 Z" />
			<path class="body-base" d="
				M 95 42 L 68 49 L 52 75 L 42 120 L 36 170 L 46 172 L 54 128 L 62 82 L 72 75 L 72 165
				L 80 200 L 70 270 L 68 335 L 73 365 L 87 365 L 88 330 L 92 265 L 97 210
				L 103 210 L 108 265 L 112 330 L 113 365 L 127 365 L 132 335 L 130 270 L 120 200
				L 128 165 L 128 75 L 138 82 L 146 128 L 154 172 L 164 170 L 158 120 L 148 75
				L 132 49 L 105 42 Z" />
		</g>

		<!-- Interactive Muscle Vectors (Back) -->
		<g class="muscle-paths">
			<!-- Trapezius & Upper Neck -->
			<path id="path-traps" data-muscle="traps" class="muscle-group-path" d="M 95 42 L 105 42 L 120 54 L 100 84 L 80 54 Z" />

			<!-- Rear Deltoids -->
			<path id="path-delt-back-left" data-muscle="shoulders" class="muscle-group-path" d="M 68 49 C 55 55 50 68 52 82 C 57 80 65 72 74 65 Z" />
			<path id="path-delt-back-right" data-muscle="shoulders" class="muscle-group-path" d="M 132 49 C 145 55 150 68 148 82 C 143 80 135 72 126 65 Z" />

			<!-- Triceps -->
			<path id="path-tricep-left" data-muscle="triceps" class="muscle-group-path" d="M 52 86 C 47 98 45 116 50 124 C 54 122 58 108 60 92 Z" />
			<path id="path-tricep-right" data-muscle="triceps" class="muscle-group-path" d="M 148 86 C 153 98 155 116 150 124 C 146 122 142 108 140 92 Z" />

			<!-- Forearms & Extensors (Back) -->
			<path id="path-forearm-back-left" data-muscle="forearms" class="muscle-group-path" d="M 49 128 C 43 140 38 158 43 166 C 46 166 50 152 53 134 Z" />
			<path id="path-forearm-back-right" data-muscle="forearms" class="muscle-group-path" d="M 151 128 C 157 140 162 158 157 166 C 154 166 150 152 147 134 Z" />

			<!-- Lats (Latissimus Dorsi) -->
			<path id="path-lats-left" data-muscle="lats" class="muscle-group-path" d="M 78 72 C 68 95 72 124 82 135 L 94 92 Z" />
			<path id="path-lats-right" data-muscle="lats" class="muscle-group-path" d="M 122 72 C 132 95 128 124 118 135 L 106 92 Z" />

			<!-- Lower Back (Erector Spinae) -->
			<path id="path-lower-back" data-muscle="lower_back" class="muscle-group-path" d="M 94 100 L 106 100 L 106 142 L 94 142 Z" />

			<!-- Glutes & Hips -->
			<path id="path-glute-left" data-muscle="glutes" class="muscle-group-path" d="M 76 146 C 70 165 72 188 85 194 C 95 195 97 175 97 148 Z" />
			<path id="path-glute-right" data-muscle="glutes" class="muscle-group-path" d="M 124 146 C 130 165 128 188 115 194 C 105 195 103 175 103 148 Z" />

			<!-- Pelvic Floor (Posterior Coccygeal / Perineal Basin) -->
			<path id="path-pelvic-back" data-muscle="pelvic_floor" class="muscle-group-path" d="M 96 172 C 98 166 102 166 104 172 C 105 186 103 198 100 206 C 97 198 95 186 96 172 Z" />

			<!-- Hamstrings -->
			<path id="path-hamstring-left" data-muscle="hamstrings" class="muscle-group-path" d="M 76 200 C 70 225 72 255 76 268 C 84 268 92 245 94 204 Z" />
			<path id="path-hamstring-right" data-muscle="hamstrings" class="muscle-group-path" d="M 124 200 C 130 225 128 255 124 268 C 116 268 108 245 106 204 Z" />

			<!-- Adductors (Inner Thigh - Posterior) -->
			<path id="path-adductor-back-left" data-muscle="adductors" class="muscle-group-path" d="M 97 210 C 96 225 94 245 91 258 C 89 250 91 230 94 210 Z" />
			<path id="path-adductor-back-right" data-muscle="adductors" class="muscle-group-path" d="M 103 210 C 104 225 106 245 109 258 C 111 250 109 230 106 210 Z" />

			<!-- Calves (Gastrocnemius & Soleus) -->
			<path id="path-calf-back-left" data-muscle="calves" class="muscle-group-path" d="M 73 282 C 67 302 70 326 75 345 C 81 345 86 330 86 300 C 86 285 78 280 73 282 Z" />
			<path id="path-calf-back-right" data-muscle="calves" class="muscle-group-path" d="M 127 282 C 133 302 130 326 125 345 C 119 345 114 330 114 300 C 114 285 122 280 127 282 Z" />
		</g>
	</svg>
	`;
}

/**
 * Creates and mounts an interactive body map visualization.
 * @param {HTMLElement} container
 * @param {Object} [options]
 * @param {Function} [options.onMuscleClick] - Called when a muscle is clicked with (muscleId, muscleDef)
 * @param {Function} [options.onMuscleHover] - Called on hover with (muscleId or null)
 * @param {string} [options.selectedMuscle] - Initial active selected muscle ID
 * @param {boolean} [options.compact] - Compact mini view
 * @returns {Object} Body map controller API
 */
export function createBodyMap(container, options = {}) {
	const onMuscleClick = options.onMuscleClick || (() => {});
	const onMuscleHover = options.onMuscleHover || (() => {});
	let activeView = 'both'; // 'front' | 'back' | 'both'
	let selectedMuscle = options.selectedMuscle || null;

	const wrapper = document.createElement('div');
	wrapper.className = `interactive-body-map ${options.compact ? 'body-map-compact' : ''}`;

	wrapper.innerHTML = `
		<div class="body-map-header">
			<div class="body-map-title-row">
				<span class="body-map-heading">🧬 Interactive Muscle Anatomy Map</span>
				<div class="body-view-controls">
					<button type="button" class="btn-view-toggle active" data-view="both" title="Dual Anterior & Posterior View">Both</button>
					<button type="button" class="btn-view-toggle" data-view="front" title="Front (Anterior) View">Front</button>
					<button type="button" class="btn-view-toggle" data-view="back" title="Back (Posterior) View">Back</button>
				</div>
			</div>
			<div class="body-map-active-badge-bar" id="body-map-active-info">
				<span class="active-muscle-hint">Click on any muscle to filter exercises</span>
			</div>
		</div>

		<div class="body-svg-stage-container">
			<div class="body-view-card front-view-card" data-view="front">
				<span class="body-view-tag">Anterior (Front)</span>
				<div class="svg-embed-wrapper">${getFrontBodySvg()}</div>
			</div>
			<div class="body-view-card back-view-card" data-view="back">
				<span class="body-view-tag">Posterior (Back)</span>
				<div class="svg-embed-wrapper">${getBackBodySvg()}</div>
			</div>
		</div>

		<div class="body-map-legend">
			<div class="legend-item"><span class="legend-dot pri-dot"></span> Primary Target</div>
			<div class="legend-item"><span class="legend-dot sec-dot"></span> Secondary Synergist</div>
			<div class="legend-item"><span class="legend-dot sel-dot"></span> Active Filter</div>
		</div>
	`;

	container.innerHTML = '';
	container.appendChild(wrapper);

	const infoBar = wrapper.querySelector('#body-map-active-info');
	const viewBtns = wrapper.querySelectorAll('.btn-view-toggle');
	const stage = wrapper.querySelector('.body-svg-stage-container');

	function setView(view) {
		activeView = view;
		viewBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-view') === view));
		stage.classList.remove('view-front-only', 'view-back-only');
		if (view === 'front') {
			stage.classList.add('view-front-only');
		} else if (view === 'back') {
			stage.classList.add('view-back-only');
		}
	}

	viewBtns.forEach(btn => {
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			setView(btn.getAttribute('data-view'));
		});
	});

	// Attach interactions to muscle vector paths
	const allMusclePaths = wrapper.querySelectorAll('.muscle-group-path');

	allMusclePaths.forEach(path => {
		const muscleId = path.getAttribute('data-muscle');
		const def = MUSCLE_DEFINITIONS[muscleId];

		path.addEventListener('mouseenter', () => {
			if (!def) return;
			highlightPathGroup(muscleId, 'muscle-hover');
			updateInfoBarHover(def);
			onMuscleHover(muscleId);
		});

		path.addEventListener('mouseleave', () => {
			clearPathGroup(muscleId, 'muscle-hover');
			updateInfoBarSelected();
			onMuscleHover(null);
		});

		path.addEventListener('click', (e) => {
			e.stopPropagation();
			if (!def) return;
			if (selectedMuscle === muscleId) {
				selectedMuscle = null;
			} else {
				selectedMuscle = muscleId;
			}
			renderSelectedState();
			onMuscleClick(selectedMuscle, selectedMuscle ? MUSCLE_DEFINITIONS[selectedMuscle] : null);
		});
	});

	function highlightPathGroup(muscleId, stateClass) {
		wrapper.querySelectorAll(`.muscle-group-path[data-muscle="${muscleId}"]`).forEach(el => {
			el.classList.add(stateClass);
		});
	}

	function clearPathGroup(muscleId, stateClass) {
		wrapper.querySelectorAll(`.muscle-group-path[data-muscle="${muscleId}"]`).forEach(el => {
			el.classList.remove(stateClass);
		});
	}

	function updateInfoBarHover(def) {
		if (!infoBar) return;
		infoBar.innerHTML = `<span class="active-muscle-name" style="color:${def.color}">${def.icon} ${def.label}</span>`;
	}

	function updateInfoBarSelected() {
		if (!infoBar) return;
		if (selectedMuscle && MUSCLE_DEFINITIONS[selectedMuscle]) {
			const def = MUSCLE_DEFINITIONS[selectedMuscle];
			infoBar.innerHTML = `
				<span class="active-filter-pill" style="--pill-color:${def.color}">
					<span>${def.icon} Filtered by: <strong>${def.label}</strong></span>
					<button type="button" class="btn-clear-muscle-filter" title="Clear muscle filter">✕</button>
				</span>
			`;
			const clearBtn = infoBar.querySelector('.btn-clear-muscle-filter');
			if (clearBtn) {
				clearBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					selectedMuscle = null;
					renderSelectedState();
					onMuscleClick(null, null);
				});
			}
		} else {
			infoBar.innerHTML = `<span class="active-muscle-hint">Click on any muscle to filter exercises</span>`;
		}
	}

	function renderSelectedState() {
		allMusclePaths.forEach(p => p.classList.remove('muscle-selected'));
		if (selectedMuscle) {
			wrapper.querySelectorAll(`.muscle-group-path[data-muscle="${selectedMuscle}"]`).forEach(el => {
				el.classList.add('muscle-selected');
			});
		}
		updateInfoBarSelected();
	}

	renderSelectedState();

	return {
		highlightMuscles(primaryMuscles = [], secondaryMuscles = [], pulse = true) {
			allMusclePaths.forEach(p => {
				p.classList.remove('muscle-primary', 'muscle-secondary', 'muscle-pulse');
			});

			const pri = (primaryMuscles || []).map(m => {
				const s = String(m).toLowerCase();
				return s === 'groin' ? 'adductors' : s;
			});
			const sec = (secondaryMuscles || []).map(m => {
				const s = String(m).toLowerCase();
				return s === 'groin' ? 'adductors' : s;
			});

			pri.forEach(m => {
				wrapper.querySelectorAll(`.muscle-group-path[data-muscle="${m}"]`).forEach(el => {
					el.classList.add('muscle-primary');
					if (pulse) el.classList.add('muscle-pulse');
				});
			});

			sec.forEach(m => {
				if (!pri.includes(m)) {
					wrapper.querySelectorAll(`.muscle-group-path[data-muscle="${m}"]`).forEach(el => {
						el.classList.add('muscle-secondary');
					});
				}
			});
		},

		clearHighlights() {
			allMusclePaths.forEach(p => {
				p.classList.remove('muscle-primary', 'muscle-secondary', 'muscle-pulse');
			});
		},

		setSelectedMuscle(muscleId) {
			selectedMuscle = muscleId === 'groin' ? 'adductors' : muscleId;
			renderSelectedState();
		},

		getSelectedMuscle() {
			return selectedMuscle;
		},

		setView,
	};
}

/**
 * Render the dedicated Full Anatomy & Muscle Filter View.
 * Displays the interactive body model on top, and the full exercise library grid below,
 * filtered directly by whichever muscle is selected.
 * @param {HTMLElement} container
 * @param {Object} [options]
 */
export function renderAnatomyExplorer(container, options = {}) {
	const onPlayExercise = options.onPlayExercise || (() => {});
	const onAddToRoutine = options.onAddToRoutine || (() => {});
	const onOpenExerciseDetails = options.onOpenExerciseDetails || null;

	container.innerHTML = `
		<div class="anatomy-explorer-container">
			<div class="anatomy-catalog-header">
				<div>
					<h2 class="anatomy-title">🧬 Anatomy & Muscle Explorer</h2>
					<p class="anatomy-subtitle">Interactive muscle visualization — select any muscle group to inspect targeting movements</p>
				</div>
			</div>

			<!-- Interactive Body Map & Quick Selector -->
			<div class="anatomy-body-map-wrapper">
				<div id="anatomy-body-map-mount"></div>
				<div class="anatomy-muscle-chips-selector" id="anatomy-quick-chips"></div>
			</div>

			<!-- Targeted Movements Section -->
			<div class="anatomy-target-section">
				<div class="anatomy-section-header">
					<h3 id="anatomy-active-target-title" class="anatomy-section-title">🎯 Targeted Movements</h3>
					<span id="anatomy-active-target-count" class="anatomy-target-count-badge">0 movements</span>
				</div>
				<div id="anatomy-cards-grid" class="exercises-cards-grid"></div>
			</div>
		</div>
	`;

	let currentMuscleFilter = null;

	const bodyMapMount = container.querySelector('#anatomy-body-map-mount');
	const chipsContainer = container.querySelector('#anatomy-quick-chips');
	const gridContainer = container.querySelector('#anatomy-cards-grid');
	const targetTitle = container.querySelector('#anatomy-active-target-title');
	const targetCount = container.querySelector('#anatomy-active-target-count');

	const bodyMap = createBodyMap(bodyMapMount, {
		onMuscleClick: (muscleId) => {
			currentMuscleFilter = muscleId;
			renderChips();
			renderGrid();
		},
	});

	function renderChips() {
		chipsContainer.innerHTML = '';
		Object.values(MUSCLE_DEFINITIONS).forEach(m => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = `anatomy-quick-chip ${currentMuscleFilter === m.id ? 'active' : ''}`;
			btn.innerHTML = `<span>${m.icon}</span> <span>${m.label}</span>`;
			btn.addEventListener('click', () => {
				currentMuscleFilter = currentMuscleFilter === m.id ? null : m.id;
				bodyMap.setSelectedMuscle(currentMuscleFilter);
				renderChips();
				renderGrid();
			});
			chipsContainer.appendChild(btn);
		});
	}

	function renderGrid() {
		const list = filterExercises('', '', '', currentMuscleFilter);

		if (currentMuscleFilter && MUSCLE_DEFINITIONS[currentMuscleFilter]) {
			const mDef = MUSCLE_DEFINITIONS[currentMuscleFilter];
			targetTitle.innerHTML = `<span>${mDef.icon}</span> Targeted Movements: <strong>${escapeHtml(mDef.label)}</strong>`;
		} else {
			targetTitle.textContent = '🎯 All Movements';
		}
		targetCount.textContent = `${list.length} movement${list.length !== 1 ? 's' : ''}`;

		if (list.length === 0) {
			gridContainer.innerHTML = `
				<div class="empty-sessions" style="grid-column: 1 / -1;">
					<p>No exercises found targeting ${currentMuscleFilter ? MUSCLE_DEFINITIONS[currentMuscleFilter]?.label || currentMuscleFilter : 'this area'}.</p>
					<p class="empty-sub">Select another muscle group on the body map or choose a different quick chip above.</p>
				</div>
			`;
			return;
		}

		gridContainer.innerHTML = '';
		list.forEach(ex => {
			const muscles = inferMusclesForExercise(ex);

			const card = renderExerciseCardElement(ex, {
				onPlay: (targetEx, media) => onPlayExercise(targetEx, media),
				onAddToRoutine: (targetEx, btn) => onAddToRoutine(targetEx, btn),
				onClick: (targetEx) => {
					if (typeof onOpenExerciseDetails === 'function') {
						onOpenExerciseDetails(targetEx, {
							onPlayAsset: (asset) => onPlayExercise(targetEx, asset),
							onAddToRoutine: (subTargetEx, btn) => onAddToRoutine(subTargetEx || targetEx, btn),
							onUpdated: () => renderGrid()
						});
					}
				},
				onMouseEnter: () => {
					bodyMap.highlightMuscles(muscles.primary, muscles.secondary, true);
				},
				onMouseLeave: () => {
					bodyMap.clearHighlights();
				}
			});

			gridContainer.appendChild(card);
		});
	}

	renderChips();
	renderGrid();
}
