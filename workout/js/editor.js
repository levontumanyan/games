/**
 * Editor module - Routine & step editing, drag-and-drop reorder.
 */

import {
	generateId, parseYouTubeId, parseYouTubeInfo, parseTime, formatTime,
	formatFriendlyDuration, escapeHtml, showToast, isBreakStep, formatModeQuantity
} from './utils.js';
import { saveAudioFile, deleteAudioFile } from './musicdb.js';
import { showPrompt, showAlert, createCustomModal } from './modal.js';
import {
	getTimerIcon,
	getBreakIcon,
	getComboIcon,
	getExerciseIcon,
	getDuplicateIcon,
	getPlusIcon,
	getSearchIcon,
	getClipIcon,
	getRepsIcon,
	getMuscleIcon,
	getMediaKindIcon,
} from './icons.js';
import {
	getCategoryBadgeHtml, getDisciplineBadgeHtml, getMuscleBadgeHtml, getDisciplineFilterPillsHtml,
	ANATOMICAL_REGIONS
} from './taxonomy.js';
import {
	getExercises, getExerciseById, filterExercises, createCustomExercise,
	inferMusclesForExercise, getExerciseMediaAssets, getExerciseFollowAlongMedia,
	resolveStepVideo, resolveStepVisual, classifyStep, hasStepVideo
} from './exercises.js';
import { showExerciseVariationsModal } from './exercises_view.js';
import { getCombos, filterCombos } from './combos.js';

// Track expanded step IDs across renders
const expandedStepIds = new Set();

/**
 * Mark a specific step ID as expanded.
 * @param {string} stepId
 */
export function expandStep(stepId) {
	if (stepId) expandedStepIds.add(stepId);
}

/**
 * Highlight and scroll to a specific step card element.
 * @param {string} stepId
 */
export function highlightStepElement(stepId) {
	if (!stepId) return;
	requestAnimationFrame(() => {
		const el = document.querySelector(`.step-card[data-id="${stepId}"]`);
		if (el) {
			el.classList.add('step-card-highlighted');
			el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			setTimeout(() => {
				el.classList.remove('step-card-highlighted');
			}, 1800);
		}
	});
}

/**
 * Toggle collapse/expand on all step cards in container.
 * @param {HTMLElement} container
 * @param {boolean} [forceExpand]
 * @returns {boolean} Whether steps are now expanded
 */
export function toggleAllStepCards(container, forceExpand) {
	if (!container) return true;
	const cards = container.querySelectorAll('.step-card');
	if (cards.length === 0) return true;

	const allExpanded = Array.from(cards).every(c => !c.classList.contains('step-card-collapsed'));
	const shouldExpand = typeof forceExpand === 'boolean' ? forceExpand : !allExpanded;

	cards.forEach(card => {
		const stepId = card.dataset.id;
		card.classList.toggle('step-card-collapsed', !shouldExpand);
		if (stepId) {
			if (shouldExpand) {
				expandedStepIds.add(stepId);
			} else {
				expandedStepIds.delete(stepId);
			}
		}
	});
	return shouldExpand;
}

/**
 * Render the routine editor for a given routine.
 * @param {Object} routine - The routine to edit
 * @param {HTMLElement} container - Container element for the step list
 * @param {Function|Object} actions - Callback or object with onUpdate and onTestStep
 */
export function renderEditor(routine, container, actions) {
	const onUpdate = typeof actions === 'function' ? actions : actions?.onUpdate;
	const onTestStep = typeof actions === 'object' ? actions.onTestStep : null;

	const stepActions = container.closest('.editor-container')?.querySelector('.step-actions')
		|| document.querySelector('.step-actions');
	if (stepActions) {
		stepActions.classList.toggle('hidden', !routine || routine.steps.length === 0);
	}

	container.innerHTML = '';

	if (!routine) {
		container.innerHTML = '<p class="empty-message">Select or create a workout to get started.</p>';
		return;
	}

	// Workout-level background music playlist card (only once there are steps)
	if (routine.steps.length > 0) {
		const musicCard = createRoutineMusicCard(routine, onUpdate);
		container.appendChild(musicCard);
	}

	if (routine.steps.length === 0) {
		const emptyCard = document.createElement('div');
		emptyCard.className = 'editor-empty-steps-card';
		emptyCard.innerHTML = `
			<div class="empty-steps-icon">🥋</div>
			<h4>No steps in this workout yet</h4>
			<p>Choose an option below to start building your routine:</p>
			<div class="editor-empty-actions">
				<button type="button" class="btn btn-primary btn-sm btn-empty-add-ex">🥋 + Add Exercise</button>
				<button type="button" class="btn btn-secondary btn-sm btn-empty-add-combo">🔗 + Add Combo</button>
				<button type="button" class="btn btn-secondary btn-sm btn-empty-add-break">⏱️ + Add Rest</button>
			</div>
		`;
		emptyCard.querySelector('.btn-empty-add-ex').addEventListener('click', () => showAddExerciseModal(routine, onUpdate, 0));
		emptyCard.querySelector('.btn-empty-add-combo').addEventListener('click', () => showAddComboModal(routine, onUpdate, 0));
		emptyCard.querySelector('.btn-empty-add-break').addEventListener('click', () => {
			const s = insertBreakStep(routine, 0, 60);
			onUpdate();
			highlightStepElement(s.id);
		});
		container.appendChild(emptyCard);
		return;
	}

	// In-between insert divider before the first step
	container.appendChild(createInsertDivider(routine, 0, onUpdate));

	routine.steps.forEach((step, index) => {
		const stepEl = createStepElement(step, index, routine, onUpdate, onTestStep);
		container.appendChild(stepEl);

		// In-between insert divider after each step
		container.appendChild(createInsertDivider(routine, index + 1, onUpdate));
	});

	// Make steps draggable for reordering
	initDragAndDrop(container, routine, onUpdate);
}

/**
 * Create a UI card for editing workout-level background music.
 * @param {Object} routine
 * @param {Function} onUpdate
 * @returns {HTMLElement}
 */
export function createRoutineMusicCard(routine, onUpdate) {
	if (!routine.musicTracks) routine.musicTracks = [];
	const card = document.createElement('div');
	card.className = 'routine-music-card';

	const header = document.createElement('div');
	header.className = 'routine-music-header';

	const titleInfo = document.createElement('div');
	titleInfo.className = 'routine-music-title-info';

	const title = document.createElement('span');
	title.className = 'routine-music-title';
	title.innerHTML = `🎵 Workout Music Playlist <span class="badge-music-count">${routine.musicTracks.length}</span>`;

	const subtext = document.createElement('span');
	subtext.className = 'routine-music-subtext';
	subtext.textContent = 'Plays during all timer & rest intervals (video clips auto-mute).';

	titleInfo.append(title, subtext);

	const actions = document.createElement('div');
	actions.className = 'routine-music-actions';

	const addYtBtn = document.createElement('button');
	addYtBtn.className = 'btn btn-ghost btn-xs';
	addYtBtn.type = 'button';
	addYtBtn.textContent = '🔗 + YouTube Track / Playlist';
	addYtBtn.addEventListener('click', async (e) => {
		e.stopPropagation();
		const url = await showPrompt({
			title: 'Add YouTube Music to Workout',
			message: 'Paste a YouTube / YouTube Music track or playlist link:',
			placeholder: 'https://music.youtube.com/playlist?list=... or https://youtube.com/watch?v=...',
			confirmText: 'Next'
		});
		if (!url) return;
		const ytInfo = parseYouTubeInfo(url);
		if (!ytInfo || (!ytInfo.videoId && !ytInfo.playlistId)) {
			await showAlert({
				title: 'Invalid Link',
				message: 'Could not find a valid YouTube video ID or playlist ID from that link. Please check the URL and try again.'
			});
			return;
		}
		const defaultLabel = ytInfo.isPlaylist ? 'YouTube Playlist' : 'Music Track';
		const label = await showPrompt({
			title: ytInfo.isPlaylist ? 'Playlist Label' : 'Track Label',
			message: ytInfo.isPlaylist ? 'Display name for this playlist:' : 'Display name for this track:',
			defaultValue: defaultLabel,
			placeholder: ytInfo.isPlaylist ? 'e.g. Synthwave Playlist' : 'e.g. Upbeat Workout Beat',
			confirmText: 'Add to Workout'
		}) || defaultLabel;
		routine.musicTracks.push({
			id: generateId(),
			source: 'youtube',
			videoId: ytInfo.videoId || null,
			playlistId: ytInfo.playlistId || null,
			isPlaylist: ytInfo.isPlaylist,
			label: label
		});
		onUpdate();
	});

	const addFileBtn = document.createElement('button');
	addFileBtn.className = 'btn btn-ghost btn-xs';
	addFileBtn.type = 'button';
	addFileBtn.textContent = '📁 + Audio File';
	addFileBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'audio/*';
		input.onchange = async (ev) => {
			const file = ev.target.files[0];
			if (!file) return;
			const trackId = generateId();
			const label = await showPrompt({
				title: 'Audio Track Label',
				message: 'Display name for this audio file:',
				defaultValue: file.name,
				confirmText: 'Add Track'
			}) || file.name;
			try {
				await saveAudioFile(trackId, file, file.name);
				routine.musicTracks.push({
					id: trackId,
					source: 'file',
					fileId: trackId,
					fileName: file.name,
					label: label
				});
				onUpdate();
			} catch (err) {
				await showAlert({
					title: 'File Save Error',
					message: 'Failed to save audio file: ' + err.message
				});
			}
		};
		input.click();
	});

	actions.append(addYtBtn, addFileBtn);
	header.append(titleInfo, actions);
	card.appendChild(header);

	if (routine.musicTracks.length === 0) {
		const empty = document.createElement('p');
		empty.className = 'routine-music-empty';
		empty.textContent = 'No workout-level music tracks. Add YouTube links or audio files to play continuously across intervals.';
		card.appendChild(empty);
	} else {
		const list = document.createElement('div');
		list.className = 'routine-music-list';
		routine.musicTracks.forEach((track, i) => {
			const trackEl = document.createElement('div');
			trackEl.className = 'step-music-track';

			const badge = document.createElement('span');
			badge.className = 'track-source-badge';
			badge.textContent = track.source === 'youtube'
				? (track.isPlaylist || (track.playlistId && !track.videoId) ? '▶ YT Playlist' : '▶ YT')
				: '📁 File';

			const trackLabel = document.createElement('span');
			trackLabel.className = 'track-label';
			trackLabel.textContent = track.label || (track.source === 'youtube' ? (track.videoId || track.playlistId) : track.fileName);

			const removeBtn = document.createElement('button');
			removeBtn.className = 'btn btn-danger btn-sm';
			removeBtn.textContent = '✕';
			removeBtn.type = 'button';
			removeBtn.title = 'Remove track from workout';
			removeBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				if (track.source === 'file' && track.fileId) {
					try { await deleteAudioFile(track.fileId); } catch {}
				}
				routine.musicTracks.splice(i, 1);
				onUpdate();
			});

			trackEl.append(badge, trackLabel, removeBtn);
			list.appendChild(trackEl);
		});
		card.appendChild(list);
	}

	return card;
}

