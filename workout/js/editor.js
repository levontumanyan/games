/**
 * Editor module - Routine & step editing, drag-and-drop reorder.
 */

import { generateId, parseYouTubeId, parseYouTubeInfo, parseTime, formatTime, formatFriendlyDuration } from './utils.js?v=5';
import { saveAudioFile, deleteAudioFile } from './musicdb.js?v=5';
import { showPrompt, showAlert } from './modal.js?v=5';
import { getClipIcon, getTimerIcon, getBreakIcon } from './icons.js?v=5';

/**
 * Render the routine editor for a given routine.
 * @param {Object} routine - The routine to edit
 * @param {HTMLElement} container - Container element for the step list
 * @param {Function} onUpdate - Callback when routine is modified
 */
export function renderEditor(routine, container, onUpdate) {
	container.innerHTML = '';

	if (!routine) {
		container.innerHTML = '<p class="empty-message">Select or create a workout to get started.</p>';
		return;
	}

	routine.steps.forEach((step, index) => {
		const stepEl = createStepElement(step, index, routine, onUpdate);
		container.appendChild(stepEl);
	});

	// Make steps draggable for reordering
	initDragAndDrop(container, routine, onUpdate);
}

/**
 * Create a DOM element for a single step.
 */
function createStepElement(step, index, routine, onUpdate) {
	const isBreak = isBreakStep(step);
	const el = document.createElement('div');
	el.className = `step-card step-${step.type}` + (isBreak ? ' step-break step-card-compact' : '');
	el.dataset.index = index;
	el.draggable = true;

	const header = document.createElement('div');
	header.className = 'step-header';

	const dragHandle = document.createElement('span');
	dragHandle.className = 'drag-handle';
	dragHandle.textContent = '⠿';
	dragHandle.title = 'Drag to reorder';

	const stepNumber = document.createElement('span');
	stepNumber.className = 'step-number';
	stepNumber.textContent = `#${index + 1}`;

	const stepType = document.createElement('span');
	stepType.className = 'step-type-badge';
	if (step.type === 'clip') {
		stepType.innerHTML = `${getClipIcon(13)} Clip`;
	} else if (isBreak) {
		stepType.innerHTML = `${getBreakIcon(13)} Break`;
	} else {
		stepType.innerHTML = `${getTimerIcon(13)} Timer`;
	}

	const removeBtn = document.createElement('button');
	removeBtn.className = 'btn btn-danger btn-sm';
	removeBtn.textContent = '✕';
	removeBtn.title = 'Remove step';
	removeBtn.addEventListener('click', () => {
		routine.steps.splice(index, 1);
		onUpdate();
	});

	header.append(dragHandle, stepNumber, stepType, removeBtn);
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
/**
 * Create input fields for a clip step.
 */
function createClipFields(step, onUpdate) {
	const frag = document.createDocumentFragment();

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
		if (l === 'rest' || l === 'break' || l === 'quick break') return true;
	}
	return false;
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
 * Create input fields for a timer step (Option 1: Start + Duration / Clean Duration Model).
 */
function createTimerFields(step, onUpdate) {
	const frag = document.createDocumentFragment();

	// Ensure musicTracks array exists
	if (!step.musicTracks) step.musicTracks = [];

	// Label
	frag.appendChild(createField('Exercise Label', step.label, (val) => {
		step.label = val;
		onUpdate();
	}, 'e.g., Push-ups, Rest, Plank'));

	// Duration field (Option 1)
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
		durationSeconds: 30,
		label: 'Exercise',
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
		durationSeconds: durationSeconds,
		label: 'Rest',
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
