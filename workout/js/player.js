/**
 * Player module - YouTube IFrame API integration and timer countdown engine.
 */

import { formatTime, formatFriendlyDuration, parseYouTubeId, escapeHtml } from './utils.js';
import { isBreakStep, resolveStepMediaUrl } from './editor.js';
import { playCountdownBeep } from './audio.js';
import { getClipIcon, getTimerIcon, getBreakIcon } from './icons.js';
import {
	setPlaylist, startMusic, pauseMusic, resumeMusic,
	stopMusic, muteMusic, unmuteMusic, hasMusic, getCurrentTrack
} from './music.js';
import {
	startSession, updateSessionStep, pauseSession,
	resumeSession, completeSession, stopSession
} from './session.js';
import { inferMusclesForExercise, getExerciseById, getExerciseInstructionMedia, getExerciseFollowAlongMedia } from './exercises.js';
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
let repsElapsedSeconds = 0;
let repsInterval = null;

// Timer state
let timerInterval = null;
let timerRemaining = 0;

// Clip state
let clipCheckInterval = null;
let clipHasStartedPlaying = false;
let clipLoadedAt = 0;

// HUD idle timer
let hudIdleTimer = null;
const HUD_IDLE_DELAY = 3000;

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
			onError: onYTError,
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

	// Click on stage/video to toggle play/pause or done
	if (dom.playerStage) {
		dom.playerStage.addEventListener('click', (e) => {
			if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.step-indicator')) return;
			if (isPlaying) {
				if (isRepsMode) {
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
			if (isRepsMode) {
				completeRepsStep();
			} else {
				togglePause();
			}
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
 * Start active polling to monitor clip playback position against step.endSeconds.
 * @param {Object} step
 */
function startClipMonitor(step) {
	clearClipMonitor();
	if (!step || step.type !== 'clip' || !step.endSeconds) return;

	clipCheckInterval = setInterval(() => {
		if (!isPlaying || isPaused || !ytReady || !ytPlayer) return;
		try {
			const currentTime = ytPlayer.getCurrentTime();
			if (typeof currentTime === 'number' && currentTime >= step.endSeconds - 0.25) {
				clearClipMonitor();
				try { ytPlayer.pauseVideo(); } catch {}
				advanceStep();
			}
		} catch (e) {
			// Ignore polling exceptions
		}
	}, 200);
}

/**
 * Clear clip monitor interval.
 */
function clearClipMonitor() {
	if (clipCheckInterval) {
		clearInterval(clipCheckInterval);
		clipCheckInterval = null;
	}
}

/**
 * Handle YouTube player state changes.
 */
function onYTStateChange(event) {
	if (event.data === YT.PlayerState.PLAYING) {
		disableCaptions();
		clipHasStartedPlaying = true;
		if (isPlaying && !isPaused && currentRoutine) {
			const currentStep = currentRoutine.steps[currentStepIndex];
			if (currentStep && currentStep.type === 'clip') {
				startClipMonitor(currentStep);
			}
		}
	} else if (event.data === YT.PlayerState.ENDED) {
		// Verify this is a legitimate ENDED event and not a spurious transition event
		if (!isPlaying || isPaused || !currentRoutine) return;
		const currentStep = currentRoutine.steps[currentStepIndex];
		if (!currentStep || currentStep.type !== 'clip') return;

		// If the video never actually entered PLAYING state for this step, or loaded less than 1s ago, ignore it
		if (!clipHasStartedPlaying || (Date.now() - clipLoadedAt < 1000)) {
			console.warn('Ignoring spurious YouTube ENDED event for step:', currentStepIndex);
			return;
		}

		clearClipMonitor();
		advanceStep();
	}
}

/**
 * Handle YouTube player error events.
 */
function onYTError(event) {
	console.warn('YouTube Player error code:', event.data);
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

	if (!isPreviewMode) {
		startSession(routine);
	}
	requestWakeLock();

	showPlayerUI();
	executeCurrentStep();
	resetHudIdleTimer();
}

/**
 * Complete the current Reps set and advance to next step or sub-step.
 */
export function completeRepsStep() {
	if (!isPlaying || !isRepsMode) return;
	playCountdownBeep(1);
	clearRepsTimer();
	advanceStepOrSubStep();
}

/**
 * Advance to next sub-step within a combo or next step in routine.
 */
function advanceStepOrSubStep() {
	if (!currentRoutine) return;
	const currentStep = currentRoutine.steps[currentStepIndex];
	const hasSubSteps = currentStep && !isBreakStep(currentStep) && Array.isArray(currentStep.exercises) && currentStep.exercises.length > 1;

	if (hasSubSteps && currentSubStepIndex < currentStep.exercises.length - 1) {
		currentSubStepIndex++;
		executeCurrentStep();
		return;
	}

	currentSubStepIndex = 0;
	advanceStep();
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
	clearRepsTimer();
	const step = currentRoutine.steps[currentStepIndex];
	updateStepIndicator();
	if (!isPreviewMode) {
		updateSessionStep(currentStepIndex);
	}

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
	clearTimer();
	clearRepsTimer();
	clearClipMonitor();
	clipHasStartedPlaying = false;
	clipLoadedAt = Date.now();
	isRepsMode = false;

	dom.timerOverlay.classList.add('hidden');
	dom.videoWrapper.classList.remove('hidden');

	const mediaContainer = dom.timerMediaContainer || document.getElementById('timer-media-container');
	const mediaImg = dom.timerMediaImg || document.getElementById('timer-media-img');
	if (mediaContainer) {
		mediaContainer.classList.add('hidden');
	}
	if (mediaImg) {
		mediaImg.removeAttribute('src');
	}
	dom.timerOverlay?.querySelector('.timer-stage-content')?.classList.remove('has-media');
	dom.timerOverlay?.classList.remove('is-reps-stage');

	if (dom.upNextCard) {
		dom.upNextCard.classList.add('hidden');
	}

	// Pause background music during video clips
	pauseMusic();
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

	const isTutorial = Boolean(step.isTutorial || (step.label && step.label.includes('[Tutorial]')));
	dom.currentStepLabel.textContent = step.label || (isTutorial ? 'Tutorial Breakdown' : 'Video Clip');
	if (isTutorial) {
		dom.currentStepType.innerHTML = `🎬 Tutorial Breakdown · ` + (step.exercises && step.exercises.length > 0 ? step.exercises.map(e => (getExerciseById(e.id || e)?.name || e.name || 'Instruction')).join(', ') : 'Instruction');
	} else if (step.exercises && step.exercises.length > 0) {
		const joiner = step.flow_type === 'alternating' ? ' ⮀ ' : ' + ';
		dom.currentStepType.innerHTML = `${getClipIcon(14)} ` + step.exercises.map(e => (getExerciseById(e.id || e)?.name || e.name || 'Exercise')).join(joiner);
	} else {
		dom.currentStepType.innerHTML = `${getClipIcon(14)} Follow-Along Video`;
	}
}

/**
 * Execute a timer/interval step or reps step.
 */
function executeTimerStep(step) {
	clearClipMonitor();
	clearTimer();
	clearRepsTimer();
	clipHasStartedPlaying = false;

	// Stop YouTube playback and hide
	if (ytReady && ytPlayer) {
		try { ytPlayer.pauseVideo(); } catch {}
	}
	dom.videoWrapper.classList.add('hidden');
	dom.timerOverlay.classList.remove('hidden');

	const isBreak = isBreakStep(step);
	const hasSubSteps = !isBreak && Array.isArray(step.exercises) && step.exercises.length > 1;
	const totalSubSteps = hasSubSteps ? step.exercises.length : 1;
	if (hasSubSteps) {
		if (currentSubStepIndex < 0) currentSubStepIndex = 0;
		if (currentSubStepIndex >= totalSubSteps) currentSubStepIndex = 0;
	} else {
		currentSubStepIndex = 0;
	}

	const rawSubEx = hasSubSteps ? step.exercises[currentSubStepIndex] : null;
	const resolvedSubEx = rawSubEx ? ((rawSubEx.id ? getExerciseById(rawSubEx.id) : null) || rawSubEx) : null;
	const activeSubEx = (rawSubEx && resolvedSubEx) ? { ...resolvedSubEx, ...rawSubEx, name: rawSubEx.name || resolvedSubEx.name || '' } : (resolvedSubEx || rawSubEx);

	const isSubReps = hasSubSteps
		? (activeSubEx.stepMode === 'reps' || activeSubEx.default_mode === 'reps' || (Boolean(activeSubEx.targetReps) && Number(activeSubEx.targetReps) > 0) || (!activeSubEx.durationSeconds && step.stepMode === 'reps'))
		: (!isBreak && (step.stepMode === 'reps' || (Boolean(step.targetReps) && Number(step.targetReps) > 0)));
	isRepsMode = isSubReps;

	dom.timerOverlay.classList.toggle('is-break', isBreak);
	dom.timerOverlay.classList.toggle('is-reps-stage', isSubReps);

	// Handle media/gif animation display (Hero Layout)
	let mediaUrl = null;
	if (hasSubSteps && activeSubEx) {
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
		unmuteMusic();
		startMusic();
	} else {
		stopMusic();
		if (dom.musicControlsBar) dom.musicControlsBar.classList.add('hidden');
		if (quickTitle) quickTitle.textContent = 'Music';
		if (musicToggleBtn) {
			musicToggleBtn.classList.remove('has-music');
			musicToggleBtn.classList.remove('active');
		}
	}

	// Remove any existing Done button
	const existingDoneBtn = dom.timerOverlay.querySelector('.reps-done-action-btn');
	if (existingDoneBtn) existingDoneBtn.remove();

	if (isSubReps) {
		const targetReps = hasSubSteps
			? (activeSubEx.targetReps || activeSubEx.reps || (activeSubEx.default_mode === 'reps' ? activeSubEx.default_quantity : (step.targetReps || 20)))
			: (step.targetReps || 20);
		dom.timerDisplay.textContent = `${targetReps} REPS`;
		dom.timerLabel.textContent = hasSubSteps ? (activeSubEx.name || step.label) : (step.label || 'Complete Target Reps');

		// Inject Hero Done Button in stage
		const centerContainer = dom.timerOverlay.querySelector('.timer-center-text') || dom.timerOverlay.querySelector('.timer-ring-container');
		if (centerContainer) {
			const doneBtn = document.createElement('button');
			doneBtn.type = 'button';
			doneBtn.className = 'btn btn-primary reps-done-action-btn';
			doneBtn.innerHTML = `✓ Done (Space / Enter)`;
			doneBtn.title = 'Complete reps & advance';
			doneBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				completeRepsStep();
			});
			centerContainer.appendChild(doneBtn);
		}

		const linkedEx = resolvedSubEx || (step.exercises && step.exercises[0]) || (step.exercise_id ? getExerciseById(step.exercise_id) : null);
		const stepMuscles = inferMusclesForExercise(linkedEx || { name: (activeSubEx?.name || step.label), description: step.description });
		const priMuscle = (stepMuscles.primary || [])[0];
		const priDef = priMuscle ? MUSCLE_DEFINITIONS[priMuscle] : null;
		const muscleTagHtml = priDef ? ` <span class="player-hud-muscle-tag" style="color:${priDef.color}">${priDef.icon} ${priDef.label}</span>` : '';

		if (hasSubSteps) {
			const flowIcon = step.flow_type === 'alternating' ? '⮀' : (step.flow_type === 'sequence' ? '➔' : '⚡');
			const flowLabel = step.flow_type === 'alternating' ? 'Alternating' : (step.flow_type === 'sequence' ? 'Flow' : 'Superset');
			dom.currentStepLabel.textContent = `${activeSubEx.name || 'Exercise'} (${step.label || 'Combo'})`;
			dom.currentStepType.innerHTML = `<span class="player-hud-substep-badge">${flowIcon} ${flowLabel} · Move ${currentSubStepIndex + 1}/${totalSubSteps}</span> 🔢 ${targetReps} Reps${muscleTagHtml}`;
		} else {
			dom.currentStepLabel.textContent = `${step.label || 'Exercise'} (${targetReps} reps)`;
			if (step.exercises && step.exercises.length > 0) {
				const joiner = step.flow_type === 'alternating' ? ' ⮀ ' : ' + ';
				dom.currentStepType.innerHTML = `🔢 ` + step.exercises.map(e => (getExerciseById(e.id || e)?.name || e.name || 'Exercise')).join(joiner) + muscleTagHtml;
			} else {
				dom.currentStepType.innerHTML = `🔢 ${targetReps} Reps` + muscleTagHtml;
			}
		}

		// Update progress ring to full
		updateTimerProgress(100, 100);

		if (!isPaused) {
			startRepsStopwatch();
		}
	} else {
		const targetDuration = hasSubSteps
			? (activeSubEx.durationSeconds || (activeSubEx.default_mode === 'time' ? activeSubEx.default_quantity : (step.durationSeconds || 30)))
			: (step.durationSeconds || 30);
		const linkedEx = resolvedSubEx || (step.exercises && step.exercises[0]) || (step.exercise_id ? getExerciseById(step.exercise_id) : null);
		const stepMuscles = inferMusclesForExercise(linkedEx || { name: (activeSubEx?.name || step.label), description: step.description });
		const priMuscle = (stepMuscles.primary || [])[0];
		const priDef = (!isBreak && priMuscle) ? MUSCLE_DEFINITIONS[priMuscle] : null;
		const muscleTagHtml = priDef ? ` <span class="player-hud-muscle-tag" style="color:${priDef.color}">${priDef.icon} ${priDef.label}</span>` : '';

		timerRemaining = targetDuration;
		dom.timerLabel.textContent = hasSubSteps ? (activeSubEx.name || step.label) : (step.label || (isBreak ? 'Rest' : 'Timer'));
		dom.timerDisplay.textContent = formatTime(timerRemaining);

		if (hasSubSteps) {
			const flowIcon = step.flow_type === 'alternating' ? '⮀' : (step.flow_type === 'sequence' ? '➔' : '⚡');
			const flowLabel = step.flow_type === 'alternating' ? 'Alternating' : (step.flow_type === 'sequence' ? 'Flow' : 'Superset');
			dom.currentStepLabel.textContent = `${activeSubEx.name || 'Exercise'} (${step.label || 'Combo'})`;
			dom.currentStepType.innerHTML = `<span class="player-hud-substep-badge">${flowIcon} ${flowLabel} · Move ${currentSubStepIndex + 1}/${totalSubSteps}</span> ${getTimerIcon(14)} ${formatTime(timerRemaining)}${muscleTagHtml}`;
		} else {
			dom.currentStepLabel.textContent = step.label || (isBreak ? 'Rest' : 'Timer');
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
				} else if (next.stepMode === 'reps' || next.targetReps) {
					dom.upNextMeta.textContent = `🔢 Exercise (${next.targetReps || 20} reps)`;
				} else {
					dom.upNextMeta.textContent = `⏱ Exercise (${formatFriendlyDuration(next.durationSeconds || 30)})`;
				}
			}
			if (dom.upNextMediaThumb) {
				const nextMedia = resolveStepMediaUrl(next);
				if (next.type === 'clip' && next.videoId) {
					dom.upNextMediaThumb.innerHTML = `
						<img src="https://img.youtube.com/vi/${next.videoId}/hqdefault.jpg" onerror="this.src='https://img.youtube.com/vi/${next.videoId}/mqdefault.jpg'" alt="${next.label || 'Next Video'}">
						<div class="thumbnail-play-overlay">▶</div>
					`;
				} else if (nextMedia) {
					dom.upNextMediaThumb.innerHTML = `<img src="${nextMedia}" alt="${next.label || 'Next Step'}" class="up-next-gif-thumb">`;
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
}

/**
 * Start stopwatch counting elapsed seconds for Reps steps.
 */
function startRepsStopwatch() {
	clearRepsTimer();
	const startTime = performance.now();
	const initialSec = repsElapsedSeconds;

	repsInterval = setInterval(() => {
		if (isPaused) return;
		const elapsed = (performance.now() - startTime) / 1000;
		repsElapsedSeconds = initialSec + elapsed;
	}, 200);
}

/**
 * Clear reps stopwatch timer.
 */
function clearRepsTimer() {
	if (repsInterval) {
		clearInterval(repsInterval);
		repsInterval = null;
	}
	repsElapsedSeconds = 0;
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
			if (playerCallbacks.onRoutineComplete) {
				playerCallbacks.onRoutineComplete(null, completedRoutine);
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
	const currentStep = currentRoutine.steps[currentStepIndex];
	const hasSubSteps = currentStep && !isBreakStep(currentStep) && Array.isArray(currentStep.exercises) && currentStep.exercises.length > 1;

	if (hasSubSteps && currentSubStepIndex > 0) {
		currentSubStepIndex--;
		executeCurrentStep();
		return;
	}

	if (currentStepIndex <= 0) return;
	currentStepIndex--;
	const prevStep = currentRoutine.steps[currentStepIndex];
	if (prevStep && !isBreakStep(prevStep) && Array.isArray(prevStep.exercises) && prevStep.exercises.length > 1) {
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

		if (step.type === 'clip') {
			if (ytReady && ytPlayer) {
				ytPlayer.playVideo();
			}
			startClipMonitor(step);
		} else if (step.type === 'timer') {
			if (isRepsMode) {
				startRepsStopwatch();
			} else {
				// Restart timer from remaining
				const totalDuration = step.durationSeconds;
				startTimer(totalDuration);
			}
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
		clearRepsTimer();
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
	clearTimer();
	clearRepsTimer();
	clearClipMonitor();
	clearHudIdleTimer();
	if (!isNativeFullscreen()) {
		releaseWakeLock();
	}
	isPlaying = false;
	isPaused = false;
	isRepsMode = false;
	clipHasStartedPlaying = false;
	currentStepIndex = -1;
	currentSubStepIndex = 0;

	if (ytReady && ytPlayer) {
		try { ytPlayer.stopVideo(); } catch {}
	}

	// Stop background music
	stopMusic();

	hidePlayerUI();

	if (!isCompleted && !isPreviewMode) {
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

/**
 * Show the player UI and hide other views.
 */
function showPlayerUI() {
	dom.playerView.classList.remove('hidden');
	if (dom.editorView) dom.editorView.classList.add('hidden');
	if (dom.routineView) dom.routineView.classList.add('hidden');
	if (dom.emptyView) dom.emptyView.classList.add('hidden');
	if (dom.combosView) dom.combosView.classList.add('hidden');
	if (dom.exercisesView) dom.exercisesView.classList.add('hidden');
	if (dom.statsView) dom.statsView.classList.add('hidden');
	if (dom.playerRoutineTitle) {
		dom.playerRoutineTitle.textContent = currentRoutine?.title || 'Workout';
	}

	let previewBadge = dom.playerView.querySelector('#player-preview-badge');
	if (!previewBadge) {
		previewBadge = document.createElement('span');
		previewBadge.id = 'player-preview-badge';
		previewBadge.className = 'player-preview-badge';
		previewBadge.innerHTML = '🔍 Preview Mode (Stats Disabled)';
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
	dom.playerView.classList.add('hidden');
	dom.timerOverlay.classList.add('hidden');
	dom.videoWrapper.classList.add('hidden');
	const mediaContainer = dom.timerMediaContainer || document.getElementById('timer-media-container');
	const mediaImg = dom.timerMediaImg || document.getElementById('timer-media-img');
	if (mediaContainer) mediaContainer.classList.add('hidden');
	if (mediaImg) mediaImg.removeAttribute('src');
	dom.timerOverlay?.querySelector('.timer-stage-content')?.classList.remove('has-media');
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

	// Update step counter with sub-step move indicator if applicable
	if (dom.stepCounter) {
		const curStep = currentRoutine.steps[currentStepIndex];
		const hasSubSteps = curStep && !isBreakStep(curStep) && Array.isArray(curStep.exercises) && curStep.exercises.length > 1;
		const subSuffix = hasSubSteps ? ` · Move ${currentSubStepIndex + 1}/${curStep.exercises.length}` : '';
		dom.stepCounter.textContent = `Step ${currentStepIndex + 1} / ${currentRoutine.steps.length}${subSuffix}`;
	}

	// Update next step preview
	if (dom.nextStepPreview) {
		const curStep = currentRoutine.steps[currentStepIndex];
		const hasSubSteps = curStep && !isBreakStep(curStep) && Array.isArray(curStep.exercises) && curStep.exercises.length > 1;
		if (hasSubSteps && currentSubStepIndex < curStep.exercises.length - 1) {
			const rawNext = curStep.exercises[currentSubStepIndex + 1];
			const resolvedNext = rawNext ? ((rawNext.id ? getExerciseById(rawNext.id) : null) || rawNext) : null;
			const nextSub = (rawNext && resolvedNext) ? { ...resolvedNext, ...rawNext, name: rawNext.name || resolvedNext.name || '' } : (resolvedNext || rawNext);
			const nextReps = nextSub?.targetReps || nextSub?.reps || (nextSub?.default_mode === 'reps' ? nextSub?.default_quantity : '');
			const repsText = nextReps ? ` (${nextReps} ${nextSub?.default_mode === 'time' ? 's' : 'reps'})` : '';
			dom.nextStepPreview.textContent = `Next in ${curStep.flow_type || 'combo'}: ${nextSub?.name || 'Exercise'}${repsText}`;
		} else {
			const next = currentRoutine.steps[currentStepIndex + 1];
			if (next) {
				dom.nextStepPreview.textContent = `Next: ${next.label}`;
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
				<span class="workout-tut-badge">🎬 Technique Tutorial & Breakdown</span>
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
					<img src="${instructionAsset.url || '/workout/media/pushups.svg'}" alt="Tutorial Photo">
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