/**
 * Duplicate a step in a routine at index + 1.
 * @param {Object} routine
 * @param {number} index
 * @returns {Object|null}
 */
export function duplicateStep(routine, index) {
	if (!routine || !Array.isArray(routine.steps) || index < 0 || index >= routine.steps.length) return null;
	const original = routine.steps[index];
	const cloned = JSON.parse(JSON.stringify(original));
	cloned.id = generateId();
	if (Array.isArray(cloned.musicTracks)) {
		cloned.musicTracks.forEach(t => { t.id = generateId(); });
	}
	routine.steps.splice(index + 1, 0, cloned);
	expandStep(cloned.id);
	return cloned;
}

/**
 * Insert a new break/rest step at a specific index.
 * @param {Object} routine
 * @param {number} [index]
 * @param {number} [durationSeconds=60]
 * @returns {Object}
 */
export function insertBreakStep(routine, index, durationSeconds = 60) {
	if (!routine) return null;
	if (!Array.isArray(routine.steps)) routine.steps = [];
	const step = createBreakStep(durationSeconds);
	const targetIdx = (typeof index === 'number' && index >= 0 && index <= routine.steps.length) ? index : routine.steps.length;
	routine.steps.splice(targetIdx, 0, step);
	expandStep(step.id);
	return step;
}

/**
 * Insert a step (exercise or combo) and automatically follow it with a 60s
 * break so the routine is always interleaved with rest between movements.
 * @param {Object} routine
 * @param {Object} step
 * @param {number} [insertIndex=-1] - Target index; -1 appends to the end
 * @returns {number} The index at which the step was inserted
 */
export function appendStepWithBreak(routine, step, insertIndex = -1) {
	if (!routine || !step) return -1;
	if (!Array.isArray(routine.steps)) routine.steps = [];
	const idx = (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= routine.steps.length)
		? insertIndex
		: routine.steps.length;
	routine.steps.splice(idx, 0, step);
	routine.steps.splice(idx + 1, 0, createBreakStep(60));
	expandStep(step.id);
	return idx;
}

/**
 * Remove any break/rest steps from the end of a routine so the last step is
 * always an actual exercise/combo movement.
 * @param {Object} routine
 */
export function trimTrailingBreaks(routine) {
	if (!routine || !Array.isArray(routine.steps)) return;
	while (routine.steps.length > 0 && isBreakStep(routine.steps[routine.steps.length - 1])) {
		routine.steps.pop();
	}
}

/**
 * Insert a new timer step at a specific index.
 * @param {Object} routine
 * @param {number} [index]
 * @returns {Object}
 */
export function insertTimerStep(routine, index) {
	if (!routine) return null;
	if (!Array.isArray(routine.steps)) routine.steps = [];
	const step = createTimerStep();
	const targetIdx = (typeof index === 'number' && index >= 0 && index <= routine.steps.length) ? index : routine.steps.length;
	routine.steps.splice(targetIdx, 0, step);
	expandStep(step.id);
	return step;
}

/**
 * Insert a new video clip step at a specific index.
 * @param {Object} routine
 * @param {number} [index]
 * @returns {Object}
 */
export function insertClipStep(routine, index) {
	if (!routine) return null;
	if (!Array.isArray(routine.steps)) routine.steps = [];
	const step = createClipStep();
	const targetIdx = (typeof index === 'number' && index >= 0 && index <= routine.steps.length) ? index : routine.steps.length;
	routine.steps.splice(targetIdx, 0, step);
	expandStep(step.id);
	return step;
}

/**
 * Create an interactive in-between insertion divider element.
 * @param {Object} routine
 * @param {number} insertIndex
 * @param {Function} onUpdate
 * @returns {HTMLElement}
 */
export function createInsertDivider(routine, insertIndex, onUpdate) {
	const divider = document.createElement('div');
	divider.className = 'step-insert-divider';
	divider.dataset.insertIndex = insertIndex;

	const isLast = insertIndex === routine.steps.length;
	if (isLast) {
		divider.classList.add('step-insert-divider-last');
	}

	const line = document.createElement('div');
	line.className = 'step-insert-line';

	const addBtn = document.createElement('button');
	addBtn.type = 'button';
	addBtn.className = 'btn-insert-divider';
	addBtn.innerHTML = isLast
		? `${getPlusIcon(13)} <span>+ Insert Step Here</span>`
		: `${getPlusIcon(12)} <span>Insert Step Here</span>`;

	const dropIndicator = document.createElement('div');
	dropIndicator.className = 'step-drop-indicator';
	dropIndicator.innerHTML = `<span>⬇ Move Step Here</span>`;

	const menu = document.createElement('div');
	menu.className = 'step-insert-menu hidden';

	const closeMenu = () => {
		menu.classList.add('hidden');
		addBtn.classList.remove('hidden');
		document.removeEventListener('click', onDocClick);
	};

	const onDocClick = (e) => {
		if (!divider.contains(e.target)) {
			closeMenu();
		}
	};

	const exBtn = document.createElement('button');
	exBtn.type = 'button';
	exBtn.className = 'btn-insert-pill btn-insert-ex';
	exBtn.innerHTML = `🥋 + Exercise`;
	exBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		closeMenu();
		showAddExerciseModal(routine, onUpdate, insertIndex);
	});

	const breakBtn = document.createElement('button');
	breakBtn.type = 'button';
	breakBtn.className = 'btn-insert-pill btn-insert-break';
	breakBtn.innerHTML = `⏱️ + Rest`;
	breakBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		closeMenu();
		const step = insertBreakStep(routine, insertIndex, 60);
		onUpdate();
		showToast(`Inserted Rest break at #${insertIndex + 1}`);
		highlightStepElement(step.id);
	});

	const comboBtn = document.createElement('button');
	comboBtn.type = 'button';
	comboBtn.className = 'btn-insert-pill btn-insert-combo';
	comboBtn.innerHTML = `🔗 + Combo`;
	comboBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		closeMenu();
		showAddComboModal(routine, onUpdate, insertIndex);
	});

	const closeBtn = document.createElement('button');
	closeBtn.type = 'button';
	closeBtn.className = 'btn-insert-close';
	closeBtn.title = 'Close';
	closeBtn.textContent = '✕';
	closeBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		closeMenu();
	});

	menu.append(exBtn, breakBtn, comboBtn, closeBtn);

	addBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		// Close any other open insert menus
		document.querySelectorAll('.step-insert-menu:not(.hidden)').forEach(m => {
			m.classList.add('hidden');
			const b = m.parentElement?.querySelector('.btn-insert-divider');
			if (b) b.classList.remove('hidden');
		});
		addBtn.classList.add('hidden');
		menu.classList.remove('hidden');
		setTimeout(() => {
			document.addEventListener('click', onDocClick);
		}, 0);
	});

	divider.append(line, addBtn, dropIndicator, menu);
	return divider;
}

/**
 * Create a DOM element for a single step.
 */
