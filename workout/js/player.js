/**
 * Player module - YouTube IFrame API integration and timer countdown engine.
 */

import {
	formatTime, formatFriendlyDuration, parseYouTubeId, escapeHtml,
	getEffectiveSubStepReps, getEffectiveSubStepDuration,
	isBreakStep, isSubStepReps
} from './utils.js';
import { resolveStepMediaUrl, getStepDisplayName } from './editor.js';
import { playCountdownBeep } from './audio.js';
import { getClipIcon, getTimerIcon, getBreakIcon, getRepsIcon, getExerciseIcon, getMuscleIcon } from './icons.js';
import {
	setPlaylist, startMusic, pauseMusic, resumeMusic,
	stopMusic, muteMusic, unmuteMusic, hasMusic, getCurrentTrack,
	toggleMusicPlayback, isMusicPausedByUser
} from './music.js';
import {
	startSession, updateSessionStep, pauseSession,
	resumeSession, completeSession, stopSession,
	isSessionActive, recordStepReps
} from './session.js';
import {
	inferMusclesForExercise, getExerciseById, getExerciseInstructionMedia, getExerciseFollowAlongMedia,
	resolveStepVideo, resolveStepVisual, classifyStep, hasSubSteps
} from './exercises.js';
import { MUSCLE_DEFINITIONS } from './taxonomy.js';

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
let currentSubStepIndex = 0;
let isPlaying = false;
let isPaused = false;
let isPreviewMode = false;
let isRepsMode = false;
let currentRepsValue = 20;

// Timer state
let timerInterval = null;
let timerRemaining = 0;

// Clip state
let clipCheckInterval = null;
let clipHasStartedPlaying = false;
let clipLoadedAt = 0;
let accumulatedVideoTime = 0;
let videoSafetyFallbackTimeout = null;
let cuedVideoAsset = null;

// HUD idle timer
let hudIdleTimer = null;
const HUD_IDLE_DELAY = 3000;

// Starting countdown state (5-second intro)
let isCountingDown = false;
let countdownInterval = null;
let countdownTimeout = null;

// Screen Wake Lock (prevent sleep / screensaver during workouts & fullscreen)
let wakeLock = null;

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
		const existingCallback = window.onYouTubeIframeAPIReady;
		window.onYouTubeIframeAPIReady = () => {
			if (typeof existingCallback === 'function') existingCallback();
			console.log('[Workout Player] YouTube IFrame API script ready.');
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

	console.log('[Workout Player] Initializing YT.Player on element #', dom.youtubeContainer?.id);

	ytPlayer = new YT.Player(dom.youtubeContainer.id, {
		height: '100%',
		width: '100%',
		playerVars: {
			controls: 0,
			disablekb: 1,
			enablejsapi: 1,
			origin: window.location.origin,
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
				console.log('[Workout Player] YouTube Player is ready for playback.');
				disableCaptions();
			},
			onStateChange: onYTStateChange,
			onError: onYTError,
		}
	});
	window.__ytPlayer = ytPlayer;

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

	// Reps mode interactive stepper & done buttons
	if (dom.repsStepMinus) {
		dom.repsStepMinus.addEventListener('click', (e) => {
			e.stopPropagation();
			decrementReps();
		});
	}
	if (dom.repsStepPlus) {
		dom.repsStepPlus.addEventListener('click', (e) => {
			e.stopPropagation();
			incrementReps();
		});
	}
	if (dom.repsDoneBtn) {
		dom.repsDoneBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			completeRepsStep();
		});
	}

	// Click on stage/video to toggle play/pause or done
	if (dom.playerStage) {
		dom.playerStage.addEventListener('click', (e) => {
			if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.step-indicator')) return;
			if (isPlaying) {
				if (isCountingDown) {
					skipCountdown();
				} else if (isRepsMode) {
					completeRepsStep();
				} else {
					togglePause();
				}
			}
		});
	}

	// Fullscreen change listener to sync icons across all browsers and manage wake lock
	const onFsChange = () => {
		syncFullscreenIcons();
		if (isNativeFullscreen() || (isPlaying && !isPaused)) {
			requestWakeLock();
		} else {
			releaseWakeLock();
		}
	};
	document.addEventListener('fullscreenchange', onFsChange);
	document.addEventListener('webkitfullscreenchange', onFsChange);
	document.addEventListener('mozfullscreenchange', onFsChange);
	document.addEventListener('MSFullscreenChange', onFsChange);

	// Screen Wake Lock re-acquisition when returning to active tab/window
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible' && (isNativeFullscreen() || (isPlaying && !isPaused))) {
			requestWakeLock();
		}
	});

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
			if (isPlaying || (dom.playerView && !dom.playerView.classList.contains('hidden'))) {
				e.preventDefault();
				toggleFullscreen();
			}
			return;
		}

		if (!isPlaying) return;

		resetActivity();

		if (e.code === 'Space' || e.key === 'Enter') {
			e.preventDefault();
			if (isCountingDown) {
				skipCountdown();
			} else if (isRepsMode) {
				completeRepsStep();
			} else {
				togglePause();
			}
		} else if (isRepsMode && (e.key === 'ArrowUp' || e.key === '+' || e.key === '=')) {
			e.preventDefault();
			incrementReps();
		} else if (isRepsMode && (e.key === 'ArrowDown' || e.key === '-' || e.key === '_')) {
			e.preventDefault();
			decrementReps();
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
		} else if (e.key === 'm' || e.key === 'M') {
			if (hasMusic()) {
				e.preventDefault();
				toggleMusicPlayback();
			}
		}
	});
}

/**
 * Request Screen Wake Lock to prevent the screen/laptop from going to sleep or screensaver.
 */
export async function requestWakeLock() {
	if (!('wakeLock' in navigator)) return;
	try {
		if (!wakeLock || wakeLock.released) {
			wakeLock = await navigator.wakeLock.request('screen');
			wakeLock.addEventListener('release', () => {
				wakeLock = null;
			});
		}
	} catch (err) {
		console.warn('Screen Wake Lock request failed:', err);
	}
}

/**
 * Release Screen Wake Lock.
 */
