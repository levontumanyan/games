/**
 * Editor module - Routine & step editing, drag-and-drop reorder.
 */

import { generateId, parseYouTubeId, parseYouTubeInfo, parseTime, formatTime, formatFriendlyDuration, escapeHtml, showToast } from './utils.js';
import { saveAudioFile, deleteAudioFile } from './musicdb.js';
import { showPrompt, showAlert } from './modal.js';
import { getTimerIcon, getBreakIcon, getComboIcon, getExerciseIcon, getDuplicateIcon, getPlusIcon } from './icons.js';
import {
	getCategoryBadgeHtml, getDisciplineBadgeHtml, getMuscleBadgeHtml
} from './taxonomy.js';
import {
	getExercises, getExerciseById, filterExercises, createCustomExercise,
	inferMusclesForExercise, getExerciseMediaAssets, getExerciseFollowAlongMedia
} from './exercises.js';
import { showExerciseVariationsModal } from './exercises_view.js';
import { getCombos } from './combos.js';

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

	container.innerHTML = '';

	if (!routine) {
		container.innerHTML = '<p class="empty-message">Select or create a workout to get started.</p>';
		return;
	}

	// Workout-level background music playlist card
	const musicCard = createRoutineMusicCard(routine, onUpdate);
	container.appendChild(musicCard);

	if (routine.steps.length === 0) {
		const emptyCard = document.createElement('div');
		emptyCard.className = 'editor-empty-steps-card';
		emptyCard.innerHTML = `
			<div class="empty-steps-icon">🥋</div>
			<h4>No steps in this workout yet</h4>
			<p>Choose an option below to start building your routine:</p>
			<div class="editor-empty-actions">
				<button type="button" class="btn btn-primary btn-sm btn-empty-add-ex">🥋 + Add Exercise</button>
				<button type="button" class="btn btn-secondary btn-sm btn-empty-add-break">⏱️ + Add Rest</button>
				<button type="button" class="btn btn-secondary btn-sm btn-empty-add-combo">🔗 + Add Combo</button>
			</div>
		`;
		emptyCard.querySelector('.btn-empty-add-ex').addEventListener('click', () => showAddExerciseModal(routine, onUpdate, 0));
		emptyCard.querySelector('.btn-empty-add-break').addEventListener('click', () => {
			const s = insertBreakStep(routine, 0, 30);
			onUpdate();
			highlightStepElement(s.id);
		});
		emptyCard.querySelector('.btn-empty-add-combo').addEventListener('click', () => showAddComboModal(routine, onUpdate, 0));
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
 * @param {number} [durationSeconds=30]
 * @returns {Object}
 */
export function insertBreakStep(routine, index, durationSeconds = 30) {
	if (!routine) return null;
	if (!Array.isArray(routine.steps)) routine.steps = [];
	const step = createBreakStep(durationSeconds);
	const targetIdx = (typeof index === 'number' && index >= 0 && index <= routine.steps.length) ? index : routine.steps.length;
	routine.steps.splice(targetIdx, 0, step);
	expandStep(step.id);
	return step;
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

	const line = document.createElement('div');
	line.className = 'step-insert-line';

	const addBtn = document.createElement('button');
	addBtn.type = 'button';
	addBtn.className = 'btn-insert-divider';
	addBtn.title = `Insert step here (position #${insertIndex + 1})`;
	addBtn.innerHTML = `${getPlusIcon(12)} <span>Insert Step Here</span>`;

	const menu = document.createElement('div');
	menu.className = 'step-insert-menu hidden';

	const exBtn = document.createElement('button');
	exBtn.type = 'button';
	exBtn.className = 'btn-insert-pill btn-insert-ex';
	exBtn.innerHTML = `🥋 + Exercise`;
	exBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		showAddExerciseModal(routine, onUpdate, insertIndex);
	});

	const breakBtn = document.createElement('button');
	breakBtn.type = 'button';
	breakBtn.className = 'btn-insert-pill btn-insert-break';
	breakBtn.innerHTML = `⏱️ + Rest`;
	breakBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const step = insertBreakStep(routine, insertIndex, 30);
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
		showAddComboModal(routine, onUpdate, insertIndex);
	});

	const closeBtn = document.createElement('button');
	closeBtn.type = 'button';
	closeBtn.className = 'btn-insert-close';
	closeBtn.title = 'Close';
	closeBtn.textContent = '✕';
	closeBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		menu.classList.add('hidden');
		addBtn.classList.remove('hidden');
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
	});

	divider.append(line, addBtn, menu);
	return divider;
}

