/**
 * Player module - YouTube IFrame API integration and timer countdown engine.
 */

import { formatTime } from './utils.js';
import { playCountdownBeep } from './audio.js';
import {
	setPlaylist, startMusic, pauseMusic, resumeMusic,
	stopMusic, muteMusic, unmuteMusic, hasMusic
} from './music.js';

/** @type {YT.Player|null} */
let ytPlayer = null;
let ytReady = false;
let playerCallbacks = {};

// Playback state
let currentRoutine = null;
let currentStepIndex = -1;
let isPlaying = false;
let isPaused = false;

// Timer state
let timerInterval = null;
let timerRemaining = 0;

// DOM references (set by init)
let dom = {};

/**
 * Load the YouTube IFrame API script.
 * @returns {Promise<void>}
 */
function loadYouTubeApi() {
	return new Promise((resolve) => {
		if (window.YT && window.YT.Player) {
			resolve();
			return;
		}
		window.onYouTubeIframeAPIReady = () => {
			resolve();
		};
		const tag = document.createElement('script');
		tag.src = 'https://www.youtube.com/iframe_api';
		document.head.appendChild(tag);
	});
}

/**
 * Initialize the player module.
 * @param {Object} domRefs - References to DOM elements
 * @param {Object} callbacks - Event callbacks
 */
export async function initPlayer(domRefs, callbacks) {
	dom = domRefs;
	playerCallbacks = callbacks || {};

	await loadYouTubeApi();

	ytPlayer = new YT.Player(dom.youtubeContainer.id, {
		height: '100%',
		width: '100%',
		playerVars: {
			controls: 0,
			disablekb: 1,
			modestbranding: 1,
			rel: 0,
			fs: 0,
			playsinline: 1,
		},
		events: {
			onReady: () => {
				ytReady = true;
			},
			onStateChange: onYTStateChange,
		}
	});
}

/**
 * Handle YouTube player state changes.
 */
function onYTStateChange(event) {
	if (event.data === YT.PlayerState.ENDED) {
		// Video segment finished, advance to next step
		if (isPlaying && !isPaused) {
			advanceStep();
		}
	}
}

/**
 * Start playing a routine from the beginning or a specific step.
 * @param {Object} routine - The routine to play
 * @param {number} [startIndex=0] - Step index to start from
 */
export function startRoutine(routine, startIndex = 0) {
	if (!routine || !routine.steps || routine.steps.length === 0) return;

	currentRoutine = routine;
	currentStepIndex = startIndex;
	isPlaying = true;
	isPaused = false;

	showPlayerUI();
	executeCurrentStep();
}

/**
 * Execute the current step (clip or timer).
 */
function executeCurrentStep() {
	if (!currentRoutine || currentStepIndex < 0 || currentStepIndex >= currentRoutine.steps.length) {
		stopPlayback();
		return;
	}

	clearTimer();
	const step = currentRoutine.steps[currentStepIndex];
	updateStepIndicator();

	if (step.type === 'clip') {
		executeClipStep(step);
	} else if (step.type === 'timer') {
		executeTimerStep(step);
	}
}

/**
 * Execute a video clip step.
 */
function executeClipStep(step) {
	dom.timerOverlay.classList.add('hidden');
	dom.videoWrapper.classList.remove('hidden');

	// Stop any music during video clips
	stopMusic();
	if (dom.musicControlsBar) {
		dom.musicControlsBar.classList.add('hidden');
	}

	if (ytReady && ytPlayer) {
		ytPlayer.loadVideoById({
			videoId: step.videoId,
			startSeconds: step.startSeconds || 0,
			endSeconds: step.endSeconds || undefined,
		});
	}

	dom.currentStepLabel.textContent = step.label || 'Video Clip';
	dom.currentStepType.textContent = '🎬 Video';
}

/**
 * Execute a timer/interval step.
 */