export async function releaseWakeLock() {
	if (wakeLock) {
		try {
			await wakeLock.release();
		} catch {}
		wakeLock = null;
	}
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
 * Start active polling to monitor clip playback position and drive HUD timer directly from the video.
 * @param {Object} step
 * @param {Object} videoAsset - { videoId, startSeconds, endSeconds }
 * @param {number} [targetDuration] - Step target duration in seconds
 */
function startClipMonitor(step, videoAsset, targetDuration) {
	clearClipMonitor();
	const endSec = (videoAsset && typeof videoAsset.endSeconds === 'number') ? videoAsset.endSeconds : step?.endSeconds;
	const startSec = (videoAsset && typeof videoAsset.startSeconds === 'number') ? videoAsset.startSeconds : (step?.startSeconds || 0);
	if (!step || !endSec || !(videoAsset && videoAsset.videoId)) return;

	const dur = (typeof targetDuration === 'number' && targetDuration > 0) ? targetDuration : Math.max(1, endSec - startSec);
	const sliceDuration = Math.max(1, endSec - startSec);
	const isLooping = dur > sliceDuration + 1.0;
	let lastBeeped = Math.ceil(dur) + 1;

	clipCheckInterval = setInterval(() => {
		if (!isPlaying || isPaused || !ytReady || !ytPlayer) return;
		try {
			const currentTime = ytPlayer.getCurrentTime();
			if (typeof currentTime !== 'number' || isNaN(currentTime)) return;

			// Video clock calculation: elapsed time in current slice + previous completed loops
			const sliceProgress = Math.max(0, Math.min(sliceDuration, currentTime - startSec));
			const totalElapsed = accumulatedVideoTime + sliceProgress;
			timerRemaining = Math.max(0, dur - totalElapsed);
			const displaySeconds = Math.ceil(timerRemaining);

			// Update HUD countdown and progress ring directly from the video
			if (dom.timerDisplay) dom.timerDisplay.textContent = formatTime(displaySeconds);
			updateTimerProgress(dur, timerRemaining);

			// Countdown beeps at 3, 2, 1
			if (displaySeconds < lastBeeped) {
				lastBeeped = displaySeconds;
				if (displaySeconds <= 3 && displaySeconds >= 1) {
					playCountdownBeep(displaySeconds);
				}
			}

			// Slice completion check (250ms lead time before endSec)
			if (currentTime >= endSec - 0.25) {
				if (isLooping && timerRemaining > 1.0) {
					accumulatedVideoTime += sliceDuration;
					try { ytPlayer.seekTo(startSec, true); } catch {}
				} else {
					clearClipMonitor();
					try { ytPlayer.pauseVideo(); } catch {}
					advanceStepOrSubStep();
				}
			}
		} catch (e) {
			// Ignore polling exceptions
		}
	}, 100);
}

/**
 * Clear clip monitor interval and any active fallback timeouts.
 */
function clearClipMonitor() {
	if (clipCheckInterval) {
		clearInterval(clipCheckInterval);
		clipCheckInterval = null;
	}
	clearVideoFallback();
}

/**
 * Clear YouTube fallback safety timeout.
 */
function clearVideoFallback() {
	if (videoSafetyFallbackTimeout) {
		clearTimeout(videoSafetyFallbackTimeout);
		videoSafetyFallbackTimeout = null;
	}
}

/**
 * Pre-cue upcoming video in YouTube player without starting playback.
 * Ensures the video metadata and player buffer are primed ahead of time.
 * @param {Object} videoAsset - { videoId, startSeconds, endSeconds }
 */
export function preCueVideo(videoAsset) {
	if (!ytReady || !ytPlayer || !videoAsset || !videoAsset.videoId) return;
	const vidId = videoAsset.videoId;
	const startSec = typeof videoAsset.startSeconds === 'number' ? videoAsset.startSeconds : 0;
	const endSec = typeof videoAsset.endSeconds === 'number' ? videoAsset.endSeconds : undefined;

	if (cuedVideoAsset && cuedVideoAsset.videoId === vidId && cuedVideoAsset.startSeconds === startSec && cuedVideoAsset.endSeconds === endSec) {
		return;
	}

	try {
		console.log(`[Workout Player] Pre-cueing upcoming video: ${vidId} (start: ${startSec}s, end: ${endSec !== undefined ? endSec + 's' : 'end'})`);
		cuedVideoAsset = { videoId: vidId, startSeconds: startSec, endSeconds: endSec };
		ytPlayer.cueVideoById({
			videoId: vidId,
			startSeconds: startSec,
			endSeconds: endSec,
		});
	} catch (e) {
		console.warn('[Workout Player] Pre-cue error:', e);
	}
}

const YT_STATE_NAMES = {
	[-1]: 'UNSTARTED',
	[0]: 'ENDED',
	[1]: 'PLAYING',
	[2]: 'PAUSED',
	[3]: 'BUFFERING',
	[5]: 'CUED'
};

const YT_ERROR_MESSAGES = {
	2: 'Invalid parameter value (e.g. videoId not 11 chars or invalid timestamp syntax).',
	5: 'HTML5 player error or content cannot be played in HTML5 player.',
	100: 'Video not found (removed or marked private).',
	101: 'Video owner does not allow embedded playback on other websites.',
	150: 'Video owner does not allow embedded playback (copyright or domain restriction).'
};

/**
 * Handle YouTube player state changes.
 */
function onYTStateChange(event) {
	const stateName = YT_STATE_NAMES[event.data] || `UNKNOWN(${event.data})`;
	console.log(`[Workout Player] YouTube State Change: ${stateName} (${event.data})`);

	if (event.data === YT.PlayerState.PLAYING) {
		disableCaptions();
		clipHasStartedPlaying = true;
		clearVideoFallback();
		if (isPlaying && !isPaused && currentRoutine) {
			const currentStep = currentRoutine.steps[currentStepIndex];
			const cls = currentStep ? classifyStep(currentStep) : null;
			if (currentStep && cls && cls.video) {
				startClipMonitor(currentStep, cls.video, cls.targetDuration);
			}
		}
	} else if (event.data === YT.PlayerState.ENDED) {
		// Verify this is a legitimate ENDED event and not a spurious transition event
		if (!isPlaying || isPaused || !currentRoutine) return;
		const currentStep = currentRoutine.steps[currentStepIndex];
		const cls = currentStep ? classifyStep(currentStep) : null;
		if (!currentStep || !cls || !cls.video) return;

		// If the video never actually entered PLAYING state for this step, or loaded less than 1s ago, ignore it
		if (!clipHasStartedPlaying || (Date.now() - clipLoadedAt < 1000)) {
			console.warn('[Workout Player] Ignoring spurious YouTube ENDED event for step:', currentStepIndex);
			return;
		}

		// Check if more looping is needed (remaining > 1.0s)
		const sliceDur = Math.max(1, (cls.video.endSeconds || 0) - (cls.video.startSeconds || 0));
		const isLooping = cls.targetDuration > sliceDur + 1.0;
		if (isLooping && timerRemaining > 1.0) {
			accumulatedVideoTime += sliceDur;
			try {
				ytPlayer.seekTo(cls.video.startSeconds || 0, true);
				ytPlayer.playVideo();
			} catch {}
			return;
		}

		clearClipMonitor();
		advanceStepOrSubStep();
	}
}

/**
 * Handle YouTube player error events.
 */
function onYTError(event) {
	const desc = YT_ERROR_MESSAGES[event.data] || 'Unknown YouTube playback error';
	console.error(`[Workout Player] YouTube Player error code ${event.data}: ${desc}`);
}

/**
 * Clear any active starting countdown timer.
 */
export function clearCountdown() {
	if (countdownInterval) {
		clearInterval(countdownInterval);
		countdownInterval = null;
	}
	if (countdownTimeout) {
		clearTimeout(countdownTimeout);
		countdownTimeout = null;
	}
	isCountingDown = false;
	const countdownStage = dom.countdownStage || document.getElementById('countdown-stage');
	if (countdownStage) {
		countdownStage.classList.add('hidden');
	}
}

/**
 * Skip the starting countdown and immediately execute step 1.
 */
export function skipCountdown() {
	if (!isCountingDown) return;
	clearCountdown();
	if (!isPreviewMode && !isSessionActive() && currentRoutine) {
		startSession(currentRoutine);
	}
	executeCurrentStep();
}

/**
 * Start the 5-second "Get Ready" intro screen.
 * @param {Object} routine
 * @param {Function} onComplete
 */
function startWorkoutCountdown(routine, onComplete) {
	clearCountdown();
	clearTimer();
	clearClipMonitor();

	isCountingDown = true;
	const countdownStage = dom.countdownStage || document.getElementById('countdown-stage');
	const routineTitleEl = dom.countdownRoutineTitle || document.getElementById('countdown-routine-title');
	const numberEl = dom.countdownNumber || document.getElementById('countdown-number');
	const ringFill = dom.countdownRingFill || document.getElementById('countdown-ring-fill');
	const firstThumb = dom.countdownFirstThumb || document.getElementById('countdown-first-thumb');
	const firstLabel = dom.countdownFirstLabel || document.getElementById('countdown-first-label');
	const firstMeta = dom.countdownFirstMeta || document.getElementById('countdown-first-meta');
	const skipBtn = dom.countdownSkipBtn || document.getElementById('countdown-skip-btn');

	if (!countdownStage) {
		onComplete();
		return;
	}

	// Hide video and timer overlays during countdown
	dom.videoWrapper?.classList.add('hidden');
	dom.timerOverlay?.classList.add('hidden');
	countdownStage.classList.remove('hidden');

	if (routineTitleEl) {
		const totalMoves = (routine.steps || []).length;
		routineTitleEl.textContent = `${routine.title || 'Workout'} (${totalMoves} movement${totalMoves === 1 ? '' : 's'})`;
	}

	// Safe preview rendering: wrapped in try-catch to guarantee countdown timer always runs
	try {
		const firstStep = (routine.steps && routine.steps[0]) ? routine.steps[0] : null;
		if (firstStep) {
			const firstStepName = getStepDisplayName(firstStep);
			if (firstLabel) firstLabel.textContent = firstStepName;

			const cls = classifyStep(firstStep);
			const isReps = cls.mode === 'reps';
			const isVid = Boolean(cls.video);
			const firstVidAsset = cls.video;
			const dur = cls.targetDuration;

			if (isVid && firstVidAsset) {
				preCueVideo(firstVidAsset);
			}

			let modeTag = '';
			if (isVid) {
				modeTag = `<span class="view-tag view-tag-clip" style="font-size:0.75rem;padding:2px 6px;">${getClipIcon(11)} Video Clip</span>`;
			} else if (isReps) {
				modeTag = `<span class="view-tag view-tag-reps" style="font-size:0.75rem;padding:2px 6px;">${getRepsIcon(11)} ${cls.targetReps} reps</span>`;
			} else {
				modeTag = `<span class="view-tag view-tag-time" style="font-size:0.75rem;padding:2px 6px;">${getTimerIcon(11)} ${formatTime(dur)}</span>`;
			}

			// Target muscles
			let musclePills = '';
			if (Array.isArray(firstStep.exercises) && firstStep.exercises.length > 0) {
				const ex = firstStep.exercises[0];
				const fullEx = (ex && ex.id ? getExerciseById(ex.id) : null) || ex;
				const muscles = inferMusclesForExercise(fullEx);
				if (muscles.primary && muscles.primary.length > 0) {
					const def = MUSCLE_DEFINITIONS[muscles.primary[0]];
					if (def) {
						musclePills = `<span style="font-size:0.75rem;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:var(--text-secondary);display:inline-flex;align-items:center;gap:4px;">${getMuscleIcon(def.id || muscles.primary[0], 12)} ${escapeHtml(def.label || def.name || '')}</span>`;
					}
				}
			}

			if (firstMeta) {
				firstMeta.innerHTML = `${modeTag} ${musclePills}`;
			}

			// Thumbnail
			if (firstThumb) {
				const vidId = isVid ? (firstVidAsset?.videoId || firstStep.videoId) : null;
				const mediaUrl = resolveStepVisual(firstStep);
				if (vidId) {
					firstThumb.innerHTML = `<img src="https://img.youtube.com/vi/${vidId}/mqdefault.jpg" alt="${escapeHtml(firstStepName)}" />`;
				} else if (mediaUrl) {
					firstThumb.innerHTML = `<img src="${mediaUrl}" alt="${escapeHtml(firstStepName)}" />`;
				} else {
					firstThumb.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;opacity:0.6;">${getExerciseIcon(20)}</span>`;
				}
			}
		}
	} catch (err) {
		console.warn('Error populating countdown first movement preview:', err);
	}

	if (skipBtn) {
		skipBtn.onclick = (e) => {
			e.stopPropagation();
			skipCountdown();
		};
	}

	let remaining = 5;
	const totalSeconds = 5;
	const circumference = 2 * Math.PI * 88; // ~552.92
	const startTime = Date.now();
	const endTime = startTime + (totalSeconds * 1000);

	function updateCountdownDisplay() {
		if (numberEl) {
			numberEl.textContent = remaining > 0 ? remaining : 'GO!';
			// Trigger pulse animation
			numberEl.style.animation = 'none';
			numberEl.offsetHeight; // trigger reflow
			numberEl.style.animation = 'countdownPulse 0.9s cubic-bezier(0.16, 1, 0.3, 1)';
		}

		if (ringFill) {
			const fraction = Math.max(0, remaining) / totalSeconds;
			const offset = circumference * (1 - fraction);
			ringFill.style.strokeDasharray = circumference;
			ringFill.style.strokeDashoffset = offset;
		}

		if (remaining <= 3 && remaining >= 1) {
			playCountdownBeep(remaining);
		} else if (remaining === 0) {
			playCountdownBeep(0);
		}
	}

	updateCountdownDisplay();

	countdownInterval = setInterval(() => {
		const now = Date.now();
		const currentRemaining = Math.max(0, Math.ceil((endTime - now) / 1000));

		if (currentRemaining !== remaining) {
			remaining = currentRemaining;
			updateCountdownDisplay();
		}

		if (now >= endTime) {
			clearInterval(countdownInterval);
			countdownInterval = null;
			countdownTimeout = setTimeout(() => {
				countdownTimeout = null;
				clearCountdown();
				onComplete();
			}, 400);
		}
	}, 100);
}

/**
 * Start playing a routine from the beginning or a specific step.
 * @param {Object} routine - The routine to play
 * @param {number} [startIndex=0] - Step index to start from
 * @param {boolean} [isPreview=false] - If true, stats tracking is disabled
 */
export function startRoutine(routine, startIndex = 0, isPreview = false) {
	if (!routine || !routine.steps || routine.steps.length === 0) return;

	currentRoutine = routine;
	currentStepIndex = startIndex;
	isPlaying = true;
	isPaused = false;
	isPreviewMode = Boolean(isPreview);

	requestWakeLock();

	showPlayerUI();

	if (!isPreviewMode && startIndex === 0) {
		startWorkoutCountdown(routine, () => {
			if (!isPreviewMode && !isSessionActive()) {
				startSession(routine);
			}
			executeCurrentStep();
		});
	} else {
		if (!isPreviewMode && !isSessionActive()) {
			startSession(routine);
		}
		clearCountdown();
		executeCurrentStep();
	}

	resetHudIdleTimer();
}

/**
 * Complete the current Reps set and advance to next step or sub-step.
 */
export function completeRepsStep() {
	if (!isPlaying || !isRepsMode) return;
	playCountdownBeep(1);
	if (dom.repsDoneBtn) {
		dom.repsDoneBtn.classList.add('active');
		setTimeout(() => dom.repsDoneBtn?.classList.remove('active'), 250);
	}
	advanceStepOrSubStep();
}

/**
 * Decrement target/completed reps for current step.
 */
export function decrementReps() {
	if (!isRepsMode) return;
	currentRepsValue = Math.max(1, currentRepsValue - 1);
	updateRepsStepperDisplay();
}

/**
 * Increment target/completed reps for current step.
 */
export function incrementReps() {
	if (!isRepsMode) return;
	currentRepsValue += 1;
	updateRepsStepperDisplay();
}

/**
 * Update the reps stepper UI and HUD indicators.
 */
function updateRepsStepperDisplay() {
	const countEl = dom.repsStepperCount || document.getElementById('reps-stepper-count');
	if (countEl) {
		countEl.textContent = currentRepsValue;
	}
	if (dom.timerDisplay) {
		dom.timerDisplay.textContent = `${currentRepsValue} REPS`;
	}
}

/**
 * Save actual reps progress for the active step and sub-exercise into the routine and session.
 */
function saveCurrentRepsProgress() {
	if (!currentRoutine || !isRepsMode || currentStepIndex < 0) return;
	const step = currentRoutine.steps[currentStepIndex];
	if (!step) return;

	const stepHasSub = hasSubSteps(step);
	const activeSubEx = (stepHasSub && step.exercises) ? step.exercises[currentSubStepIndex] : null;

	if (stepHasSub) {
		if (!step.completedSubReps) step.completedSubReps = [];
		step.completedSubReps[currentSubStepIndex] = currentRepsValue;
		step.completedReps = step.completedSubReps.reduce((a, b) => a + (b || 0), 0);
	} else {
		step.completedReps = currentRepsValue;
	}

	const exObj = activeSubEx || (step.exercises && step.exercises[0]) || { id: step.exercise_id, name: getStepDisplayName(step) };
	if (!isPreviewMode) {
		recordStepReps(currentStepIndex, currentRepsValue, exObj);
	}
}

/**
 * Advance to next sub-step within a combo or next step in routine.
 */
function advanceStepOrSubStep() {
	if (!currentRoutine) return;
	if (isRepsMode) {
		saveCurrentRepsProgress();
	}
	clearClipMonitor();
	clearTimer();

	const currentStep = currentRoutine.steps[currentStepIndex];
	const stepHasSubSteps = hasSubSteps(currentStep);

	if (stepHasSubSteps && currentSubStepIndex < currentStep.exercises.length - 1) {
		currentSubStepIndex++;
		executeCurrentStep();
		return;
	}

	currentSubStepIndex = 0;
	advanceStep();
}

/**
 * Resolve any video asset details for a step dynamically.
 * @param {Object} step
 * @returns {Object|null} { videoId, startSeconds, endSeconds }
 */
export function resolveStepVideoAsset(step) {
	return resolveStepVideo(step);
}

/**
 * Execute the current step (clip or timer).
 */
function executeCurrentStep() {
	if (!currentRoutine || currentStepIndex < 0 || currentStepIndex >= currentRoutine.steps.length) {
		stopPlayback();
		return;
	}

	clearClipMonitor();
	clearTimer();
	const step = currentRoutine.steps[currentStepIndex];
	updateStepIndicator();
	if (!isPreviewMode) {
		updateSessionStep(currentStepIndex);
	}

	const cls = classifyStep(step);
	const videoAsset = cls.video;

	if (cls.mode === 'time' && videoAsset) {
		executeVideoStep(step, cls.targetDuration, videoAsset);
	} else {
		executeTimerStep(step);
	}

	resetHudIdleTimer();
}

/**
 * Execute a timed step that plays a follow-along video. The step's target
 * duration is the authoritative master timer; the video slice loops until it
 * reaches zero.
 * @param {Object} step
 * @param {number} targetDuration
 * @param {Object} videoAsset
 */
function executeVideoStep(step, targetDuration, videoAsset) {
	clearTimer();
	clearClipMonitor();
	clearVideoFallback();
	clipHasStartedPlaying = false;
	clipLoadedAt = Date.now();
	isRepsMode = false;
	accumulatedVideoTime = 0;

	// Show the video with the timer ring overlaid so the countdown stays visible.
	dom.videoWrapper?.classList.remove('hidden');
	dom.timerOverlay?.classList.remove('hidden');
	dom.timerOverlay?.classList.add('is-video-mode');
	dom.timerOverlay?.classList.remove('is-break');
	dom.timerOverlay?.classList.remove('is-reps-stage');

	const mediaContainer = dom.timerMediaContainer || document.getElementById('timer-media-container');
	const mediaImg = dom.timerMediaImg || document.getElementById('timer-media-img');
	if (mediaContainer) {
		mediaContainer.classList.add('hidden');
	}
	if (mediaImg) {
		mediaImg.removeAttribute('src');
	}
	dom.timerOverlay?.querySelector('.timer-stage-content')?.classList.remove('has-media');
	const repsContainer = dom.timerRepsContainer || document.getElementById('timer-reps-container');
	if (repsContainer) repsContainer.classList.add('hidden');

	if (dom.upNextCard) {
		dom.upNextCard.classList.add('hidden');
	}

	// Pause background music during video clips
	pauseMusic();
	if (dom.musicControlsBar) {
		dom.musicControlsBar.classList.add('hidden');
	}

	const vidId = videoAsset?.videoId;
	if (!vidId) {
		console.warn(`[Workout Player] executeClipStep [${currentStepIndex}] has no valid video ID, routing to timer`);
		executeTimerStep(step);
		return;
	}
	const startSec = typeof videoAsset.startSeconds === 'number' ? videoAsset.startSeconds : (step.startSeconds || 0);
	const endSec = typeof videoAsset.endSeconds === 'number' ? videoAsset.endSeconds : (step.endSeconds || undefined);

	console.log(`[Workout Player] executeVideoStep [${currentStepIndex}] ("${step.label || 'Step'}"): videoId="${vidId}", start=${startSec}s, end=${endSec !== undefined ? endSec + 's' : 'end'}, ytReady=${ytReady}, ytPlayer=${Boolean(ytPlayer)}`);

	const isAlreadyCued = cuedVideoAsset && cuedVideoAsset.videoId === vidId && cuedVideoAsset.startSeconds === startSec;

	if (ytReady && ytPlayer) {
		if (isAlreadyCued) {
			console.log(`[Workout Player] Playing already cued video: ${vidId} at ${startSec}s`);
			try {
				ytPlayer.seekTo(startSec, true);
				ytPlayer.playVideo();
			} catch (e) {
				console.warn('[Workout Player] Failed to play cued video, falling back to loadVideoById:', e);
				ytPlayer.loadVideoById({
					videoId: vidId,
					startSeconds: startSec,
					endSeconds: endSec,
				});
			}
		} else {
			cuedVideoAsset = { videoId: vidId, startSeconds: startSec, endSeconds: endSec };
			ytPlayer.loadVideoById({
				videoId: vidId,
				startSeconds: startSec,
				endSeconds: endSec,
			});
		}
		disableCaptions();
	} else {
		console.warn(`[Workout Player] Cannot play clip: ytReady=${ytReady}, ytPlayer=${Boolean(ytPlayer)}`);
	}

	// Initialize HUD with target duration, but do NOT start wall-clock timer!
	// The video's playback position in startClipMonitor is the authoritative clock.
	timerRemaining = targetDuration;
	if (dom.timerDisplay) dom.timerDisplay.textContent = formatTime(targetDuration);
	if (dom.timerLabel) {
		dom.timerLabel.textContent = '';
		dom.timerLabel.classList.add('hidden');
	}
	const videoStageHeader = dom.timerStageHeader || document.getElementById('timer-stage-header');
	if (videoStageHeader) videoStageHeader.classList.add('hidden');
	updateTimerProgress(targetDuration, targetDuration);

	// 6-second safety fallback: if YouTube fails to play (ad-block, offline, error), fall back to standard timer step
	videoSafetyFallbackTimeout = setTimeout(() => {
		if (!clipHasStartedPlaying && isPlaying && !isPaused) {
			console.warn('[Workout Player] Video playback failed to start within 6s, falling back to timer step');
			executeTimerStep(step);
		}
	}, 6000);

	const isTutorial = Boolean(step.isTutorial || (step.label && step.label.includes('[Tutorial]')));
	if (dom.currentStepLabel) dom.currentStepLabel.textContent = isTutorial ? 'Tutorial Breakdown' : getStepDisplayName(step);
	if (dom.currentStepType) {
		if (isTutorial) {
			dom.currentStepType.innerHTML = `${getClipIcon(14)} Tutorial Breakdown · ` + (step.exercises && step.exercises.length > 0 ? step.exercises.map(e => (getExerciseById(e.id || e)?.name || e.name || 'Instruction')).join(', ') : 'Instruction');
		} else if (step.exercises && step.exercises.length > 0) {
			const joiner = step.flow_type === 'alternating' ? ' ⮀ ' : ' + ';
			dom.currentStepType.innerHTML = `${getClipIcon(14)} ` + step.exercises.map(e => (getExerciseById(e.id || e)?.name || e.name || 'Exercise')).join(joiner);
		} else {
			dom.currentStepType.innerHTML = `${getClipIcon(14)} Follow-Along Video`;
		}
	}
}

/**
 * Execute a timer/interval step or reps step.
 */
function executeTimerStep(step) {
	clearClipMonitor();
	clearTimer();
	clipHasStartedPlaying = false;

	// Stop YouTube playback and hide
	if (ytReady && ytPlayer) {
		try { ytPlayer.pauseVideo(); } catch {}
	}
	dom.videoWrapper?.classList.add('hidden');
	dom.timerOverlay?.classList.remove('hidden');
	dom.timerOverlay?.classList.remove('is-video-mode');

	const isBreak = isBreakStep(step);
	const stepHasSubSteps = hasSubSteps(step);
	const totalSubSteps = stepHasSubSteps ? step.exercises.length : 1;
	if (stepHasSubSteps) {
		if (currentSubStepIndex < 0) currentSubStepIndex = 0;
		if (currentSubStepIndex >= totalSubSteps) currentSubStepIndex = 0;
	} else {
		currentSubStepIndex = 0;
	}

	const rawSubEx = stepHasSubSteps ? step.exercises[currentSubStepIndex] : null;
	const resolvedSubEx = rawSubEx ? ((rawSubEx.id ? getExerciseById(rawSubEx.id) : null) || rawSubEx) : null;
	const activeSubEx = (rawSubEx && resolvedSubEx) ? { ...resolvedSubEx, ...rawSubEx, name: rawSubEx.name || resolvedSubEx.name || '' } : (resolvedSubEx || rawSubEx);

	const isSubReps = isSubStepReps(step, stepHasSubSteps ? activeSubEx : null);
	isRepsMode = isSubReps;

	dom.timerOverlay?.classList.toggle('is-break', isBreak);
	dom.timerOverlay?.classList.toggle('is-reps-stage', isSubReps);

	// Handle media/gif animation display (Hero Layout)
	let mediaUrl = null;
	if (stepHasSubSteps && activeSubEx) {
		mediaUrl = activeSubEx.media_url || activeSubEx.mediaUrl || activeSubEx.gifUrl || resolveStepMediaUrl({ label: activeSubEx.name, type: 'timer' }) || resolveStepMediaUrl(step);
	} else {
		mediaUrl = resolveStepMediaUrl(step);
	}

	const mediaContainer = dom.timerMediaContainer || document.getElementById('timer-media-container');
	const mediaImg = dom.timerMediaImg || document.getElementById('timer-media-img');
	const contentEl = dom.timerOverlay?.querySelector('.timer-stage-content');
	if (mediaUrl) {
		if (mediaImg) {
			mediaImg.src = mediaUrl;
			mediaImg.alt = (activeSubEx?.name || step.label) || 'Exercise animation';
		}
		if (mediaContainer) {
			mediaContainer.classList.remove('hidden');
		}
		if (contentEl) contentEl.classList.add('has-media');
	} else {
		if (mediaContainer) {
			mediaContainer.classList.add('hidden');
		}
		if (mediaImg) {
			mediaImg.removeAttribute('src');
		}
		if (contentEl) contentEl.classList.remove('has-media');
	}

	// Remove any existing tutorial buttons
	dom.timerOverlay?.querySelectorAll('.player-hud-tutorial-btn')?.forEach(b => b.remove());

	const linkedEx = resolvedSubEx || (step.exercises && step.exercises[0]) || (step.exercise_id ? getExerciseById(step.exercise_id) : null);
	const instructionAsset = linkedEx ? getExerciseInstructionMedia(linkedEx) : null;
	if (instructionAsset && (instructionAsset.type === 'video' || Boolean(instructionAsset.videoId) || instructionAsset.url)) {
		const targetContainer = mediaContainer || dom.timerOverlay?.querySelector('.timer-stage-content');
		if (targetContainer) {
			const tutBtn = document.createElement('button');
			tutBtn.type = 'button';
			tutBtn.className = 'btn btn-ghost btn-xs player-hud-tutorial-btn';
			tutBtn.innerHTML = `🎬 Form Guide`;
			tutBtn.title = `Pause and review ${instructionAsset.title || linkedEx.name} coaching tutorial`;
			tutBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				openWorkoutTutorial(instructionAsset, linkedEx);
			});
			targetContainer.appendChild(tutBtn);
		}
	}

	// Set and start music playlist specifically for this timer step or routine-level tracks
	const tracks = (step.musicTracks && step.musicTracks.length > 0)
		? step.musicTracks
		: (currentRoutine?.musicTracks || []);

	setPlaylist(tracks);
	const quickTitle = document.getElementById('music-quick-title');
	const musicToggleBtn = document.getElementById('player-music-toggle-btn');
	if (tracks.length > 0) {
		const currentInfo = getCurrentTrack();
		const currentTrack = currentInfo?.track || tracks[0];
		const trackTitle = currentTrack.liveTitle || currentTrack.label || (currentTrack.source === 'youtube' ? (currentTrack.videoId || currentTrack.playlistId) : currentTrack.fileName);
		if (dom.musicTrackName) dom.musicTrackName.textContent = trackTitle;
		if (quickTitle) quickTitle.textContent = trackTitle;
		if (musicToggleBtn) musicToggleBtn.classList.add('has-music');
		if (!isMusicPausedByUser()) {
			unmuteMusic();
			startMusic();
		}
	} else {
		stopMusic();
		if (dom.musicControlsBar) dom.musicControlsBar.classList.add('hidden');
		if (quickTitle) quickTitle.textContent = 'Music';
		if (musicToggleBtn) {
			musicToggleBtn.classList.remove('has-music');
			musicToggleBtn.classList.remove('active');
		}
	}

	const repsContainer = dom.timerRepsContainer || document.getElementById('timer-reps-container');

	// Remove any obsolete injected Done buttons if present
	dom.timerOverlay?.querySelectorAll('.timer-center-text .reps-done-action-btn')?.forEach(b => b.remove());

	if (isSubReps) {
		const targetReps = stepHasSubSteps
			? getEffectiveSubStepReps(step, currentSubStepIndex, totalSubSteps, activeSubEx)
			: (step.targetReps || 20);
		currentRepsValue = Number(targetReps) || 20;
		updateRepsStepperDisplay();

		if (repsContainer) {
			repsContainer.classList.remove('hidden');
		}

		const linkedEx = resolvedSubEx || (step.exercises && step.exercises[0]) || (step.exercise_id ? getExerciseById(step.exercise_id) : null);
		const dispName = getStepDisplayName(step);
		const stepMuscles = inferMusclesForExercise(linkedEx || { name: (activeSubEx?.name || dispName), description: step.description });
		const priMuscle = (stepMuscles.primary || [])[0];
		const priDef = priMuscle ? MUSCLE_DEFINITIONS[priMuscle] : null;
		const muscleTagHtml = priDef ? ` <span class="player-hud-muscle-tag" style="color:${priDef.color}">${getMuscleIcon(priMuscle, 12)} ${priDef.label}</span>` : '';

		const stageHeader = dom.timerStageHeader || (typeof document !== 'undefined' && document.getElementById('timer-stage-header'));
		const stageBadge = dom.timerStageBadge || (typeof document !== 'undefined' && document.getElementById('timer-stage-badge'));
		const stageTitle = dom.timerStageTitle || (typeof document !== 'undefined' && document.getElementById('timer-stage-title'));

		if (stageHeader) {
			stageHeader.classList.remove('hidden');
			if (stageBadge) {
				stageBadge.innerHTML = muscleTagHtml ? `${getRepsIcon(12)} REPETITIONS ${muscleTagHtml}` : `${getRepsIcon(12)} REPETITIONS`;
			}
			if (stageTitle) {
				stageTitle.textContent = stepHasSubSteps ? (activeSubEx.name || dispName) : dispName;
			}
		}

		if (stepHasSubSteps) {
			const flowIcon = step.flow_type === 'alternating' ? '⮀' : (step.flow_type === 'sequence' ? '➔' : '⚡');
			const flowLabel = step.flow_type === 'alternating' ? 'Alternating' : (step.flow_type === 'sequence' ? 'Flow' : 'Superset');
			dom.currentStepLabel.textContent = `${activeSubEx.name || 'Exercise'} (${dispName})`;
			dom.currentStepType.innerHTML = `<span class="player-hud-substep-badge">${flowIcon} ${flowLabel} · Move ${currentSubStepIndex + 1}/${totalSubSteps}</span> ${getRepsIcon(14)} ${targetReps} Reps${muscleTagHtml}`;
		} else {
			dom.currentStepLabel.textContent = `${dispName} (${targetReps} reps)`;
			if (step.exercises && step.exercises.length > 0) {
				const joiner = step.flow_type === 'alternating' ? ' ⮀ ' : ' + ';
				dom.currentStepType.innerHTML = `${getRepsIcon(14)} ` + step.exercises.map(e => (getExerciseById(e.id || e)?.name || e.name || 'Exercise')).join(joiner) + muscleTagHtml;
			} else {
				dom.currentStepType.innerHTML = `${getRepsIcon(14)} ${targetReps} Reps` + muscleTagHtml;
			}
		}

		// Update progress ring to full
		updateTimerProgress(100, 100);
	} else {
		if (repsContainer) {
			repsContainer.classList.add('hidden');
		}
		const targetDuration = stepHasSubSteps
			? getEffectiveSubStepDuration(step, currentSubStepIndex, totalSubSteps, activeSubEx)
			: (step.durationSeconds || 30);
		const linkedEx = resolvedSubEx || (step.exercises && step.exercises[0]) || (step.exercise_id ? getExerciseById(step.exercise_id) : null);
		const dispName = getStepDisplayName(step);
		const stepMuscles = inferMusclesForExercise(linkedEx || { name: (activeSubEx?.name || dispName), description: step.description });
		const priMuscle = (stepMuscles.primary || [])[0];
		const priDef = (!isBreak && priMuscle) ? MUSCLE_DEFINITIONS[priMuscle] : null;
		const muscleTagHtml = priDef ? ` <span class="player-hud-muscle-tag" style="color:${priDef.color}">${getMuscleIcon(priMuscle, 12)} ${priDef.label}</span>` : '';

		timerRemaining = targetDuration;

		const stageHeader = dom.timerStageHeader || (typeof document !== 'undefined' && document.getElementById('timer-stage-header'));
		const stageBadge = dom.timerStageBadge || (typeof document !== 'undefined' && document.getElementById('timer-stage-badge'));
		const stageTitle = dom.timerStageTitle || (typeof document !== 'undefined' && document.getElementById('timer-stage-title'));

		if (isBreak) {
			if (stageHeader) stageHeader.classList.add('hidden');
			if (dom.timerLabel) {
				dom.timerLabel.textContent = 'REST';
				dom.timerLabel.classList.remove('hidden');
			}
		} else {
			if (stageHeader) {
				stageHeader.classList.remove('hidden');
				if (stageBadge) {
					stageBadge.innerHTML = muscleTagHtml ? `${getTimerIcon(12)} TIMED INTERVAL ${muscleTagHtml}` : `${getTimerIcon(12)} TIMED INTERVAL`;
				}
				if (stageTitle) {
					stageTitle.textContent = stepHasSubSteps ? (activeSubEx.name || dispName) : dispName;
				}
			}
			if (dom.timerLabel) {
				dom.timerLabel.textContent = '';
				dom.timerLabel.classList.add('hidden');
			}
		}

		dom.timerDisplay.textContent = formatTime(timerRemaining);

		if (stepHasSubSteps) {
			const flowIcon = step.flow_type === 'alternating' ? '⮀' : (step.flow_type === 'sequence' ? '➔' : '⚡');
			const flowLabel = step.flow_type === 'alternating' ? 'Alternating' : (step.flow_type === 'sequence' ? 'Flow' : 'Superset');
			dom.currentStepLabel.textContent = `${activeSubEx.name || 'Exercise'} (${dispName})`;
			dom.currentStepType.innerHTML = `<span class="player-hud-substep-badge">${flowIcon} ${flowLabel} · Move ${currentSubStepIndex + 1}/${totalSubSteps}</span> ${getTimerIcon(14)} ${formatTime(timerRemaining)}${muscleTagHtml}`;
		} else {
			dom.currentStepLabel.textContent = dispName;
			if (step.exercises && step.exercises.length > 0) {
				const joiner = step.flow_type === 'alternating' ? ' ⮀ ' : ' + ';
				dom.currentStepType.innerHTML = isBreak ? `${getBreakIcon(14)} Rest` : (getTimerIcon(14) + ' ' + step.exercises.map(e => (getExerciseById(e.id || e)?.name || e.name || 'Exercise')).join(joiner) + muscleTagHtml);
			} else {
				dom.currentStepType.innerHTML = isBreak ? `${getBreakIcon(14)} Rest` : `${getTimerIcon(14)} Timer${muscleTagHtml}`;
			}
		}

		// Update progress ring
		updateTimerProgress(targetDuration, timerRemaining);

		if (!isPaused) {
			startTimer(targetDuration);
		}
	}

	// Update Up Next preview card for break steps
	if (dom.upNextCard) {
		const next = currentRoutine.steps[currentStepIndex + 1];
		if (isBreak && next) {
			dom.upNextCard.classList.remove('hidden');
			const nextName = getStepDisplayName(next);
			if (dom.upNextLabel) {
				dom.upNextLabel.textContent = nextName;
			}
			const nextCls = classifyStep(next);
			const nextIsBreak = nextCls.mode === 'break';
			const nextIsReps = nextCls.mode === 'reps';
			const nextIsClip = Boolean(nextCls.video);
			const nextVid = nextCls.video;

			if (nextIsClip && nextVid) {
				preCueVideo(nextVid);
			}

			if (dom.upNextMeta) {
				if (nextIsBreak) {
					dom.upNextMeta.innerHTML = `${getBreakIcon(12)} Rest (${formatFriendlyDuration(next.durationSeconds || 30)})`;
				} else if (nextIsReps) {
					dom.upNextMeta.innerHTML = `${getRepsIcon(12)} ${next.targetReps || 20} reps`;
				} else if (nextIsClip) {
					const start = nextVid.startSeconds || 0;
					const end = nextVid.endSeconds || (start + 60);
					const dur = Math.max(1, end - start);
					dom.upNextMeta.innerHTML = `${getClipIcon(12)} ${formatFriendlyDuration(dur)} (${formatTime(start)} → ${formatTime(end)})`;
				} else {
					dom.upNextMeta.innerHTML = `${getTimerIcon(12)} ${formatFriendlyDuration(next.durationSeconds || 30)}`;
				}
			}
			if (dom.upNextMediaThumb) {
				const nextMedia = resolveStepVisual(next);
				if (nextVid && nextVid.videoId && (nextIsClip || !nextMedia)) {
					dom.upNextMediaThumb.innerHTML = `
						<img src="https://img.youtube.com/vi/${nextVid.videoId}/hqdefault.jpg" onerror="this.src='https://img.youtube.com/vi/${nextVid.videoId}/mqdefault.jpg'" alt="${escapeHtml(nextName)}">
						<div class="thumbnail-play-overlay">▶</div>
					`;
				} else if (nextMedia) {
					dom.upNextMediaThumb.innerHTML = `<img src="${nextMedia}" alt="${escapeHtml(nextName)}" class="up-next-gif-thumb">`;
				} else if (nextIsBreak) {
					dom.upNextMediaThumb.innerHTML = getBreakIcon(24);
				} else if (nextIsReps) {
					dom.upNextMediaThumb.innerHTML = `<div class="timer-visual-box timer-visual-reps"><span class="timer-icon">${getRepsIcon(20)}</span><span class="timer-badge-sec">${next.targetReps || 20}r</span></div>`;
				} else {
					dom.upNextMediaThumb.innerHTML = `<div class="timer-visual-box"><span class="timer-icon">${getTimerIcon(22)}</span></div>`;
				}
			}
		} else {
			dom.upNextCard.classList.add('hidden');
		}
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
			advanceStepOrSubStep();
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
	clearClipMonitor();
}