/**
 * Create a DOM element for a single step.
 */
function createStepElement(step, index, routine, onUpdate, onTestStep) {
	if (!step.id) step.id = generateId();
	const isBreak = isBreakStep(step);
	const isCombo = Boolean((step.exercises && step.exercises.length >= 2) || step.flow_type);
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
	const derivedTitle = step.label || (step.exercises && step.exercises.length > 0 ? step.exercises.map(e => e.name).join(' + ') : (isBreak ? 'Rest' : 'Exercise'));
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
		input.className = 'input input-inline-title-edit';
		input.value = currentVal;
		input.placeholder = derivedTitle;

		const commit = () => {
			const val = input.value.trim();
			if (val && val !== (step.exercises && step.exercises.length > 0 ? step.exercises.map(ex => ex.name).join(' + ') : (isBreak ? 'Rest' : 'Exercise'))) {
				step.label = val;
			} else {
				delete step.label;
			}
			headerTitle.textContent = step.label || (step.exercises && step.exercises.length > 0 ? step.exercises.map(ex => ex.name).join(' + ') : (isBreak ? 'Rest' : 'Exercise'));
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
	if (step.type === 'clip') {
		const dur = Math.max(0, (step.endSeconds || 60) - (step.startSeconds || 0));
		headerMeta.textContent = `${formatTime(dur)} (${formatTime(step.startSeconds || 0)}–${formatTime(step.endSeconds || 60)})`;
	} else if (step.stepMode === 'reps' || (!step.stepMode && Boolean(step.targetReps))) {
		headerMeta.textContent = `${step.targetReps || 20} reps`;
	} else {
		headerMeta.textContent = formatFriendlyDuration(step.durationSeconds || 30);
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
 * Check if a step is a break/rest interval.
 * @param {Object} step
 * @returns {boolean}
 */
export function isBreakStep(step) {
	if (!step) return false;
	if (step.subtype === 'break' || step.isBreak) return true;
	if (step.type === 'timer' && step.label) {
		const l = step.label.trim().toLowerCase();
		if (l === 'rest' || l === 'break' || l === 'quick break' || l.startsWith('rest') || l.startsWith('break') || l === 'recovery' || l === 'breathe' || l === 'pause') return true;
	}
	return false;
}

/**
 * Auto-resolve the media/GIF URL for a step (either from explicit properties or by matching exercise name).
 * @param {Object} step
 * @returns {string|null}
 */
export function resolveStepMediaUrl(step) {
	if (!step) return null;
	const direct = step.gifUrl || step.mediaUrl || step.imageUrl;
	if (direct && typeof direct === 'string' && direct.trim()) {
		const trimmed = direct.trim();
		// If direct is a YouTube link, do not return as direct image URL
		if (!trimmed.includes('youtube.com') && !trimmed.includes('youtu.be')) {
			return trimmed;
		}
	}

	// Check attached exercises for visual image/animation asset
	if (Array.isArray(step.exercises) && step.exercises.length > 0) {
		for (const ex of step.exercises) {
			const visual = getExerciseFollowAlongMedia(ex.id || ex);
			if (visual && visual.type === 'image' && visual.url && !visual.url.includes('youtube') && !visual.url.includes('youtu.be')) {
				return visual.url;
			}
		}
	}

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
	customInput.className = 'break-custom-input';
	customInput.placeholder = '0:30';
	customInput.value = formatTime(curSec);
	customInput.title = 'Rest duration (scroll wheel, up/down arrows, or type MM:SS)';

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

	customInput.addEventListener('wheel', (e) => {
		e.preventDefault();
		const delta = e.shiftKey ? 15 : 5;
		const cur = parseTime(customInput.value) || step.durationSeconds || 30;
		setDuration(e.deltaY < 0 ? cur + delta : cur - delta);
	}, { passive: false });

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
	input.className = 'input ex-combobox-input ex-combobox-input-compact';
	input.placeholder = '+ Tag movement (e.g. Teep, Push-ups)...';
	input.autocomplete = 'off';

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
				if (!step.label || step.label === 'Exercise' || step.label === 'Video Clip') {
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
						if (!step.label || step.label === 'Exercise' || step.label === 'Video Clip') {
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

	input.addEventListener('input', () => {
		updateDropdown();
	});

	input.addEventListener('blur', () => {
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

	// 2. Compact Control Row: Mode + Presets + Stepper (or Fixed Video Badge)
	const isVideoStep = Boolean(step.type === 'clip' || (step.videoId && step.endSeconds && step.endSeconds > (step.startSeconds || 0)));

	const row = document.createElement('div');
	row.className = 'timer-controls-row';

	if (isVideoStep) {
		const dur = Math.max(1, (step.endSeconds || 60) - (step.startSeconds || 0));
		const videoPill = document.createElement('div');
		videoPill.className = 'step-fixed-video-pill';
		videoPill.innerHTML = `
			<span class="fixed-video-icon">🎬</span>
			<span class="fixed-video-title">Follow-Along Video Drill</span>
			<span class="fixed-video-dur">${formatTime(dur)}</span>
			<span class="fixed-video-timestamps">(${formatTime(step.startSeconds || 0)} → ${formatTime(step.endSeconds || dur)})</span>
		`;
		row.appendChild(videoPill);
	} else {
		// Mode Switcher: Timed vs Reps (inline segmented button)
		const modeToggle = document.createElement('div');
		modeToggle.className = 'step-mode-segmented-compact';

		const timedBtn = document.createElement('button');
		timedBtn.type = 'button';
		timedBtn.className = `btn-mode-seg ${step.stepMode !== 'reps' ? 'active' : ''}`;
		timedBtn.innerHTML = `⏱️ Time`;
		timedBtn.addEventListener('click', () => {
			step.stepMode = 'time';
			if (!step.durationSeconds) step.durationSeconds = 30;
			onUpdate();
		});

		const repsBtn = document.createElement('button');
		repsBtn.type = 'button';
		repsBtn.className = `btn-mode-seg ${step.stepMode === 'reps' ? 'active' : ''}`;
		repsBtn.innerHTML = `🔢 Reps`;
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
			repsInp.className = 'break-custom-input';
			repsInp.value = curReps;

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
			customInput.className = 'break-custom-input';
			customInput.placeholder = '0:30';
			customInput.value = formatTime(curSec);

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
	}
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
	input.className = 'stepper-input';
	input.placeholder = placeholder;
	input.value = (valueSeconds === 0 && emptyWhenZero) ? '' : (valueSeconds > 0 ? formatTime(valueSeconds) : '');

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

	input.addEventListener('wheel', (e) => {
		e.preventDefault();
		const delta = e.shiftKey ? 15 : stepSeconds;
		const cur = parseTime(input.value) || valueSeconds || 30;
		setVal(e.deltaY < 0 ? cur + delta : cur - delta);
	}, { passive: false });

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
	input.className = 'input';
	input.value = value || '';
	input.placeholder = placeholder;
	input.addEventListener('change', (e) => onChange(e.target.value));

	group.append(label, input);
	return group;
}

/**
 * Initialize drag-and-drop reordering for steps.
 */
function initDragAndDrop(container, routine, onUpdate) {
	let dragIndex = null;

	container.addEventListener('dragstart', (e) => {
		const card = e.target.closest('.step-card');
		if (!card) return;
		dragIndex = parseInt(card.dataset.index, 10);
		card.classList.add('dragging');
		e.dataTransfer.effectAllowed = 'move';
	});

	container.addEventListener('dragend', (e) => {
		const card = e.target.closest('.step-card');
		if (card) card.classList.remove('dragging');
		dragIndex = null;
	});

	container.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';

		const afterElement = getDragAfterElement(container, e.clientY);
		const dragging = container.querySelector('.dragging');
		if (!dragging) return;

		if (afterElement === null) {
			container.appendChild(dragging);
		} else {
			container.insertBefore(dragging, afterElement);
		}
	});

	container.addEventListener('drop', (e) => {
		e.preventDefault();
		if (dragIndex === null) return;

		const cards = [...container.querySelectorAll('.step-card')];
		const newOrder = cards.map(c => parseInt(c.dataset.index, 10));
		const reordered = newOrder.map(i => routine.steps[i]);
		routine.steps = reordered;
		onUpdate();
	});
}

/**
 * Get the element after which a dragged item should be placed.
 */
function getDragAfterElement(container, y) {
	const elements = [...container.querySelectorAll('.step-card:not(.dragging)')];

	return elements.reduce((closest, child) => {
		const box = child.getBoundingClientRect();
		const offset = y - box.top - box.height / 2;

		if (offset < 0 && offset > closest.offset) {
			return { offset, element: child };
		}
		return closest;
	}, { offset: Number.NEGATIVE_INFINITY }).element || null;
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
 * @param {number} [durationSeconds=30]
 * @returns {Object} Step object
 */
export function createBreakStep(durationSeconds = 30) {
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
 * If the exercise has a follow-along video asset or YouTube video, creates a 'clip' step.
 * Otherwise creates a 'timer' or 'reps' step.
 * @param {Object} ex
 * @returns {Object} Step object
 */
export function createStepFromExercise(ex) {
	if (!ex) return createTimerStep();
	const isReps = (ex.default_mode || 'reps') === 'reps';
	const quantity = ex.default_quantity || (isReps ? 20 : 30);
	const asset = getExerciseFollowAlongMedia(ex) || (ex.media_assets || [])[0];
	const isVidAsset = asset && (asset.type === 'video' || Boolean(asset.videoId));
	const directVid = (!isVidAsset && ex.media_url && (ex.media_url.includes('youtube') || ex.media_url.includes('youtu.be'))) ? parseYouTubeId(ex.media_url) : null;

	let newStep;
	if (isVidAsset || directVid) {
		newStep = createClipStep();
		newStep.label = ex.name;
		newStep.videoId = (asset && asset.videoId) ? asset.videoId : (directVid || parseYouTubeId(asset?.url));
		newStep.startSeconds = asset?.startSeconds || 0;
		newStep.endSeconds = asset?.endSeconds || ((asset?.startSeconds || 0) + (isReps ? 60 : quantity));
	} else {
		newStep = createTimerStep();
		newStep.label = ex.name;
		newStep.stepMode = isReps ? 'reps' : 'time';
		newStep.targetReps = isReps ? quantity : 0;
		newStep.durationSeconds = !isReps ? quantity : 30;
		if (asset?.url || ex.media_url) {
			newStep.gifUrl = asset?.url || ex.media_url || '';
			newStep.mediaUrl = asset?.url || ex.media_url || '';
		}
	}
	newStep.exercises = [{ id: ex.id, name: ex.name, category: ex.category, discipline: ex.discipline }];
	return newStep;
}

/**
 * Create a new step from a combo definition.
 * If the combo has a video asset or YouTube video, creates a 'clip' step.
 * Otherwise creates a 'timer' or 'reps' step.
 * @param {Object} combo
 * @returns {Object} Step object
 */
export function createStepFromCombo(combo) {
	if (!combo) return createTimerStep();
	const exList = (combo.exercise_ids || []).map(id => (typeof id === 'object' ? id : { id }));
	const asset = (combo.media_assets || [])[0];
	const isVideo = asset && (asset.type === 'video' || Boolean(asset.videoId));
	const directVid = (!isVideo && combo.media_url && (combo.media_url.includes('youtube') || combo.media_url.includes('youtu.be'))) ? parseYouTubeId(combo.media_url) : null;

	let newStep;
	if (isVideo || directVid) {
		newStep = createClipStep();
		newStep.label = combo.name;
		newStep.videoId = (asset && asset.videoId) ? asset.videoId : (directVid || parseYouTubeId(asset?.url || combo.media_url));
		newStep.startSeconds = asset?.startSeconds || 0;
		newStep.endSeconds = asset?.endSeconds || ((asset?.startSeconds || 0) + (combo.default_quantity || 190));
	} else {
		newStep = createTimerStep();
		newStep.label = combo.name;
		if (combo.default_mode === 'reps') {
			newStep.stepMode = 'reps';
			newStep.targetReps = combo.default_quantity || 20;
		} else {
			newStep.durationSeconds = combo.default_quantity || 190;
		}
		if (asset?.url || combo.media_url) {
			newStep.gifUrl = asset?.url || combo.media_url || '';
			newStep.mediaUrl = asset?.url || combo.media_url || '';
		}
	}
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
 * Open a quick selection modal to add an exercise into the active routine.
 * @param {Object} routine
 * @param {Function} onUpdate
 */
/**
 * Anatomical region definitions for the Option 4 Muscle Navigator exercise picker.
 */
const ANATOMICAL_REGIONS = [
	{ id: 'all', label: 'All Movements', icon: '🎯' },
	{ id: 'lower', label: 'Lower Body & Legs', icon: '🦵', muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'groin', 'ankles'] },
	{ id: 'core', label: 'Core & Hip Flexors', icon: '🛡️', muscles: ['abs', 'obliques', 'lower_back', 'hip_flexors'] },
	{ id: 'arms', label: 'Arms & Grip', icon: '💪', muscles: ['biceps', 'triceps', 'forearms', 'wrists'] },
	{ id: 'upper', label: 'Shoulders & Upper', icon: '🥊', muscles: ['shoulders', 'chest', 'back', 'lats', 'traps', 'upper_back', 'rotators'] },
	{ id: 'stretch', label: 'Stretch & Mobility', icon: '🧘', categories: ['stretch', 'mobility'], disciplines: ['yoga'] }
];

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
				<div class="nav-search-wrap">
					<span class="search-icon">🔍</span>
					<input type="text" class="nav-search-input" id="nav-search" placeholder="Search exercises, disciplines, or muscles (e.g. Teep, Quads, Push-ups)..." autofocus>
				</div>

				<div class="nav-pills-row" id="nav-discipline-pills">
					<span class="nav-pill-label">Discipline</span>
					<button type="button" class="nav-filter-pill active" data-disc="all">All</button>
					<button type="button" class="nav-filter-pill" data-disc="calisthenics">🤸 Calisthenics</button>
					<button type="button" class="nav-filter-pill" data-disc="muay_thai">🥊 Muay Thai</button>
					<button type="button" class="nav-filter-pill" data-disc="boxing">🥊 Boxing</button>
					<button type="button" class="nav-filter-pill" data-disc="yoga">🧘 Yoga & Recovery</button>
					<button type="button" class="nav-filter-pill" data-disc="general">🏋️ General</button>
				</div>

				<div class="nav-pills-row" id="nav-media-pills">
					<span class="nav-pill-label">Media Filter</span>
					<button type="button" class="nav-filter-pill active" data-media="all">All Types</button>
					<button type="button" class="nav-filter-pill" data-media="video">🎬 Has Video</button>
					<button type="button" class="nav-filter-pill" data-media="gif">✨ Has GIF / Loop</button>
					<button type="button" class="nav-filter-pill" data-media="tutorial">🎓 Has Tutorial</button>
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
		const modalDlg = document.getElementById('modal-backdrop');
		if (modalDlg && !modalDlg.classList.contains('hidden')) {
			return;
		}
		if (e.key === 'Escape' || e.keyCode === 27) close();
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

	function matchesRegion(ex, regionId) {
		if (regionId === 'all') return true;
		const region = ANATOMICAL_REGIONS.find(r => r.id === regionId);
		if (!region) return true;

		if (region.categories && region.categories.includes(ex.category)) return true;
		if (region.disciplines && region.disciplines.includes(ex.discipline)) return true;

		const muscles = inferMusclesForExercise(ex);
		const allTargetMuscles = [...(muscles.primary || []), ...(muscles.secondary || [])];
		if (region.muscles && region.muscles.some(m => allTargetMuscles.includes(m))) {
			return true;
		}
		return false;
	}

	function getFilteredExercises(forRegion = activeRegion) {
		const q = searchQuery.toLowerCase().trim();

		return allExercises.filter(ex => {
			if (activeDiscipline !== 'all' && ex.discipline !== activeDiscipline) return false;

			const assets = getExerciseMediaAssets([ex]);
			const hasVid = ex.media_url?.includes('youtube') || ex.media_url?.includes('youtu.be') || assets.some(a => a.type === 'video' || Boolean(a.videoId));
			const hasGifOrImg = Boolean(ex.media_url && !hasVid) || assets.some(a => a.kind === 'animation' || a.kind === 'photo');
			const hasTutorial = assets.some(a => a.kind === 'instruction');

			if (activeMedia === 'video' && !hasVid) return false;
			if (activeMedia === 'gif' && !hasGifOrImg) return false;
			if (activeMedia === 'tutorial' && !hasTutorial) return false;

			if (!matchesRegion(ex, forRegion)) return false;

			if (q) {
				const muscles = inferMusclesForExercise(ex);
				const allTargetMuscles = [...(muscles.primary || []), ...(muscles.secondary || [])];
				const matchName = (ex.name || '').toLowerCase().includes(q);
				const matchCategory = (ex.category || '').toLowerCase().includes(q);
				const matchDisc = (ex.discipline || '').toLowerCase().includes(q);
				const matchMuscles = allTargetMuscles.some(m => m.toLowerCase().includes(q));
				if (!matchName && !matchCategory && !matchDisc && !matchMuscles) return false;
			}

			return true;
		});
	}

	function commitAddExercise(ex) {
		const newStep = createStepFromExercise(ex);

		if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= routine.steps.length) {
			routine.steps.splice(insertIndex, 0, newStep);
		} else {
			routine.steps.push(newStep);
		}

		expandStep(newStep.id);
		close();
		onUpdate();
		const pos = (typeof insertIndex === 'number' && insertIndex >= 0) ? insertIndex + 1 : routine.steps.length;
		showToast(`Added "${ex.name}" at step #${pos}`);
		highlightStepElement(newStep.id);
	}

	function renderSidebar() {
		sidebarEl.innerHTML = '';
		ANATOMICAL_REGIONS.forEach(reg => {
			const count = getFilteredExercises(reg.id).length;
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = `nav-region-btn ${activeRegion === reg.id ? 'active' : ''}`;
			btn.innerHTML = `
				<span>${reg.icon} ${reg.label}</span>
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
		const filtered = getFilteredExercises(activeRegion);
		countBadge.textContent = `${filtered.length} movement${filtered.length === 1 ? '' : 's'}`;
		listEl.innerHTML = '';

		if (filtered.length === 0) {
			listEl.innerHTML = `<div class="empty-sessions" style="padding:40px 20px; text-align:center;"><p style="color:var(--text-muted);">No matching exercises found in this region.</p></div>`;
			return;
		}

		filtered.forEach(ex => {
			const card = document.createElement('div');
			card.className = 'nav-exercise-card';

			const fullEx = (ex.id ? getExerciseById(ex.id) : null) || ex;
			const muscles = inferMusclesForExercise(fullEx);
			const primaryPills = (muscles.primary || []).slice(0, 3).map(m => getMuscleBadgeHtml(m, true)).join('');

			const assets = getExerciseMediaAssets([fullEx]);
			const followAlong = getExerciseFollowAlongMedia(fullEx) || assets[0];
			const isVid = followAlong && (followAlong.type === 'video' || Boolean(followAlong.videoId));
			const vid = followAlong?.videoId || (fullEx.media_url ? parseYouTubeId(fullEx.media_url) : null);

			let thumbHtml = '';
			if (isVid && vid) {
				thumbHtml = `
					<div class="nav-card-thumb">
						<img src="https://img.youtube.com/vi/${vid}/default.jpg" alt="${escapeHtml(fullEx.name)}" loading="lazy">
						<span class="nav-card-thumb-badge">▶</span>
					</div>
				`;
			} else if (fullEx.media_url || followAlong?.url) {
				thumbHtml = `
					<div class="nav-card-thumb">
						<img src="${fullEx.media_url || followAlong.url}" alt="${escapeHtml(fullEx.name)}" loading="lazy">
						<span class="nav-card-thumb-badge">✨</span>
					</div>
				`;
			} else {
				thumbHtml = `
					<div class="nav-card-thumb">
						<span style="font-size:1.2rem;">🥋</span>
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
					<button type="button" class="btn-nav-view" title="Open Full Variations Overlay">👁️ View</button>
					<button type="button" class="btn-nav-add" title="Add to Routine">+ Add (${qty}${unitStr})</button>
				</div>
			`;

			// Clicking card main or view button opens the full Exercise Overlay
			const openOverlay = (e) => {
				if (e) e.stopPropagation();
				showExerciseVariationsModal(fullEx, {
					onUpdated: () => {
						renderSidebar();
						renderList();
						onUpdate();
					},
					onAddToRoutine: () => {
						commitAddExercise(fullEx);
					}
				});
			};

			card.querySelector('.nav-card-main').addEventListener('click', openOverlay);
			card.querySelector('.btn-nav-view').addEventListener('click', openOverlay);

			// Clicking "+ Add" directly commits the exercise into the routine
			card.querySelector('.btn-nav-add').addEventListener('click', (e) => {
				e.stopPropagation();
				commitAddExercise(fullEx);
			});

			listEl.appendChild(card);
		});
	}

	searchInput.addEventListener('input', (e) => {
		searchQuery = e.target.value;
		renderSidebar();
		renderList();
	});

	modal.querySelectorAll('#nav-discipline-pills .nav-filter-pill').forEach(pill => {
		pill.addEventListener('click', () => {
			modal.querySelectorAll('#nav-discipline-pills .nav-filter-pill').forEach(p => p.classList.remove('active'));
			pill.classList.add('active');
			activeDiscipline = pill.getAttribute('data-disc');
			renderSidebar();
			renderList();
		});
	});

	modal.querySelectorAll('#nav-media-pills .nav-filter-pill').forEach(pill => {
		pill.addEventListener('click', () => {
			modal.querySelectorAll('#nav-media-pills .nav-filter-pill').forEach(p => p.classList.remove('active'));
			pill.classList.add('active');
			activeMedia = pill.getAttribute('data-media');
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

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-window modal-add-picker';

	const isInserting = typeof insertIndex === 'number' && insertIndex >= 0;
	const titleText = isInserting ? `🔗 Select Combo Flow (Insert at #${insertIndex + 1})` : '🔗 Select Combo Flow';

	modal.innerHTML = `
		<div class="modal-header">
			<h3 class="modal-title">${titleText}</h3>
			<button class="modal-close-btn" title="Close">✕</button>
		</div>

		<div class="modal-body">
			<div class="search-box-wrapper" style="margin-bottom:12px;">
				<span class="search-icon">🔍</span>
				<input type="text" id="add-combo-search" class="input combo-search-input" placeholder="Search combos (Star Jumps ⮀ Coordination, Lateral Taps, Jab Knee)..." autofocus>
			</div>

			<div id="add-combo-list" class="add-picker-list"></div>
		</div>
	`;

	const close = () => backdrop.remove();

	modal.querySelector('.modal-close-btn').addEventListener('click', close);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	const searchInput = modal.querySelector('#add-combo-search');
	const listEl = modal.querySelector('#add-combo-list');

	function renderList(query = '') {
		const q = (query || '').toLowerCase().trim();
		const filtered = combos.filter(c => {
			if (!q) return true;
			return (c.name || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q);
		});
		listEl.innerHTML = '';

		if (filtered.length === 0) {
			listEl.innerHTML = `<div class="empty-sessions"><p>No combos found.</p></div>`;
			return;
		}

		filtered.forEach(combo => {
			const item = document.createElement('div');
			item.className = 'add-picker-item';

			const flowIcon = combo.flow_type === 'alternating' ? '⮀ Alternating' : (combo.flow_type === 'sequence' ? '➔ Flow' : '⚡ Superset');
			const modeStr = combo.default_mode === 'reps' ? `🔢 ${combo.default_quantity || 20} Reps` : `⏱️ ${formatTime(combo.default_quantity || 190)}`;

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

				if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= routine.steps.length) {
					routine.steps.splice(insertIndex, 0, newStep);
				} else {
					routine.steps.push(newStep);
				}

				expandStep(newStep.id);
				close();
				onUpdate();
				const pos = (typeof insertIndex === 'number' && insertIndex >= 0) ? insertIndex + 1 : routine.steps.length;
				showToast(`Added "${combo.name}" at step #${pos}`);
				highlightStepElement(newStep.id);
			});

			listEl.appendChild(item);
		});
	}

	searchInput.addEventListener('input', (e) => {
		renderList(e.target.value);
	});

	renderList();
	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);
}


