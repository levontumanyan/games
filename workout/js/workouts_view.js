/**
 * Workouts Catalog View - Full-width, decluttered catalog for browsing, searching, and managing routines.
 * Replaces the legacy 280px left sidebar with a clean, calm, and responsive grid.
 */

import { escapeHtml } from './utils.js';
import { getSearchIcon, getCalendarIcon, getEditIcon } from './icons.js';
import { MUSCLE_DEFINITIONS } from './taxonomy.js';
import { inferMusclesForExercise, getExerciseById, classifyStep } from './exercises.js';

/**
 * Compute metadata, timing, and anatomical breakdown for a routine.
 * @param {Object} routine
 * @returns {Object}
 */
export function analyzeRoutine(routine) {
	const steps = routine.steps || [];
	let totalSeconds = 0;
	let timeCount = 0;
	let repsCount = 0;
	let breakCount = 0;
	const muscleHits = { upper: 0, core: 0, lower: 0 };
	const uniqueMuscles = new Set();
	const exerciseNames = new Set();
	let combatScore = 0;
	let lowerScore = 0;
	let mobilityScore = 0;

	steps.forEach((s) => {
		const cls = classifyStep(s);
		if (cls.mode === 'break') {
			breakCount++;
			totalSeconds += cls.targetDuration || 0;
		} else if (cls.mode === 'reps') {
			repsCount++;
			totalSeconds += (s.targetReps || s.reps || 10) * 2.5;
		} else {
			timeCount++;
			totalSeconds += cls.targetDuration || s.durationSeconds || 30;
		}

		if (cls.mode !== 'break') {
			const linkedEx = (s.exercises && s.exercises[0]) || (s.exercise_id ? getExerciseById(s.exercise_id) : null);
			const exName = linkedEx ? linkedEx.name : (s.label || '');
			if (exName) exerciseNames.add(exName.toLowerCase());

			const disc = (linkedEx?.discipline || '').toLowerCase();
			const cat = (linkedEx?.category || '').toLowerCase();
			if (['boxing', 'muay_thai', 'kickboxing', 'bjj'].includes(disc) || cat === 'technique') {
				combatScore++;
			}
			if (['stretch', 'mobility', 'yoga'].includes(cat) || ['yoga'].includes(disc)) {
				mobilityScore++;
			}

			const muscles = inferMusclesForExercise(linkedEx || { name: s.label, description: s.description });
			[...(muscles.primary || []), ...(muscles.secondary || [])].forEach((m) => {
				uniqueMuscles.add(m);
				const def = MUSCLE_DEFINITIONS[m];
				if (def?.region === 'upper') muscleHits.upper++;
				else if (def?.region === 'core') muscleHits.core++;
				else if (def?.region === 'lower') {
					muscleHits.lower++;
					lowerScore++;
				}
			});
		}
	});

	const totalHits = muscleHits.upper + muscleHits.core + muscleHits.lower;
	const upperPct = totalHits > 0 ? Math.round((muscleHits.upper / totalHits) * 100) : 0;
	const corePct = totalHits > 0 ? Math.round((muscleHits.core / totalHits) * 100) : 0;
	const lowerPct = totalHits > 0 ? Math.max(0, 100 - upperPct - corePct) : 0;

	// Concise category mapping
	let domain = 'strength';
	let domainLabel = 'Strength';
	let domainColor = '#e67e22';

	if (combatScore >= 2 || (steps.length > 0 && combatScore / steps.length >= 0.25)) {
		domain = 'combat';
		domainLabel = 'Combat';
		domainColor = '#e74c3c';
	} else if (lowerScore >= 3 || lowerPct >= 45) {
		domain = 'lower';
		domainLabel = 'Lower Body';
		domainColor = '#27ae60';
	} else if (mobilityScore >= 2 || (steps.length > 0 && mobilityScore / steps.length >= 0.35)) {
		domain = 'mobility';
		domainLabel = 'Mobility';
		domainColor = '#3498db';
	}

	const totalMinutes = Math.round(totalSeconds / 60);
	const formattedDuration = totalMinutes > 0 ? `${totalMinutes} min` : `${Math.round(totalSeconds)}s`;

	return {
		totalSeconds: Math.round(totalSeconds),
		formattedDuration,
		stepCount: steps.length,
		timeCount,
		repsCount,
		breakCount,
		upperPct,
		corePct,
		lowerPct,
		domain,
		domainLabel,
		domainColor,
		uniqueMuscles: Array.from(uniqueMuscles),
		exerciseNames: Array.from(exerciseNames),
	};
}

