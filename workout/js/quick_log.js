/**
 * Quick Workout & Fast Reps Logger Module.
 * Allows instant logging of pushups or multi-exercise micro-sessions
 * directly into streaks, heatmaps, and movement PR leaderboards.
 */

import { createCustomModal, showAlert } from './modal.js';
import { getExercises, getExerciseById, getCategoryBadgeHtml, getDisciplineBadgeHtml } from './exercises.js';
import { saveSession } from './storage.js';
import { showToast, escapeHtml } from './utils.js';
import { invalidateStatsCache } from './stats.js';

let activeModal = null;
let rowCounter = 0;
let exerciseRows = [];

// Curated list of popular quick bodyweight/conditioning exercises to feature at top of dropdown
const POPULAR_EXERCISE_KEYWORDS = [
	'pushup',
	'push-up',
	'pullup',
	'pull-up',
	'dip',
	'squat',
	'lunge',
	'burpee',
	'plank',
	'climber',
	'jump'
];

/**
 * Categorize exercises into Popular movements and full alphabetical library.
 * @returns {{ popular: Array, rest: Array }}
 */
function getCategorizedExercises() {
	const all = getExercises() || [];
	const popular = [];
	const rest = [];
	const seenIds = new Set();

	// Primary sort: pushups first, then other common movements
	const sorted = [...all].sort((a, b) => {
		const aName = (a.name || '').toLowerCase();
		const bName = (b.name || '').toLowerCase();
		const aIsPush = aName.includes('push');
		const bIsPush = bName.includes('push');
		if (aIsPush && !bIsPush) return -1;
		if (!aIsPush && bIsPush) return 1;
		return aName.localeCompare(bName);
	});

	for (const ex of sorted) {
		const name = (ex.name || '').toLowerCase();
		const isPop = POPULAR_EXERCISE_KEYWORDS.some(k => name.includes(k));
		if (isPop && popular.length < 12) {
			popular.push(ex);
			seenIds.add(ex.id);
		}
	}

	for (const ex of all) {
		if (!seenIds.has(ex.id)) {
			rest.push(ex);
		}
	}

	rest.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

	return { popular, rest };
}

/**
 * Find default pushup exercise ID.
 * @returns {string}
 */
function findDefaultPushupId() {
	const all = getExercises() || [];
	const std = all.find(e => e.id === 'ex-standard-pushups');
	if (std) return std.id;
	const anyPush = all.find(e => (e.name || '').toLowerCase().includes('pushup') || (e.name || '').toLowerCase().includes('push-up'));
	if (anyPush) return anyPush.id;
	return all[0]?.id || 'ex-standard-pushups';
}

/**
 * Open the Quick Workout Log modal.
 * @param {Object} [options]
 * @param {string} [options.defaultExerciseId]
 * @param {Function} [options.onLogged]
 */
export function showQuickLogModal(options = {}) {
	if (activeModal) {
		activeModal.close();
		activeModal = null;
	}

	const defaultId = options.defaultExerciseId || findDefaultPushupId();
	const initialExercise = getExerciseById(defaultId);
	const initialMode = initialExercise?.default_mode === 'time' ? 'time' : 'reps';
	const initialQuantity = initialExercise?.default_quantity || (initialMode === 'time' ? 30 : 25);

	rowCounter = 1;
	exerciseRows = [
		{
			id: `ql-row-${rowCounter}`,
			exerciseId: defaultId,
			reps: initialQuantity,
			mode: initialMode
		}
	];

	const bodyElement = document.createElement('div');
	bodyElement.className = 'quick-log-modal-content';

	const modal = createCustomModal({
		title: '⚡ Quick Workout Log',
		maxWidth: '540px',
		className: 'quick-log-modal-backdrop',
		bodyElement: bodyElement,
		onClose: () => {
			activeModal = null;
		}
	});

	activeModal = modal;

	renderQuickLogView(bodyElement, options.onLogged);
}