function createStepElement(step, index, routine, onUpdate, onTestStep) {
	if (!step.id) step.id = generateId();
	const isBreak = isBreakStep(step);
	const isCombo = Boolean(step.combo_id || step.flow_type || (step.exercises && step.exercises.length >= 2));
	const isExpanded = expandedStepIds.has(step.id) || (expandedStepIds.size === 0 && index === 0);

	const el = document.createElement('div');
	el.className = `step-card step-${step.type}` + (isBreak ? ' step-break step-card-compact' : '') + (isExpanded ? '' : ' step-card-collapsed');
	el.dataset.index = index;
	el.dataset.id = step.id;
	el.draggable = true;

	const header = document.createElement('div');
	header.className = 'step-header';
	header.title = 'Click to expand/collapse step fields';

	const dragHandle = document.createElement('span');
	dragHandle.className = 'drag-handle';
	dragHandle.textContent = '⠿';
	dragHandle.title = 'Drag to reorder';

	const stepNumber = document.createElement('span');
	stepNumber.className = 'step-number';
	stepNumber.textContent = `#${index + 1}`;

	const stepType = document.createElement('span');
	stepType.className = 'step-type-badge' + (isCombo ? ' step-badge-combo' : (isBreak ? ' step-badge-break' : ' step-badge-exercise'));
	if (isBreak) {
		stepType.innerHTML = `${getBreakIcon(13)} Rest`;
	} else if (isCombo) {
		stepType.innerHTML = `${getComboIcon(13)} Combo Flow`;
	} else {
		stepType.innerHTML = `🥋 Exercise`;
	}

	// Compact summary info preview for collapsed state
	const headerInfo = document.createElement('div');
	headerInfo.className = 'step-header-info';

	const headerTitle = document.createElement('span');
	headerTitle.className = 'step-header-title';
	const derivedTitle = getStepDisplayName(step);
	headerTitle.textContent = derivedTitle;

	const editTitleBtn = document.createElement('button');
	editTitleBtn.type = 'button';
	editTitleBtn.className = 'btn-edit-title-pencil';
	editTitleBtn.title = 'Edit custom step title';
	editTitleBtn.innerHTML = '✏️';
	editTitleBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const currentVal = step.label || derivedTitle;
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'input input-inline-title-edit clean-input';
		input.value = currentVal;
		input.placeholder = derivedTitle;
		input.autocomplete = 'off';
		input.autocorrect = 'off';
		input.autocapitalize = 'off';
		input.spellcheck = false;

		const commit = () => {
			const val = input.value.trim();
			if (val && val !== (step.exercises && step.exercises.length > 0 ? step.exercises.map(ex => ex.name).join(' + ') : (isBreak ? 'Rest' : 'Exercise'))) {
				step.label = val;
				step.customLabel = true;
			} else {
				delete step.label;
				delete step.customLabel;
			}
			headerTitle.textContent = getStepDisplayName(step);
			if (input.parentNode) {
				input.replaceWith(headerTitle);
				editTitleBtn.style.display = '';
			}
			onUpdate();
		};

		input.addEventListener('blur', commit);
		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				input.blur();
			} else if (evt.key === 'Escape') {
				input.value = currentVal;
				input.blur();
			}
		});

		headerTitle.replaceWith(input);
		editTitleBtn.style.display = 'none';
		input.focus();
		input.select();
	});

	const headerMeta = document.createElement('span');
	headerMeta.className = 'step-header-meta';
	const cls = classifyStep(step);
	if (cls.mode === 'reps') {
		headerMeta.textContent = formatModeQuantity('reps', cls.targetReps);
	} else if (cls.video && cls.video.videoId) {
		const vidDur = Math.max(0, cls.video.endSeconds - cls.video.startSeconds);
		headerMeta.textContent = `${formatFriendlyDuration(cls.targetDuration)} · 🎬 ${formatTime(vidDur)}`;
	} else {
		headerMeta.textContent = formatFriendlyDuration(cls.targetDuration || 30);
	}

	headerInfo.append(headerTitle, editTitleBtn, headerMeta);

	if (step.musicTracks && step.musicTracks.length > 0) {
		const musicBadge = document.createElement('span');
		musicBadge.className = 'step-header-music-badge';
		musicBadge.textContent = `🎵 ${step.musicTracks.length}`;
		musicBadge.title = `${step.musicTracks.length} background music track(s)`;
		headerInfo.appendChild(musicBadge);
	}

	const headerActions = document.createElement('div');
	headerActions.className = 'step-header-actions';

	if (onTestStep) {
		const testBtn = document.createElement('button');
		testBtn.type = 'button';
		testBtn.className = 'btn btn-ghost btn-xs btn-test-step';
		testBtn.innerHTML = '▶ Test';
		testBtn.title = 'Test step in Preview Mode (Stats Disabled)';
		testBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			onTestStep(index);
		});
		headerActions.appendChild(testBtn);
	}

	const dupBtn = document.createElement('button');
	dupBtn.type = 'button';
	dupBtn.className = 'btn btn-ghost btn-xs btn-duplicate-step';
	dupBtn.innerHTML = getDuplicateIcon(14);
	dupBtn.title = 'Duplicate step (clone with all settings)';
	dupBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const cloned = duplicateStep(routine, index);
		if (cloned) {
			onUpdate();
			showToast(`Duplicated step #${index + 1}`);
			highlightStepElement(cloned.id);
		}
	});
	headerActions.appendChild(dupBtn);

	const removeBtn = document.createElement('button');
	removeBtn.className = 'btn btn-danger btn-sm';
	removeBtn.textContent = '✕';
	removeBtn.title = 'Remove step';
	removeBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		routine.steps.splice(index, 1);
		if (step.id) expandedStepIds.delete(step.id);
		onUpdate();
	});
	headerActions.appendChild(removeBtn);

	const expandToggle = document.createElement('span');
	expandToggle.className = 'step-expand-toggle';
	expandToggle.textContent = '▾';
	headerActions.appendChild(expandToggle);

	header.append(dragHandle, stepNumber, stepType, headerInfo, headerActions);

	// Toggle collapse on header click
	header.addEventListener('click', (e) => {
		const stepsContainer = el.closest('.editor-steps-container');
		if (stepsContainer && stepsContainer._isDraggingStep) return;
		if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.drag-handle')) {
			return;
		}
		const collapsed = el.classList.toggle('step-card-collapsed');
		if (step.id) {
			if (collapsed) {
				expandedStepIds.delete(step.id);
			} else {
				expandedStepIds.add(step.id);
			}
		}
	});

	el.appendChild(header);

	const body = document.createElement('div');
	body.className = 'step-body';

	if (isBreak) {
		body.appendChild(createBreakFields(step, onUpdate));
	} else {
		body.appendChild(createTimerFields(step, onUpdate));
	}

	el.appendChild(body);

	// Move buttons
	const moveBar = document.createElement('div');
	moveBar.className = 'step-move-bar';

	if (index > 0) {
		const upBtn = document.createElement('button');
		upBtn.className = 'btn btn-ghost btn-sm';
		upBtn.textContent = '↑';
		upBtn.title = 'Move up';
		upBtn.addEventListener('click', () => {
			[routine.steps[index - 1], routine.steps[index]] =
				[routine.steps[index], routine.steps[index - 1]];
			onUpdate();
		});
		moveBar.appendChild(upBtn);
	}

	if (index < routine.steps.length - 1) {
		const downBtn = document.createElement('button');
		downBtn.className = 'btn btn-ghost btn-sm';
		downBtn.textContent = '↓';
		downBtn.title = 'Move down';
		downBtn.addEventListener('click', () => {
			[routine.steps[index], routine.steps[index + 1]] =
				[routine.steps[index + 1], routine.steps[index]];
			onUpdate();
		});
		moveBar.appendChild(downBtn);
	}

	el.appendChild(moveBar);
	return el;
}

/**
 * Resolves the primary user-facing name for a routine step.
 * Falls back to attached exercise names if step.label is missing or generic.
 * @param {Object} step
 * @returns {string}
 */
export function getStepDisplayName(step) {
	if (!step) return 'Exercise';
	const rawLabel = typeof step.label === 'string' ? step.label.trim() : '';
	if (step.customLabel && rawLabel) {
		return rawLabel;
	}
	if (Array.isArray(step.exercises) && step.exercises.length > 0) {
		const names = step.exercises
			.map(e => {
				const eid = typeof e === 'object' ? (e.id || e.name) : e;
				const fullEx = getExerciseById(eid);
				return fullEx?.name || (typeof e === 'object' ? (e.name || e.id) : e);
			})
			.filter(Boolean);

		if (!step.customLabel) {
			const matchesCurrent = names.length > 0 && (
				rawLabel.toLowerCase() === names.join(' + ').toLowerCase() ||
				rawLabel.toLowerCase() === names.join(' ⮀ ').toLowerCase()
			);
			const matchesSaved = step.exercises.some(e => {
				const savedName = typeof e === 'object' ? e.name : null;
				return savedName && rawLabel.toLowerCase() === savedName.toLowerCase();
			});

			if (matchesCurrent || matchesSaved || !rawLabel || rawLabel === 'Exercise' || rawLabel === 'Video Clip' || rawLabel === 'Timer') {
				if (names.length > 0) {
					return names.join(step.flow_type === 'alternating' ? ' ⮀ ' : ' + ');
				}
			}
		}

		if (rawLabel && rawLabel !== 'Exercise' && rawLabel !== 'Video Clip' && rawLabel !== 'Timer') {
			return rawLabel;
		}

		if (names.length > 0) {
			return names.join(step.flow_type === 'alternating' ? ' ⮀ ' : ' + ');
		}
	}
	if (rawLabel && rawLabel !== 'Exercise' && rawLabel !== 'Video Clip' && rawLabel !== 'Timer') {
		return rawLabel;
	}
	if (isBreakStep(step)) return 'Rest';
	if (step.type === 'clip') return 'Video Clip';
	return 'Exercise';
}

