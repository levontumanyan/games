/**
 * App controller - coordinates UI, storage, editor, and player modules.
 */

import {
	loadRoutines, saveRoutines, fetchServerRoutines,
	saveServerRoutines, exportRoutines, importRoutines
} from './storage.js?v=3';
import { renderEditor, createClipStep, createTimerStep, createRoutine } from './editor.js?v=3';
import {
	initPlayer, startRoutine, stopPlayback,
	togglePause, skipStep, previousStep, resetPlayback
} from './player.js?v=3';
import { initAudio } from './audio.js?v=3';
import {
	initMusic, setVolume as setMusicVolume, nextTrack, prevTrack,
	muteMusic, unmuteMusic, isMuted as isMusicMuted
} from './music.js?v=3';
import { formatTime } from './utils.js?v=3';
import { showPrompt, showConfirm, showAlert } from './modal.js?v=3';

let routines = [];
let selectedRoutineId = null;
let syncTimeout = null;

// DOM references
const dom = {};

/**
 * Initialize the application.
 */
async function init() {
	cacheDom();

	// Fast initial render from localStorage cache
	routines = loadRoutines();
	if (routines.length > 0) {
		selectedRoutineId = routines[0].id;
	}

	renderRoutineList();
	renderSelectedRoutine();
	bindEvents();

	// Fetch server state as source of truth
	await syncWithServerOnStartup();

	// Initialize audio on first interaction
	document.addEventListener('click', () => initAudio(), { once: true });

	// Initialize YouTube player
	await initPlayer(
		{
			youtubeContainer: dom.youtubePlayer,
			playerView: dom.playerView,
			editorView: dom.editorView,
			timerOverlay: dom.timerOverlay,
			timerDisplay: dom.timerDisplay,
			timerLabel: dom.timerLabel,
			timerRing: dom.timerRing,
			videoWrapper: dom.videoWrapper,
			currentStepLabel: dom.currentStepLabel,
			currentStepType: dom.currentStepType,
			stepTimeline: dom.stepTimeline,
			stepCounter: dom.stepCounter,
			nextStepPreview: dom.nextStepPreview,
			playPauseBtn: dom.playPauseBtn,
			musicControlsBar: dom.musicControlsBar,
			musicTrackName: dom.musicTrackName,
		},
		{
			onStop: () => {
				renderSelectedRoutine();
			},
			onRoutineComplete: () => {
				dom.timerOverlay.classList.remove('hidden');
				dom.videoWrapper.classList.add('hidden');
				dom.timerDisplay.textContent = '🎉';
				dom.timerLabel.textContent = 'Workout Complete!';
				dom.currentStepLabel.textContent = 'Done';
				dom.currentStepType.textContent = '';
				dom.nextStepPreview.textContent = '';
			},
		}
	);

	// Initialize music module (hidden YouTube player for background music)
	await initMusicModule();
}

/**
 * Cache all DOM element references.
 */
function cacheDom() {
	dom.routineList = document.getElementById('routine-list');
	dom.addWorkoutBtn = document.getElementById('add-workout-btn');
	dom.exportBtn = document.getElementById('export-btn');
	dom.importBtn = document.getElementById('import-btn');
	dom.syncStatus = document.getElementById('sync-status');
	dom.editorView = document.getElementById('editor-view');
	dom.playerView = document.getElementById('player-view');
	dom.routineTitle = document.getElementById('routine-title');
	dom.stepList = document.getElementById('step-list');
	dom.addClipBtn = document.getElementById('add-clip-btn');
	dom.addTimerBtn = document.getElementById('add-timer-btn');
	dom.playRoutineBtn = document.getElementById('play-routine-btn');
	dom.deleteRoutineBtn = document.getElementById('delete-routine-btn');
	dom.editorEmpty = document.getElementById('editor-empty');
	dom.editorContent = document.getElementById('editor-content');

	// Player elements
	dom.youtubePlayer = document.getElementById('youtube-player');
	dom.videoWrapper = document.getElementById('video-wrapper');
	dom.timerOverlay = document.getElementById('timer-overlay');
	dom.timerDisplay = document.getElementById('timer-display');
	dom.timerLabel = document.getElementById('timer-label');
	dom.timerRing = document.getElementById('timer-ring');
	dom.currentStepLabel = document.getElementById('current-step-label');
	dom.currentStepType = document.getElementById('current-step-type');
	dom.stepTimeline = document.getElementById('step-timeline');
	dom.stepCounter = document.getElementById('step-counter');
	dom.nextStepPreview = document.getElementById('next-step-preview');
	dom.playPauseBtn = document.getElementById('play-pause-btn');
	dom.skipBtn = document.getElementById('skip-btn');
	dom.prevBtn = document.getElementById('prev-btn');
	dom.resetBtn = document.getElementById('reset-btn');
	dom.stopBtn = document.getElementById('stop-btn');

	// Music player controls
	dom.musicControlsBar = document.getElementById('music-controls-bar');
	dom.musicTrackName = document.getElementById('music-track-name');
	dom.musicVolume = document.getElementById('music-volume');
	dom.musicMuteBtn = document.getElementById('music-mute-btn');
	dom.musicPrevBtn = document.getElementById('music-prev-btn');
	dom.musicNextBtn = document.getElementById('music-next-btn');

	// Hidden YouTube music player
	dom.ytMusicPlayer = document.getElementById('yt-music-player');
}