/**
 * Render modal body contents.
 * @param {HTMLElement} container
 * @param {Function} [onLogged]
 */
function renderQuickLogView(container, onLogged) {
	container.innerHTML = `
		<div class="quick-log-description">
			Knock out a quick set of pushups or calisthenics. Instantly advances your daily streak, records personal bests, and tracks volume.
		</div>

		<div class="quick-log-rows-container" id="quick-log-rows"></div>

		<div class="quick-log-add-wrap">
			<button type="button" class="btn btn-ghost btn-sm quick-log-add-btn" id="ql-add-row-btn">
				<span style="font-size:1.1rem; line-height:1;">+</span>
				<span>Add Another Exercise</span>
			</button>
		</div>

		<div class="quick-log-summary-card">
			<div class="quick-log-summary-left">
				<span class="ql-summary-label">Session Volume</span>
				<strong class="ql-summary-value" id="ql-summary-volume">25 reps</strong>
			</div>
			<div class="quick-log-summary-right">
				<span class="ql-summary-label">Est. Duration</span>
				<span class="ql-summary-time" id="ql-summary-time">⏱ ~1 min</span>
			</div>
		</div>

		<div class="quick-log-actions">
			<button type="button" class="btn btn-ghost" id="ql-cancel-btn">Cancel</button>
			<button type="button" class="btn btn-primary btn-lg quick-log-submit-btn" id="ql-submit-btn">
				<span>⚡ Log Workout</span>
			</button>
		</div>
	`;

	const rowsContainer = container.querySelector('#quick-log-rows');
	const addBtn = container.querySelector('#ql-add-row-btn');
	const cancelBtn = container.querySelector('#ql-cancel-btn');
	const submitBtn = container.querySelector('#ql-submit-btn');

	renderRows(rowsContainer);
	updateSummary(container);

	addBtn.addEventListener('click', () => {
		rowCounter++;
		// Pick next unselected popular exercise or standard squats/pullups
		const { popular, rest } = getCategorizedExercises();
		const candidates = [...popular, ...rest];
		const currentIds = new Set(exerciseRows.map(r => r.exerciseId));
		const nextEx = candidates.find(c => !currentIds.has(c.id)) || candidates[0] || { id: 'ex-standard-pushups' };
		const mode = nextEx?.default_mode === 'time' ? 'time' : 'reps';
		const quantity = nextEx?.default_quantity || (mode === 'time' ? 30 : 20);

		exerciseRows.push({
			id: `ql-row-${rowCounter}`,
			exerciseId: nextEx.id,
			reps: quantity,
			mode: mode
		});

		renderRows(rowsContainer);
		updateSummary(container);

		// Smooth scroll to the newly appended card
		const newEl = rowsContainer.querySelector(`#ql-row-${rowCounter}`);
		if (newEl) {
			newEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	});

	cancelBtn.addEventListener('click', () => {
		if (activeModal) activeModal.close();
	});

	submitBtn.addEventListener('click', async () => {
		await handleQuickLogSubmit(submitBtn, onLogged);
	});

	// Enter key support inside inputs to quickly submit
	container.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
			e.preventDefault();
			submitBtn.click();
		}
	});
}

/**
 * Render all exercise item cards.
 * @param {HTMLElement} rowsContainer
 */