function executeTimerStep(step) {
	// Stop YouTube playback and hide
	if (ytReady && ytPlayer) {
		try { ytPlayer.pauseVideo(); } catch {}
	}
	dom.videoWrapper.classList.add('hidden');
	dom.timerOverlay.classList.remove('hidden');

	// Set and start music playlist specifically for this timer step
	const tracks = step.musicTracks || [];
	setPlaylist(tracks);
	if (tracks.length > 0) {
		if (dom.musicControlsBar) {
			dom.musicControlsBar.classList.remove('hidden');
		}
		if (dom.musicTrackName) {
			dom.musicTrackName.textContent = tracks[0].label || (tracks[0].source === 'youtube' ? tracks[0].videoId : tracks[0].fileName);
		}
		unmuteMusic();
		startMusic();
	} else {
		stopMusic();
		if (dom.musicControlsBar) {
			dom.musicControlsBar.classList.add('hidden');
		}
	}

	timerRemaining = step.durationSeconds;
	dom.timerLabel.textContent = step.label || 'Timer';
	dom.timerDisplay.textContent = formatTime(timerRemaining);
	dom.currentStepLabel.textContent = step.label || 'Timer';
	dom.currentStepType.textContent = '⏱️ Timer';

	// Update progress ring
	updateTimerProgress(step.durationSeconds, timerRemaining);

	if (!isPaused) {
		startTimer(step.durationSeconds);
	}
}

/**
 * Start the countdown timer.
 */
function startTimer(totalDuration) {
	clearTimer();
	const startTime = performance.now();
	const startRemaining = timerRemaining;
	let lastBeeped = Math.ceil(timerRemaining) + 1;

	timerInterval = setInterval(() => {
		if (isPaused) return;

		const elapsed = (performance.now() - startTime) / 1000;
		timerRemaining = Math.max(0, startRemaining - elapsed);
		const displaySeconds = Math.ceil(timerRemaining);

		dom.timerDisplay.textContent = formatTime(displaySeconds);
		updateTimerProgress(totalDuration, timerRemaining);

		// Play countdown beeps when crossing a new second boundary
		if (displaySeconds < lastBeeped) {
			lastBeeped = displaySeconds;
			if (displaySeconds <= 3) {
				playCountdownBeep(displaySeconds);
			}
		}

		if (timerRemaining <= 0) {
			clearTimer();
			advanceStep();
		}
	}, 100);
}

/**
 * Update the circular timer progress ring.
 */
function updateTimerProgress(total, remaining) {
	if (!dom.timerRing) return;
	const fraction = total > 0 ? remaining / total : 0;
	const circumference = 2 * Math.PI * 140; // r=140
	const offset = circumference * (1 - fraction);
	dom.timerRing.style.strokeDasharray = circumference;
	dom.timerRing.style.strokeDashoffset = offset;
}

/**
 * Clear any running timer interval.
 */
function clearTimer() {
	if (timerInterval) {
		clearInterval(timerInterval);
		timerInterval = null;
	}
}

/**
 * Advance to the next step.
 */
function advanceStep() {
	if (!currentRoutine) return;

	currentStepIndex++;
	if (currentStepIndex >= currentRoutine.steps.length) {
		// Routine complete
		stopPlayback();
		if (playerCallbacks.onRoutineComplete) {
			playerCallbacks.onRoutineComplete();
		}
		return;
	}

	executeCurrentStep();
}

/**
 * Go to previous step.
 */
export function previousStep() {
	if (!currentRoutine || currentStepIndex <= 0) return;
	currentStepIndex--;
	executeCurrentStep();
}

/**
 * Skip to next step.
 */
export function skipStep() {
	if (!currentRoutine) return;
	advanceStep();
}

/**
 * Toggle play/pause.
 */