/**
 * Advance to the next step.
 */
function advanceStep() {
	if (!currentRoutine) return;
	clearClipMonitor();
	clearTimer();

	currentStepIndex++;
	currentSubStepIndex = 0;
	if (currentStepIndex >= currentRoutine.steps.length) {
		// Routine complete
		const completedRoutine = currentRoutine;
		stopPlayback(true);
		if (!isPreviewMode) {
			completeSession().then((session) => {
				if (playerCallbacks.onRoutineComplete) {
					playerCallbacks.onRoutineComplete(session, completedRoutine);
				}
			});
		} else {
			if (playerCallbacks.onPreviewComplete) {
				playerCallbacks.onPreviewComplete(completedRoutine);
			}
		}
		return;
	}

	executeCurrentStep();
}

/**
 * Go to previous step or sub-step.
 */
export function previousStep() {
	if (!currentRoutine) return;
	clearClipMonitor();
	clearTimer();

	const currentStep = currentRoutine.steps[currentStepIndex];
	const stepHasSubSteps = hasSubSteps(currentStep);

	if (stepHasSubSteps && currentSubStepIndex > 0) {
		currentSubStepIndex--;
		executeCurrentStep();
		return;
	}

	if (currentStepIndex <= 0) return;
	currentStepIndex--;
	const prevStep = currentRoutine.steps[currentStepIndex];
	const prevHasSubSteps = hasSubSteps(prevStep);
	if (prevStep && prevHasSubSteps) {
		currentSubStepIndex = prevStep.exercises.length - 1;
	} else {
		currentSubStepIndex = 0;
	}
	executeCurrentStep();
}