function renderRows(rowsContainer) {
	rowsContainer.innerHTML = '';
	const { popular, rest } = getCategorizedExercises();

	exerciseRows.forEach((row, index) => {
		const ex = getExerciseById(row.exerciseId) || {
			id: row.exerciseId,
			name: 'Push-ups',
			category: 'strength',
			discipline: 'calisthenics'
		};

		const rowCard = document.createElement('div');
		rowCard.className = 'quick-log-row-card';
		rowCard.id = row.id;

		const isSingle = exerciseRows.length === 1;
		const unitLabel = row.mode === 'time' ? 'SECONDS' : 'REPS';

		rowCard.innerHTML = `
			<div class="quick-log-row-header">
				<div class="quick-log-row-title-wrap">
					<span class="quick-log-row-num">${exerciseRows.length > 1 ? `Movement ${index + 1}` : 'Selected Movement'}</span>
					<div class="quick-log-badges" id="badges-${row.id}">
						${getCategoryBadgeHtml(ex.category || 'strength')}
						${getDisciplineBadgeHtml(ex.discipline || 'calisthenics')}
					</div>
				</div>
				${!isSingle ? `<button type="button" class="quick-log-row-delete-btn" title="Remove movement" data-row-id="${row.id}">✕</button>` : ''}
			</div>

			<!-- Exercise Dropdown Selector -->
			<div class="quick-log-select-wrap">
				<select class="clean-input quick-log-select" data-row-id="${row.id}">
					${popular.length > 0 ? `
						<optgroup label="Popular Quick Movements">
							${popular.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === row.exerciseId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
						</optgroup>
					` : ''}
					${rest.length > 0 ? `
						<optgroup label="All Exercises">
							${rest.map(r => `<option value="${escapeHtml(r.id)}" ${r.id === row.exerciseId ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
						</optgroup>
					` : ''}
				</select>
			</div>

			<!-- Giant Tactile Stepper & Counter -->
			<div class="quick-log-counter-box">
				<div class="quick-log-counter-steppers">
					<button type="button" class="btn-ql-step" data-step="-5" data-row-id="${row.id}" title="Minus 5">−5</button>
					<button type="button" class="btn-ql-step" data-step="-1" data-row-id="${row.id}" title="Minus 1">−1</button>
				</div>
				<div class="quick-log-counter-display">
					<input type="number" min="0" max="999" class="quick-log-rep-input clean-input" data-row-id="${row.id}" value="${row.reps}">
					<span class="quick-log-unit-label" id="unit-${row.id}">${unitLabel}</span>
				</div>
				<div class="quick-log-counter-steppers">
					<button type="button" class="btn-ql-step" data-step="1" data-row-id="${row.id}" title="Plus 1">+1</button>
					<button type="button" class="btn-ql-step" data-step="5" data-row-id="${row.id}" title="Plus 5">+5</button>
				</div>
			</div>

			<!-- Speed Increment Pills -->
			<div class="quick-log-pills-grid">
				<button type="button" class="ql-pill-btn" data-set="10" data-row-id="${row.id}">10</button>
				<button type="button" class="ql-pill-btn" data-set="20" data-row-id="${row.id}">20</button>
				<button type="button" class="ql-pill-btn" data-set="25" data-row-id="${row.id}">25</button>
				<button type="button" class="ql-pill-btn" data-set="30" data-row-id="${row.id}">30</button>
				<button type="button" class="ql-pill-btn" data-set="50" data-row-id="${row.id}">50</button>
				<button type="button" class="ql-pill-btn" data-step="10" data-row-id="${row.id}">+10</button>
				<button type="button" class="ql-pill-btn" data-step="25" data-row-id="${row.id}">+25</button>
				<button type="button" class="ql-pill-btn ql-pill-clear" data-set="0" data-row-id="${row.id}">Clear</button>
			</div>
		`;

		rowsContainer.appendChild(rowCard);
	});

	bindRowEvents(rowsContainer);
}

/**
 * Bind event handlers on rows.
 * @param {HTMLElement} rowsContainer
 */
function bindRowEvents(rowsContainer) {
	// Dropdown changes
	rowsContainer.querySelectorAll('.quick-log-select').forEach(sel => {
		sel.addEventListener('change', (e) => {
			const rowId = sel.dataset.rowId;
			const row = exerciseRows.find(r => r.id === rowId);
			if (!row) return;

			row.exerciseId = sel.value;
			const ex = getExerciseById(row.exerciseId);
			if (ex) {
				row.mode = ex.default_mode === 'time' ? 'time' : 'reps';
				const badgeContainer = rowsContainer.querySelector(`#badges-${rowId}`);
				if (badgeContainer) {
					badgeContainer.innerHTML = `
						${getCategoryBadgeHtml(ex.category || 'strength')}
						${getDisciplineBadgeHtml(ex.discipline || 'calisthenics')}
					`;
				}
				const unitEl = rowsContainer.querySelector(`#unit-${rowId}`);
				if (unitEl) {
					unitEl.textContent = row.mode === 'time' ? 'SECONDS' : 'REPS';
				}
			}
			updateSummary(rowsContainer.closest('.quick-log-modal-content'));
		});
	});

	// Direct input changes
	rowsContainer.querySelectorAll('.quick-log-rep-input').forEach(inp => {
		inp.addEventListener('input', () => {
			const rowId = inp.dataset.rowId;
			const row = exerciseRows.find(r => r.id === rowId);
			if (!row) return;

			row.reps = Math.max(0, parseInt(inp.value, 10) || 0);
			updateSummary(rowsContainer.closest('.quick-log-modal-content'));
		});

		inp.addEventListener('blur', () => {
			if (inp.value === '' || isNaN(inp.value)) {
				inp.value = '0';
			}
		});
	});

	// Stepper buttons (-5, -1, +1, +5)
	rowsContainer.querySelectorAll('.btn-ql-step').forEach(btn => {
		btn.addEventListener('click', () => {
			const rowId = btn.dataset.rowId;
			const delta = parseInt(btn.dataset.step, 10) || 0;
			const row = exerciseRows.find(r => r.id === rowId);
			if (!row) return;

			row.reps = Math.max(0, row.reps + delta);
			const inp = rowsContainer.querySelector(`.quick-log-rep-input[data-row-id="${rowId}"]`);
			if (inp) inp.value = row.reps;
			updateSummary(rowsContainer.closest('.quick-log-modal-content'));
		});
	});

	// Speed pills
	rowsContainer.querySelectorAll('.ql-pill-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			const rowId = btn.dataset.rowId;
			const row = exerciseRows.find(r => r.id === rowId);
			if (!row) return;

			if (btn.dataset.set !== undefined) {
				row.reps = parseInt(btn.dataset.set, 10) || 0;
			} else if (btn.dataset.step !== undefined) {
				row.reps = Math.max(0, row.reps + (parseInt(btn.dataset.step, 10) || 0));
			}

			const inp = rowsContainer.querySelector(`.quick-log-rep-input[data-row-id="${rowId}"]`);
			if (inp) inp.value = row.reps;
			updateSummary(rowsContainer.closest('.quick-log-modal-content'));
		});
	});

	// Delete row buttons
	rowsContainer.querySelectorAll('.quick-log-row-delete-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			const rowId = btn.dataset.rowId;
			exerciseRows = exerciseRows.filter(r => r.id !== rowId);
			renderRows(rowsContainer);
			updateSummary(rowsContainer.closest('.quick-log-modal-content'));
		});
	});
}

