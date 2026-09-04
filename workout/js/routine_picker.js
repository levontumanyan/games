/**
 * Routine Picker Popover module - Quick target selector for adding movements to workouts without leaving catalog.
 */

import { escapeHtml } from './utils.js';
import { createStepFromExercise, createStepFromCombo, createRoutine, expandStep } from './editor.js';

let activePopover = null;
let activeCleanup = null;

/**
 * Close any active popover menu.
 */
export function closeRoutinePickerPopover() {
	if (activeCleanup) {
		activeCleanup();
		activeCleanup = null;
	}
	if (activePopover) {
		activePopover.remove();
		activePopover = null;
	}
}

/**
 * Show the Target Workout Popover anchored to a trigger button.
 * @param {HTMLElement} triggerBtn - The button that triggered the popover
 * @param {Object} item - The Exercise or Combo object
 * @param {'exercise'|'combo'} type - Type of item being added
 * @param {Object} options - Context and callbacks
 * @param {Array} options.routines - List of all routines
 * @param {string|null} options.selectedRoutineId - Currently active routine ID
 * @param {Function} options.onSave - Callback to persist routines (e.g. persist())
 * @param {Function} options.onSelectRoutine - Callback to select routine
 * @param {Function} options.onSwitchToEditor - Callback to jump to editor tab
 */