/**
 * Update UI sync status indicator.
 * @param {'syncing' | 'synced' | 'error'} state
 * @param {string} [message]
 */
function setSyncStatus(state, message) {
	if (!dom.syncStatus) return;
	dom.syncStatus.className = `sync-status ${state}`;
	if (state === 'syncing') {
		dom.syncStatus.textContent = '🔄 ' + (message || 'Saving...');
	} else if (state === 'synced') {
		dom.syncStatus.textContent = '☁️ ' + (message || 'Synced');
	} else if (state === 'error') {
		dom.syncStatus.textContent = '⚠️ ' + (message || 'Offline');
	}
}

/**
 * Sync current routines state with the backend server.
 */
async function syncToServer() {
	setSyncStatus('syncing', 'Saving...');
	try {
		await saveServerRoutines(routines);
		setSyncStatus('synced', 'Synced');
	} catch (err) {
		console.warn('Failed to sync routines to server:', err);
		setSyncStatus('error', 'Saved locally (offline)');
	}
}

/**
 * Initial sync with server on app load.
 */
async function syncWithServerOnStartup() {
	try {
		setSyncStatus('syncing', 'Syncing...');
		const serverRoutines = await fetchServerRoutines();
		routines = serverRoutines;
		saveRoutines(routines);
		if (routines.length > 0) {
			if (!routines.some(r => r.id === selectedRoutineId)) {
				selectedRoutineId = routines[0].id;
			}
		} else {
			selectedRoutineId = null;
		}
		renderRoutineList();
		renderSelectedRoutine();
		setSyncStatus('synced', 'Synced');
	} catch (err) {
		console.warn('Could not sync with server on startup, using local storage cache:', err);
		setSyncStatus('error', 'Offline mode');
	}
}

/**
 * Bind UI event handlers.
 */
function bindEvents() {
	dom.addWorkoutBtn.addEventListener('click', handleAddWorkout);
	dom.exportBtn.addEventListener('click', handleExport);
	dom.importBtn.addEventListener('click', handleImport);
	dom.addClipBtn.addEventListener('click', handleAddClip);
	dom.addTimerBtn.addEventListener('click', handleAddTimer);
	dom.playRoutineBtn.addEventListener('click', handlePlayRoutine);
	dom.deleteRoutineBtn.addEventListener('click', handleDeleteRoutine);
	dom.playPauseBtn.addEventListener('click', togglePause);
	dom.skipBtn.addEventListener('click', skipStep);
	dom.prevBtn.addEventListener('click', previousStep);
	dom.resetBtn.addEventListener('click', resetPlayback);
	dom.stopBtn.addEventListener('click', stopPlayback);

	// Routine title editing
	dom.routineTitle.addEventListener('change', (e) => {
		const routine = getSelectedRoutine();
		if (routine) {
			routine.title = e.target.value.trim() || 'Untitled Workout';
			persist();
			renderRoutineList();
		}
	});

	// Music player controls
	dom.musicPrevBtn.addEventListener('click', prevTrack);
	dom.musicNextBtn.addEventListener('click', nextTrack);
	dom.musicVolume.addEventListener('input', (e) => {
		setMusicVolume(parseInt(e.target.value, 10) / 100);
	});
	dom.musicMuteBtn.addEventListener('click', () => {
		if (isMusicMuted()) {
			unmuteMusic();
			dom.musicMuteBtn.textContent = '🔊';
		} else {
			muteMusic();
			dom.musicMuteBtn.textContent = '🔇';
		}
	});
}

/**
 * Get the currently selected routine.
 */
function getSelectedRoutine() {
	return routines.find(r => r.id === selectedRoutineId) || null;
}

/**
 * Save routines to local storage and sync to server.
 * @param {boolean} [immediateServerSync=false]
 */
function persist(immediateServerSync = false) {
	saveRoutines(routines);
	if (syncTimeout) {
		clearTimeout(syncTimeout);
	}
	if (immediateServerSync) {
		syncToServer();
	} else {
		setSyncStatus('syncing', 'Saving...');
		syncTimeout = setTimeout(syncToServer, 400);
	}
}