export { isBreakStep };

/**
 * Auto-resolve the media/GIF URL for a step (delegates to dynamic resolveStepVisual).
 * @param {Object} step
 * @returns {string|null}
 */
export function resolveStepMediaUrl(step) {
	return resolveStepVisual(step);
}


/**
 * Create compact input fields for a break/rest step.
 */
function createBreakFields(step, onUpdate) {
	const container = document.createElement('div');
	container.className = 'break-fields-container';

	const row = document.createElement('div');
	row.className = 'break-controls-row';

	// Quick Duration Presets: 5s, 30s, 1m, 2m
	const presetsGroup = document.createElement('div');
	presetsGroup.className = 'break-presets-group';

	const breakPresets = [
		{ label: '5s', sec: 5 },
		{ label: '30s', sec: 30 },
		{ label: '1m', sec: 60 },
		{ label: '2m', sec: 120 },
	];

	const curSec = step.durationSeconds || 30;

	// Custom duration & stepper group
	const stepperGroup = document.createElement('div');
	stepperGroup.className = 'break-stepper-group';

	const decBtn = document.createElement('button');
	decBtn.type = 'button';
	decBtn.className = 'break-stepper-btn';
	decBtn.title = 'Decrease rest time (-5s, Shift for -15s)';
	decBtn.innerHTML = '−';

	const customInput = document.createElement('input');
	customInput.type = 'text';
	customInput.className = 'break-custom-input clean-input';
	customInput.placeholder = '0:30';
	customInput.value = formatTime(curSec);
	customInput.autocomplete = 'off';
	customInput.autocorrect = 'off';
	customInput.autocapitalize = 'off';
	customInput.spellcheck = false;
	customInput.title = 'Rest duration (up/down arrows or type MM:SS)';

	const incBtn = document.createElement('button');
	incBtn.type = 'button';
	incBtn.className = 'break-stepper-btn';
	incBtn.title = 'Increase rest time (+5s, Shift for +15s)';
	incBtn.innerHTML = '+';

	customInput.addEventListener('focus', () => {
		customInput.select();
	});

	const presetButtons = [];

	function updateActivePreset(sec) {
		presetButtons.forEach(({ btn, sec: pSec }) => {
			if (sec === pSec) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		});
	}

	const setDuration = (newSec) => {
		const clamped = Math.max(1, newSec);
		step.durationSeconds = clamped;
		customInput.value = formatTime(clamped);
		updateActivePreset(clamped);
		onUpdate();
	};

	decBtn.addEventListener('click', (e) => {
		const delta = e.shiftKey ? 15 : 5;
		const cur = parseTime(customInput.value) || step.durationSeconds || 30;
		setDuration(cur - delta);
	});

	incBtn.addEventListener('click', (e) => {
		const delta = e.shiftKey ? 15 : 5;
		const cur = parseTime(customInput.value) || step.durationSeconds || 30;
		setDuration(cur + delta);
	});

	customInput.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			const delta = e.shiftKey ? 15 : 5;
			const cur = parseTime(customInput.value) || step.durationSeconds || 30;
			setDuration(cur + delta);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			const delta = e.shiftKey ? 15 : 5;
			const cur = parseTime(customInput.value) || step.durationSeconds || 30;
			setDuration(cur - delta);
		} else if (e.key === 'Enter') {
			customInput.blur();
		}
	});

	const commitCustom = () => {
		const parsed = parseTime(customInput.value);
		const newSec = Math.max(1, parsed || 30);
		setDuration(newSec);
	};

	customInput.addEventListener('change', commitCustom);
	customInput.addEventListener('blur', commitCustom);

	breakPresets.forEach(p => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'preset-chip break-preset-chip';
		if (curSec === p.sec) btn.classList.add('active');
		btn.textContent = p.label;
		btn.addEventListener('click', () => {
			setDuration(p.sec);
		});
		presetsGroup.appendChild(btn);
		presetButtons.push({ btn, sec: p.sec });
	});

	stepperGroup.append(decBtn, customInput, incBtn);
	row.append(presetsGroup, stepperGroup);
	container.appendChild(row);

	return container;
}

/**
 * Reusable exercise tag chips and searchable combobox dropdown component.
 */
function createExercisePicker(step, onUpdate) {
	if (!step.exercises) step.exercises = [];

	const container = document.createElement('div');
	container.className = 'step-exercise-picker-compact';

	// Tag chips list
	const chipList = document.createElement('div');
	chipList.className = 'step-exercise-chips';

	function renderChips() {
		chipList.innerHTML = '';
		step.exercises.forEach((ex, i) => {
			const chip = document.createElement('div');
			chip.className = 'step-ex-chip';
			chip.title = `Click to view "${ex.name}" exercise guide & videos`;
			chip.style.cursor = 'pointer';
			chip.innerHTML = `
				${getCategoryBadgeHtml(ex.category)}
				<span class="step-ex-name">${escapeHtml(ex.name)}</span>
				${ex.discipline ? getDisciplineBadgeHtml(ex.discipline) : ''}
				<button type="button" class="btn-remove-ex-chip" title="Remove movement">✕</button>
			`;
			chip.addEventListener('click', () => {
				const fullEx = (ex.id ? getExerciseById(ex.id) : null) || ex;
				showExerciseVariationsModal(fullEx, {
					onUpdated: () => {
						renderChips();
						onUpdate();
					}
				});
			});
			const removeBtn = chip.querySelector('.btn-remove-ex-chip');
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				step.exercises.splice(i, 1);
				renderChips();
				onUpdate();
			});
			chipList.appendChild(chip);
		});
	}

	renderChips();
	container.appendChild(chipList);

	// Autocomplete combobox
	const combobox = document.createElement('div');
	combobox.className = 'ex-combobox-wrapper ex-combobox-compact';

	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'input ex-combobox-input ex-combobox-input-compact clean-input';
	input.placeholder = '+ Tag movement (e.g. Teep, Push-ups)...';
	input.autocomplete = 'off';
	input.autocorrect = 'off';
	input.autocapitalize = 'off';
	input.spellcheck = false;

	const dropdown = document.createElement('div');
	dropdown.className = 'ex-combobox-dropdown hidden';

	function updateDropdown() {
		const query = input.value.trim();
		const matches = filterExercises(query);

		dropdown.innerHTML = '';
		if (matches.length === 0 && query) {
			const createOpt = document.createElement('div');
			createOpt.className = 'ex-dropdown-item ex-dropdown-create';
			createOpt.innerHTML = `<span>➕ Create custom exercise "<strong>${escapeHtml(query)}</strong>"</span>`;
			createOpt.addEventListener('mousedown', async (e) => {
				e.preventDefault();
				const created = await createCustomExercise({
					name: query,
					category: 'strength',
					discipline: 'general',
					default_mode: step.stepMode || 'reps'
				});
				step.exercises.push({
					id: created.id,
					name: created.name,
					category: created.category,
					discipline: created.discipline
				});
				if (!step.customLabel && (!step.label || step.label === 'Exercise' || step.label === 'Video Clip')) {
					step.label = step.exercises.map(ex => ex.name).join(' + ');
				}
				input.value = '';
				dropdown.classList.add('hidden');
				renderChips();
				onUpdate();
			});
			dropdown.appendChild(createOpt);
		} else {
			matches.slice(0, 10).forEach(item => {
				const isAlready = step.exercises.some(e => e.id === item.id || e.name === item.name);
				const row = document.createElement('div');
				row.className = `ex-dropdown-item ${isAlready ? 'is-selected' : ''}`;
				row.innerHTML = `
					<div class="ex-dropdown-left">
						${getCategoryBadgeHtml(item.category)}
						<span class="ex-dropdown-name">${escapeHtml(item.name)}</span>
					</div>
					<div class="ex-dropdown-right">
						${item.discipline ? getDisciplineBadgeHtml(item.discipline) : ''}
						${isAlready ? '<span class="ex-check">✓</span>' : ''}
					</div>
				`;
				row.addEventListener('mousedown', (e) => {
					e.preventDefault();
					if (!isAlready) {
						step.exercises.push({
							id: item.id,
							name: item.name,
							category: item.category,
							discipline: item.discipline
						});
						if (!step.customLabel && (!step.label || step.label === 'Exercise' || step.label === 'Video Clip')) {
							step.label = step.exercises.map(ex => ex.name).join(' + ');
						}
						if (item.media_url && !step.gifUrl && !step.mediaUrl) {
							step.gifUrl = item.media_url;
						}
						if (item.default_mode && !step.stepMode) {
							step.stepMode = item.default_mode;
							if (item.default_mode === 'reps' && item.default_quantity) {
								step.targetReps = item.default_quantity;
							} else if (item.default_mode === 'time' && item.default_quantity) {
								step.durationSeconds = item.default_quantity;
							}
						}
						input.value = '';
						dropdown.classList.add('hidden');
						renderChips();
						onUpdate();
					}
				});
				dropdown.appendChild(row);
			});
		}

		dropdown.classList.remove('hidden');
	}

	input.addEventListener('focus', () => {
		updateDropdown();
	});

	let pickerDebounceTimer = null;
	input.addEventListener('input', () => {
		clearTimeout(pickerDebounceTimer);
		pickerDebounceTimer = setTimeout(() => {
			updateDropdown();
		}, 80);
	});

	input.addEventListener('blur', () => {
		clearTimeout(pickerDebounceTimer);
		setTimeout(() => {
			dropdown.classList.add('hidden');
		}, 250);
	});

	combobox.append(input, dropdown);
	container.appendChild(combobox);

	return container;
}

