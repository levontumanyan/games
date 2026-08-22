/**
 * App controller - coordinates UI, storage, editor, and player modules.
 */

import { loadRoutines, saveRoutines, exportRoutines, importRoutines } from './storage.js';
import { renderEditor, createClipStep, createTimerStep, createRoutine } from './editor.js';
import {
	initPlayer, startRoutine, stopPlayback,
	togglePause, skipStep, previousStep, resetPlayback
} from './player.js';
import { initAudio } from './audio.js';
import {
	initMusic, setVolume as setMusicVolume, nextTrack, prevTrack,
	muteMusic, unmuteMusic, isMuted as isMusicMuted
} from './music.js';
import { formatTime } from './utils.js';

let routines = [];
let selectedRoutineId = null;

// DOM references
const dom = {};

/**
 * Initialize the application.
 */
async function init() {
	cacheDom();
	routines = loadRoutines();

	// Select the first routine by default
	if (routines.length > 0) {
		selectedRoutineId = routines[0].id;
	}

	renderRoutineList();
	renderSelectedRoutine();
	bindEvents();

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
 * Save routines and re-render editor.
 */
function persist() {
	saveRoutines(routines);
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

function handleAddWorkout() {
	const title = prompt('Workout name:');
	if (title === null) return;
	const routine = createRoutine(title.trim() || 'New Workout');
	routines.push(routine);
	selectedRoutineId = routine.id;
	persist();
	renderRoutineList();
	renderSelectedRoutine();
}

function handleDeleteRoutine() {
	const routine = getSelectedRoutine();
	if (!routine) return;
	if (!confirm(`Delete "${routine.title}"?`)) return;

	routines = routines.filter(r => r.id !== routine.id);
	selectedRoutineId = routines.length > 0 ? routines[0].id : null;
	persist();
	renderRoutineList();
	renderSelectedRoutine();
}

function handleAddClip() {
	const routine = getSelectedRoutine();
	if (!routine) return;
	routine.steps.push(createClipStep());
	persist();
	renderSelectedRoutine();
}

function handleAddTimer() {
	const routine = getSelectedRoutine();
	if (!routine) return;
	routine.steps.push(createTimerStep());
	persist();
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
		persist();
		renderRoutineList();
		renderSelectedRoutine();
	} catch (err) {
		alert('Import failed: ' + err.message);
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