/**
 * Skip to next step or sub-step.
 */
export function skipStep() {
	if (!currentRoutine) return;
	advanceStepOrSubStep();
}

/**
 * Toggle play/pause.
 */
export function togglePause() {
	if (!isPlaying) return;

	if (isPaused) {
		// Resume
		isPaused = false;
		if (!isPreviewMode) {
			resumeSession();
		}
		requestWakeLock();
		const step = currentRoutine.steps[currentStepIndex];
		const cls = classifyStep(step);

		if (cls.mode === 'time' && cls.video) {
			if (ytReady && ytPlayer) {
				ytPlayer.playVideo();
			}
			startClipMonitor(step, cls.video, cls.targetDuration);
		} else if (cls.mode === 'time') {
			// Restart timer from remaining
			startTimer(cls.targetDuration);
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
		if (!isPreviewMode) {
			pauseSession();
		}
		clearTimer();
		clearClipMonitor();
		if (!isNativeFullscreen()) {
			releaseWakeLock();
		}

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
	currentSubStepIndex = 0;
	isPaused = false;
	updatePlayPauseBtn(false);
	executeCurrentStep();
}

/**
 * Stop playback entirely and return to editor/list view.
 * @param {boolean} [isCompleted=false]
 */
export function stopPlayback(isCompleted = false) {
	clearCountdown();
	clearTimer();
	clearClipMonitor();
	clearHudIdleTimer();
	if (!isNativeFullscreen()) {
		releaseWakeLock();
	}
	isPlaying = false;
	isPaused = false;
	isRepsMode = false;
	const repsContainer = dom.timerRepsContainer || document.getElementById('timer-reps-container');
	if (repsContainer) repsContainer.classList.add('hidden');
	clipHasStartedPlaying = false;
	accumulatedVideoTime = 0;
	cuedVideoAsset = null;
	currentStepIndex = -1;
	currentSubStepIndex = 0;

	if (ytReady && ytPlayer) {
		try { ytPlayer.stopVideo(); } catch {}
	}

	// Stop background music
	stopMusic();

	hidePlayerUI();

	if (!isCompleted && !isPreviewMode && isSessionActive()) {
		stopSession();
	}

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
	currentSubStepIndex = 0;
	isPaused = false;
	updatePlayPauseBtn(false);
	executeCurrentStep();
}
window.__jumpToStep = jumpToStep;

/**
 * Show the player UI and hide other views.
 */
function showPlayerUI() {
	if (dom.playerView) dom.playerView.classList.remove('hidden');
	if (dom.editorView) dom.editorView.classList.add('hidden');
	if (dom.routineView) dom.routineView.classList.add('hidden');
	if (dom.emptyView) dom.emptyView.classList.add('hidden');
	if (dom.combosView) dom.combosView.classList.add('hidden');
	if (dom.exercisesView) dom.exercisesView.classList.add('hidden');
	if (dom.statsView) dom.statsView.classList.add('hidden');
	if (dom.playerRoutineTitle) {
		dom.playerRoutineTitle.textContent = currentRoutine?.title || 'Workout';
	}

	let previewBadge = dom.playerView?.querySelector('#player-preview-badge');
	if (!previewBadge && dom.playerView) {
		previewBadge = document.createElement('span');
		previewBadge.id = 'player-preview-badge';
		previewBadge.className = 'player-preview-badge';
		previewBadge.innerHTML = 'Preview Mode (Stats Disabled)';
		const topBar = dom.playerView.querySelector('.player-top-bar');
		if (topBar) {
			topBar.insertBefore(previewBadge, dom.fullscreenTopBtn);
		}
	}
	if (previewBadge) {
		previewBadge.classList.toggle('hidden', !isPreviewMode);
	}

	updatePlayPauseBtn(false);
}

/**
 * Hide the player UI.
 */
function hidePlayerUI() {
	dom.playerView?.classList.add('hidden');
	dom.timerOverlay?.classList.add('hidden');
	dom.timerOverlay?.classList.remove('is-video-mode');
	dom.videoWrapper?.classList.add('hidden');
	const mediaContainer = dom.timerMediaContainer || (typeof document !== 'undefined' && document.getElementById('timer-media-container'));
	const mediaImg = dom.timerMediaImg || (typeof document !== 'undefined' && document.getElementById('timer-media-img'));
	if (mediaContainer) mediaContainer.classList?.add('hidden');
	if (mediaImg) mediaImg.removeAttribute?.('src');
	dom.timerOverlay?.querySelector?.('.timer-stage-content')?.classList.remove('has-media');
	if (dom.upNextCard) dom.upNextCard.classList?.add('hidden');
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
		const stepCls = classifyStep(step);
		const durLabel = stepCls.video ? 'Video' : (stepCls.mode === 'reps' ? `${stepCls.targetReps} reps` : formatTime(stepCls.targetDuration || 30));
		const stepTitle = getStepDisplayName(step);
		indicator.title = `${stepTitle} (${durLabel})`;
		indicator.textContent = i + 1;
		indicator.addEventListener('click', () => jumpToStep(i));
		dom.stepTimeline.appendChild(indicator);
	});

	// Update step counter with sub-step move indicator if applicable
	if (dom.stepCounter) {
		const curStep = currentRoutine.steps[currentStepIndex];
		const curHasSubSteps = hasSubSteps(curStep);
		const subSuffix = curHasSubSteps ? ` · Move ${currentSubStepIndex + 1}/${curStep.exercises.length}` : '';
		dom.stepCounter.textContent = `Step ${currentStepIndex + 1} / ${currentRoutine.steps.length}${subSuffix}`;
	}

	// Update next step preview
	if (dom.nextStepPreview) {
		const curStep = currentRoutine.steps[currentStepIndex];
		const curHasSubSteps = hasSubSteps(curStep);
		if (curHasSubSteps && currentSubStepIndex < curStep.exercises.length - 1) {
			const rawNext = curStep.exercises[currentSubStepIndex + 1];
			const resolvedNext = rawNext ? ((rawNext.id ? getExerciseById(rawNext.id) : null) || rawNext) : null;
			const nextSub = (rawNext && resolvedNext) ? { ...resolvedNext, ...rawNext, name: rawNext.name || resolvedNext.name || '' } : (resolvedNext || rawNext);
			const nextReps = nextSub?.targetReps || nextSub?.reps || (nextSub?.default_mode === 'reps' ? nextSub?.default_quantity : '');
			const repsText = nextReps ? ` (${nextReps} ${nextSub?.default_mode === 'time' ? 's' : 'reps'})` : '';
			dom.nextStepPreview.textContent = `Next in ${curStep.flow_type || 'combo'}: ${nextSub?.name || 'Exercise'}${repsText}`;
		} else {
			const next = currentRoutine.steps[currentStepIndex + 1];
			if (next) {
				dom.nextStepPreview.textContent = `Next: ${getStepDisplayName(next)}`;
			} else {
				dom.nextStepPreview.textContent = 'Last step';
			}
		}
	}
}