/**
 * Create compact input fields for a timer or reps step.
 */
function createTimerFields(step, onUpdate) {
	const frag = document.createDocumentFragment();

	// Ensure defaults
	if (!step.musicTracks) step.musicTracks = [];
	if (!step.exercises) step.exercises = [];
	if (!step.stepMode) step.stepMode = step.targetReps ? 'reps' : 'time';

	// 1. Tagged movements / exercise chips
	frag.appendChild(createExercisePicker(step, onUpdate));

	// 2. Compact Control Row: Mode + Presets + Stepper (+ optional follow-along video badge)
	const hasVideo = hasStepVideo(step);

	if (hasVideo) {
		const vidAsset = resolveStepVideo(step);
		const startSec = vidAsset?.startSeconds ?? (step.startSeconds || 0);
		const endSec = vidAsset?.endSeconds ?? (step.endSeconds || (startSec + 60));
		const dur = Math.max(1, endSec - startSec);
		const videoPill = document.createElement('div');
		videoPill.className = 'step-fixed-video-pill';
		videoPill.innerHTML = `
			<span class="fixed-video-icon">🎬</span>
			<span class="fixed-video-title">Follow-Along Video Drill</span>
			<span class="fixed-video-dur">${formatTime(dur)} loop</span>
			<span class="fixed-video-timestamps">(${formatTime(startSec)} → ${formatTime(endSec)})</span>
		`;
		frag.appendChild(videoPill);
	}

	const row = document.createElement('div');
	row.className = 'timer-controls-row';

	// Mode Switcher: Timed vs Reps (inline segmented button)
	const modeToggle = document.createElement('div');
	modeToggle.className = 'step-mode-segmented-compact';

	const timedBtn = document.createElement('button');
	timedBtn.type = 'button';
	timedBtn.className = `btn-mode-seg ${step.stepMode !== 'reps' ? 'active' : ''}`;
	timedBtn.innerHTML = `⏱️ Time`;
		timedBtn.addEventListener('click', () => {
			step.stepMode = 'time';
			step.targetReps = 0;
			if (!step.durationSeconds) step.durationSeconds = 30;
			onUpdate();
		});

		const repsBtn = document.createElement('button');
		repsBtn.type = 'button';
		repsBtn.className = `btn-mode-seg ${step.stepMode === 'reps' ? 'active' : ''}`;
		repsBtn.innerHTML = `🔢 Reps`;
		if (hasVideo) {
			repsBtn.disabled = true;
			repsBtn.title = 'Follow-along video steps are always timed';
		}
		repsBtn.addEventListener('click', () => {
			step.stepMode = 'reps';
			if (!step.targetReps) step.targetReps = 20;
			onUpdate();
		});

	modeToggle.append(timedBtn, repsBtn);

	// Presets & Stepper Group
	const presetsGroup = document.createElement('div');
	presetsGroup.className = 'timer-presets-group';

	const stepperGroup = document.createElement('div');
	stepperGroup.className = 'timer-stepper-group';

	if (step.stepMode === 'reps') {
		const curReps = step.targetReps || 20;

		const decBtn = document.createElement('button');
		decBtn.type = 'button';
		decBtn.className = 'break-stepper-btn';
		decBtn.innerHTML = '−';
		decBtn.title = 'Decrease reps (-5, Shift for -10)';

		const repsInp = document.createElement('input');
		repsInp.type = 'number';
		repsInp.min = '1';
		repsInp.className = 'break-custom-input clean-input';
		repsInp.value = curReps;
		repsInp.autocomplete = 'off';
		repsInp.autocorrect = 'off';
		repsInp.autocapitalize = 'off';
		repsInp.spellcheck = false;
		repsInp.addEventListener('wheel', () => {
			if (document.activeElement === repsInp) repsInp.blur();
		}, { passive: true });

		const incBtn = document.createElement('button');
		incBtn.type = 'button';
		incBtn.className = 'break-stepper-btn';
		incBtn.innerHTML = '+';
		incBtn.title = 'Increase reps (+5, Shift for +10)';

		const repsPresets = [10, 15, 20, 25, 30, 50];
		const presetButtons = [];
		function updateActivePreset(val) {
			presetButtons.forEach(({ btn, r }) => {
				if (val === r) btn.classList.add('active');
				else btn.classList.remove('active');
			});
		}

		const setReps = (val) => {
			const clamped = Math.max(1, parseInt(val, 10) || 20);
			step.targetReps = clamped;
			repsInp.value = clamped;
			updateActivePreset(clamped);
			onUpdate();
		};

		decBtn.addEventListener('click', (e) => {
			const delta = e.shiftKey ? 10 : 5;
			setReps((step.targetReps || 20) - delta);
		});

		incBtn.addEventListener('click', (e) => {
			const delta = e.shiftKey ? 10 : 5;
			setReps((step.targetReps || 20) + delta);
		});

		repsInp.addEventListener('focus', () => repsInp.select());
		repsInp.addEventListener('change', () => setReps(repsInp.value));

		repsPresets.forEach(r => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'preset-chip break-preset-chip';
			if (curReps === r) btn.classList.add('active');
			btn.textContent = `${r}`;
			btn.title = `${r} reps`;
			btn.addEventListener('click', () => setReps(r));
			presetsGroup.appendChild(btn);
			presetButtons.push({ btn, r });
		});

		stepperGroup.append(decBtn, repsInp, incBtn);
	} else {
		const curSec = step.durationSeconds || 30;

		const decBtn = document.createElement('button');
		decBtn.type = 'button';
		decBtn.className = 'break-stepper-btn';
		decBtn.innerHTML = '−';
		decBtn.title = 'Decrease duration (-5s, Shift for -15s)';

		const customInput = document.createElement('input');
		customInput.type = 'text';
		customInput.className = 'break-custom-input clean-input';
		customInput.placeholder = '0:30';
		customInput.value = formatTime(curSec);
		customInput.autocomplete = 'off';
		customInput.autocorrect = 'off';
		customInput.autocapitalize = 'off';
		customInput.spellcheck = false;

		const incBtn = document.createElement('button');
		incBtn.type = 'button';
		incBtn.className = 'break-stepper-btn';
		incBtn.innerHTML = '+';
		incBtn.title = 'Increase duration (+5s, Shift for +15s)';

		const timePresets = [
			{ label: '15s', sec: 15 },
			{ label: '30s', sec: 30 },
			{ label: '45s', sec: 45 },
			{ label: '1m', sec: 60 },
			{ label: '2m', sec: 120 },
			{ label: '3m', sec: 180 },
		];
		const presetButtons = [];
		function updateActivePreset(sec) {
			presetButtons.forEach(({ btn, pSec }) => {
				if (sec === pSec) btn.classList.add('active');
				else btn.classList.remove('active');
			});
		}

		const setDuration = (newSec) => {
			const clamped = Math.max(1, newSec);
			step.durationSeconds = clamped;
			customInput.value = formatTime(clamped);
			updateActivePreset(clamped);
			onUpdate();
		};

		decBtn.addEventListener('click', (e) => {
			const delta = e.shiftKey ? 15 : 5;
			const cur = parseTime(customInput.value) || step.durationSeconds || 30;
			setDuration(cur - delta);
		});

		incBtn.addEventListener('click', (e) => {
			const delta = e.shiftKey ? 15 : 5;
			const cur = parseTime(customInput.value) || step.durationSeconds || 30;
			setDuration(cur + delta);
		});

		customInput.addEventListener('focus', () => customInput.select());
		customInput.addEventListener('change', () => {
			const parsed = parseTime(customInput.value);
			setDuration(Math.max(1, parsed || 30));
		});

		timePresets.forEach(p => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'preset-chip break-preset-chip';
			if (curSec === p.sec) btn.classList.add('active');
			btn.textContent = p.label;
			btn.addEventListener('click', () => setDuration(p.sec));
			presetsGroup.appendChild(btn);
			presetButtons.push({ btn, pSec: p.sec });
		});

		stepperGroup.append(decBtn, customInput, incBtn);
	}

	row.append(modeToggle, presetsGroup, stepperGroup);
	frag.appendChild(row);

	return frag;
}

/**
 * Create a simple, clean time input field.
 * Auto-selects on focus so user can immediately type a new number without backspacing.
 * Supports typing seconds ("45", "90") or MM:SS ("1:30") and formats cleanly on blur/Enter.
 */
