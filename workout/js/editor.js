/**
 * Editor module - Routine & step editing, drag-and-drop reorder.
 */

import { generateId, parseYouTubeId, parseYouTubeInfo, parseTime, formatTime, formatFriendlyDuration, escapeHtml, showToast } from './utils.js';
import { saveAudioFile, deleteAudioFile } from './musicdb.js';
import { showPrompt, showAlert } from './modal.js';
import { getClipIcon, getTimerIcon, getBreakIcon, getComboIcon, getExerciseIcon, getDuplicateIcon, getPlusIcon } from './icons.js';
import {
	getExercises, getExerciseById, filterExercises, createCustomExercise,
	getCategoryBadgeHtml, getDisciplineBadgeHtml,
	getExerciseMediaAssets, getMediaKindBadgeHtml,
	addMediaAssetToExercise, showExerciseVariationsModal, MEDIA_KINDS
} from './exercises.js';
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
				<button type="button" class="btn btn-secondary btn-sm btn-empty-add-clip">🎬 + Add Video Clip</button>
			</div>
		`;
		emptyCard.querySelector('.btn-empty-add-ex').addEventListener('click', () => showAddExerciseModal(routine, onUpdate, 0));
		emptyCard.querySelector('.btn-empty-add-break').addEventListener('click', () => {
			const s = insertBreakStep(routine, 0, 30);
			onUpdate();
			highlightStepElement(s.id);
		});
		emptyCard.querySelector('.btn-empty-add-combo').addEventListener('click', () => showAddComboModal(routine, onUpdate, 0));
		emptyCard.querySelector('.btn-empty-add-clip').addEventListener('click', () => {
			const s = insertClipStep(routine, 0);
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
	addYtBtn.textContent = '🔗 + YouTube Track';
	addYtBtn.addEventListener('click', async (e) => {
		e.stopPropagation();
		const url = await showPrompt({
			title: 'Add YouTube Music to Workout',
			message: 'Paste a YouTube or YouTube Music link:',
			placeholder: 'https://music.youtube.com/watch?v=... or https://youtube.com/watch?v=...',
			confirmText: 'Next'
		});
		if (!url) return;
		const videoId = parseYouTubeId(url);
		if (!videoId) {
			await showAlert({
				title: 'Invalid Link',
				message: 'Could not find a valid YouTube video ID from that link. Please check the URL and try again.'
			});
			return;
		}
		const label = await showPrompt({
			title: 'Track Label',
			message: 'Display name for this track:',
			defaultValue: 'Music Track',
			placeholder: 'e.g. Upbeat Workout Beat',
			confirmText: 'Add Track'
		}) || 'Music Track';
		routine.musicTracks.push({
			id: generateId(),
			source: 'youtube',
			videoId: videoId,
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
			badge.textContent = track.source === 'youtube' ? '▶ YT' : '📁 File';

			const trackLabel = document.createElement('span');
			trackLabel.className = 'track-label';
			trackLabel.textContent = track.label || (track.source === 'youtube' ? track.videoId : track.fileName);

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

	const clipBtn = document.createElement('button');
	clipBtn.type = 'button';
	clipBtn.className = 'btn-insert-pill btn-insert-clip';
	clipBtn.innerHTML = `🎬 + Video`;
	clipBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const step = insertClipStep(routine, insertIndex);
		onUpdate();
		showToast(`Inserted Video Clip at #${insertIndex + 1}`);
		highlightStepElement(step.id);
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

	menu.append(exBtn, breakBtn, comboBtn, clipBtn, closeBtn);

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
	headerTitle.textContent = step.label || (isBreak ? 'Rest' : 'Untitled Step');

	const headerMeta = document.createElement('span');
	headerMeta.className = 'step-header-meta';
	if (step.type === 'clip') {
		const dur = Math.max(0, (step.endSeconds || 60) - (step.startSeconds || 0));
		headerMeta.textContent = `${formatTime(dur)} (${formatTime(step.startSeconds || 0)}–${formatTime(step.endSeconds || 60)})`;
	} else if (step.stepMode === 'reps' || step.targetReps) {
		headerMeta.textContent = `${step.targetReps || 20} reps`;
	} else {
		headerMeta.textContent = formatFriendlyDuration(step.durationSeconds || 30);
	}

	headerInfo.append(headerTitle, headerMeta);

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

	if (step.type === 'clip') {
		body.appendChild(createClipFields(step, onUpdate));
	} else if (isBreak) {
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
 * Create input fields for a clip step.
 */
function createClipFields(step, onUpdate) {
	const frag = document.createDocumentFragment();

	if (!step.exercises) step.exercises = [];

	// Exercise picker component
	frag.appendChild(createExercisePicker(step, onUpdate));

	// Multi-media variation selector (Instruction vs Execution vs GIF vs Photos)
	frag.appendChild(createExerciseMediaSelector(step, onUpdate));

	// Label
	frag.appendChild(createField('Label', step.label, (val) => {
		step.label = val;
		onUpdate();
	}));

	// YouTube URL/ID
	frag.appendChild(createField('YouTube URL or ID', step.videoId, (val) => {
		const info = parseYouTubeInfo(val);
		if (info && info.videoId) {
			step.videoId = info.videoId;
			if (info.startSeconds !== null && info.startSeconds !== undefined) {
				step.startSeconds = info.startSeconds;
				if (!step.endSeconds || step.endSeconds <= step.startSeconds) {
					step.endSeconds = step.startSeconds + 60;
				}
			}
			if (!step.label || step.label === 'Video Clip') {
				fetchVideoTitle(info.videoId, (title) => {
					if (title && (!step.label || step.label === 'Video Clip')) {
						step.label = title;
						onUpdate();
					}
				});
			}
			onUpdate();
		}
	}, 'e.g., https://youtube.com/watch?v=dQw4w9WgXcQ'));

	// Dual-Handle Range Trimmer (Option 2)
	frag.appendChild(createVideoRangeTrimmer(step, onUpdate));

	return frag;
}

/**
 * Dual-Handle Range Trimmer component for video clips.
 * Visual interactive slider with two draggable handles, draggable range block,
 * and synchronized start/end time inputs.
 */
function createVideoRangeTrimmer(step, onUpdate) {
	const container = document.createElement('div');
	container.className = 'video-trimmer';

	let startSec = Math.max(0, step.startSeconds || 0);
	let endSec = Math.max(startSec + 1, step.endSeconds || (startSec + 60));

	function getTimelineMax() {
		const ceiling = Math.max(300, endSec * 1.35);
		return Math.ceil(ceiling / 60) * 60;
	}
	let timelineMax = getTimelineMax();

	const trackWrapper = document.createElement('div');
	trackWrapper.className = 'trimmer-track-wrapper';

	const trackBg = document.createElement('div');
	trackBg.className = 'trimmer-track-bg';

	const highlight = document.createElement('div');
	highlight.className = 'trimmer-highlight';
	highlight.title = 'Drag interval window';

	const handleStart = document.createElement('div');
	handleStart.className = 'trimmer-handle trimmer-handle-start';
	handleStart.title = 'Drag Start';

	const handleEnd = document.createElement('div');
	handleEnd.className = 'trimmer-handle trimmer-handle-end';
	handleEnd.title = 'Drag End';

	trackWrapper.append(trackBg, highlight, handleStart, handleEnd);

	// Controls below trimmer
	const controlsRow = document.createElement('div');
	controlsRow.className = 'trimmer-controls-row';

	// Start Input
	const startGroup = document.createElement('div');
	startGroup.className = 'field-group trimmer-input-group';
	const startLbl = document.createElement('label');
	startLbl.textContent = 'Start';
	const startInput = document.createElement('input');
	startInput.type = 'text';
	startInput.className = 'input trimmer-input';
	startInput.value = formatTime(startSec);
	startGroup.append(startLbl, startInput);

	// Duration Pill
	const durationPill = document.createElement('div');
	durationPill.className = 'trimmer-duration-pill';
	durationPill.textContent = `⏱️ ${formatFriendlyDuration(endSec - startSec)}`;

	// End Input
	const endGroup = document.createElement('div');
	endGroup.className = 'field-group trimmer-input-group';
	const endLbl = document.createElement('label');
	endLbl.textContent = 'End';
	const endInput = document.createElement('input');
	endInput.type = 'text';
	endInput.className = 'input trimmer-input';
	endInput.value = formatTime(endSec);
	endGroup.append(endLbl, endInput);

	controlsRow.append(startGroup, durationPill, endGroup);
	container.append(trackWrapper, controlsRow);

	function updateVisuals() {
		timelineMax = getTimelineMax();
		const leftPercent = (startSec / timelineMax) * 100;
		const rightPercent = (endSec / timelineMax) * 100;
		const widthPercent = Math.max(0, rightPercent - leftPercent);

		highlight.style.left = `${leftPercent}%`;
		highlight.style.width = `${widthPercent}%`;
		handleStart.style.left = `${leftPercent}%`;
		handleEnd.style.left = `${rightPercent}%`;

		startInput.value = formatTime(startSec);
		endInput.value = formatTime(endSec);
		durationPill.textContent = `⏱️ ${formatFriendlyDuration(endSec - startSec)}`;
	}

	updateVisuals();

	// Pointer dragging
	let isDragging = null;
	let dragStartX = 0;
	let dragInitialStart = 0;
	let dragInitialEnd = 0;

	function getSecFromPointer(e) {
		const rect = trackWrapper.getBoundingClientRect();
		const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		return Math.round(frac * timelineMax);
	}

	handleStart.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		handleStart.setPointerCapture(e.pointerId);
		isDragging = 'start';
	});

	handleEnd.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		handleEnd.setPointerCapture(e.pointerId);
		isDragging = 'end';
	});

	highlight.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		highlight.setPointerCapture(e.pointerId);
		isDragging = 'range';
		dragStartX = e.clientX;
		dragInitialStart = startSec;
		dragInitialEnd = endSec;
	});

	const onPointerMove = (e) => {
		if (!isDragging) return;
		if (isDragging === 'start') {
			const s = getSecFromPointer(e);
			startSec = Math.max(0, Math.min(s, endSec - 1));
			step.startSeconds = startSec;
			updateVisuals();
		} else if (isDragging === 'end') {
			const end = getSecFromPointer(e);
			endSec = Math.max(startSec + 1, Math.min(end, timelineMax));
			step.endSeconds = endSec;
			updateVisuals();
		} else if (isDragging === 'range') {
			const rect = trackWrapper.getBoundingClientRect();
			const deltaSec = Math.round(((e.clientX - dragStartX) / rect.width) * timelineMax);
			const dur = dragInitialEnd - dragInitialStart;
			let newStart = dragInitialStart + deltaSec;
			if (newStart < 0) newStart = 0;
			if (newStart + dur > timelineMax) newStart = timelineMax - dur;
			startSec = newStart;
			endSec = newStart + dur;
			step.startSeconds = startSec;
			step.endSeconds = endSec;
			updateVisuals();
		}
	};

	const onPointerUp = () => {
		if (isDragging) {
			isDragging = null;
			onUpdate();
		}
	};

	trackWrapper.addEventListener('pointermove', onPointerMove);
	trackWrapper.addEventListener('pointerup', onPointerUp);
	trackWrapper.addEventListener('pointercancel', onPointerUp);

	// Typing listeners with auto-select
	startInput.addEventListener('focus', () => startInput.select());
	endInput.addEventListener('focus', () => endInput.select());

	const commitStart = () => {
		const parsed = parseTime(startInput.value);
		startSec = parsed;
		if (endSec <= startSec) {
			endSec = startSec + 60;
		}
		step.startSeconds = startSec;
		step.endSeconds = endSec;
		updateVisuals();
		onUpdate();
	};

	const commitEnd = () => {
		const parsed = parseTime(endInput.value);
		if (parsed > startSec) {
			endSec = parsed;
		} else {
			endSec = startSec + 60;
		}
		step.startSeconds = startSec;
		step.endSeconds = endSec;
		updateVisuals();
		onUpdate();
	};

	startInput.addEventListener('change', commitStart);
	startInput.addEventListener('blur', commitStart);
	startInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startInput.blur(); });

	endInput.addEventListener('change', commitEnd);
	endInput.addEventListener('blur', commitEnd);
	endInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') endInput.blur(); });

	return container;
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
	if (direct && typeof direct === 'string' && direct.trim()) return direct.trim();

	if (step.type === 'timer' && step.label) {
		const l = step.label.toLowerCase();
		if (l.includes('diamond pushup') || l.includes('diamond push-up') || l.includes('diamond-pushup')) {
			return '/workout/media/diamond-pushups.svg';
		}
		if (l.includes('pushup') || l.includes('push-up') || l.includes('push up')) {
			return '/workout/media/pushups.svg';
		}
		if (l.includes('shoulder tap') || l.includes('shoulder-tap') || l.includes('shouldertap')) {
			return '/workout/media/shoulder-taps.svg';
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

	// Compact Label Field
	const labelGroup = document.createElement('div');
	labelGroup.className = 'field-group break-label-group';
	const labelInput = document.createElement('input');
	labelInput.type = 'text';
	labelInput.className = 'input break-label-input';
	labelInput.placeholder = 'Rest';
	labelInput.value = step.label || 'Rest';
	labelInput.addEventListener('change', (e) => {
		step.label = e.target.value.trim() || 'Rest';
		onUpdate();
	});
	labelGroup.appendChild(labelInput);

	// Quick Duration Presets: 30s, 1min, 2mins
	const presetsGroup = document.createElement('div');
	presetsGroup.className = 'break-presets-group';

	const breakPresets = [
		{ label: '30s', sec: 30 },
		{ label: '1m', sec: 60 },
		{ label: '2m', sec: 120 },
	];

	const curSec = step.durationSeconds || 30;

	// Custom duration field
	const customGroup = document.createElement('div');
	customGroup.className = 'break-custom-group';
	const customInput = document.createElement('input');
	customInput.type = 'text';
	customInput.className = 'input break-custom-input';
	customInput.placeholder = '0:30';
	customInput.value = formatTime(curSec);
	customInput.title = 'Custom duration (MM:SS or sec)';

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

	breakPresets.forEach(p => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'preset-chip break-preset-chip';
		if (curSec === p.sec) btn.classList.add('active');
		btn.textContent = p.label;
		btn.addEventListener('click', () => {
			step.durationSeconds = p.sec;
			customInput.value = formatTime(p.sec);
			updateActivePreset(p.sec);
			onUpdate();
		});
		presetsGroup.appendChild(btn);
		presetButtons.push({ btn, sec: p.sec });
	});

	const commitCustom = () => {
		const parsed = parseTime(customInput.value);
		const newSec = Math.max(1, parsed || 30);
		step.durationSeconds = newSec;
		customInput.value = formatTime(newSec);
		updateActivePreset(newSec);
		onUpdate();
	};

	customInput.addEventListener('change', commitCustom);
	customInput.addEventListener('blur', commitCustom);
	customInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') customInput.blur();
	});

	customGroup.appendChild(customInput);

	row.append(labelGroup, presetsGroup, customGroup);
	container.appendChild(row);

	return container;
}