/**
 * Render the full-width Workouts Catalog into a container.
 * @param {HTMLElement} container
 * @param {Object} options
 */
export function renderWorkoutsCatalog(container, options = {}) {
	const routines = options.routines || [];
	const onSelectRoutine = options.onSelectRoutine || (() => {});
	const onPlayRoutine = options.onPlayRoutine || (() => {});
	const onScheduleRoutine = options.onScheduleRoutine || (() => {});
	const onEditRoutine = options.onEditRoutine || (() => {});
	const onCreateRoutine = options.onCreateRoutine || (() => {});

	container.innerHTML = `
		<div class="workouts-catalog-container">
			<div class="workouts-catalog-header">
				<div class="workouts-header-left">
					<h2 class="workouts-title">Workouts</h2>
					<span class="workouts-count-badge" id="workouts-count-badge">${routines.length} workouts</span>
				</div>
				<div class="workouts-header-actions">
					<button id="btn-create-workout-top" class="btn btn-primary btn-sm">+ New Workout</button>
				</div>
			</div>

			<!-- Sleek Search & Category Filter Bar -->
			<div class="workouts-controls-bar">
				<div class="search-box-wrapper workouts-search-box">
					<span class="search-icon">${getSearchIcon(15)}</span>
					<input
						type="text"
						id="workout-search-input"
						class="input search-box-input workout-search-input clean-input"
						placeholder="Search workouts or exercises..."
						autocomplete="off"
						autocorrect="off"
						autocapitalize="off"
						spellcheck="false"
					>
					<button id="btn-clear-workout-search" class="search-clear-btn hidden" title="Clear search">✕</button>
				</div>

				<div class="workouts-filter-and-sort">
					<div class="workouts-filter-chips" id="workouts-filter-chips"></div>

					<div class="workouts-sort-wrapper">
						<select id="workouts-sort-select" class="clean-input workouts-sort-select" title="Sort workouts">
							<option value="default">Default</option>
							<option value="duration-asc">Shortest</option>
							<option value="duration-desc">Longest</option>
							<option value="steps-desc">Most Steps</option>
							<option value="name-asc">A → Z</option>
						</select>
					</div>
				</div>
			</div>

			<!-- Workouts Cards Grid -->
			<div id="workouts-cards-grid" class="workouts-cards-grid"></div>
		</div>
	`;

	const searchInput = container.querySelector('#workout-search-input');
	const clearSearchBtn = container.querySelector('#btn-clear-workout-search');
	const filterChipsContainer = container.querySelector('#workouts-filter-chips');
	const sortSelect = container.querySelector('#workouts-sort-select');
	const gridContainer = container.querySelector('#workouts-cards-grid');
	const createBtn = container.querySelector('#btn-create-workout-top');

	createBtn.addEventListener('click', onCreateRoutine);

	let currentSearch = '';
	let currentFilter = 'all';
	let currentSort = 'default';

	const filterCategories = [
		{ id: 'all', label: 'All' },
		{ id: 'combat', label: 'Combat' },
		{ id: 'lower', label: 'Lower Body' },
		{ id: 'mobility', label: 'Mobility' },
		{ id: 'strength', label: 'Strength' },
	];

	function renderFilterChips() {
		filterChipsContainer.innerHTML = '';
		filterCategories.forEach((cat) => {
			const count = cat.id === 'all'
				? routines.length
				: routines.filter((r) => analyzeRoutine(r).domain === cat.id).length;

			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = `workout-pill-btn ${currentFilter === cat.id ? 'active' : ''}`;
			btn.innerHTML = `<span>${cat.label}</span><span class="pill-count">${count}</span>`;
			btn.addEventListener('click', () => {
				currentFilter = cat.id;
				renderFilterChips();
				renderGrid();
			});
			filterChipsContainer.appendChild(btn);
		});
	}

	function renderGrid() {
		gridContainer.innerHTML = '';

		let filtered = routines.map((r) => ({
			routine: r,
			meta: analyzeRoutine(r),
		}));

		// Filter by domain
		if (currentFilter !== 'all') {
			filtered = filtered.filter((item) => item.meta.domain === currentFilter);
		}

		// Fuzzy search filter
		if (currentSearch) {
			const q = currentSearch.toLowerCase().trim();
			filtered = filtered.filter((item) => {
				const titleMatch = (item.routine.title || '').toLowerCase().includes(q);
				const exMatch = item.meta.exerciseNames.some((n) => n.includes(q));
				const musMatch = item.meta.uniqueMuscles.some((m) => {
					const def = MUSCLE_DEFINITIONS[m];
					return m.includes(q) || (def?.label || '').toLowerCase().includes(q);
				});
				const domainMatch = item.meta.domainLabel.toLowerCase().includes(q);
				return titleMatch || exMatch || musMatch || domainMatch;
			});
		}

		// Sorting
		if (currentSort === 'duration-asc') {
			filtered.sort((a, b) => a.meta.totalSeconds - b.meta.totalSeconds);
		} else if (currentSort === 'duration-desc') {
			filtered.sort((a, b) => b.meta.totalSeconds - a.meta.totalSeconds);
		} else if (currentSort === 'steps-desc') {
			filtered.sort((a, b) => b.meta.stepCount - a.meta.stepCount);
		} else if (currentSort === 'name-asc') {
			filtered.sort((a, b) => (a.routine.title || '').localeCompare(b.routine.title || ''));
		}

		if (filtered.length === 0) {
			gridContainer.innerHTML = `
				<div class="workouts-empty-state">
					<div class="empty-icon-circle">🔍</div>
					<h3>No workouts found</h3>
					<p class="empty-message">${currentSearch ? `No matches for "${escapeHtml(currentSearch)}"` : 'No workouts in this category yet.'}</p>
					${currentSearch ? '<button id="btn-reset-workout-search" class="btn btn-ghost btn-sm">Clear Search</button>' : ''}
				</div>
			`;
			const resetBtn = gridContainer.querySelector('#btn-reset-workout-search');
			if (resetBtn) {
				resetBtn.addEventListener('click', () => {
					searchInput.value = '';
					currentSearch = '';
					clearSearchBtn.classList.add('hidden');
					renderGrid();
				});
			}
			return;
		}

		filtered.forEach(({ routine, meta }) => {
			const card = document.createElement('div');
			card.className = 'workout-catalog-card';
			card.dataset.routineId = routine.id;

			card.innerHTML = `
				<div class="workout-card-top">
					<span class="workout-domain-tag" style="--dom-color:${meta.domainColor};">
						<span class="domain-dot"></span>
						<span>${meta.domainLabel}</span>
					</span>
					<span class="workout-duration-tag">⏱ ${meta.formattedDuration}</span>
				</div>

				<h3 class="workout-card-title">${escapeHtml(routine.title || 'Untitled Workout')}</h3>

				<div class="workout-card-meta">
					<span>${meta.stepCount} ${meta.stepCount === 1 ? 'step' : 'steps'}</span>
				</div>

				<div class="workout-card-footer">
					<button class="btn btn-primary btn-sm btn-play-card" title="Start Workout">
						▶ Start
					</button>
					<div class="workout-card-actions-secondary">
						<button class="btn-card-icon btn-schedule-card" title="Schedule to Calendar">
							${getCalendarIcon(15)}
						</button>
						<button class="btn-card-icon btn-edit-card" title="Edit Workout">
							${getEditIcon(15)}
						</button>
					</div>
				</div>
			`;

			// Click card body to open details
			card.addEventListener('click', (e) => {
				if (e.target.closest('button')) return;
				onSelectRoutine(routine);
			});

			// Actions
			const playBtn = card.querySelector('.btn-play-card');
			playBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				onPlayRoutine(routine);
			});

			const schedBtn = card.querySelector('.btn-schedule-card');
			schedBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				onScheduleRoutine(routine);
			});

			const editBtn = card.querySelector('.btn-edit-card');
			editBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				onEditRoutine(routine);
			});

			gridContainer.appendChild(card);
		});
	}

	// Search input event listeners
	searchInput.addEventListener('input', () => {
		currentSearch = searchInput.value;
		clearSearchBtn.classList.toggle('hidden', !currentSearch);
		renderGrid();
	});

	clearSearchBtn.addEventListener('click', () => {
		searchInput.value = '';
		currentSearch = '';
		clearSearchBtn.classList.add('hidden');
		searchInput.focus();
		renderGrid();
	});

	sortSelect.addEventListener('change', () => {
		currentSort = sortSelect.value;
		renderGrid();
	});

	// Initial render
	renderFilterChips();
	renderGrid();
}