function createTimeField(labelText, valueSeconds, onChange, placeholder = '0:00', emptyWhenZero = false, stepSeconds = 5) {
	const group = document.createElement('div');
	group.className = 'field-group';

	const label = document.createElement('label');
	label.textContent = labelText;

	const stepper = document.createElement('div');
	stepper.className = 'time-stepper-control';

	const decBtn = document.createElement('button');
	decBtn.type = 'button';
	decBtn.className = 'stepper-btn stepper-btn-dec';
	decBtn.innerHTML = '−';
	decBtn.title = `Decrease (-${stepSeconds}s, Shift for -15s)`;

	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'stepper-input clean-input';
	input.placeholder = placeholder;
	input.value = (valueSeconds === 0 && emptyWhenZero) ? '' : (valueSeconds > 0 ? formatTime(valueSeconds) : '');
	input.autocomplete = 'off';
	input.autocorrect = 'off';
	input.autocapitalize = 'off';
	input.spellcheck = false;

	const incBtn = document.createElement('button');
	incBtn.type = 'button';
	incBtn.className = 'stepper-btn stepper-btn-inc';
	incBtn.innerHTML = '+';
	incBtn.title = `Increase (+${stepSeconds}s, Shift for +15s)`;

	// Select all on focus so user can immediately type over the existing value
	input.addEventListener('focus', () => {
		input.select();
	});

	const setVal = (newSec) => {
		const clamped = emptyWhenZero ? Math.max(0, newSec) : Math.max(1, newSec);
		input.value = (clamped === 0 && emptyWhenZero) ? '' : formatTime(clamped);
		onChange(clamped);
	};

	decBtn.addEventListener('click', (e) => {
		const delta = e.shiftKey ? 15 : stepSeconds;
		const cur = parseTime(input.value) || valueSeconds || 30;
		setVal(cur - delta);
	});

	incBtn.addEventListener('click', (e) => {
		const delta = e.shiftKey ? 15 : stepSeconds;
		const cur = parseTime(input.value) || valueSeconds || 30;
		setVal(cur + delta);
	});

	const commit = () => {
		const parsed = parseTime(input.value);
		input.value = (parsed === 0 && emptyWhenZero) ? '' : formatTime(parsed);
		onChange(parsed);
	};

	input.addEventListener('change', commit);
	input.addEventListener('blur', commit);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			const delta = e.shiftKey ? 15 : stepSeconds;
			const cur = parseTime(input.value) || valueSeconds || 30;
			setVal(cur + delta);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			const delta = e.shiftKey ? 15 : stepSeconds;
			const cur = parseTime(input.value) || valueSeconds || 30;
			setVal(cur - delta);
		} else if (e.key === 'Enter') {
			input.blur();
		}
	});

	stepper.append(decBtn, input, incBtn);
	group.append(label, stepper);
	return group;
}

/**
 * Fetch video title using YouTube oEmbed.
 */
async function fetchVideoTitle(videoId, callback) {
	try {
		const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
		if (res.ok) {
			const data = await res.json();
			if (data && data.title) {
				callback(data.title);
			}
		}
	} catch {
		// Silent failure
	}
}

/**
 * Create a standard input field group.
 */
function createField(labelText, value, onChange, placeholder = '') {
	const group = document.createElement('div');
	group.className = 'field-group';

	const label = document.createElement('label');
	label.textContent = labelText;

	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'input clean-input';
	input.value = value || '';
	input.placeholder = placeholder;
	input.autocomplete = 'off';
	input.autocorrect = 'off';
	input.autocapitalize = 'off';
	input.spellcheck = false;
	input.addEventListener('change', (e) => onChange(e.target.value));

	group.append(label, input);
	return group;
}

/**
 * Initialize drag-and-drop reordering for steps.
 */
function initDragAndDrop(container, routine, onUpdate) {
	container._dndRoutine = routine;
	container._dndOnUpdate = onUpdate;

	if (container._dndInitialized) {
		return;
	}
	container._dndInitialized = true;

	let dragIndex = null;
	let activeDropSlot = null;
	let isDraggingActive = false;

	const clearDropTargets = () => {
		container.querySelectorAll('.step-insert-divider.drop-target-active').forEach(div => {
			div.classList.remove('drop-target-active');
		});
		activeDropSlot = null;
	};

	container.addEventListener('dragstart', (e) => {
		const card = e.target.closest('.step-card');
		if (!card || !container.contains(card)) return;

		// Prevent drag start when interacting with form inputs, buttons, sliders, or insert dividers
		if (e.target.closest('button, input, select, textarea, a, .break-stepper-btn, .timer-preset-pill, .break-preset-btn, .step-insert-divider')) {
			e.preventDefault();
			return;
		}

		dragIndex = parseInt(card.dataset.index, 10);
		if (isNaN(dragIndex)) return;

		isDraggingActive = true;
		container._isDraggingStep = true;
		e.dataTransfer.effectAllowed = 'move';
		try {
			e.dataTransfer.setData('text/plain', String(dragIndex));
		} catch (_) {
			// Safari/fallback
		}

		// Defer class application so browser drag image snapshot captures the full card
		setTimeout(() => {
			if (isDraggingActive) {
				card.classList.add('dragging');
				container.classList.add('is-dragging-step');
			}
		}, 0);
	});

	container.addEventListener('dragend', () => {
		isDraggingActive = false;
		setTimeout(() => {
			container._isDraggingStep = false;
		}, 60);

		container.querySelectorAll('.step-card.dragging').forEach(c => c.classList.remove('dragging'));
		container.classList.remove('is-dragging-step');
		clearDropTargets();
		dragIndex = null;
	});

	container.addEventListener('dragover', (e) => {
		e.preventDefault();
		if (dragIndex === null) return;
		e.dataTransfer.dropEffect = 'move';

		// Auto-scroll when near top or bottom edges of viewport / editor container
		const scrollContainer = container.closest('#editor-view') || container;
		const scrollRect = scrollContainer.getBoundingClientRect();
		const edgeZone = 60;
		if (e.clientY < scrollRect.top + edgeZone) {
			scrollContainer.scrollTop -= 12;
		} else if (e.clientY > scrollRect.bottom - edgeZone) {
			scrollContainer.scrollTop += 12;
		}

		const cards = [...container.querySelectorAll('.step-card')];
		if (cards.length === 0) return;

		// Determine target insertion slot (0 to cards.length) based on card midpoints
		let targetSlot = cards.length;
		for (let i = 0; i < cards.length; i++) {
			const rect = cards[i].getBoundingClientRect();
			const midY = rect.top + rect.height / 2;
			if (e.clientY < midY) {
				targetSlot = i;
				break;
			}
		}

		// If targetSlot is the dragged item's current position (before or after itself), it's a no-op
		if (targetSlot === dragIndex || targetSlot === dragIndex + 1) {
			clearDropTargets();
			return;
		}

		if (activeDropSlot !== targetSlot) {
			clearDropTargets();
			const divider = container.querySelector(`.step-insert-divider[data-insert-index="${targetSlot}"]`);
			if (divider) {
				divider.classList.add('drop-target-active');
				activeDropSlot = targetSlot;
			}
		}
	});

	container.addEventListener('dragleave', (e) => {
		if (!container.contains(e.relatedTarget)) {
			clearDropTargets();
		}
	});

	container.addEventListener('drop', (e) => {
		e.preventDefault();
		const currentDragIndex = dragIndex;
		const targetSlot = activeDropSlot;

		isDraggingActive = false;
		setTimeout(() => {
			container._isDraggingStep = false;
		}, 60);

		clearDropTargets();
		container.classList.remove('is-dragging-step');
		container.querySelectorAll('.step-card.dragging').forEach(c => c.classList.remove('dragging'));
		dragIndex = null;

		if (currentDragIndex === null || targetSlot === null) return;
		if (targetSlot === currentDragIndex || targetSlot === currentDragIndex + 1) return;

		const currentRoutine = container._dndRoutine;
		const currentOnUpdate = container._dndOnUpdate;
		if (!currentRoutine || !Array.isArray(currentRoutine.steps)) return;

		const [movedItem] = currentRoutine.steps.splice(currentDragIndex, 1);
		if (!movedItem) return;

		const destinationIndex = targetSlot > currentDragIndex ? targetSlot - 1 : targetSlot;
		currentRoutine.steps.splice(destinationIndex, 0, movedItem);

		if (typeof currentOnUpdate === 'function') {
			currentOnUpdate();
		}

		if (movedItem.id) {
			requestAnimationFrame(() => highlightStepElement(movedItem.id));
		}
	});
}

/**
 * Create a new clip step with defaults.
 * @returns {Object} Step object
 */
export function createClipStep() {
	return {
		id: generateId(),
		type: 'clip',
		videoId: '',
		startSeconds: 0,
		endSeconds: 60,
		label: 'Video Clip',
		exercises: [],
	};
}

/**
 * Create a new timer step with defaults.
 * @returns {Object} Step object
 */
export function createTimerStep() {
	return {
		id: generateId(),
		type: 'timer',
		stepMode: 'time',
		durationSeconds: 30,
		targetReps: 0,
		label: 'Exercise',
		exercises: [],
		musicTracks: [],
	};
}