/**
 * Reusable exercise tag chips and searchable combobox dropdown component.
 */
function createExercisePicker(step, onUpdate) {
	if (!step.exercises) step.exercises = [];

	const container = document.createElement('div');
	container.className = 'field-group step-exercise-picker-group';

	const headerRow = document.createElement('div');
	headerRow.className = 'ex-picker-header-row';

	const label = document.createElement('label');
	label.textContent = `Exercises & Movements (${step.exercises.length})`;

	headerRow.appendChild(label);
	container.appendChild(headerRow);

	// Tag chips list
	const chipList = document.createElement('div');
	chipList.className = 'step-exercise-chips';

	function renderChips() {
		chipList.innerHTML = '';
		if (step.exercises.length === 0) {
			const emptyChip = document.createElement('span');
			emptyChip.className = 'empty-chip-hint';
			emptyChip.textContent = 'No movements tagged (click below to select or add)';
			chipList.appendChild(emptyChip);
			return;
		}

		step.exercises.forEach((ex, i) => {
			const chip = document.createElement('div');
			chip.className = 'step-ex-chip';
			chip.title = `Click to view "${ex.name}" exercise guide & videos`;
			chip.style.cursor = 'pointer';
			chip.innerHTML = `
				${getCategoryBadgeHtml(ex.category)}
				<span class="step-ex-name">${escapeHtml(ex.name)}</span>
				${ex.discipline ? getDisciplineBadgeHtml(ex.discipline) : ''}
				<button type="button" class="btn-remove-ex-chip" title="Remove exercise">✕</button>
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
				label.textContent = `Exercises & Movements (${step.exercises.length})`;
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
	combobox.className = 'ex-combobox-wrapper';

	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'input ex-combobox-input';
	input.placeholder = '+ Search or add movement (e.g. Teep, Push-ups, Cobra)...';
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
				label.textContent = `Exercises & Movements (${step.exercises.length})`;
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
						// If item has default media or mode, suggest it
						if (item.media_url && !step.gifUrl && !step.mediaUrl) {
							step.gifUrl = item.media_url;
						}
						if (item.default_mode && !step.stepMode) {
							step.stepMode = item.default_mode;
							if (item.default_mode === 'reps' && item.default_quantity) {
								step.targetReps = item.default_quantity;
							}
						}
						input.value = '';
						dropdown.classList.add('hidden');
						label.textContent = `Exercises & Movements (${step.exercises.length})`;
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
 * Component to display, filter, and pick between an exercise's multiple media variations
 * (Instruction breakdown video vs. Execution video vs. Looping GIF / Animation vs. Photos).
 */
function createExerciseMediaSelector(step, onUpdate) {
	const container = document.createElement('div');
	container.className = 'step-media-selector-section';

	const assets = getExerciseMediaAssets(step.exercises || []);

	if (assets.length === 0) {
		return container;
	}

	const header = document.createElement('div');
	header.className = 'media-selector-header';

	const title = document.createElement('div');
	title.className = 'media-selector-title';
	title.innerHTML = `<span>🎬 Media & Variations</span> <span class="badge-count">${assets.length} available</span>`;

	header.appendChild(title);
	container.appendChild(header);

	// Tabs: All, Instructions, Demonstrations, Animations, Photos
	const tabsRow = document.createElement('div');
	tabsRow.className = 'media-selector-tabs';

	let activeFilter = 'all';

	const kindsPresent = ['all', ...new Set(assets.map(a => a.kind || 'demonstration'))];

	function renderMediaGrid() {
		const existingGrid = container.querySelector('.media-assets-grid');
		if (existingGrid) existingGrid.remove();

		const grid = document.createElement('div');
		grid.className = 'media-assets-grid';

		const filtered = activeFilter === 'all' ? assets : assets.filter(a => (a.kind || 'demonstration') === activeFilter);

		if (filtered.length === 0) {
			grid.innerHTML = '<p class="empty-chip-hint">No media in this category.</p>';
			container.appendChild(grid);
			return;
		}

		filtered.forEach(asset => {
			const isVideo = asset.type === 'video' || Boolean(asset.videoId);
			const isCurrentlyActive = isVideo
				? (step.type === 'clip' && step.videoId === asset.videoId && (step.startSeconds || 0) === (asset.startSeconds || 0))
				: ((step.gifUrl === asset.url || step.mediaUrl === asset.url) && (step.type === 'timer'));

			const card = document.createElement('div');
			card.className = `media-asset-card ${isCurrentlyActive ? 'is-active' : ''} kind-${asset.kind || 'demonstration'}`;
			card.title = `Click to apply "${asset.title}" to this step`;

			let thumbHtml = '';
			if (isVideo) {
				const vid = asset.videoId || parseYouTubeId(asset.url);
				thumbHtml = `
					<div class="asset-thumb-box">
						<img src="https://img.youtube.com/vi/${vid}/mqdefault.jpg" alt="${escapeHtml(asset.title || '')}" loading="lazy">
						<div class="asset-play-overlay">▶</div>
						${asset.startSeconds !== undefined && asset.endSeconds ? `<span class="asset-timestamp">${formatTime(asset.startSeconds)} - ${formatTime(asset.endSeconds)}</span>` : ''}
					</div>
				`;
			} else {
				thumbHtml = `
					<div class="asset-thumb-box">
						<img src="${asset.url}" alt="${escapeHtml(asset.title || '')}" class="asset-img-thumb" loading="lazy">
						<span class="asset-type-badge">${asset.kind === 'photo' ? '📷 Photo' : '✨ Looping GIF'}</span>
					</div>
				`;
			}

			card.innerHTML = `
				${thumbHtml}
				<div class="asset-card-info">
					<div class="asset-kind-badge-row">
						${getMediaKindBadgeHtml(asset.kind)}
						${isCurrentlyActive ? '<span class="asset-active-pill">✓ Active</span>' : ''}
					</div>
					<div class="asset-card-title">${escapeHtml(asset.title || 'Media Asset')}</div>
					<div class="asset-card-sub">${escapeHtml(asset.exerciseName || '')}</div>
				</div>
			`;

			card.addEventListener('click', () => {
				if (isVideo) {
					step.type = 'clip';
					step.videoId = asset.videoId || parseYouTubeId(asset.url);
					step.startSeconds = asset.startSeconds || 0;
					step.endSeconds = asset.endSeconds || (step.startSeconds + 60);
					if (asset.kind === 'instruction' && (!step.label || step.label === 'Exercise' || step.label === 'Video Clip')) {
						step.label = `${asset.exerciseName || 'Exercise'}: Instruction`;
					} else if (asset.kind === 'demonstration' && (!step.label || step.label === 'Exercise' || step.label === 'Video Clip')) {
						step.label = `${asset.exerciseName || 'Exercise'}: Follow-Along`;
					}
				} else {
					step.type = 'timer';
					step.gifUrl = asset.url;
					step.mediaUrl = asset.url;
					if (!step.label || step.label === 'Exercise' || step.label === 'Video Clip') {
						step.label = asset.exerciseName || 'Exercise';
					}
				}
				onUpdate();
			});

			grid.appendChild(card);
		});

		container.appendChild(grid);
	}

	kindsPresent.forEach(k => {
		const tabBtn = document.createElement('button');
		tabBtn.type = 'button';
		tabBtn.className = `media-tab-btn ${activeFilter === k ? 'active' : ''}`;
		if (k === 'all') {
			tabBtn.textContent = `All (${assets.length})`;
		} else {
			const info = MEDIA_KINDS[k] || { label: k, icon: '🎬' };
			const count = assets.filter(a => (a.kind || 'demonstration') === k).length;
			tabBtn.innerHTML = `${info.icon} ${info.label} (${count})`;
		}
		tabBtn.addEventListener('click', () => {
			activeFilter = k;
			tabsRow.querySelectorAll('.media-tab-btn').forEach(b => b.classList.remove('active'));
			tabBtn.classList.add('active');
			renderMediaGrid();
		});
		tabsRow.appendChild(tabBtn);
	});

	container.appendChild(tabsRow);
	renderMediaGrid();

	return container;
}

/**
 * Create input fields for a timer or reps step.
 */
function createTimerFields(step, onUpdate) {
	const frag = document.createDocumentFragment();

	// Ensure defaults
	if (!step.musicTracks) step.musicTracks = [];
	if (!step.exercises) step.exercises = [];
	if (!step.stepMode) step.stepMode = step.targetReps ? 'reps' : 'time';

	// Exercise picker component
	frag.appendChild(createExercisePicker(step, onUpdate));

	// Multi-media variation selector (Instruction vs Execution vs GIF vs Photos)
	frag.appendChild(createExerciseMediaSelector(step, onUpdate));

	// Label
	frag.appendChild(createField('Exercise Label', step.label, (val) => {
		step.label = val;
		onUpdate();
	}, 'e.g., Push-ups, Teep Drill, Plank'));

	// ── Mode Switcher: Timed vs Reps ─────────────────────────────────────────
	const modeRow = document.createElement('div');
	modeRow.className = 'field-group step-mode-switcher-group';

	const modeLabel = document.createElement('label');
	modeLabel.textContent = 'Execution Mode';

	const modeButtons = document.createElement('div');
	modeButtons.className = 'step-mode-segmented';

	const timedBtn = document.createElement('button');
	timedBtn.type = 'button';
	timedBtn.className = `btn-mode-seg ${step.stepMode !== 'reps' ? 'active' : ''}`;
	timedBtn.innerHTML = `⏱️ Timed Interval`;
	timedBtn.addEventListener('click', () => {
		step.stepMode = 'time';
		onUpdate();
	});

	const repsBtn = document.createElement('button');
	repsBtn.type = 'button';
	repsBtn.className = `btn-mode-seg ${step.stepMode === 'reps' ? 'active' : ''}`;
	repsBtn.innerHTML = `🔢 Target Reps`;
	repsBtn.addEventListener('click', () => {
		step.stepMode = 'reps';
		if (!step.targetReps) step.targetReps = 20;
		onUpdate();
	});

	modeButtons.append(timedBtn, repsBtn);
	modeRow.append(modeLabel, modeButtons);
	frag.appendChild(modeRow);

	if (step.stepMode === 'reps') {
		// Reps inputs
		const repsContainer = document.createElement('div');
		repsContainer.className = 'timer-duration-container';

		const repsGroup = document.createElement('div');
		repsGroup.className = 'field-group';
		const repsLbl = document.createElement('label');
		repsLbl.textContent = 'Target Reps (Quantity)';
		const repsInp = document.createElement('input');
		repsInp.type = 'number';
		repsInp.min = '1';
		repsInp.className = 'input';
		repsInp.value = step.targetReps || 20;
		repsInp.addEventListener('change', (e) => {
			step.targetReps = Math.max(1, parseInt(e.target.value, 10) || 20);
			onUpdate();
		});
		repsGroup.append(repsLbl, repsInp);
		repsContainer.appendChild(repsGroup);

		// Quick Reps Presets
		const repsPresetsRow = document.createElement('div');
		repsPresetsRow.className = 'preset-chips-row';
		const repsPresets = [10, 15, 20, 25, 30, 50, 100];
		repsPresets.forEach(r => {
			const chip = document.createElement('button');
			chip.type = 'button';
			chip.className = 'preset-chip';
			if ((step.targetReps || 20) === r) chip.classList.add('active');
			chip.textContent = `${r} reps`;
			chip.addEventListener('click', () => {
				step.targetReps = r;
				onUpdate();
			});
			repsPresetsRow.appendChild(chip);
		});
		repsContainer.appendChild(repsPresetsRow);
		frag.appendChild(repsContainer);
	} else {
		// Timed inputs
		const durationContainer = document.createElement('div');
		durationContainer.className = 'timer-duration-container';

		durationContainer.appendChild(createTimeField('Duration (MM:SS or sec)', step.durationSeconds || 30, (val) => {
			step.durationSeconds = Math.max(1, val);
			onUpdate();
		}, '0:30', false));

		// Quick Duration Presets for Timers
		const presetsRow = document.createElement('div');
		presetsRow.className = 'preset-chips-row';

		const presets = [
			{ label: '15s', sec: 15 },
			{ label: '30s', sec: 30 },
			{ label: '45s', sec: 45 },
			{ label: '1m', sec: 60 },
			{ label: '1m 30s', sec: 90 },
			{ label: '2m', sec: 120 },
			{ label: '3m', sec: 180 },
			{ label: '5m', sec: 300 },
		];

		presets.forEach(p => {
			const chip = document.createElement('button');
			chip.type = 'button';
			chip.className = 'preset-chip';
			if ((step.durationSeconds || 30) === p.sec) chip.classList.add('active');
			chip.textContent = p.label;
			chip.addEventListener('click', () => {
				step.durationSeconds = p.sec;
				onUpdate();
			});
			presetsRow.appendChild(chip);
		});

		durationContainer.appendChild(presetsRow);
		frag.appendChild(durationContainer);
	}

	// ── Animation / GIF Section ──────────────────────────────────────────────
	const mediaSection = document.createElement('div');
	mediaSection.className = 'step-media-section';

	const mediaField = createField('Animation / GIF URL', step.gifUrl || step.mediaUrl || '', (val) => {
		const clean = val.trim();
		if (clean) {
			step.gifUrl = clean;
		} else {
			delete step.gifUrl;
			delete step.mediaUrl;
		}
		onUpdate();
	}, '/workout/media/cobra-stretch.svg or https://...');

	const mediaPresetsRow = document.createElement('div');
	mediaPresetsRow.className = 'preset-chips-row media-preset-chips';

	const mediaPresets = [
		{ label: 'Pushups', url: '/workout/media/pushups.svg' },
		{ label: 'Diamond Pushups', url: '/workout/media/diamond-pushups.svg' },
		{ label: 'Shoulder Taps', url: '/workout/media/shoulder-taps.svg' },
		{ label: 'Cobra Stretch', url: '/workout/media/cobra-stretch.jpg' },
		{ label: 'Tricep Stretch', url: '/workout/media/overhead-tricep-stretch.jpg' },
		{ label: 'Pigeon Pose', url: '/workout/media/pigeon-pose.jpg' },
		{ label: 'Child’s Pose', url: '/workout/media/childs-pose.jpg' },
		{ label: 'Hamstring Fold', url: '/workout/media/seated-hamstring-fold.jpg' },
	];

	mediaPresets.forEach(p => {
		const chip = document.createElement('button');
		chip.type = 'button';
		chip.className = 'preset-chip';
		if ((step.gifUrl || step.mediaUrl) === p.url) chip.classList.add('active');
		chip.textContent = p.label;
		chip.addEventListener('click', () => {
			if (step.gifUrl === p.url || step.mediaUrl === p.url) {
				delete step.gifUrl;
				delete step.mediaUrl;
			} else {
				step.gifUrl = p.url;
			}
			onUpdate();
		});
		mediaPresetsRow.appendChild(chip);
	});

	mediaSection.appendChild(mediaField);
	mediaSection.appendChild(mediaPresetsRow);
	frag.appendChild(mediaSection);

	// ── Music Section ───────────────────────────────────────────────────────
	const musicSection = document.createElement('div');
	musicSection.className = 'step-music-section';

	const musicHeader = document.createElement('div');
	musicHeader.className = 'step-music-header';

	const musicTitle = document.createElement('span');
	musicTitle.className = 'step-music-title';
	musicTitle.textContent = '🎵 Music';

	const addYtBtn = document.createElement('button');
	addYtBtn.className = 'btn btn-ghost btn-sm';
	addYtBtn.textContent = '🔗 YouTube';
	addYtBtn.type = 'button';
	addYtBtn.addEventListener('click', async () => {
		const url = await showPrompt({
			title: 'Add YouTube Music',
			message: 'Paste a YouTube or YouTube Music link:',
			placeholder: 'https://music.youtube.com/watch?v=... or https://youtube.com/watch?v=...',
			confirmText: 'Next'
		});
		if (!url) return;
		const videoId = parseYouTubeId(url);
		if (!videoId) {
			await showAlert({
				title: 'Invalid Link',
				message: 'Could not find a valid YouTube video ID from that link. Please check the URL and try again.'
			});
			return;
		}
		const label = await showPrompt({
			title: 'Track Label',
			message: 'Display name for this track:',
			defaultValue: 'Music',
			placeholder: 'e.g. Upbeat Workout Beat',
			confirmText: 'Add Track'
		}) || 'Music';
		step.musicTracks.push({
			id: generateId(),
			source: 'youtube',
			videoId: videoId,
			label: label
		});
		onUpdate();
	});

	const addFileBtn = document.createElement('button');
	addFileBtn.className = 'btn btn-ghost btn-sm';
	addFileBtn.textContent = '📁 File';
	addFileBtn.type = 'button';
	addFileBtn.addEventListener('click', () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'audio/*';
		input.onchange = async (e) => {
			const file = e.target.files[0];
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
				step.musicTracks.push({
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

	musicHeader.append(musicTitle, addYtBtn, addFileBtn);
	musicSection.appendChild(musicHeader);

	// Render existing tracks
	if (step.musicTracks.length === 0) {
		const empty = document.createElement('p');
		empty.className = 'step-music-empty';
		empty.textContent = 'No music. Tracks loop if shorter than the timer.';
		musicSection.appendChild(empty);
	} else {
		step.musicTracks.forEach((track, i) => {
			const trackEl = document.createElement('div');
			trackEl.className = 'step-music-track';

			const badge = document.createElement('span');
			badge.className = 'track-source-badge';
			badge.textContent = track.source === 'youtube' ? '▶ YT' : '📁 File';

			const trackLabel = document.createElement('span');
			trackLabel.className = 'track-label';
			trackLabel.textContent = track.label || (track.source === 'youtube' ? track.videoId : track.fileName);

			const removeBtn = document.createElement('button');
			removeBtn.className = 'btn btn-danger btn-sm';
			removeBtn.textContent = '✕';
			removeBtn.type = 'button';
			removeBtn.addEventListener('click', async () => {
				if (track.source === 'file' && track.fileId) {
					try { await deleteAudioFile(track.fileId); } catch {}
				}
				step.musicTracks.splice(i, 1);
				onUpdate();
			});

			trackEl.append(badge, trackLabel, removeBtn);
			musicSection.appendChild(trackEl);
		});
	}

	frag.appendChild(musicSection);

	return frag;
}

/**
 * Create a simple, clean time input field.
 * Auto-selects on focus so user can immediately type a new number without backspacing.
 * Supports typing seconds ("45", "90") or MM:SS ("1:30") and formats cleanly on blur/Enter.
 */
function createTimeField(labelText, valueSeconds, onChange, placeholder = '0:00', emptyWhenZero = false) {
	const group = document.createElement('div');
	group.className = 'field-group';

	const label = document.createElement('label');
	label.textContent = labelText;

	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'input';
	input.placeholder = placeholder;
	input.value = (valueSeconds === 0 && emptyWhenZero) ? '' : (valueSeconds > 0 ? formatTime(valueSeconds) : '');

	// Select all on focus so user can immediately type over the existing value
	input.addEventListener('focus', () => {
		input.select();
	});

	const commit = () => {
		const parsed = parseTime(input.value);
		input.value = (parsed === 0 && emptyWhenZero) ? '' : formatTime(parsed);
		onChange(parsed);
	};

	input.addEventListener('change', commit);
	input.addEventListener('blur', commit);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			input.blur();
		}
	});

	group.append(label, input);
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
		targetReps: 20,
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
 * Open a quick selection modal to add an exercise into the active routine.
 * @param {Object} routine
 * @param {Function} onUpdate
 * @param {number} [insertIndex=-1] - Optional index to insert at (defaults to end)
 */
export function showAddExerciseModal(routine, onUpdate, insertIndex = -1) {
	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-add-picker';

	const isInserting = typeof insertIndex === 'number' && insertIndex >= 0;
	const titleText = isInserting ? `🥋 Select Exercise (Insert at #${insertIndex + 1})` : '🥋 Select Exercise';

	modal.innerHTML = `
		<div id="add-ex-picker-main">
			<div class="modal-header">
				<h3 class="modal-title">${titleText}</h3>
				<button class="modal-close-btn" title="Close">✕</button>
			</div>

			<div class="modal-body">
				<div class="search-box-wrapper" style="margin-bottom:12px;">
					<span class="search-icon">🔍</span>
					<input type="text" id="add-ex-search" class="input combo-search-input" placeholder="Search exercises (pushups, teep, squats)..." autofocus>
				</div>

				<div id="add-ex-list" class="add-picker-list"></div>
			</div>
		</div>

		<div id="add-ex-picker-subwindow" class="add-picker-subwindow" style="display:none;">
			<div class="modal-header">
				<div>
					<h3 class="modal-title" id="add-ex-sub-title">Exercise Name</h3>
					<div class="modal-subtitle" id="add-ex-sub-meta" style="margin-top:2px;">Category • Discipline</div>
				</div>
				<button class="btn btn-ghost btn-xs" id="add-ex-sub-back-btn">← Back</button>
			</div>

			<div class="modal-body" style="gap:16px;">
				<div class="sub-reps-box">
					<div class="sub-reps-counter-row">
						<button class="btn-sub-step" id="add-ex-step-minus" type="button">−</button>
						<input type="number" id="add-ex-num-input" class="sub-reps-input" value="20" min="1" max="999">
						<button class="btn-sub-step" id="add-ex-step-plus" type="button">+</button>
						<span class="sub-unit-label" id="add-ex-unit-label">Reps</span>
					</div>

					<div class="sub-chips-row" id="add-ex-preset-chips"></div>
				</div>

				<div class="modal-footer" style="padding:0;border:none;margin-top:8px;">
					<button class="btn btn-ghost btn-sm" id="add-ex-sub-cancel-btn">Cancel</button>
					<button class="btn btn-primary btn-sm" id="add-ex-sub-confirm-btn">✓ Add to Workout (Enter)</button>
				</div>
			</div>
		</div>
	`;

	const close = () => backdrop.remove();

	modal.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', close));
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	const searchInput = modal.querySelector('#add-ex-search');
	const listEl = modal.querySelector('#add-ex-list');
	const mainView = modal.querySelector('#add-ex-picker-main');
	const subView = modal.querySelector('#add-ex-picker-subwindow');
	const subTitle = modal.querySelector('#add-ex-sub-title');
	const subMeta = modal.querySelector('#add-ex-sub-meta');
	const numInput = modal.querySelector('#add-ex-num-input');
	const unitLabel = modal.querySelector('#add-ex-unit-label');
	const presetChips = modal.querySelector('#add-ex-preset-chips');
	const backBtn = modal.querySelector('#add-ex-sub-back-btn');
	const cancelBtn = modal.querySelector('#add-ex-sub-cancel-btn');
	const confirmBtn = modal.querySelector('#add-ex-sub-confirm-btn');
	const stepMinus = modal.querySelector('#add-ex-step-minus');
	const stepPlus = modal.querySelector('#add-ex-step-plus');

	let activeEx = null;

	function openSubwindow(ex) {
		activeEx = ex;
		subTitle.textContent = ex.name;
		subMeta.textContent = [ex.category, ex.discipline].filter(Boolean).join(' • ');

		const isReps = (ex.default_mode || 'reps') === 'reps';
		unitLabel.textContent = isReps ? 'Reps' : 'Seconds';
		numInput.value = ex.default_quantity || (isReps ? 20 : 30);

		const chipValues = isReps ? [10, 15, 20, 25, 30, 50] : [15, 30, 45, 60, 90, 120];
		presetChips.innerHTML = chipValues.map(v => `<button type="button" class="sub-chip-pill" data-val="${v}">${v}${isReps ? '' : 's'}</button>`).join('');

		presetChips.querySelectorAll('.sub-chip-pill').forEach(chip => {
			chip.addEventListener('click', () => {
				numInput.value = chip.getAttribute('data-val');
				numInput.focus();
				numInput.select();
			});
		});

		mainView.style.display = 'none';
		subView.style.display = 'block';
		numInput.focus();
		numInput.select();
	}

	function closeSubwindow() {
		subView.style.display = 'none';
		mainView.style.display = 'block';
		activeEx = null;
		searchInput.focus();
	}

	function commitAdd() {
		if (!activeEx) return;
		const ex = activeEx;
		const isReps = (ex.default_mode || 'reps') === 'reps';
		const quantity = parseInt(numInput.value, 10) || ex.default_quantity || (isReps ? 20 : 30);

		const hasVideo = ex.media_url && (ex.media_url.includes('youtube') || ex.media_url.includes('youtu.be'));
		const asset = (ex.media_assets || [])[0];
		const isVidAsset = asset && (asset.type === 'video' || Boolean(asset.videoId));

		let newStep;
		if (isVidAsset || hasVideo) {
			newStep = createClipStep();
			newStep.label = ex.name;
			newStep.videoId = asset?.videoId || parseYouTubeId(ex.media_url);
			newStep.startSeconds = asset?.startSeconds || 0;
			newStep.endSeconds = asset?.endSeconds || ((asset?.startSeconds || 0) + quantity);
		} else {
			newStep = createTimerStep();
			newStep.label = ex.name;
			newStep.stepMode = ex.default_mode || 'reps';
			newStep.targetReps = isReps ? quantity : 0;
			newStep.durationSeconds = !isReps ? quantity : 30;
			newStep.gifUrl = asset?.url || ex.media_url || '';
			newStep.mediaUrl = asset?.url || ex.media_url || '';
		}

		newStep.exercises = [{ id: ex.id, name: ex.name, category: ex.category, discipline: ex.discipline }];

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

	backBtn.addEventListener('click', closeSubwindow);
	cancelBtn.addEventListener('click', closeSubwindow);
	confirmBtn.addEventListener('click', commitAdd);

	stepMinus.addEventListener('click', () => {
		const isReps = (activeEx?.default_mode || 'reps') === 'reps';
		let val = parseInt(numInput.value, 10) || 10;
		numInput.value = Math.max(1, val - (isReps ? 5 : 5));
	});

	stepPlus.addEventListener('click', () => {
		const isReps = (activeEx?.default_mode || 'reps') === 'reps';
		let val = parseInt(numInput.value, 10) || 10;
		numInput.value = val + (isReps ? 5 : 5);
	});

	numInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			commitAdd();
		} else if (e.key === 'Escape') {
			closeSubwindow();
		}
	});

	function renderList(query = '') {
		const filtered = filterExercises(query);
		listEl.innerHTML = '';

		if (filtered.length === 0) {
			listEl.innerHTML = `<div class="empty-sessions"><p>No exercises found.</p></div>`;
			return;
		}

		filtered.forEach(ex => {
			const item = document.createElement('div');
			item.className = 'add-picker-item';

			const metaText = [ex.category, ex.discipline].filter(Boolean).join(' • ');

			item.innerHTML = `
				<div class="add-picker-item-left">
					<span class="add-picker-name">${escapeHtml(ex.name)}</span>
					${metaText ? `<span class="add-picker-sub">${escapeHtml(metaText)}</span>` : ''}
				</div>
				<div class="add-picker-item-right">
					<button class="btn-picker-add" title="Configure reps & add">+</button>
				</div>
			`;

			item.addEventListener('click', () => {
				openSubwindow(ex);
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
	modal.className = 'modal modal-add-picker';

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

			const modeStr = `⏱️ ${formatTime(combo.default_quantity || 190)}`;

			item.innerHTML = `
				<div class="add-picker-item-left">
					<span class="combo-flow-badge" style="font-size:0.7rem;padding:2px 6px;">${combo.flow_type === 'alternating' ? '⮀ Alternating' : '➔ Sequence'}</span>
					<span class="add-picker-name">${escapeHtml(combo.name)}</span>
				</div>
				<div class="add-picker-item-right">
					<span class="add-picker-mode">${modeStr}</span>
					<button class="btn btn-primary btn-xs">+ Add</button>
				</div>
			`;

			item.addEventListener('click', () => {
				const asset = (combo.media_assets || [])[0];
				const isVideo = asset && (asset.type === 'video' || Boolean(asset.videoId));
				const exList = (combo.exercise_ids || []).map(id => ({ id }));

				let newStep;
				if (isVideo) {
					newStep = createClipStep();
					newStep.label = combo.name;
					newStep.videoId = asset.videoId || parseYouTubeId(asset.url || combo.media_url);
					newStep.startSeconds = asset.startSeconds || 0;
					newStep.endSeconds = asset.endSeconds || ((asset.startSeconds || 0) + (combo.default_quantity || 190));
				} else {
					newStep = createTimerStep();
					newStep.label = combo.name;
					newStep.durationSeconds = combo.default_quantity || 190;
				}

				newStep.flow_type = combo.flow_type || 'alternating';
				newStep.exercises = exList;

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


