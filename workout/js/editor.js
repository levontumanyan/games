/**
 * Editor module - Routine & step editing, drag-and-drop reorder.
 */

import { generateId, parseYouTubeId, parseTime, formatTime } from './utils.js?v=4';
import { saveAudioFile, deleteAudioFile } from './musicdb.js?v=4';
import { showPrompt, showAlert } from './modal.js?v=4';

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
	const el = document.createElement('div');
	el.className = `step-card step-${step.type}`;
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
	stepType.textContent = step.type === 'clip' ? '🎬 Clip' : '⏱️ Timer';

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

	// Label
	frag.appendChild(createField('Label', step.label, (val) => {
		step.label = val;
		onUpdate();
	}));

	// YouTube URL/ID
	frag.appendChild(createField('YouTube URL or ID', step.videoId, (val) => {
		const id = parseYouTubeId(val);
		if (id) {
			step.videoId = id;
			onUpdate();
		}
	}, 'e.g., https://youtube.com/watch?v=dQw4w9WgXcQ'));

	// Start time
	const timeRow = document.createElement('div');
	timeRow.className = 'field-row';

	timeRow.appendChild(createField('Start (MM:SS or sec)', formatTime(step.startSeconds), (val) => {
		step.startSeconds = parseTime(val);
		onUpdate();
	}, '0:00'));

	timeRow.appendChild(createField('End (MM:SS or sec)', formatTime(step.endSeconds), (val) => {
		step.endSeconds = parseTime(val);
		onUpdate();
	}, '1:00'));

	frag.appendChild(timeRow);

	return frag;
}

/**
 * Create input fields for a timer step.
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

	// Duration
	frag.appendChild(createField('Duration (MM:SS or sec)', formatTime(step.durationSeconds), (val) => {
		step.durationSeconds = parseTime(val);
		onUpdate();
	}, '0:30'));

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
 * Create an input field group.
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
