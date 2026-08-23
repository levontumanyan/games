/**
 * Player module - YouTube IFrame API integration and timer countdown engine.
 */

import { formatTime, formatFriendlyDuration } from './utils.js?v=6';
import { isBreakStep } from './editor.js?v=6';
import { playCountdownBeep } from './audio.js?v=6';
import { getClipIcon, getTimerIcon, getBreakIcon } from './icons.js?v=6';
import {
	setPlaylist, startMusic, pauseMusic, resumeMusic,
	stopMusic, muteMusic, unmuteMusic, hasMusic
} from './music.js?v=6';

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="7,4 19,12 7,20"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>`;

function updatePlayPauseBtn(paused) {
	if (!dom.playPauseBtn) return;
	dom.playPauseBtn.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
	dom.playPauseBtn.title = paused ? 'Play (Space)' : 'Pause (Space)';
}

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

// HUD idle timer
let hudIdleTimer = null;
const HUD_IDLE_DELAY = 3000;

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
			iv_load_policy: 3, // Disable video annotations, info cards & interactive popups
			cc_load_policy: 0, // Disable closed captions / subtitles by default
			cc_lang_pref: 'none',
			showinfo: 0,
			autohide: 1,
		},
		events: {
			onReady: () => {
				ytReady = true;
				disableCaptions();
			},
			onStateChange: onYTStateChange,
		}
	});

	// Fullscreen toggle buttons
	if (dom.fullscreenTopBtn) {
		dom.fullscreenTopBtn.addEventListener('click', toggleFullscreen);
	}
	if (dom.fullscreenDockBtn) {
		dom.fullscreenDockBtn.addEventListener('click', toggleFullscreen);
	}
	if (dom.playerBackBtn) {
		dom.playerBackBtn.addEventListener('click', stopPlayback);
	}

	// Click on stage/video to toggle play/pause
	if (dom.playerStage) {
		dom.playerStage.addEventListener('click', (e) => {
			if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.step-indicator')) return;
			if (isPlaying) {
				togglePause();
			}
		});
	}

	// Fullscreen change listener to sync icons across all browsers
	const onFsChange = () => syncFullscreenIcons();
	document.addEventListener('fullscreenchange', onFsChange);
	document.addEventListener('webkitfullscreenchange', onFsChange);
	document.addEventListener('mozfullscreenchange', onFsChange);
	document.addEventListener('MSFullscreenChange', onFsChange);

	// User activity events for auto-hiding HUD
	const resetActivity = () => {
		if (isPlaying) {
			resetHudIdleTimer();
		}
	};
	window.addEventListener('mousemove', resetActivity, { passive: true });
	window.addEventListener('touchstart', resetActivity, { passive: true });

	// Global player keyboard controls
	window.addEventListener('keydown', (e) => {
		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

		if (e.key === 'f' || e.key === 'F') {
			e.preventDefault();
			toggleFullscreen();
			return;
		}

		if (!isPlaying) return;

		resetActivity();

		if (e.code === 'Space') {
			e.preventDefault();
			togglePause();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			skipStep();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			previousStep();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (isNativeFullscreen()) {
				toggleFullscreen();
			}
			stopPlayback();
		} else if (e.key === 'r' || e.key === 'R') {
			e.preventDefault();
			resetPlayback();
		}
	});
}

/**
 * Check if the browser is currently in native fullscreen.
 */
export function isNativeFullscreen() {
	return !!(
		document.fullscreenElement ||
		document.webkitFullscreenElement ||
		document.mozFullScreenElement ||
		document.msFullscreenElement
	);
}

/**
 * Toggle native Fullscreen mode with full cross-browser vendor prefix support.
 */
export async function toggleFullscreen() {
	try {
		if (!isNativeFullscreen()) {
			const el = document.documentElement;
			if (el.requestFullscreen) {
				await el.requestFullscreen();
			} else if (el.webkitRequestFullscreen) {
				await el.webkitRequestFullscreen();
			} else if (el.mozRequestFullScreen) {
				await el.mozRequestFullScreen();
			} else if (el.msRequestFullscreen) {
				await el.msRequestFullscreen();
			}
		} else {
			if (document.exitFullscreen) {
				await document.exitFullscreen();
			} else if (document.webkitExitFullscreen) {
				await document.webkitExitFullscreen();
			} else if (document.mozCancelFullScreen) {
				await document.mozCancelFullScreen();
			} else if (document.msExitFullscreen) {
				await document.msExitFullscreen();
			}
		}
	} catch (err) {
		console.warn('Fullscreen request failed:', err);
	}
}

/**
 * Sync fullscreen enter/exit icons across UI.
 */
export function syncFullscreenIcons() {
	const isFull = isNativeFullscreen();
	const enterIcons = document.querySelectorAll('.icon-enter-fullscreen');
	const exitIcons = document.querySelectorAll('.icon-exit-fullscreen');

	enterIcons.forEach(el => el.classList.toggle('hidden', isFull));
	exitIcons.forEach(el => el.classList.toggle('hidden', !isFull));
}

/**
 * Reset HUD idle timer to auto-hide controls after delay.
 */
function resetHudIdleTimer() {
	if (!dom.playerView) return;
	dom.playerView.classList.remove('hud-idle');

	if (hudIdleTimer) {
		clearTimeout(hudIdleTimer);
		hudIdleTimer = null;
	}

	if (isPlaying && !isPaused) {
		hudIdleTimer = setTimeout(() => {
			if (isPlaying && !isPaused && dom.playerView) {
				dom.playerView.classList.add('hud-idle');
			}
		}, HUD_IDLE_DELAY);
	}
}

/**
 * Clear HUD idle timer and keep controls visible.
 */
function clearHudIdleTimer() {
	if (hudIdleTimer) {
		clearTimeout(hudIdleTimer);
		hudIdleTimer = null;
	}
	if (dom.playerView) {
		dom.playerView.classList.remove('hud-idle');
	}
}

/**
 * Actively disable YouTube closed captions / subtitles.
 */
function disableCaptions() {
	if (!ytReady || !ytPlayer) return;
	try {
		if (typeof ytPlayer.unloadModule === 'function') {
			ytPlayer.unloadModule('captions');
			ytPlayer.unloadModule('cc');
		}
		if (typeof ytPlayer.setOption === 'function') {
			ytPlayer.setOption('captions', 'track', {});
			ytPlayer.setOption('cc', 'track', {});
			ytPlayer.setOption('captions', 'fontSize', 0);
		}
	} catch {}
}

/**
 * Handle YouTube player state changes.
 */
function onYTStateChange(event) {
	if (event.data === YT.PlayerState.PLAYING) {
		disableCaptions();
	} else if (event.data === YT.PlayerState.ENDED) {
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
	resetHudIdleTimer();
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

	resetHudIdleTimer();
}

/**
 * Execute a video clip step.
 */
function executeClipStep(step) {
	dom.timerOverlay.classList.add('hidden');
	dom.videoWrapper.classList.remove('hidden');

	if (dom.upNextCard) {
		dom.upNextCard.classList.add('hidden');
	}

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
		disableCaptions();
	}

	dom.currentStepLabel.textContent = step.label || 'Video Clip';
	dom.currentStepType.innerHTML = `${getClipIcon(14)} Video`;
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

	const isBreak = isBreakStep(step);
	dom.timerOverlay.classList.toggle('is-break', isBreak);

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
	dom.timerLabel.textContent = step.label || (isBreak ? 'Rest' : 'Timer');
	dom.timerDisplay.textContent = formatTime(timerRemaining);
	dom.currentStepLabel.textContent = step.label || (isBreak ? 'Rest' : 'Timer');
	dom.currentStepType.innerHTML = isBreak ? `${getBreakIcon(14)} Rest` : `${getTimerIcon(14)} Timer`;

	// Update Up Next preview card for break steps
	if (dom.upNextCard) {
		const next = currentRoutine.steps[currentStepIndex + 1];
		if (isBreak && next) {
			dom.upNextCard.classList.remove('hidden');
			if (dom.upNextLabel) {
				dom.upNextLabel.textContent = next.label || (next.type === 'clip' ? 'Video Clip' : 'Exercise');
			}
			if (dom.upNextMeta) {
				if (next.type === 'clip') {
					const start = next.startSeconds || 0;
					const end = next.endSeconds || (start + 60);
					const dur = Math.max(0, end - start);
					dom.upNextMeta.textContent = `🎬 Next Video · ${formatFriendlyDuration(dur)} (${formatTime(start)} → ${formatTime(end)})`;
				} else if (isBreakStep(next)) {
					dom.upNextMeta.textContent = `☕ Rest (${formatFriendlyDuration(next.durationSeconds || 30)})`;
				} else {
					dom.upNextMeta.textContent = `⏱ Exercise (${formatFriendlyDuration(next.durationSeconds || 30)})`;
				}
			}
			if (dom.upNextMediaThumb) {
				if (next.type === 'clip' && next.videoId) {
					dom.upNextMediaThumb.innerHTML = `
						<img src="https://img.youtube.com/vi/${next.videoId}/hqdefault.jpg" onerror="this.src='https://img.youtube.com/vi/${next.videoId}/mqdefault.jpg'" alt="${next.label || 'Next Video'}">
						<div class="thumbnail-play-overlay">▶</div>
					`;
				} else if (isBreakStep(next)) {
					dom.upNextMediaThumb.innerHTML = getBreakIcon(24);
				} else {
					dom.upNextMediaThumb.innerHTML = `<div class="timer-visual-box"><span class="timer-icon">${getTimerIcon(22)}</span></div>`;
				}
			}
		} else {
			dom.upNextCard.classList.add('hidden');
		}
	}

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

		updatePlayPauseBtn(false);
		resetHudIdleTimer();
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

		updatePlayPauseBtn(true);
		clearHudIdleTimer();
	}
}

/**
 * Reset to the beginning of the current routine.
 */
export function resetPlayback() {
	if (!currentRoutine) return;
	currentStepIndex = 0;
	isPaused = false;
	updatePlayPauseBtn(false);
	executeCurrentStep();
}

/**
 * Stop playback entirely and return to editor/list view.
 */
export function stopPlayback() {
	clearTimer();
	clearHudIdleTimer();
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
	updatePlayPauseBtn(false);
	executeCurrentStep();
}

/**
 * Show the player UI and hide other views.
 */
function showPlayerUI() {
	dom.playerView.classList.remove('hidden');
	if (dom.editorView) dom.editorView.classList.add('hidden');
	if (dom.routineView) dom.routineView.classList.add('hidden');
	if (dom.emptyView) dom.emptyView.classList.add('hidden');
	if (dom.playerRoutineTitle) {
		dom.playerRoutineTitle.textContent = currentRoutine?.title || 'Workout';
	}
	updatePlayPauseBtn(false);
}

/**
 * Hide the player UI.
 */
function hidePlayerUI() {
	dom.playerView.classList.add('hidden');
	dom.timerOverlay.classList.add('hidden');
	dom.videoWrapper.classList.add('hidden');
	if (dom.upNextCard) dom.upNextCard.classList.add('hidden');
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