export function showRoutinePickerPopover(triggerBtn, item, type = 'exercise', options = {}) {
	if (!triggerBtn || !item) return;

	// Toggle: if clicking the same trigger button while open, just close
	if (activePopover && activePopover._triggerBtn === triggerBtn) {
		closeRoutinePickerPopover();
		return;
	}

	closeRoutinePickerPopover();

	const {
		routines = [],
		selectedRoutineId = null,
		onSave = () => {},
		onSelectRoutine = () => {},
		onSwitchToEditor = () => {}
	} = options;

	const itemName = item.name || 'Movement';

	const popover = document.createElement('div');
	popover.className = 'popover-menu';
	popover._triggerBtn = triggerBtn;

	// Build items
	let itemsHtml = '';
	if (routines.length > 0) {
		itemsHtml = routines.map(r => {
			const isActive = r.id === selectedRoutineId;
			const stepCount = Array.isArray(r.steps) ? r.steps.length : 0;
			const activeBadge = isActive ? `<span class="popover-badge">Active</span>` : '';
			return `
				<div class="popover-item" data-routine-id="${escapeHtml(r.id)}">
					<div class="popover-item-title">${escapeHtml(r.title || 'Untitled Workout')}</div>
					<div class="popover-item-meta">${stepCount} move${stepCount === 1 ? '' : 's'} ${activeBadge}</div>
				</div>
			`;
		}).join('');
	} else {
		itemsHtml = `<div style="padding:10px 14px;font-size:0.85rem;color:var(--text-muted);">No workouts created yet.</div>`;
	}

	popover.innerHTML = `
		<div class="popover-header">
			<span>Add to Workout</span>
			<span style="font-size:0.7rem;opacity:0.7;">▾</span>
		</div>
		<div class="popover-list">
			${itemsHtml}
		</div>
		<div class="popover-footer">
			<div class="popover-item popover-item-create" data-action="create-new">
				<span>+ Create New Workout</span>
			</div>
		</div>
	`;

	// Position relative to trigger button in viewport
	document.body.appendChild(popover);
	activePopover = popover;

	const rect = triggerBtn.getBoundingClientRect();
	const popoverHeight = popover.offsetHeight || 280;
	const popoverWidth = 290;
	const spaceBelow = window.innerHeight - rect.bottom;
	const spaceAbove = rect.top;

	// Position vertically
	if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
		// Place above
		popover.style.top = `${Math.max(10, rect.top - popoverHeight - 6)}px`;
	} else {
		// Place below
		popover.style.top = `${rect.bottom + 6}px`;
	}

	// Position horizontally (align right edge with trigger right edge if possible)
	let leftPos = rect.right - popoverWidth;
	if (leftPos < 10) leftPos = 10;
	if (leftPos + popoverWidth > window.innerWidth - 10) {
		leftPos = window.innerWidth - popoverWidth - 10;
	}
	popover.style.left = `${leftPos}px`;

	// Handle selection
	popover.addEventListener('click', (e) => {
		e.stopPropagation();
		const createBtn = e.target.closest('[data-action="create-new"]');
		if (createBtn) {
			const newRoutine = createRoutine('New Workout');
			routines.push(newRoutine);
			onSelectRoutine(newRoutine.id);

			const newStep = type === 'combo' ? createStepFromCombo(item) : createStepFromExercise(item);
			newRoutine.steps.push(newStep);
			expandStep(newStep.id);
			onSave();

			createBtn.innerHTML = `<span class="popover-item-success">✓ Created & Added!</span>`;
			setTimeout(() => {
				closeRoutinePickerPopover();
				showToastWithEditorAction(`Added "${itemName}" to New Workout!`, onSwitchToEditor);
			}, 350);
			return;
		}

		const itemRow = e.target.closest('[data-routine-id]');
		if (itemRow) {
			const routineId = itemRow.getAttribute('data-routine-id');
			const targetRoutine = routines.find(r => r.id === routineId);
			if (targetRoutine) {
				const newStep = type === 'combo' ? createStepFromCombo(item) : createStepFromExercise(item);
				targetRoutine.steps.push(newStep);
				expandStep(newStep.id);
				onSelectRoutine(targetRoutine.id);
				onSave();

				itemRow.innerHTML = `<span class="popover-item-success">✓ Added to ${escapeHtml(targetRoutine.title)}</span>`;
				setTimeout(() => {
					closeRoutinePickerPopover();
					showToastWithEditorAction(`Added "${itemName}" to ${targetRoutine.title}!`, onSwitchToEditor);
				}, 350);
			}
		}
	});

	// Close listeners (click outside, escape key, scroll)
	const onDocClick = (e) => {
		if (!popover.contains(e.target) && e.target !== triggerBtn && !triggerBtn.contains(e.target)) {
			closeRoutinePickerPopover();
		}
	};
	const onDocKeydown = (e) => {
		if (e.key === 'Escape') {
			closeRoutinePickerPopover();
		}
	};
	const onDocScroll = (e) => {
		if (popover && !popover.contains(e.target)) {
			closeRoutinePickerPopover();
		}
	};

	setTimeout(() => {
		document.addEventListener('click', onDocClick);
		document.addEventListener('keydown', onDocKeydown);
		window.addEventListener('scroll', onDocScroll, { passive: true, capture: true });
	}, 10);

	activeCleanup = () => {
		document.removeEventListener('click', onDocClick);
		document.removeEventListener('keydown', onDocKeydown);
		window.removeEventListener('scroll', onDocScroll, { capture: true });
	};
}

/**
 * Show a toast with an interactive button to jump to the editor.
 * @param {string} message
 * @param {Function} onSwitchToEditor
 */
function showToastWithEditorAction(message, onSwitchToEditor) {
	let container = document.getElementById('toast-container');
	if (!container) {
		container = document.createElement('div');
		container.id = 'toast-container';
		container.className = 'toast-container';
		document.body.appendChild(container);
	}

	const toast = document.createElement('div');
	toast.className = 'toast-pill';
	toast.innerHTML = `
		<span>${escapeHtml(message)}</span>
		<button class="toast-link-btn" title="Open in Workout Editor">View in Editor →</button>
	`;

	const linkBtn = toast.querySelector('.toast-link-btn');
	if (linkBtn) {
		linkBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			toast.remove();
			onSwitchToEditor();
		});
	}

	container.appendChild(toast);

	requestAnimationFrame(() => {
		toast.classList.add('show');
	});

	setTimeout(() => {
		toast.classList.remove('show');
		setTimeout(() => {
			toast.remove();
		}, 300);
	}, 4000);
}