/**
 * Render the sidebar routine list.
 */
function renderRoutineList() {
	dom.routineList.innerHTML = '';

	routines.forEach((routine) => {
		const li = document.createElement('li');
		li.className = 'routine-item';
		if (routine.id === selectedRoutineId) {
			li.classList.add('active');
		}

		const info = document.createElement('div');
		info.className = 'routine-info';

		const title = document.createElement('span');
		title.className = 'routine-title-text';
		title.textContent = routine.title;

		const meta = document.createElement('span');
		meta.className = 'routine-meta';
		const clipCount = routine.steps.filter(s => s.type === 'clip').length;
		const timerCount = routine.steps.filter(s => s.type === 'timer').length;
		const totalTime = routine.steps.reduce((sum, s) => {
			if (s.type === 'timer') return sum + s.durationSeconds;
			if (s.type === 'clip') return sum + ((s.endSeconds || 0) - (s.startSeconds || 0));
			return sum;
		}, 0);
		meta.textContent = `${routine.steps.length} steps · ${clipCount} clips · ${timerCount} timers · ~${formatTime(totalTime)}`;

		info.append(title, meta);
		li.appendChild(info);

		li.addEventListener('click', () => {
			selectedRoutineId = routine.id;
			renderRoutineList();
			renderSelectedRoutine();
		});

		dom.routineList.appendChild(li);
	});
}

/**
 * Render the editor for the selected routine.
 */
function renderSelectedRoutine() {
	const routine = getSelectedRoutine();

	if (!routine) {
		dom.editorEmpty.classList.remove('hidden');
		dom.editorContent.classList.add('hidden');
		return;
	}

	dom.editorEmpty.classList.add('hidden');
	dom.editorContent.classList.remove('hidden');
	dom.routineTitle.value = routine.title;

	const onStepUpdate = () => {
		persist();
		renderEditor(routine, dom.stepList, onStepUpdate);
		renderRoutineList();
	};
	renderEditor(routine, dom.stepList, onStepUpdate);

	// Disable play if no steps
	dom.playRoutineBtn.disabled = routine.steps.length === 0;
}

// ── Event Handlers ──────────────────────────────────────────────────────────

async function handleAddWorkout() {
	const title = await showPrompt({
		title: 'New Workout',
		message: 'Enter a name for your new workout routine:',
		placeholder: 'e.g. Morning HIIT, Upper Body Power',
		confirmText: 'Create Workout'
	});
	if (title === null) return;
	const routine = createRoutine(title.trim() || 'New Workout');
	routines.push(routine);
	selectedRoutineId = routine.id;
	persist(true);
	renderRoutineList();
	renderSelectedRoutine();
}

async function handleDeleteRoutine() {
	const routine = getSelectedRoutine();
	if (!routine) return;
	const confirmed = await showConfirm({
		title: 'Delete Workout',
		message: `Are you sure you want to delete "${routine.title}"? This cannot be undone.`,
		confirmText: 'Delete',
		danger: true
	});
	if (!confirmed) return;

	routines = routines.filter(r => r.id !== routine.id);
	selectedRoutineId = routines.length > 0 ? routines[0].id : null;
	persist(true);
	renderRoutineList();
	renderSelectedRoutine();
}

function handleAddClip() {
	const routine = getSelectedRoutine();
	if (!routine) return;
	routine.steps.push(createClipStep());
	persist(true);
	renderSelectedRoutine();
}

function handleAddTimer() {
	const routine = getSelectedRoutine();
	if (!routine) return;
	routine.steps.push(createTimerStep());
	persist(true);
	renderSelectedRoutine();
}

function handlePlayRoutine() {
	const routine = getSelectedRoutine();
	if (!routine || routine.steps.length === 0) return;
	startRoutine(routine);
}

function handleExport() {
	exportRoutines(routines);
}

async function handleImport() {
	try {
		const imported = await importRoutines();
		routines = imported;
		selectedRoutineId = routines.length > 0 ? routines[0].id : null;
		persist(true);
		renderRoutineList();
		renderSelectedRoutine();
	} catch (err) {
		await showAlert({
			title: 'Import Failed',
			message: 'Could not import routines: ' + err.message
		});
	}
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

async function initMusicModule() {
	// Initialize the hidden YouTube music player after the main player is ready
	await initMusic(dom.ytMusicPlayer, {
		onTrackChange: (track) => {
			if (dom.musicTrackName) {
				dom.musicTrackName.textContent = track.label || 'Music';
			}
		},
	});
}

document.addEventListener('DOMContentLoaded', init);
