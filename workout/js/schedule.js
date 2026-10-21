/**
 * Schedule / Calendar Module
 * Provides a clean, modern, lightweight workout calendar and daily agenda planner.
 */

import {
	fetchSchedule,
	createScheduleItem,
	updateScheduleItem,
	deleteScheduleItem,
	completeScheduleItem,
	loadRoutines
} from './storage.js';
import { escapeHtml } from './utils.js';
import { createCustomModal, showConfirm, showAlert } from './modal.js';

let cachedSchedule = [];
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1; // 1-12
let selectedDateStr = getTodayDateStr();

function getTodayDateStr() {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function invalidateScheduleCache() {
	cachedSchedule = [];
}

/**
 * Render the main schedule dashboard.
 * @param {HTMLElement} container
 * @param {Object} options - { onPlayRoutine, routines }
 */
export async function renderScheduleDashboard(container, options = {}) {
	container.innerHTML = `
		<div class="schedule-dashboard-wrapper">
			<div class="schedule-top-banner">
				<div class="schedule-banner-title">
					<h2>Workout Schedule</h2>
					<p class="text-muted">Plan your weekly training and track daily consistency.</p>
				</div>
				<div class="schedule-banner-actions">
					<button id="schedule-add-btn" class="btn btn-primary btn-sm">
						+ Schedule Workout
					</button>
				</div>
			</div>

			<div class="schedule-layout-grid">
				<div class="schedule-calendar-pane">
					<div class="schedule-calendar-card">
						<div class="schedule-month-nav">
							<div class="month-nav-left">
								<h3 id="schedule-month-title" class="month-title">Loading...</h3>
							</div>
							<div class="month-nav-right">
								<button id="schedule-prev-month-btn" class="btn btn-ghost btn-xs btn-icon-only" title="Previous Month">‹</button>
								<button id="schedule-today-btn" class="btn btn-ghost btn-xs">Today</button>
								<button id="schedule-next-month-btn" class="btn btn-ghost btn-xs btn-icon-only" title="Next Month">›</button>
							</div>
						</div>
						<div id="schedule-calendar-grid-container" class="calendar-grid-container">
							<div class="schedule-loading-spinner">
								<div class="spinner"></div>
							</div>
						</div>
					</div>
				</div>

				<div class="schedule-agenda-pane">
					<div class="schedule-agenda-card" id="schedule-agenda-card">
						<div class="agenda-header">
							<div class="agenda-date-info">
								<h3 id="agenda-date-title" class="agenda-title">Today</h3>
								<span id="agenda-date-subtitle" class="agenda-subtitle text-muted"></span>
							</div>
							<button id="agenda-quick-add-btn" class="btn btn-ghost btn-xs" title="Add to this day">
								+ Add
							</button>
						</div>
						<div id="agenda-items-list" class="agenda-items-list"></div>
					</div>
				</div>
			</div>
		</div>
	`;

	// Bind top controls
	const addBtn = container.querySelector('#schedule-add-btn');
	if (addBtn) {
		addBtn.addEventListener('click', () => {
			openScheduleModal({
				date: selectedDateStr,
				routines: options.routines || loadRoutines(),
				onSaved: () => refreshSchedule(container, options)
			});
		});
	}

	const quickAddBtn = container.querySelector('#agenda-quick-add-btn');
	if (quickAddBtn) {
		quickAddBtn.addEventListener('click', () => {
			openScheduleModal({
				date: selectedDateStr,
				routines: options.routines || loadRoutines(),
				onSaved: () => refreshSchedule(container, options)
			});
		});
	}

	const prevBtn = container.querySelector('#schedule-prev-month-btn');
	if (prevBtn) {
		prevBtn.addEventListener('click', () => {
			currentMonth--;
			if (currentMonth < 1) {
				currentMonth = 12;
				currentYear--;
			}
			selectedDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
			refreshSchedule(container, options);
		});
	}

	const nextBtn = container.querySelector('#schedule-next-month-btn');
	if (nextBtn) {
		nextBtn.addEventListener('click', () => {
			currentMonth++;
			if (currentMonth > 12) {
				currentMonth = 1;
				currentYear++;
			}
			selectedDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
			refreshSchedule(container, options);
		});
	}

	const todayBtn = container.querySelector('#schedule-today-btn');
	if (todayBtn) {
		todayBtn.addEventListener('click', () => {
			const now = new Date();
			currentYear = now.getFullYear();
			currentMonth = now.getMonth() + 1;
			selectedDateStr = getTodayDateStr();
			refreshSchedule(container, options);
		});
	}

	// Fetch & render
	await refreshSchedule(container, options);
}

/**
 * Fetch fresh schedule data and render calendar + agenda.
 */
async function refreshSchedule(container, options = {}) {
	const monthTitle = container.querySelector('#schedule-month-title');
	const gridContainer = container.querySelector('#schedule-calendar-grid-container');
	if (!gridContainer) return;

	const dateObj = new Date(currentYear, currentMonth - 1, 1);
	const monthName = dateObj.toLocaleString('default', { month: 'long' });
	if (monthTitle) {
		monthTitle.textContent = `${monthName} ${currentYear}`;
	}

	// Compute start and end date of range for API query (full month + edge padding)
	const startStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
	const lastDay = new Date(currentYear, currentMonth, 0).getDate();
	const endStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

	try {
		cachedSchedule = await fetchSchedule(startStr, endStr);
	} catch (err) {
		console.warn('Failed to load schedule from server:', err);
	}

	renderCalendarGrid(gridContainer, container, options);
	renderAgenda(container, options);
}

/**
 * Render the interactive month calendar grid.
 */
function renderCalendarGrid(gridContainer, mainContainer, options) {
	const firstDay = new Date(currentYear, currentMonth - 1, 1);
	const lastDay = new Date(currentYear, currentMonth, 0);
	const totalDays = lastDay.getDate();
	const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0

	const todayStr = getTodayDateStr();

	// Map items by date
	const scheduleMap = {};
	cachedSchedule.forEach(item => {
		if (!scheduleMap[item.scheduled_date]) {
			scheduleMap[item.scheduled_date] = [];
		}
		scheduleMap[item.scheduled_date].push(item);
	});

	let html = '<div class="calendar-grid modern-schedule-grid">';
	const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	dayHeaders.forEach(dh => {
		html += `<div class="cal-header-cell">${dh}</div>`;
	});

	// Empty leading cells
	for (let i = 0; i < startDayOfWeek; i++) {
		html += `<div class="cal-day-cell cal-cell-empty"></div>`;
	}

	// Month day cells
	for (let d = 1; d <= totalDays; d++) {
		const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		const isToday = dateStr === todayStr;
		const isSelected = dateStr === selectedDateStr;
		const items = scheduleMap[dateStr] || [];
		const count = items.length;
		const hasCompleted = items.some(it => it.status === 'completed');
		const allCompleted = count > 0 && items.every(it => it.status === 'completed');

		html += `
			<div class="cal-day-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${count > 0 ? 'has-scheduled' : ''}" data-date="${dateStr}">
				<div class="cell-day-top">
					<span class="cell-day-num">${d}</span>
					${allCompleted ? '<span class="cell-badge-done" title="Completed">✓</span>' : ''}
				</div>
				<div class="cell-day-content">
					${count > 0 ? `
						<div class="cell-workout-chips">
							${items.slice(0, 2).map(it => `
								<div class="cell-mini-chip ${it.status === 'completed' ? 'chip-completed' : ''}" title="${escapeHtml(it.routine_title)}">
									${escapeHtml(it.routine_title)}
								</div>
							`).join('')}
							${count > 2 ? `<span class="cell-more-badge">+${count - 2} more</span>` : ''}
						</div>
					` : ''}
				</div>
			</div>
		`;
	}

	html += '</div>';
	gridContainer.innerHTML = html;

	// Click event for selecting a day
	gridContainer.querySelectorAll('.cal-day-cell:not(.cal-cell-empty)').forEach(cell => {
		cell.addEventListener('click', () => {
			const clickedDate = cell.getAttribute('data-date');
			if (!clickedDate) return;
			selectedDateStr = clickedDate;
			gridContainer.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('is-selected'));
			cell.classList.add('is-selected');
			renderAgenda(mainContainer, options);
		});
	});
}