/**
 * Open tutorial popup during workout and pause timer.
 * @param {Object} instructionAsset
 * @param {Object} exercise
 */
function openWorkoutTutorial(instructionAsset, exercise) {
	const wasPaused = isPaused;
	if (!isPaused) {
		togglePause();
	}

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop workout-tutorial-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-window workout-tutorial-modal';

	const vid = instructionAsset.videoId || (instructionAsset.url ? parseYouTubeId(instructionAsset.url) : null);
	const startSec = instructionAsset.startSeconds || 0;

	modal.innerHTML = `
		<div class="modal-header">
			<div class="workout-tut-header-info">
				<span class="workout-tut-badge">${getClipIcon(12)} Technique Tutorial & Breakdown</span>
				<h3 class="modal-title">${escapeHtml(exercise?.name || instructionAsset.exerciseName || 'Form Guide')}</h3>
			</div>
			<button class="modal-close-btn" title="Close (ESC)">✕</button>
		</div>

		<div class="modal-body workout-tutorial-body">
			${vid ? `
				<div class="workout-tutorial-video-wrapper">
					<iframe
						src="https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&start=${startSec}"
						title="${escapeHtml(instructionAsset.title || 'Tutorial')}"
						frameborder="0"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowfullscreen
					></iframe>
				</div>
			` : `
				<div class="workout-tutorial-img-wrapper">
					<img src="${instructionAsset.url || '/workout/media/placeholder.svg'}" alt="Tutorial Photo" onerror="this.src='/workout/media/placeholder.svg'">
				</div>
			`}

			<div class="workout-tutorial-notes">
				<h4>${escapeHtml(instructionAsset.title || 'Coaching Cues')}</h4>
				<p>${escapeHtml(exercise?.description || 'Review biomechanical cues, posture alignment, and cadence.')}</p>
			</div>
		</div>

		<div class="modal-footer workout-tutorial-footer">
			<button class="btn btn-primary btn-resume-workout-btn">◀ Resume Workout</button>
		</div>
	`;

	const close = () => {
		document.removeEventListener('keydown', handleEsc);
		backdrop.remove();
		if (!wasPaused && isPaused) {
			togglePause();
		}
	};

	const handleEsc = (e) => {
		if (e.key === 'Escape' || e.keyCode === 27) close();
	};
	document.addEventListener('keydown', handleEsc);

	modal.querySelectorAll('.modal-close-btn, .btn-resume-workout-btn').forEach(b => {
		b.addEventListener('click', close);
	});

	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);
}

/**
 * Get current playback state.
 */
export function getPlaybackState() {
	return { isPlaying, isPaused, currentStepIndex, currentRoutine };
}