/**
 * Create a new break/rest timer step with defaults.
 * @param {number} [durationSeconds=60]
 * @returns {Object} Step object
 */
export function createBreakStep(durationSeconds = 60) {
	return {
		id: generateId(),
		type: 'timer',
		subtype: 'break',
		stepMode: 'time',
		durationSeconds: durationSeconds,
		label: 'Rest',
		exercises: [],
		musicTracks: [],
	};
}

/**
 * Create a new step from an exercise definition.
 * Always produces a time or reps step; follow-along media is resolved
 * dynamically from the exercise library, not baked into the step.
 * @param {Object} ex
 * @returns {Object} Step object
 */
export function createStepFromExercise(ex) {
	if (!ex) return createTimerStep();
	const isReps = (ex.default_mode || 'reps') === 'reps';
	const quantity = ex.default_quantity || (isReps ? 20 : 30);
	const asset = getExerciseFollowAlongMedia(ex);

	const newStep = createTimerStep();
	newStep.label = ex.name;
	newStep.stepMode = isReps ? 'reps' : 'time';
	newStep.targetReps = isReps ? quantity : 0;
	newStep.durationSeconds = !isReps ? quantity : 30;

	if (asset?.url || ex.media_url) {
		newStep.gifUrl = asset?.url || ex.media_url || '';
		newStep.mediaUrl = asset?.url || ex.media_url || '';
	}
	newStep.exercises = [{ id: ex.id, name: ex.name, category: ex.category, discipline: ex.discipline }];
	return newStep;
}

/**
 * Create a new step from a combo definition.
 * Always produces a time or reps step; the combo's demonstration media is
 * resolved dynamically, not baked into the step.
 * @param {Object} combo
 * @returns {Object} Step object
 */
export function createStepFromCombo(combo) {
	if (!combo) return createTimerStep();
	const exList = (combo.exercise_ids || []).map(id => {
		if (typeof id === 'object' && id !== null) {
			const resolved = id.id ? getExerciseById(id.id) : null;
			return {
				id: id.id || '',
				name: id.name || resolved?.name || id.id || 'Exercise',
				category: id.category || resolved?.category || '',
				discipline: id.discipline || resolved?.discipline || ''
			};
		}
		const resolved = getExerciseById(id);
		return {
			id,
			name: resolved?.name || id || 'Exercise',
			category: resolved?.category || '',
			discipline: resolved?.discipline || ''
		};
	});
	const isReps = combo.default_mode === 'reps';

	const newStep = createTimerStep();
	newStep.label = combo.name;
	newStep.stepMode = isReps ? 'reps' : 'time';
	newStep.targetReps = isReps ? (combo.default_quantity || 20) : 0;
	newStep.durationSeconds = !isReps ? (combo.default_quantity || 190) : 30;

	newStep.combo_id = combo.id;
	newStep.flow_type = combo.flow_type || 'alternating';
	newStep.exercises = exList;
	return newStep;
}

/**
 * Create a new empty routine.
 * @param {string} title
 * @returns {Object} Routine object
 */
export function createRoutine(title) {
	return {
		id: generateId(),
		title: title || 'New Workout',
		musicTracks: [],
		steps: [],
	};
}

/**
 * Open the Anatomical Muscle Navigator modal to browse, inspect, and add exercises to the active routine.
 * Clicking an exercise card body opens the full Exercise Variations / Cues HUD overlay.
 * Clicking the "+ Add" button commits the movement directly into the workout routine.
 * @param {Object} routine
 * @param {Function} onUpdate
 * @param {number} [insertIndex=-1] - Optional index to insert at (defaults to end)
 */