/**
 * Render agenda pane for selected date.
 */
function renderAgenda(mainContainer, options) {
	const titleEl = mainContainer.querySelector('#agenda-date-title');
	const subtitleEl = mainContainer.querySelector('#agenda-date-subtitle');
	const listEl = mainContainer.querySelector('#agenda-items-list');
	if (!listEl) return;

	const todayStr = getTodayDateStr();
	const isToday = selectedDateStr === todayStr;

	const [y, m, d] = selectedDateStr.split('-').map(Number);
	const dateObj = new Date(y, m - 1, d);
	const dayName = dateObj.toLocaleDateString('default', { weekday: 'long' });
	const fullDateStr = dateObj.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });

	if (titleEl) {
		titleEl.textContent = isToday ? `Today (${dayName})` : `${dayName}`;
	}
	if (subtitleEl) {
		subtitleEl.textContent = fullDateStr;
	}

	const items = cachedSchedule.filter(it => it.scheduled_date === selectedDateStr);
	if (items.length === 0) {
		listEl.innerHTML = `
			<div class="agenda-empty-state">
				<div class="agenda-empty-icon">📅</div>
				<p class="agenda-empty-text">No workouts planned for this day.</p>
				<button id="agenda-empty-add-btn" class="btn btn-secondary btn-sm">
					+ Plan a Workout
				</button>
			</div>
		`;
		const btn = listEl.querySelector('#agenda-empty-add-btn');
		if (btn) {
			btn.addEventListener('click', () => {
				openScheduleModal({
					date: selectedDateStr,
					routines: options.routines || loadRoutines(),
					onSaved: () => refreshSchedule(mainContainer, options)
				});
			});
		}
		return;
	}

	listEl.innerHTML = items.map(item => {
		const isCompleted = item.status === 'completed';
		const isSkipped = item.status === 'skipped';
		const timeDisplay = item.scheduled_time || 'Anytime';

		return `
			<div class="agenda-item-card ${isCompleted ? 'agenda-completed' : ''} ${isSkipped ? 'agenda-skipped' : ''}" data-id="${item.id}">
				<div class="agenda-item-left">
					<button class="agenda-check-btn ${isCompleted ? 'checked' : ''}" title="${isCompleted ? 'Mark uncompleted' : 'Mark completed'}" data-action="toggle-complete">
						${isCompleted ? '✓' : ''}
					</button>
					<div class="agenda-item-info">
						<div class="agenda-item-title-row">
							<span class="agenda-item-title">${escapeHtml(item.routine_title)}</span>
							<span class="agenda-time-pill">${escapeHtml(timeDisplay)}</span>
						</div>
						${item.notes ? `<div class="agenda-item-notes">${escapeHtml(item.notes)}</div>` : ''}
					</div>
				</div>

				<div class="agenda-item-actions">
					${item.routine_id ? `
						<button class="btn btn-primary btn-xs btn-start-scheduled" title="Start Workout Player" data-action="start">
							▶ Play
						</button>
					` : ''}
					<button class="btn btn-ghost btn-xs btn-icon-only" title="Edit" data-action="edit">✎</button>
					<button class="btn btn-ghost btn-xs btn-icon-only btn-delete-scheduled" title="Delete" data-action="delete">✕</button>
				</div>
			</div>
		`;
	}).join('');

	// Bind item action buttons
	listEl.querySelectorAll('.agenda-item-card').forEach(card => {
		const itemId = card.getAttribute('data-id');
		const item = items.find(it => it.id === itemId);
		if (!item) return;

		const toggleBtn = card.querySelector('[data-action="toggle-complete"]');
		if (toggleBtn) {
			toggleBtn.addEventListener('click', async () => {
				const newStatus = item.status === 'completed' ? 'scheduled' : 'completed';
				try {
					await updateScheduleItem(item.id, { status: newStatus });
					refreshSchedule(mainContainer, options);
				} catch (err) {
					showAlert({ title: 'Error', message: 'Could not update status: ' + err.message });
				}
			});
		}

		const startBtn = card.querySelector('[data-action="start"]');
		if (startBtn) {
			startBtn.addEventListener('click', () => {
				const routines = options.routines || loadRoutines();
				const matchedRoutine = routines.find(r => r.id === item.routine_id);
				if (matchedRoutine && options.onPlayRoutine) {
					// Launch player with routine
					options.onPlayRoutine(matchedRoutine, { scheduledItemId: item.id });
				} else {
					showAlert({
						title: 'Routine Not Found',
						message: `The workout "${item.routine_title}" could not be found in your local routines library.`
					});
				}
			});
		}

		const editBtn = card.querySelector('[data-action="edit"]');
		if (editBtn) {
			editBtn.addEventListener('click', () => {
				openScheduleModal({
					scheduleItem: item,
					date: item.scheduled_date,
					routines: options.routines || loadRoutines(),
					onSaved: () => refreshSchedule(mainContainer, options)
				});
			});
		}

		const deleteBtn = card.querySelector('[data-action="delete"]');
		if (deleteBtn) {
			deleteBtn.addEventListener('click', async () => {
				const confirmed = await showConfirm({
					title: 'Delete Scheduled Workout',
					message: `Remove "${item.routine_title}" from ${item.scheduled_date}?`
				});
				if (!confirmed) return;

				try {
					await deleteScheduleItem(item.id);
					refreshSchedule(mainContainer, options);
				} catch (err) {
					showAlert({ title: 'Error', message: 'Could not delete item: ' + err.message });
				}
			});
		}
	});
}