export function togglePause() {
	if (!isPlaying) return;

	if (isPaused) {
		// Resume
		isPaused = false;
		const step = currentRoutine.steps[currentStepIndex];

		if (step.type === 'clip' && ytReady && ytPlayer) {
			ytPlayer.playVideo();
		} else if (step.type === 'timer') {
			// Restart timer from remaining
			const totalDuration = step.durationSeconds;
			startTimer(totalDuration);
		}

		// Resume background music
		if (hasMusic()) {
			resumeMusic();
		}

		dom.playPauseBtn.textContent = '⏸️';
		dom.playPauseBtn.title = 'Pause';
	} else {
		// Pause
		isPaused = true;
		clearTimer();

		if (ytReady && ytPlayer) {
			try { ytPlayer.pauseVideo(); } catch {}
		}

		// Pause background music
		if (hasMusic()) {
			pauseMusic();
		}

		dom.playPauseBtn.textContent = '▶️';
		dom.playPauseBtn.title = 'Play';
	}
}

/**
 * Reset to the beginning of the current routine.
 */
export function resetPlayback() {
	if (!currentRoutine) return;
	currentStepIndex = 0;
	isPaused = false;
	dom.playPauseBtn.textContent = '⏸️';
	dom.playPauseBtn.title = 'Pause';
	executeCurrentStep();
}

/**
 * Stop playback entirely and return to editor/list view.
 */
export function stopPlayback() {
	clearTimer();
	isPlaying = false;
	isPaused = false;
	currentStepIndex = -1;

	if (ytReady && ytPlayer) {
		try { ytPlayer.stopVideo(); } catch {}
	}

	// Stop background music
	stopMusic();

	hidePlayerUI();

	if (playerCallbacks.onStop) {
		playerCallbacks.onStop();
	}
}

/**
 * Jump to a specific step by index.
 */
export function jumpToStep(index) {
	if (!currentRoutine || index < 0 || index >= currentRoutine.steps.length) return;
	currentStepIndex = index;
	isPaused = false;
	dom.playPauseBtn.textContent = '⏸️';
	dom.playPauseBtn.title = 'Pause';
	executeCurrentStep();
}

/**
 * Show the player UI and hide editor.
 */
function showPlayerUI() {
	dom.playerView.classList.remove('hidden');
	dom.editorView.classList.add('hidden');
	dom.playPauseBtn.textContent = '⏸️';
	dom.playPauseBtn.title = 'Pause';
}

/**
 * Hide the player UI and show editor.
 */
function hidePlayerUI() {
	dom.playerView.classList.add('hidden');
	dom.editorView.classList.remove('hidden');
	dom.timerOverlay.classList.add('hidden');
	dom.videoWrapper.classList.add('hidden');
}

/**
 * Update the step indicator timeline.
 */
function updateStepIndicator() {
	if (!currentRoutine || !dom.stepTimeline) return;

	dom.stepTimeline.innerHTML = '';
	currentRoutine.steps.forEach((step, i) => {
		const indicator = document.createElement('button');
		indicator.className = 'step-indicator';
		if (i < currentStepIndex) indicator.classList.add('completed');
		if (i === currentStepIndex) indicator.classList.add('active');
		indicator.title = `${step.label} (${step.type === 'clip' ? 'Video' : formatTime(step.durationSeconds)})`;
		indicator.textContent = i + 1;
		indicator.addEventListener('click', () => jumpToStep(i));
		dom.stepTimeline.appendChild(indicator);
	});

	// Update step counter
	if (dom.stepCounter) {
		dom.stepCounter.textContent = `Step ${currentStepIndex + 1} / ${currentRoutine.steps.length}`;
	}

	// Update next step preview
	if (dom.nextStepPreview) {
		const next = currentRoutine.steps[currentStepIndex + 1];
		if (next) {
			dom.nextStepPreview.textContent = `Next: ${next.label}`;
		} else {
			dom.nextStepPreview.textContent = 'Last step';
		}
	}
}

/**
 * Get current playback state.
 */
export function getPlaybackState() {
	return { isPlaying, isPaused, currentStepIndex, currentRoutine };
}