export function showAddExerciseModal(routine, onUpdate, insertIndex = -1) {
	const allExercises = getExercises();

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop modal-exercise-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-window modal-add-navigator';

	const isInserting = typeof insertIndex === 'number' && insertIndex >= 0;
	const titleText = isInserting ? `🥋 Select Exercise (Insert at #${insertIndex + 1})` : '🥋 Select Exercise';

	modal.innerHTML = `
		<div class="modal-header">
			<div style="display:flex; align-items:center; gap:10px;">
				<h3 class="modal-title">${titleText}</h3>
				<span class="badge-count" id="nav-count-badge">0 movements</span>
			</div>
			<button class="modal-close-btn" title="Close">✕</button>
		</div>

		<div class="modal-body">
			<!-- Filter Toolbar -->
			<div class="nav-filter-toolbar">
				<div class="search-box-wrapper">
					<span class="search-icon">${getSearchIcon(16)}</span>
					<input type="text" class="input search-box-input nav-search-input clean-input" id="nav-search" placeholder="Search exercises, disciplines, or muscles (e.g. Teep, Quads, Push-ups)..." autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
				</div>

				<div class="nav-pills-row" id="nav-discipline-pills">
					<span class="nav-pill-label">Discipline</span>
					${getDisciplineFilterPillsHtml()}
				</div>

				<div class="nav-pills-row" id="nav-media-pills">
					<span class="nav-pill-label">Media Filter</span>
					<button type="button" class="nav-filter-pill active" data-media="all">All Types</button>
					<button type="button" class="nav-filter-pill" data-media="video"><span class="chip-svg-wrap">${getClipIcon(12)}</span> Has Video</button>
					<button type="button" class="nav-filter-pill" data-media="gif"><span class="chip-svg-wrap">${getMediaKindIcon('animation', 12)}</span> Has GIF / Loop</button>
					<button type="button" class="nav-filter-pill" data-media="tutorial"><span class="chip-svg-wrap">${getMediaKindIcon('instruction', 12)}</span> Has Tutorial</button>
				</div>
			</div>

			<!-- 2-Column Anatomical Navigator -->
			<div class="nav-muscle-layout">
				<div class="nav-muscle-sidebar" id="nav-muscle-sidebar"></div>
				<div class="nav-exercise-list-pane" id="nav-exercise-list"></div>
			</div>
		</div>
	`;

	const close = () => {
		document.removeEventListener('keydown', handleEsc);
		backdrop.remove();
	};

	const handleEsc = (e) => {
		if (e.key !== 'Escape' && e.keyCode !== 27) return;
		const modalDlg = document.getElementById('modal-backdrop');
		if (modalDlg && !modalDlg.classList.contains('hidden')) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		close();
	};
	document.addEventListener('keydown', handleEsc);

	modal.querySelector('.modal-close-btn').addEventListener('click', close);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	const searchInput = modal.querySelector('#nav-search');
	const sidebarEl = modal.querySelector('#nav-muscle-sidebar');
	const listEl = modal.querySelector('#nav-exercise-list');
	const countBadge = modal.querySelector('#nav-count-badge');

	let activeRegion = 'all';
	let activeDiscipline = 'all';
	let activeMedia = 'all';
	let searchQuery = '';
	let searchDebounceTimer = null;

	// Pre-index exercise attributes to make filtering and rendering instantaneous
	const indexedExercises = allExercises.map(ex => {
		const fullEx = ex;
		const muscles = inferMusclesForExercise(fullEx);
		const primaryPills = (muscles.primary || []).map(m => getMuscleBadgeHtml(m, true)).join('');
		const allTargetMuscles = [...(muscles.primary || []), ...(muscles.secondary || [])];
		const followAlong = getExerciseFollowAlongMedia(fullEx);
		const assets = getExerciseMediaAssets([fullEx]);
		const isVid = Boolean(followAlong && (followAlong.type === 'video' || followAlong.videoId));
		const vid = isVid ? (followAlong.videoId || parseYouTubeId(followAlong.url)) : null;
		const hasVid = isVid || assets.some(a => a.type === 'video' || a.videoId);
		const hasGifOrImg = Boolean(fullEx.media_url || assets.some(a => a.type === 'image' || a.kind === 'animation' || a.kind === 'photo'));
		const hasTutorial = assets.some(a => a.kind === 'instruction');

		const searchBlob = `${fullEx.name || ''} ${fullEx.discipline || ''} ${fullEx.category || ''} ${allTargetMuscles.join(' ')} ${fullEx.description || ''}`.toLowerCase();

		return {
			fullEx,
			muscles,
			primaryPills,
			allTargetMuscles,
			followAlong,
			assets,
			isVid,
			vid,
			hasVid,
			hasGifOrImg,
			hasTutorial,
			searchBlob
		};
	});

	function matchesRegion(item, regionId) {
		if (regionId === 'all') return true;
		const region = ANATOMICAL_REGIONS.find(r => r.id === regionId);
		if (!region) return true;

		if (region.categories && region.categories.includes(item.fullEx.category)) {
			return true;
		}

		if (region.disciplines && region.disciplines.includes(item.fullEx.discipline)) {
			return true;
		}

		if (region.muscles && region.muscles.some(m => item.allTargetMuscles.includes(m))) {
			return true;
		}
		return false;
	}

	function getBaseFiltered() {
		const q = searchQuery.toLowerCase().trim();
		return indexedExercises.filter(item => {
			if (activeDiscipline !== 'all' && item.fullEx.discipline !== activeDiscipline) return false;
			if (activeMedia === 'video' && !item.hasVid) return false;
			if (activeMedia === 'gif' && !item.hasGifOrImg) return false;
			if (activeMedia === 'tutorial' && !item.hasTutorial) return false;
			if (q && !item.searchBlob.includes(q)) return false;
			return true;
		});
	}

	function commitAddExercise(ex) {
		const newStep = createStepFromExercise(ex);

		const idx = appendStepWithBreak(routine, newStep, insertIndex);

		clearTimeout(searchDebounceTimer);
		close();
		onUpdate();
		showToast(`Added "${ex.name}" at step #${idx + 1}`);
		highlightStepElement(newStep.id);
	}

	function renderSidebar() {
		sidebarEl.innerHTML = '';
		const base = getBaseFiltered();
		ANATOMICAL_REGIONS.forEach(reg => {
			const count = reg.id === 'all' ? base.length : base.filter(item => matchesRegion(item, reg.id)).length;
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = `nav-region-btn ${activeRegion === reg.id ? 'active' : ''}`;
			const iconSvg = reg.id === 'all'
				? getExerciseIcon(14)
				: (reg.muscles && reg.muscles.length > 0 ? getMuscleIcon(reg.muscles[0], 14) : getExerciseIcon(14));
			btn.innerHTML = `
				<span class="region-btn-label"><span class="chip-svg-wrap">${iconSvg}</span> ${reg.label}</span>
				<span class="nav-region-count">${count}</span>
			`;
			btn.addEventListener('click', () => {
				activeRegion = reg.id;
				renderSidebar();
				renderList();
			});
			sidebarEl.appendChild(btn);
		});
	}

	function renderList() {
		const base = getBaseFiltered();
		const filtered = activeRegion === 'all' ? base : base.filter(item => matchesRegion(item, activeRegion));
		countBadge.textContent = `${filtered.length} movement${filtered.length === 1 ? '' : 's'}`;
		listEl.innerHTML = '';

		if (filtered.length === 0) {
			listEl.innerHTML = `<div class="empty-sessions" style="padding:40px 20px; text-align:center;"><p style="color:var(--text-muted);">No matching exercises found in this region.</p></div>`;
			return;
		}

		filtered.forEach(({ fullEx, primaryPills, followAlong, isVid, vid }) => {
			const card = document.createElement('div');
			card.className = 'nav-exercise-card';

			let thumbHtml = '';
			if (isVid && vid) {
				thumbHtml = `
					<div class="nav-card-thumb">
						<img src="https://img.youtube.com/vi/${vid}/default.jpg" alt="${escapeHtml(fullEx.name)}" loading="lazy">
						<span class="nav-card-thumb-badge">${getClipIcon(11)}</span>
					</div>
				`;
			} else if (fullEx.media_url || followAlong?.url) {
				thumbHtml = `
					<div class="nav-card-thumb">
						<img src="${fullEx.media_url || followAlong.url}" alt="${escapeHtml(fullEx.name)}" loading="lazy">
						<span class="nav-card-thumb-badge">${getMediaKindIcon('animation', 11)}</span>
					</div>
				`;
			} else {
				thumbHtml = `
					<div class="nav-card-thumb">
						<span class="nav-card-icon-placeholder">${getExerciseIcon(20)}</span>
					</div>
				`;
			}

			const isReps = (fullEx.default_mode || 'reps') === 'reps';
			const qty = fullEx.default_quantity || (isReps ? 20 : 30);
			const unitStr = isReps ? 'reps' : 's';

			card.innerHTML = `
				<div class="nav-card-main" title="Click to view details, cues, and video variations">
					${thumbHtml}
					<div class="nav-card-info">
						<div class="nav-card-title-row">
							<span class="nav-card-title">${escapeHtml(fullEx.name)}</span>
							<span class="nav-card-inspect-hint">Details ↗</span>
						</div>
						<div class="nav-card-tags-row">
							${fullEx.discipline ? getDisciplineBadgeHtml(fullEx.discipline) : ''}
							${fullEx.category ? getCategoryBadgeHtml(fullEx.category) : ''}
							${primaryPills}
						</div>
					</div>
				</div>
				<div class="nav-card-actions">
					<button type="button" class="btn-nav-view" title="Open Full Variations Overlay">View</button>
					<button type="button" class="btn-nav-add" title="Add to Routine">+ Add (${qty}${unitStr})</button>
				</div>
			`;

			let overlayHandle = null;
			const openOverlay = (e) => {
				if (e) e.stopPropagation();
				overlayHandle = showExerciseVariationsModal(fullEx, {
					onUpdated: () => {
						renderSidebar();
						renderList();
						onUpdate();
					},
					onAddToRoutine: () => {
						if (overlayHandle && typeof overlayHandle.close === 'function') {
							overlayHandle.close();
						}
						commitAddExercise(fullEx);
					}
				});
			};

			card.querySelector('.nav-card-main').addEventListener('click', openOverlay);
			card.querySelector('.btn-nav-view').addEventListener('click', openOverlay);

			card.querySelector('.btn-nav-add').addEventListener('click', (e) => {
				e.stopPropagation();
				commitAddExercise(fullEx);
			});

			listEl.appendChild(card);
		});
	}

	function handleSearchChange() {
		searchQuery = searchInput.value;
		renderSidebar();
		renderList();
	}

	searchInput.addEventListener('input', () => {
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(handleSearchChange, 120);
	});

	modal.querySelectorAll('#nav-discipline-pills .nav-filter-pill').forEach(btn => {
		btn.addEventListener('click', () => {
			modal.querySelectorAll('#nav-discipline-pills .nav-filter-pill').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			activeDiscipline = btn.getAttribute('data-disc') || 'all';
			renderSidebar();
			renderList();
		});
	});

	modal.querySelectorAll('#nav-media-pills .nav-filter-pill').forEach(btn => {
		btn.addEventListener('click', () => {
			modal.querySelectorAll('#nav-media-pills .nav-filter-pill').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			activeMedia = btn.getAttribute('data-media') || 'all';
			renderSidebar();
			renderList();
		});
	});

	renderSidebar();
	renderList();

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);
}

/**
 * Open a quick selection modal to add a combo into the active routine.
 * @param {Object} routine
 * @param {Function} onUpdate
 * @param {number} [insertIndex=-1] - Optional index to insert at (defaults to end)
 */
export function showAddComboModal(routine, onUpdate, insertIndex = -1) {
	const combos = getCombos();

	const isInserting = typeof insertIndex === 'number' && insertIndex >= 0;
	const titleText = isInserting ? `Select Combo Flow (Insert at #${insertIndex + 1})` : 'Select Combo Flow';

	const { modal, close } = createCustomModal({
		title: titleText,
		className: 'modal-add-picker-backdrop',
		bodyHtml: `
			<div class="search-box-wrapper" style="margin-bottom:12px;">
				<span class="search-icon">${getSearchIcon(16)}</span>
				<input type="text" id="add-combo-search" class="input search-box-input combo-search-input clean-input" placeholder="Search combos (Star Jumps ⮀ Coordination, Lateral Taps, Jab Knee)..." autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
			</div>

			<div id="add-combo-list" class="add-picker-list"></div>
		`
	});
	modal.classList.add('modal-add-picker');

	const searchInput = modal.querySelector('#add-combo-search');
	const listEl = modal.querySelector('#add-combo-list');

	function renderList(query = '') {
		const filtered = filterCombos(query);
		listEl.innerHTML = '';

		if (filtered.length === 0) {
			listEl.innerHTML = `<div class="empty-sessions"><p>No combos found.</p></div>`;
			return;
		}

		filtered.forEach(combo => {
			const item = document.createElement('div');
			item.className = 'add-picker-item';

			const flowIcon = combo.flow_type === 'alternating' ? '⮀ Alternating' : (combo.flow_type === 'sequence' ? '➔ Flow' : '⚡ Superset');
			const modeStr = combo.default_mode === 'reps'
			? `<span class="chip-svg-wrap">${getRepsIcon(13)}</span> ${formatModeQuantity('reps', combo.default_quantity, { repsFallback: 20 })}`
			: `<span class="chip-svg-wrap">${getTimerIcon(13)}</span> ${formatModeQuantity('time', combo.default_quantity, { secsFallback: 190 })}`;

			item.innerHTML = `
				<div class="add-picker-item-left">
					<span class="combo-flow-badge" style="font-size:0.7rem;padding:2px 6px;">${flowIcon}</span>
					<span class="add-picker-name">${escapeHtml(combo.name)}</span>
				</div>
				<div class="add-picker-item-right">
					<span class="add-picker-mode">${modeStr}</span>
					<button class="btn btn-primary btn-xs">+ Add</button>
				</div>
			`;

			item.addEventListener('click', () => {
				const newStep = createStepFromCombo(combo);

				const idx = appendStepWithBreak(routine, newStep, insertIndex);

				close();
				onUpdate();
				showToast(`Added "${combo.name}" at step #${idx + 1}`);
				highlightStepElement(newStep.id);
			});

			listEl.appendChild(item);
		});
	}

	let comboSearchTimer = null;
	searchInput.addEventListener('input', (e) => {
		clearTimeout(comboSearchTimer);
		comboSearchTimer = setTimeout(() => {
			renderList(e.target.value);
		}, 100);
	});

	renderList();
}