/**
 * Open modal to schedule or edit a workout.
 */
export function openScheduleModal({
	scheduleItem = null,
	routine = null,
	date = null,
	routines = [],
	onSaved = null
} = {}) {
	const isEdit = !!scheduleItem;
	const activeDate = scheduleItem?.scheduled_date || date || getTodayDateStr();
	const activeTime = scheduleItem?.scheduled_time || '';
	const activeNotes = scheduleItem?.notes || '';
	const activeRoutineId = scheduleItem?.routine_id || routine?.id || '';
	const activeRoutineTitle = scheduleItem?.routine_title || routine?.title || '';

	const routineOptionsHtml = routines.map(r => `
		<option value="${r.id}" ${r.id === activeRoutineId ? 'selected' : ''}>
			${escapeHtml(r.title)}
		</option>
	`).join('');

	const formHtml = `
		<form id="schedule-form" class="schedule-modal-form">
			<div class="form-group">
				<label class="form-label" for="schedule-routine-select">Workout Routine</label>
				<select id="schedule-routine-select" class="form-select clean-input">
					<option value="">-- Choose from your routines --</option>
					${routineOptionsHtml}
					<option value="__custom__" ${(!activeRoutineId && activeRoutineTitle) ? 'selected' : ''}>Custom workout...</option>
				</select>
			</div>

			<div class="form-group ${(!activeRoutineId && activeRoutineTitle) ? '' : 'hidden'}" id="custom-title-group">
				<label class="form-label" for="schedule-custom-title">Custom Workout Title</label>
				<input type="text" id="schedule-custom-title" class="form-input clean-input" placeholder="e.g. 5k Morning Run, Mobility Flow" value="${escapeHtml(activeRoutineTitle)}">
			</div>

			<div class="form-row form-row-2col">
				<div class="form-group">
					<label class="form-label" for="schedule-date-input">Date</label>
					<input type="date" id="schedule-date-input" class="form-input clean-input" value="${activeDate}" required>
				</div>
				<div class="form-group">
					<label class="form-label" for="schedule-time-input">Time (Optional)</label>
					<input type="time" id="schedule-time-input" class="form-input clean-input" value="${activeTime}">
				</div>
			</div>

			<div class="form-group">
				<label class="form-label" for="schedule-notes-input">Notes / Focus</label>
				<textarea id="schedule-notes-input" class="form-textarea clean-input" rows="2" placeholder="e.g. Focus on tempo, stretch after">${escapeHtml(activeNotes)}</textarea>
			</div>

			<div class="modal-form-actions">
				<button type="button" id="schedule-modal-cancel-btn" class="btn btn-ghost btn-sm">Cancel</button>
				<button type="submit" id="schedule-modal-save-btn" class="btn btn-primary btn-sm">
					${isEdit ? 'Save Changes' : 'Schedule Workout'}
				</button>
			</div>
		</form>
	`;

	const modal = createCustomModal({
		title: isEdit ? 'Edit Scheduled Workout' : 'Schedule Workout',
		bodyHtml: formHtml,
		maxWidth: '460px'
	});

	const form = modal.modal.querySelector('#schedule-form');
	const routineSelect = modal.modal.querySelector('#schedule-routine-select');
	const customGroup = modal.modal.querySelector('#custom-title-group');
	const customInput = modal.modal.querySelector('#schedule-custom-title');
	const cancelBtn = modal.modal.querySelector('#schedule-modal-cancel-btn');

	if (routineSelect && customGroup) {
		routineSelect.addEventListener('change', () => {
			if (routineSelect.value === '__custom__') {
				customGroup.classList.remove('hidden');
				customInput.focus();
			} else {
				customGroup.classList.add('hidden');
			}
		});
	}

	if (cancelBtn) {
		cancelBtn.addEventListener('click', () => modal.close());
	}

	if (form) {
		form.addEventListener('submit', async (e) => {
			e.preventDefault();

			const selectedId = routineSelect.value;
			let routineTitle = '';
			let routineId = null;

			if (selectedId === '__custom__') {
				routineTitle = customInput.value.trim() || 'Custom Workout';
			} else if (selectedId) {
				const r = routines.find(item => item.id === selectedId);
				routineTitle = r ? r.title : 'Workout';
				routineId = selectedId;
			} else {
				routineTitle = customInput.value.trim() || 'Workout';
			}

			const targetDate = modal.modal.querySelector('#schedule-date-input').value;
			const targetTime = modal.modal.querySelector('#schedule-time-input').value || null;
			const targetNotes = modal.modal.querySelector('#schedule-notes-input').value.trim();

			if (!targetDate) {
				showAlert({ title: 'Validation', message: 'Please select a date for the workout.' });
				return;
			}

			const saveBtn = modal.modal.querySelector('#schedule-modal-save-btn');
			saveBtn.disabled = true;
			saveBtn.textContent = 'Saving...';

			try {
				if (isEdit) {
					await updateScheduleItem(scheduleItem.id, {
						routine_id: routineId,
						routine_title: routineTitle,
						scheduled_date: targetDate,
						scheduled_time: targetTime,
						notes: targetNotes
					});
				} else {
					await createScheduleItem({
						routine_id: routineId,
						routine_title: routineTitle,
						scheduled_date: targetDate,
						scheduled_time: targetTime,
						notes: targetNotes,
						status: 'scheduled'
					});
				}
				modal.close();
				if (onSaved) onSaved();
			} catch (err) {
				saveBtn.disabled = false;
				saveBtn.textContent = isEdit ? 'Save Changes' : 'Schedule Workout';
				showAlert({ title: 'Error', message: 'Could not save schedule: ' + err.message });
			}
		});
	}
}