/**
 * Update summary numbers and duration estimate.
 * @param {HTMLElement} container
 */
function updateSummary(container) {
	if (!container) return;

	let totalReps = 0;
	let totalSeconds = 0;

	for (const row of exerciseRows) {
		if (row.mode === 'time') {
			totalSeconds += row.reps;
		} else {
			totalReps += row.reps;
			// Estimate 2.5 seconds per repetition
			totalSeconds += Math.max(25, Math.round(row.reps * 2.5));
		}
	}

	const estMinutes = Math.max(1, Math.round(totalSeconds / 60));
	const volumeText = exerciseRows.length > 1
		? `${totalReps} total reps · ${exerciseRows.length} exercises`
		: `${totalReps} reps`;

	const volEl = container.querySelector('#ql-summary-volume');
	const timeEl = container.querySelector('#ql-summary-time');

	if (volEl) volEl.textContent = volumeText;
	if (timeEl) timeEl.textContent = `⏱ ~${estMinutes} min${estMinutes === 1 ? '' : 's'}`;
}

/**
 * Handle submission of the Quick Workout to backend sessions.
 * @param {HTMLButtonElement} submitBtn
 * @param {Function} [onLogged]
 */
async function handleQuickLogSubmit(submitBtn, onLogged) {
	// Validate
	const validRows = exerciseRows.filter(r => r.reps > 0);
	if (validRows.length === 0) {
		await showAlert({
			title: 'No Reps Logged',
			message: 'Please enter at least 1 rep or second for your exercise.'
		});
		return;
	}

	submitBtn.disabled = true;
	const originalContent = submitBtn.innerHTML;
	submitBtn.innerHTML = '<span>⚡ Logging workout...</span>';

	try {
		let totalDuration = 0;
		const stepsSnapshot = [];

		for (let i = 0; i < validRows.length; i++) {
			const row = validRows[i];
			const ex = getExerciseById(row.exerciseId) || {
				id: row.exerciseId,
				name: 'Push-ups',
				category: 'strength',
				discipline: 'calisthenics'
			};

			const duration = row.mode === 'time'
				? row.reps
				: Math.max(20, Math.round(row.reps * 2.5));

			totalDuration += duration;

			stepsSnapshot.push({
				id: `quick-step-${i + 1}-${Date.now().toString(36)}`,
				name: ex.name,
				label: ex.name,
				category: ex.category || 'strength',
				discipline: ex.discipline || 'calisthenics',
				type: row.mode === 'time' ? 'time' : 'reps',
				reps: row.mode === 'time' ? 0 : row.reps,
				duration: duration,
				exercises: [
					{
						id: ex.id,
						name: ex.name,
						category: ex.category || 'strength',
						discipline: ex.discipline || 'calisthenics',
						reps: row.mode === 'time' ? 0 : row.reps,
						duration: duration
					}
				]
			});
		}

		// Title formulation
		let routineTitle = 'Quick Workout';
		if (validRows.length === 1) {
			const ex = getExerciseById(validRows[0].exerciseId);
			routineTitle = `Quick ${ex?.name || 'Workout'}`;
		} else {
			const names = validRows.map(r => getExerciseById(r.exerciseId)?.name || 'Movement');
			routineTitle = `Quick ${names.slice(0, 2).join(' & ')}${names.length > 2 ? ' +' : ''}`;
		}

		const now = new Date();
		const startedAt = new Date(now.getTime() - totalDuration * 1000).toISOString();
		const completedAt = now.toISOString();

		const sessionPayload = {
			id: `quick_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
			routine_id: null,
			routine_title: routineTitle,
			started_at: startedAt,
			completed_at: completedAt,
			duration_seconds: totalDuration,
			completed_steps: stepsSnapshot.length,
			total_steps: stepsSnapshot.length,
			status: 'completed',
			is_preview: 0,
			exercises: stepsSnapshot
		};

		await saveSession(sessionPayload);

		// Invalidate stats cache so any Stats tab view pulls the updated PRs, streaks, and calendar
		invalidateStatsCache();

		// Close modal
		if (activeModal) {
			activeModal.close();
			activeModal = null;
		}

		// Total reps logged
		const totalReps = validRows.reduce((sum, r) => sum + (r.mode === 'time' ? 0 : r.reps), 0);
		const feedbackMsg = totalReps > 0
			? `🎉 <strong>Logged!</strong> 🔥 +${totalReps} reps recorded & daily streak advanced!`
			: `🎉 <strong>Logged!</strong> 🔥 Quick workout saved to your history!`;

		showToast(feedbackMsg, 3500);

		if (typeof onLogged === 'function') {
			onLogged(sessionPayload);
		}
	} catch (err) {
		console.error('Failed to log quick workout:', err);
		submitBtn.disabled = false;
		submitBtn.innerHTML = originalContent;
		await showAlert({
			title: 'Logging Error',
			message: `Could not save your workout session: ${err.message || 'Unknown error'}. Please try again.`
		});
	}
}
