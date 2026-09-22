/**
 * App controller - coordinates UI, soft accounts, routines, stats, sharing, and player modules.
 */

import {
	loadRoutines, saveRoutines, fetchServerRoutines,
	saveServerRoutines, exportSingleRoutine,
	buildRoutineUrl, getRoutineTargetFromUrl,
	fetchStats
} from './storage.js';
import {
	renderEditor, createClipStep, createTimerStep, createBreakStep, createRoutine,
	createStepFromExercise, createStepFromCombo,
	showAddExerciseModal, showAddComboModal, toggleAllStepCards, expandStep,
	appendStepWithBreak, trimTrailingBreaks,
	getStepDisplayName
} from './editor.js';
import { renderRoutineOverview } from './view.js';
import {
	initPlayer, startRoutine, stopPlayback,
	togglePause, skipStep, previousStep, resetPlayback,
	toggleFullscreen
} from './player.js';
import { initAudio } from './audio.js';
import {
	initMusic, nextTrack, prevTrack,
	toggleMusicPlayback, isMusicPausedByUser,
	unlockAudio
} from './music.js';
import { formatTime, formatFriendlyDuration, copyToClipboard, showToast, parseYouTubeId, initInputCleanlinessEnforcer, escapeHtml } from './utils.js';
import {
	getClipIcon, getTimerIcon, getBreakIcon,
	getMusicPlayIcon, getMusicPauseIcon
} from './icons.js';
import { showPrompt, showConfirm, showAlert } from './modal.js';
import {
	getActiveUserId, getActiveDisplayName, setActiveUser,
	fetchUsers, createUser
} from './user.js';
import { renderStatsDashboard } from './stats.js';
import { loadExercises, getExerciseById, getExerciseFollowAlongMedia, classifyStep } from './exercises.js';
import { renderExercisesCatalog, showExerciseVariationsModal, highlightExerciseCard } from './exercises_view.js';
import { loadCombos, renderCombosCatalog } from './combos.js';
import { renderAnatomyExplorer } from './body_map.js';
import { initTheme } from './theme.js';
import { showRoutinePickerPopover } from './routine_picker.js';

let routines = [];
let selectedRoutineId = null;
let currentMode = 'view'; // 'view' | 'edit'
let currentTab = 'routines'; // 'routines' | 'combos' | 'exercises' | 'stats'
let syncTimeout = null;
let localStorageTimeout = null;
let sharedRoutine = null;
let isViewingShared = false;
let editingRoutineSnapshot = null;
let isNewRoutineEditing = false;

// DOM references
const dom = {};

/**
 * Initialize the application.
 */
async function init() {
	cacheDom();
	initTheme();
	initInputCleanlinessEnforcer();
	updateProfileButtonLabel();

	// Fast initial render from localStorage cache
	routines = loadRoutines();
	if (routines.length > 0) {
		selectedRoutineId = routines[0].id;
	}

	// Warm up exercise and combos taxonomy caches from server
	await Promise.all([loadExercises(), loadCombos()]).catch(() => {});

	// Check if URL specifies a target routine
	const urlTarget = await getRoutineTargetFromUrl();
	if (urlTarget) {
		if (urlTarget.isOwner) {
			const found = routines.find(r => r.id === urlTarget.routineId || r.title.toLowerCase().replace(/ /g, '-') === urlTarget.routineId.toLowerCase());
			if (found) selectedRoutineId = found.id;
		} else if (urlTarget.routine) {
			sharedRoutine = urlTarget.routine;
			isViewingShared = true;
		}
	}

	renderRoutineList();
	renderSelectedRoutine();
	initSidebarState();
	bindEvents();

	// Fetch server state as source of truth
	await syncWithServerOnStartup();

	let needsRerender = false;
	if (urlTarget && urlTarget.isOwner) {
		const found = routines.find(r => r.id === urlTarget.routineId || r.title.toLowerCase().replace(/ /g, '-') === urlTarget.routineId.toLowerCase());
		if (found && selectedRoutineId !== found.id) {
			selectedRoutineId = found.id;
			history.replaceState(null, '', window.location.pathname);
			needsRerender = true;
		}
	} else if (sharedRoutine && !isViewingShared) {
		isViewingShared = true;
		needsRerender = true;
	}
	if (needsRerender) {
		renderRoutineList();
		renderSelectedRoutine();
	}

	// Initialize audio on first interaction
	document.addEventListener('click', () => initAudio(), { once: true });

	// Initialize YouTube player
	await initPlayer(
		{
			youtubeContainer: dom.youtubePlayer,
			playerView: dom.playerView,
			playerStage: dom.playerStage,
			editorView: dom.editorView,
			routineView: dom.routineView,
			emptyView: dom.emptyView,
			combosView: dom.combosView,
			exercisesView: dom.exercisesView,
			statsView: dom.statsView,
			timerOverlay: dom.timerOverlay,
			timerStageHeader: dom.timerStageHeader,
			timerStageBadge: dom.timerStageBadge,
			timerStageTitle: dom.timerStageTitle,
			timerMediaContainer: dom.timerMediaContainer,
			timerMediaImg: dom.timerMediaImg,
			timerDisplay: dom.timerDisplay,
			timerLabel: dom.timerLabel,
			timerRing: dom.timerRing,
			timerRepsContainer: dom.timerRepsContainer,
			repsStepMinus: dom.repsStepMinus,
			repsStepPlus: dom.repsStepPlus,
			repsStepperCount: dom.repsStepperCount,
			repsDoneBtn: dom.repsDoneBtn,
			videoWrapper: dom.videoWrapper,
			currentStepLabel: dom.currentStepLabel,
			currentStepType: dom.currentStepType,
			stepTimeline: dom.stepTimeline,
			stepCounter: dom.stepCounter,
			nextStepPreview: dom.nextStepPreview,
			playPauseBtn: dom.playPauseBtn,
			musicControlsBar: dom.musicControlsBar,
			musicTrackName: dom.musicTrackName,
			playerBackBtn: dom.playerBackBtn,
			playerRoutineTitle: dom.playerRoutineTitle,
			fullscreenTopBtn: dom.fullscreenTopBtn,
			fullscreenDockBtn: dom.fullscreenDockBtn,
			upNextCard: dom.upNextCard,
			upNextLabel: dom.upNextLabel,
			upNextMeta: dom.upNextMeta,
			upNextMediaThumb: dom.upNextMediaThumb,
			countdownStage: dom.countdownStage,
			countdownRoutineTitle: dom.countdownRoutineTitle,
			countdownNumber: dom.countdownNumber,
			countdownRingFill: dom.countdownRingFill,
			countdownFirstUpCard: dom.countdownFirstUpCard,
			countdownFirstThumb: dom.countdownFirstThumb,
			countdownFirstLabel: dom.countdownFirstLabel,
			countdownFirstMeta: dom.countdownFirstMeta,
			countdownSkipBtn: dom.countdownSkipBtn,
		},
		{
			onStop: () => {
				if (currentTab === 'stats') {
					if (dom.statsView) dom.statsView.classList.remove('hidden');
					renderStatsDashboard(dom.statsView);
				} else if (currentTab === 'combos') {
					if (dom.combosView) dom.combosView.classList.remove('hidden');
				} else if (currentTab === 'exercises') {
					if (dom.exercisesView) dom.exercisesView.classList.remove('hidden');
				} else {
					renderSelectedRoutine();
				}
			},
			onRoutineComplete: (session, completedRoutine) => {
				showCompletionModal(session, completedRoutine);
			},
			onPreviewComplete: (completedRoutine) => {
				const title = completedRoutine?.title ? completedRoutine.title.replace(/^(Preview|Tutorial):\s*/i, '') : '';
				showToast(title ? `Finished previewing: ${title}` : 'Preview finished');
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
	dom.syncStatus = document.getElementById('sync-status');
	dom.emptyView = document.getElementById('empty-view');
	dom.routineView = document.getElementById('routine-view');
	dom.routineOverviewContainer = document.getElementById('routine-overview-container');
	dom.editorView = document.getElementById('editor-view');
	dom.combosView = document.getElementById('combos-view');
	dom.exercisesView = document.getElementById('exercises-view');
	dom.anatomyView = document.getElementById('anatomy-view');
	dom.statsView = document.getElementById('stats-view');
	dom.playerView = document.getElementById('player-view');
	dom.playerStage = document.querySelector('.player-stage');
	dom.routineTitle = document.getElementById('routine-title');
	dom.stepActions = document.querySelector('.step-actions');
	dom.stepList = document.getElementById('step-list');
	dom.addExerciseBtn = document.getElementById('add-exercise-btn');
	dom.addComboBtn = document.getElementById('add-combo-btn');
	dom.addBreakBtn = document.getElementById('add-break-btn');
	dom.doneEditingBtn = document.getElementById('done-editing-btn');
	dom.cancelEditingBtn = document.getElementById('cancel-editing-btn');
	dom.deleteRoutineBtn = document.getElementById('delete-routine-btn');

	// Sidebar & Layout
	dom.appContainer = document.querySelector('.app-container');
	dom.sidebar = document.getElementById('app-sidebar');
	dom.sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
	dom.sidebarExpandBtn = document.getElementById('sidebar-expand-btn');

	// Soft Accounts & Navigation
	dom.userProfileBtn = document.getElementById('user-profile-btn');
	dom.userProfileName = document.getElementById('user-profile-name');
	dom.profileDropdownContainer = document.getElementById('profile-dropdown-container');
	dom.profileDropdownMenu = document.getElementById('profile-dropdown-menu');
	dom.dropdownProfileList = document.getElementById('dropdown-profile-list');
	dom.dropdownNewProfileInput = document.getElementById('dropdown-new-profile-input');
	dom.dropdownCreateProfileBtn = document.getElementById('dropdown-create-profile-btn');
	dom.tabRoutinesBtn = document.getElementById('tab-routines-btn');
	dom.tabCombosBtn = document.getElementById('tab-combos-btn');
	dom.tabExercisesBtn = document.getElementById('tab-exercises-btn');
	dom.tabAnatomyBtn = document.getElementById('tab-anatomy-btn');
	dom.tabStatsBtn = document.getElementById('tab-stats-btn');
	dom.profileModalBackdrop = document.getElementById('profile-modal-backdrop');
	dom.profileModalCloseBtn = document.getElementById('profile-modal-close-btn');
	dom.profileUserList = document.getElementById('profile-user-list');
	dom.newProfileInput = document.getElementById('new-profile-input');
	dom.createProfileBtn = document.getElementById('create-profile-btn');

	dom.emptyCreateBtn = document.getElementById('empty-create-btn');
	dom.toggleCollapseAllBtn = document.getElementById('toggle-collapse-all-btn');
	dom.collapseToggleText = document.getElementById('collapse-toggle-text');

	// Mobile Navigation Elements
	dom.mTabRoutinesBtn = document.getElementById('m-tab-routines-btn');
	dom.mTabCombosBtn = document.getElementById('m-tab-combos-btn');
	dom.mTabExercisesBtn = document.getElementById('m-tab-exercises-btn');
	dom.mTabAnatomyBtn = document.getElementById('m-tab-anatomy-btn');
	dom.mTabStatsBtn = document.getElementById('m-tab-stats-btn');

	// Player top bar & buttons
	dom.playerBackBtn = document.getElementById('player-back-btn');
	dom.playerRoutineTitle = document.getElementById('player-routine-title');
	dom.fullscreenTopBtn = document.getElementById('fullscreen-top-btn');
	dom.fullscreenDockBtn = document.getElementById('fullscreen-dock-btn');

	// Player stage elements
	dom.youtubePlayer = document.getElementById('youtube-player');
	dom.videoWrapper = document.getElementById('video-wrapper');
	dom.timerOverlay = document.getElementById('timer-overlay');
	dom.timerStageHeader = document.getElementById('timer-stage-header');
	dom.timerStageBadge = document.getElementById('timer-stage-badge');
	dom.timerStageTitle = document.getElementById('timer-stage-title');
	dom.timerMediaContainer = document.getElementById('timer-media-container');
	dom.timerMediaImg = document.getElementById('timer-media-img');
	dom.timerDisplay = document.getElementById('timer-display');
	dom.timerLabel = document.getElementById('timer-label');
	dom.timerRing = document.getElementById('timer-ring');
	dom.timerRepsContainer = document.getElementById('timer-reps-container');
	dom.repsStepMinus = document.getElementById('reps-step-minus');
	dom.repsStepPlus = document.getElementById('reps-step-plus');
	dom.repsStepperCount = document.getElementById('reps-stepper-count');
	dom.repsDoneBtn = document.getElementById('reps-done-btn');
	dom.upNextCard = document.getElementById('up-next-card');
	dom.upNextLabel = document.getElementById('up-next-label');
	dom.upNextMeta = document.getElementById('up-next-meta');
	dom.upNextMediaThumb = document.getElementById('up-next-media-thumb');

	// Countdown stage elements
	dom.countdownStage = document.getElementById('countdown-stage');
	dom.countdownRoutineTitle = document.getElementById('countdown-routine-title');
	dom.countdownNumber = document.getElementById('countdown-number');
	dom.countdownRingFill = document.getElementById('countdown-ring-fill');
	dom.countdownFirstUpCard = document.getElementById('countdown-first-up-card');
	dom.countdownFirstThumb = document.getElementById('countdown-first-thumb');
	dom.countdownFirstLabel = document.getElementById('countdown-first-label');
	dom.countdownFirstMeta = document.getElementById('countdown-first-meta');
	dom.countdownSkipBtn = document.getElementById('countdown-skip-btn');

	// Player bottom controls elements
	dom.currentStepLabel = document.getElementById('current-step-label');
	dom.currentStepType = document.getElementById('current-step-type');
	dom.stepTimeline = document.getElementById('step-timeline');
	dom.stepCounter = document.getElementById('step-counter');
	dom.nextStepPreview = document.getElementById('next-step-preview');
	dom.playerMusicToggleBtn = document.getElementById('player-music-toggle-btn');
	dom.musicQuickTitle = document.getElementById('music-quick-title');
	dom.playPauseBtn = document.getElementById('play-pause-btn');
	dom.skipBtn = document.getElementById('skip-btn');
	dom.prevBtn = document.getElementById('prev-btn');
	dom.resetBtn = document.getElementById('reset-btn');
	dom.stopBtn = document.getElementById('stop-btn');

	// Music player controls
	dom.musicControlsBar = document.getElementById('music-controls-bar');
	dom.musicTrackName = document.getElementById('music-track-name');
	dom.musicPrevBtn = document.getElementById('music-prev-btn');
	dom.musicPlayPauseBtn = document.getElementById('music-play-pause-btn');
	dom.musicNextBtn = document.getElementById('music-next-btn');

	// Hidden YouTube music player
	dom.ytMusicPlayer = document.getElementById('yt-music-player');

	// Workout Completion Modal
	dom.completionModalBackdrop = document.getElementById('completion-modal-backdrop');
	dom.completionModalCloseBtn = document.getElementById('completion-modal-close-btn');
	dom.completionRoutineTitle = document.getElementById('completion-routine-title');
	dom.completionStatDuration = document.getElementById('completion-stat-duration');
	dom.completionStatSteps = document.getElementById('completion-stat-steps');
	dom.completionStatStreak = document.getElementById('completion-stat-streak');
	dom.completionStepsCount = document.getElementById('completion-steps-count');
	dom.completionStepsList = document.getElementById('completion-steps-list');
	dom.completionStatsBtn = document.getElementById('completion-stats-btn');
	dom.completionRestartBtn = document.getElementById('completion-restart-btn');
	dom.completionDoneBtn = document.getElementById('completion-done-btn');
}

function updateProfileButtonLabel() {
	const displayName = getActiveDisplayName() || 'Levon';
	const initial = displayName.trim().charAt(0).toUpperCase() || 'L';
	if (dom.userProfileName) {
		dom.userProfileName.textContent = initial;
	}
	const dropdownAvatar = document.getElementById('dropdown-user-avatar');
	if (dropdownAvatar) dropdownAvatar.textContent = initial;
	const dropdownName = document.getElementById('dropdown-user-name');
	if (dropdownName) dropdownName.textContent = displayName;
	const dropdownId = document.getElementById('dropdown-user-id');
	if (dropdownId) dropdownId.textContent = `@${getActiveUserId()}`;
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
		dom.syncStatus.classList.remove('hidden');
		dom.syncStatus.textContent = '🔄 ' + (message || 'Saving...');
	} else if (state === 'synced') {
		dom.syncStatus.classList.add('hidden');
		dom.syncStatus.textContent = '';
	} else if (state === 'error') {
		dom.syncStatus.classList.remove('hidden');
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
		if (currentTab === 'routines') {
			renderSelectedRoutine();
		}
		setSyncStatus('synced', 'Synced');
	} catch (err) {
		console.warn('Could not sync with server on startup, using local storage cache:', err);
		setSyncStatus('error', 'Offline mode');
	}
}

/**
 * Switch active navigation tab (Routines vs Combos vs Exercises vs Stats).
 * @param {'routines' | 'combos' | 'exercises' | 'anatomy' | 'stats'} tab
 */
/**
 * Handle adding an exercise or combo with the target routine picker popover.
 * @param {Object} item - Exercise or Combo object
 * @param {HTMLElement} [triggerBtn] - Trigger button element for popover anchoring
 * @param {'exercise'|'combo'} [type='exercise'] - Type of item
 */
function handleAddToRoutineWithPicker(item, triggerBtn, type = 'exercise') {
	if (!triggerBtn) {
		let routine = getSelectedRoutine();
		if (!routine) {
			routine = createRoutine('New Workout');
			routines.push(routine);
			selectedRoutineId = routine.id;
		}
		const newStep = type === 'combo' ? createStepFromCombo(item) : createStepFromExercise(item);
		appendStepWithBreak(routine, newStep);
		persist();
		showToast(`Added "${item.name}" to ${routine.title}!`);
		return;
	}

	showRoutinePickerPopover(triggerBtn, item, type, {
		routines,
		selectedRoutineId,
		onSave: () => persist(),
		onSelectRoutine: (id) => {
			selectedRoutineId = id;
		},
		onSwitchToEditor: () => {
			currentMode = 'edit';
			switchTab('routines');
		}
	});
}

/**
 * Build a preview step for an exercise or combo definition.
 * @param {Object} item - Exercise or Combo definition
 * @param {Object} [asset] - Media asset to preview
 * @param {Object} [options]
 * @param {boolean} [options.isCombo=false]
 * @returns {Object} Preview step object
 */
export function buildPreviewStep(item, asset = null, { isCombo = false } = {}) {
	const chosenAsset = asset || (isCombo ? (item?.media_assets || [])[0] : getExerciseFollowAlongMedia(item));
	const isVideo = chosenAsset && (chosenAsset.type === 'video' || Boolean(chosenAsset.videoId));
	const isTutorial = Boolean(chosenAsset && chosenAsset.kind === 'instruction');
	const isExReps = (item?.default_mode || (isCombo ? 'time' : 'reps')) === 'reps';
	const exList = isCombo
		? ((item?.exercise_ids || []).map(id => (typeof id === 'object' ? id : getExerciseById(id))).filter(Boolean))
		: (item ? [item] : []);

	let label;
	if (isCombo) {
		label = item?.name || 'Combo Flow';
	} else if (isTutorial) {
		label = `${item?.name || 'Exercise'}: [Tutorial] ${chosenAsset?.title || 'Instruction'}`;
	} else if (chosenAsset?.title) {
		label = `${item?.name || 'Exercise'}: ${chosenAsset.title}`;
	} else {
		label = item?.name || 'Exercise';
	}

	const fallbackQty = isCombo ? 190 : (isExReps ? 20 : 30);
	const targetQty = item?.default_quantity || fallbackQty;

	const vidId = chosenAsset
		? (chosenAsset.videoId || parseYouTubeId(chosenAsset.url || item?.media_url))
		: parseYouTubeId(item?.media_url);

	if (isVideo) {
		const start = chosenAsset?.startSeconds || 0;
		const dur = isCombo ? targetQty : (chosenAsset?.endSeconds ? chosenAsset.endSeconds - start : (item?.default_quantity || 60));
		const end = chosenAsset?.endSeconds || (start + dur);
		const step = {
			id: isCombo ? 'preview-combo-step' : 'preview-step',
			type: 'clip',
			isTutorial,
			customMedia: true,
			videoId: vidId,
			startSeconds: start,
			endSeconds: end,
			label,
			exercises: exList
		};
		if (isCombo) {
			step.flow_type = item?.flow_type || 'alternating';
		}
		return step;
	}

	const rawGif = (chosenAsset && chosenAsset.type === 'image' ? chosenAsset.url : '') ||
		(chosenAsset?.url || (item?.media_url && !item?.media_url?.includes('youtube') && !item?.media_url?.includes('youtu.be') ? item.media_url : ''));

	const step = {
		id: isCombo ? 'preview-combo-step' : 'preview-step',
		type: 'timer',
		stepMode: isExReps ? 'reps' : 'time',
		targetReps: isExReps ? targetQty : 0,
		durationSeconds: !isExReps ? targetQty : 30,
		label,
		customMedia: true,
		gifUrl: rawGif || '',
		exercises: exList
	};
	if (isCombo) {
		step.flow_type = item?.flow_type || 'alternating';
	}
	return step;
}

/**
 * Start preview playback for an exercise or combo.
 * @param {Object} item
 * @param {Object} [asset]
 * @param {Object} [options]
 */
function playPreview(item, asset = null, { isCombo = false } = {}) {
	const step = buildPreviewStep(item, asset, { isCombo });
	const isTutorial = Boolean(step.isTutorial);
	const previewRoutine = {
		id: isCombo ? 'preview-combo-routine' : 'preview-routine',
		title: isTutorial ? `Tutorial: ${item?.name}` : `Preview: ${item?.name}`,
		steps: [step]
	};
	unlockAudio();
	startRoutine(previewRoutine, 0, true);
}

function switchTab(tab) {
	currentTab = tab;

	if (dom.tabRoutinesBtn) dom.tabRoutinesBtn.classList.toggle('active', tab === 'routines');
	if (dom.tabCombosBtn) dom.tabCombosBtn.classList.toggle('active', tab === 'combos');
	if (dom.tabExercisesBtn) dom.tabExercisesBtn.classList.toggle('active', tab === 'exercises');
	if (dom.tabAnatomyBtn) dom.tabAnatomyBtn.classList.toggle('active', tab === 'anatomy');
	if (dom.tabStatsBtn) dom.tabStatsBtn.classList.toggle('active', tab === 'stats');

	// Sync mobile bottom navigation bar active state
	if (dom.mTabRoutinesBtn) dom.mTabRoutinesBtn.classList.toggle('active', tab === 'routines');
	if (dom.mTabCombosBtn) dom.mTabCombosBtn.classList.toggle('active', tab === 'combos');
	if (dom.mTabExercisesBtn) dom.mTabExercisesBtn.classList.toggle('active', tab === 'exercises');
	if (dom.mTabAnatomyBtn) dom.mTabAnatomyBtn.classList.toggle('active', tab === 'anatomy');
	if (dom.mTabStatsBtn) dom.mTabStatsBtn.classList.toggle('active', tab === 'stats');

	// Manage sidebar visibility for routines tab vs full-width catalogs
	const isRoutines = tab === 'routines';
	if (dom.appContainer) {
		dom.appContainer.classList.toggle('non-routines-tab', !isRoutines);
	}
	if (dom.sidebarExpandBtn) {
		if (!isRoutines) {
			dom.sidebarExpandBtn.classList.add('hidden');
		} else {
			const isManuallyHidden = dom.appContainer && dom.appContainer.classList.contains('sidebar-hidden');
			dom.sidebarExpandBtn.classList.toggle('hidden', !isManuallyHidden);
		}
	}

	if (dom.routineView) dom.routineView.classList.add('hidden');
	if (dom.editorView) dom.editorView.classList.add('hidden');
	if (dom.emptyView) dom.emptyView.classList.add('hidden');
	if (dom.combosView) dom.combosView.classList.add('hidden');
	if (dom.exercisesView) dom.exercisesView.classList.add('hidden');
	if (dom.anatomyView) dom.anatomyView.classList.add('hidden');
	if (dom.statsView) dom.statsView.classList.add('hidden');
	if (dom.playerView) dom.playerView.classList.add('hidden');

	if (tab === 'anatomy') {
		if (dom.anatomyView) {
			dom.anatomyView.classList.remove('hidden');
			renderAnatomyExplorer(dom.anatomyView, {
				onPlayExercise: (exercise, asset) => {
					playPreview(exercise, asset);
				},
				onAddToRoutine: (exercise, triggerBtn) => handleAddToRoutineWithPicker(exercise, triggerBtn, 'exercise'),
				onOpenExerciseDetails: (exercise, customOpts = {}) => {
					showExerciseVariationsModal(exercise, {
						...customOpts,
						onAddToRoutine: (targetEx, btn) => handleAddToRoutineWithPicker(targetEx || exercise, btn, 'exercise')
					});
				}
			});
		}
	} else if (tab === 'stats') {
		if (dom.statsView) {
			dom.statsView.classList.remove('hidden');
			renderStatsDashboard(dom.statsView);
		}
	} else if (tab === 'combos') {
		if (dom.combosView) {
			dom.combosView.classList.remove('hidden');
			renderCombosCatalog(dom.combosView, {
				onPlayCombo: (combo) => {
					playPreview(combo, null, { isCombo: true });
				},
				onBreakDownCombo: (combo) => {
					const exList = (combo.exercise_ids || []).map(id => getExerciseById(id)).filter(Boolean);
					if (exList.length === 0) {
						showToast('No constituent exercises to break down.');
						return;
					}
					const isComboReps = combo.default_mode === 'reps';
					const totalQuantity = combo.default_quantity || (isComboReps ? 20 : 190);
					const count = exList.length;
					const baseQty = Math.floor(totalQuantity / count);
					const remainder = totalQuantity % count;

					const steps = exList.map((e, idx) => {
						const isReps = isComboReps || (e.default_mode || 'time') === 'reps';
						const allocated = idx < remainder ? baseQty + 1 : baseQty;
						const repsCount = isComboReps ? allocated : (e.default_quantity || 20);
						const secCount = !isComboReps ? Math.max(10, allocated) : (e.default_quantity || 30);

						const s = createTimerStep(
							e.name,
							isReps ? 30 : secCount,
							e.media_url || ''
						);
						s.stepMode = isReps ? 'reps' : 'time';
						if (isReps) s.targetReps = repsCount;
						s.exercises = [e];
						return s;
					});
					const previewRoutine = {
						id: 'preview-breakdown-routine',
						title: `Breakdown: ${combo.name}`,
						steps
					};
					unlockAudio();
					startRoutine(previewRoutine, 0, true);
				},
				onAddToRoutine: (combo, triggerBtn) => handleAddToRoutineWithPicker(combo, triggerBtn, 'combo'),
				onAddToRoutineExercise: (exercise, triggerBtn) => handleAddToRoutineWithPicker(exercise, triggerBtn, 'exercise'),
				onPlayExercise: (exercise, asset) => {
					playPreview(exercise, asset);
				}
			});
		}
	} else if (tab === 'exercises') {
		if (dom.exercisesView) {
			dom.exercisesView.classList.remove('hidden');
			renderExercisesCatalog(dom.exercisesView, {
				onPlayExercise: (exercise, asset) => {
					playPreview(exercise, asset);
				},
				onAddToRoutine: (exercise, triggerBtn) => handleAddToRoutineWithPicker(exercise, triggerBtn, 'exercise')
			});
		}
	} else {
		if (dom.statsView) dom.statsView.classList.add('hidden');
		if (dom.combosView) dom.combosView.classList.add('hidden');
		if (dom.exercisesView) dom.exercisesView.classList.add('hidden');
		renderSelectedRoutine();
	}
}

/**
 * Initialize sidebar visibility from saved user preference.
 */
function initSidebarState() {
	const isHidden = localStorage.getItem('workout_sidebar_hidden') === 'true';
	if (isHidden && dom.appContainer) {
		dom.appContainer.classList.add('sidebar-hidden');
		if (dom.sidebarExpandBtn) {
			dom.sidebarExpandBtn.classList.remove('hidden');
		}
	}
}

/**
 * Toggle sidebar visibility (hide or expand).
 * @param {boolean} [hide]
 */
function toggleSidebar(hide) {
	if (!dom.appContainer) return;
	const shouldHide = typeof hide === 'boolean' ? hide : !dom.appContainer.classList.contains('sidebar-hidden');
	dom.appContainer.classList.toggle('sidebar-hidden', shouldHide);
	if (dom.sidebarExpandBtn) {
		dom.sidebarExpandBtn.classList.toggle('hidden', !shouldHide);
	}
	localStorage.setItem('workout_sidebar_hidden', shouldHide ? 'true' : 'false');
}

/**
 * Bind UI event handlers.
 */
function bindEvents() {
	dom.addWorkoutBtn.addEventListener('click', handleAddWorkout);
	if (dom.sidebarToggleBtn) {
		dom.sidebarToggleBtn.addEventListener('click', () => toggleSidebar(true));
	}
	if (dom.sidebarExpandBtn) {
		dom.sidebarExpandBtn.addEventListener('click', () => toggleSidebar(false));
	}
	if (dom.addExerciseBtn) {
		dom.addExerciseBtn.addEventListener('click', () => {
			const r = getSelectedRoutine();
			if (r) {
				showAddExerciseModal(r, () => {
					persist();
					renderSelectedRoutine();
				});
			}
		});
	}
	if (dom.addComboBtn) {
		dom.addComboBtn.addEventListener('click', () => {
			const r = getSelectedRoutine();
			if (r) {
				showAddComboModal(r, () => {
					persist();
					renderSelectedRoutine();
				});
			}
		});
	}
	if (dom.addBreakBtn) dom.addBreakBtn.addEventListener('click', handleAddBreak);
	dom.doneEditingBtn.addEventListener('click', () => {
		const routine = getSelectedRoutine();
		if (routine) trimTrailingBreaks(routine);
		editingRoutineSnapshot = null;
		isNewRoutineEditing = false;
		currentMode = 'view';
		persist(true);
		renderRoutineList();
		renderSelectedRoutine();
	});
	if (dom.cancelEditingBtn) {
		dom.cancelEditingBtn.addEventListener('click', handleCancelEditing);
	}
	dom.deleteRoutineBtn.addEventListener('click', handleDeleteRoutine);
	dom.playPauseBtn.addEventListener('click', togglePause);
	dom.skipBtn.addEventListener('click', skipStep);
	dom.prevBtn.addEventListener('click', previousStep);
	dom.resetBtn.addEventListener('click', resetPlayback);
	dom.stopBtn.addEventListener('click', () => stopPlayback());

	// Tab switcher
	if (dom.tabRoutinesBtn) dom.tabRoutinesBtn.addEventListener('click', () => switchTab('routines'));
	if (dom.tabCombosBtn) dom.tabCombosBtn.addEventListener('click', () => switchTab('combos'));
	if (dom.tabExercisesBtn) dom.tabExercisesBtn.addEventListener('click', () => switchTab('exercises'));
	if (dom.tabAnatomyBtn) dom.tabAnatomyBtn.addEventListener('click', () => switchTab('anatomy'));
	if (dom.tabStatsBtn) dom.tabStatsBtn.addEventListener('click', () => switchTab('stats'));

	// Mobile Navigation tab buttons
	if (dom.mTabRoutinesBtn) dom.mTabRoutinesBtn.addEventListener('click', () => switchTab('routines'));
	if (dom.mTabCombosBtn) dom.mTabCombosBtn.addEventListener('click', () => switchTab('combos'));
	if (dom.mTabExercisesBtn) dom.mTabExercisesBtn.addEventListener('click', () => switchTab('exercises'));
	if (dom.mTabAnatomyBtn) dom.mTabAnatomyBtn.addEventListener('click', () => switchTab('anatomy'));
	if (dom.mTabStatsBtn) dom.mTabStatsBtn.addEventListener('click', () => switchTab('stats'));

	// Empty state create button
	if (dom.emptyCreateBtn) dom.emptyCreateBtn.addEventListener('click', handleAddWorkout);

	// Toggle collapse all editor steps
	if (dom.toggleCollapseAllBtn) {
		dom.toggleCollapseAllBtn.addEventListener('click', () => {
			const expanded = toggleAllStepCards(dom.stepList);
			if (dom.collapseToggleText) {
				dom.collapseToggleText.textContent = expanded ? 'Collapse All' : 'Expand All';
			}
		});
	}

	// Player music shelf toggle button
	if (dom.playerMusicToggleBtn) {
		dom.playerMusicToggleBtn.addEventListener('click', () => {
			if (dom.musicControlsBar) {
				const isHidden = dom.musicControlsBar.classList.toggle('hidden');
				dom.playerMusicToggleBtn.classList.toggle('active', !isHidden);
			}
		});
	}

	// Soft Profile Dropdown
	if (dom.userProfileBtn) {
		dom.userProfileBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			toggleProfileDropdown();
		});
	}
	if (dom.dropdownCreateProfileBtn) {
		dom.dropdownCreateProfileBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			handleDropdownCreateProfile();
		});
	}
	if (dom.dropdownNewProfileInput) {
		dom.dropdownNewProfileInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				handleDropdownCreateProfile();
			}
		});
	}

	// Close profile dropdown on outside click or Escape
	document.addEventListener('click', (e) => {
		if (dom.profileDropdownMenu && !dom.profileDropdownMenu.classList.contains('hidden')) {
			if (!dom.profileDropdownContainer?.contains(e.target)) {
				closeProfileDropdown();
			}
		}
	});
	window.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			if (dom.profileDropdownMenu && !dom.profileDropdownMenu.classList.contains('hidden')) {
				closeProfileDropdown();
				return;
			}
			if (currentMode === 'edit' && !document.querySelector('.modal-backdrop:not(.hidden)')) {
				handleCancelEditing();
			}
		}
	});

	// Close dropdown when clicking theme switcher button inside it
	const dropdownThemeBtn = document.getElementById('theme-switcher-btn');
	if (dropdownThemeBtn) {
		dropdownThemeBtn.addEventListener('click', () => {
			closeProfileDropdown();
		});
	}

	// Legacy Soft Profile modal listeners
	if (dom.profileModalCloseBtn) {
		dom.profileModalCloseBtn.addEventListener('click', closeProfileModal);
	}
	if (dom.profileModalBackdrop) {
		dom.profileModalBackdrop.addEventListener('click', (e) => {
			if (e.target === dom.profileModalBackdrop) closeProfileModal();
		});
	}
	if (dom.createProfileBtn) {
		dom.createProfileBtn.addEventListener('click', handleCreateProfile);
	}
	if (dom.newProfileInput) {
		dom.newProfileInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') handleCreateProfile();
		});
	}

	// Listen for user changed events
	document.addEventListener('workout:userchanged', async () => {
		updateProfileButtonLabel();
		currentMode = 'view';
		stopPlayback();
		routines = loadRoutines();
		selectedRoutineId = routines.length > 0 ? routines[0].id : null;
		renderRoutineList();
		switchTab(currentTab);
		await syncWithServerOnStartup();
	});

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
	if (dom.musicPrevBtn) dom.musicPrevBtn.addEventListener('click', prevTrack);
	if (dom.musicNextBtn) dom.musicNextBtn.addEventListener('click', nextTrack);
	if (dom.musicPlayPauseBtn) {
		dom.musicPlayPauseBtn.addEventListener('click', () => {
			const isNowPlaying = toggleMusicPlayback();
			updateMusicPlayPauseBtn(isNowPlaying);
		});
	}

	// Completion modal buttons
	if (dom.completionModalCloseBtn) {
		dom.completionModalCloseBtn.addEventListener('click', closeCompletionModal);
	}
	if (dom.completionModalBackdrop) {
		dom.completionModalBackdrop.addEventListener('click', (e) => {
			if (e.target === dom.completionModalBackdrop) closeCompletionModal();
		});
	}
	if (dom.completionDoneBtn) {
		dom.completionDoneBtn.addEventListener('click', closeCompletionModal);
	}
	if (dom.completionStatsBtn) {
		dom.completionStatsBtn.addEventListener('click', () => {
			closeCompletionModal();
			switchTab('stats');
		});
	}
	if (dom.completionRestartBtn) {
		dom.completionRestartBtn.addEventListener('click', () => {
			const routine = completedWorkoutRoutine || getSelectedRoutine();
			closeCompletionModal();
			if (routine) {
				startRoutine(routine, 0);
			}
		});
	}
}

/**
 * Toggle soft profile & theme dropdown menu.
 */
function toggleProfileDropdown() {
	if (!dom.profileDropdownMenu) return;
	const isHidden = dom.profileDropdownMenu.classList.contains('hidden');
	if (isHidden) {
		openProfileDropdown();
	} else {
		closeProfileDropdown();
	}
}

/**
 * Open soft profile & theme dropdown menu and load user accounts.
 */
async function openProfileDropdown() {
	if (!dom.profileDropdownMenu) return;
	updateProfileButtonLabel();
	dom.profileDropdownMenu.classList.remove('hidden');
	dom.userProfileBtn?.classList.add('active');
	dom.userProfileBtn?.setAttribute('aria-expanded', 'true');

	if (dom.dropdownProfileList) {
		dom.dropdownProfileList.innerHTML = '<div class="spinner-small"></div> Loading profiles...';
		try {
			const users = await fetchUsers();
			renderDropdownProfileList(users);
		} catch (e) {
			dom.dropdownProfileList.innerHTML = '<p class="text-muted text-xs">Could not load profiles.</p>';
		}
	}
}

/**
 * Close soft profile & theme dropdown menu.
 */
function closeProfileDropdown() {
	if (!dom.profileDropdownMenu) return;
	dom.profileDropdownMenu.classList.add('hidden');
	dom.userProfileBtn?.classList.remove('active');
	dom.userProfileBtn?.setAttribute('aria-expanded', 'false');
	if (dom.dropdownNewProfileInput) {
		dom.dropdownNewProfileInput.value = '';
	}
}

/**
 * Render profile item list in topbar dropdown.
 * @param {Array} users
 */
function renderDropdownProfileList(users) {
	if (!dom.dropdownProfileList) return;
	dom.dropdownProfileList.innerHTML = '';
	const currentUserId = getActiveUserId();

	users.forEach(user => {
		const item = document.createElement('div');
		const isActive = user.id === currentUserId;
		item.className = `profile-dropdown-item ${isActive ? 'active' : ''}`;
		const initial = (user.display_name || user.id || 'U').trim().charAt(0).toUpperCase();
		item.innerHTML = `
			<div class="profile-dropdown-item-left">
				<span class="profile-dropdown-item-avatar">${initial}</span>
				<span class="profile-dropdown-item-name">${escapeHtml(user.display_name || user.id)}</span>
			</div>
			${isActive ? '<span class="profile-dropdown-active-check">✓</span>' : ''}
		`;
		item.addEventListener('click', (e) => {
			e.stopPropagation();
			setActiveUser(user.id, user.display_name);
			closeProfileDropdown();
		});
		dom.dropdownProfileList.appendChild(item);
	});
}

/**
 * Handle creating a new soft profile from the dropdown menu.
 */
async function handleDropdownCreateProfile() {
	if (!dom.dropdownNewProfileInput) return;
	const name = dom.dropdownNewProfileInput.value.trim();
	if (!name) return;

	try {
		const created = await createUser(name, name);
		setActiveUser(created.id, created.display_name);
		dom.dropdownNewProfileInput.value = '';
		closeProfileDropdown();
	} catch (e) {
		await showAlert({
			title: 'Create Profile Failed',
			message: e.message
		});
	}
}

/**
 * Open soft profile switcher modal.
 */
async function openProfileModal() {
	if (!dom.profileModalBackdrop || !dom.profileUserList) return;
	dom.profileModalBackdrop.classList.remove('hidden');
	dom.profileUserList.innerHTML = '<div class="spinner-small"></div> Loading profiles...';

	try {
		const users = await fetchUsers();
		renderProfileList(users);
	} catch (e) {
		dom.profileUserList.innerHTML = '<p class="text-muted">Could not load profiles.</p>';
	}
}

/**
 * Close soft profile modal.
 */
function closeProfileModal() {
	if (dom.profileModalBackdrop) {
		dom.profileModalBackdrop.classList.add('hidden');
	}
	if (dom.newProfileInput) {
		dom.newProfileInput.value = '';
	}
}

/**
 * Render profile item list in modal.
 * @param {Array} users
 */
function renderProfileList(users) {
	if (!dom.profileUserList) return;
	dom.profileUserList.innerHTML = '';
	const currentUserId = getActiveUserId();

	users.forEach(user => {
		const div = document.createElement('div');
		div.className = `profile-item ${user.id === currentUserId ? 'active' : ''}`;
		div.innerHTML = `
			<div class="profile-item-left">
				<span class="profile-avatar">👤</span>
				<div class="profile-name-text">${escapeHtml(user.display_name || user.id)}</div>
			</div>
			${user.id === currentUserId ? '<span class="active-badge">Active</span>' : ''}
		`;
		div.addEventListener('click', () => {
			setActiveUser(user.id, user.display_name);
			closeProfileModal();
		});
		dom.profileUserList.appendChild(div);
	});
}

/**
 * Handle creating a new soft profile.
 */
async function handleCreateProfile() {
	if (!dom.newProfileInput) return;
	const name = dom.newProfileInput.value.trim();
	if (!name) return;

	try {
		const created = await createUser(name, name);
		setActiveUser(created.id, created.display_name);
		closeProfileModal();
	} catch (e) {
		await showAlert({
			title: 'Create Profile Failed',
			message: e.message
		});
	}
}

/**
 * Get the currently selected routine.
 */
function getSelectedRoutine() {
	if (isViewingShared && sharedRoutine) {
		return sharedRoutine;
	}
	return routines.find(r => r.id === selectedRoutineId) || null;
}

/**
 * Save routines to local storage and sync to server.
 * @param {boolean} [immediateServerSync=false]
 */
function persist(immediateServerSync = false) {
	if (immediateServerSync) {
		if (localStorageTimeout) {
			clearTimeout(localStorageTimeout);
			localStorageTimeout = null;
		}
		saveRoutines(routines);
		if (syncTimeout) {
			clearTimeout(syncTimeout);
		}
		syncToServer();
	} else {
		if (localStorageTimeout) {
			clearTimeout(localStorageTimeout);
		}
		localStorageTimeout = setTimeout(() => {
			saveRoutines(routines);
			localStorageTimeout = null;
		}, 60);

		setSyncStatus('syncing', 'Saving...');
		if (syncTimeout) {
			clearTimeout(syncTimeout);
		}
		syncTimeout = setTimeout(syncToServer, 400);
	}
}

window.addEventListener('beforeunload', () => {
	if (localStorageTimeout) {
		clearTimeout(localStorageTimeout);
		saveRoutines(routines);
	}
});

/**
 * Render the sidebar routine list.
 */
function renderRoutineList() {
	dom.routineList.innerHTML = '';

	if (isViewingShared && sharedRoutine) {
		const sharedLi = document.createElement('li');
		sharedLi.className = 'routine-item active shared-item';

		const info = document.createElement('div');
		info.className = 'routine-info';

		const title = document.createElement('span');
		title.className = 'routine-title-text';
		title.textContent = `✨ ${sharedRoutine.title}`;

		const meta = document.createElement('span');
		meta.className = 'routine-meta';
		const sharedSteps = sharedRoutine.steps || [];
		let clipCount = 0;
		let timerCount = 0;
		let totalTime = 0;
		sharedSteps.forEach(s => {
			const cls = classifyStep(s);
			if (cls.video) clipCount++; else timerCount++;
			if (cls.targetDuration) totalTime += cls.targetDuration;
		});
		meta.textContent = `Shared · ${sharedRoutine.steps.length} steps · ~${formatTime(totalTime)}`;

		info.append(title, meta);
		sharedLi.appendChild(info);
		dom.routineList.appendChild(sharedLi);
	}

	routines.forEach((routine) => {
		const li = document.createElement('li');
		li.className = 'routine-item';
		if (!isViewingShared && routine.id === selectedRoutineId) {
			li.classList.add('active');
		}

		const info = document.createElement('div');
		info.className = 'routine-info';

		const title = document.createElement('span');
		title.className = 'routine-title-text';
		title.textContent = routine.title;

		const meta = document.createElement('span');
		meta.className = 'routine-meta';
		const routineSteps = routine.steps || [];
		let timeCount = 0;
		let repsCount = 0;
		let breakCount = 0;
		routineSteps.forEach(s => {
			const cls = classifyStep(s);
			if (cls.mode === 'break') breakCount++;
			else if (cls.mode === 'reps') repsCount++;
			else timeCount++;
		});
		const parts = [`${routineSteps.length} steps`];
		if (timeCount) parts.push(`${timeCount} timed`);
		if (repsCount) parts.push(`${repsCount} reps`);
		if (breakCount) parts.push(`${breakCount} rest`);
		meta.textContent = routineSteps.length === 0 ? '' : parts.join(' · ');

		info.append(title, meta);
		li.appendChild(info);

		li.addEventListener('click', () => {
			if (currentMode === 'edit' && editingRoutineSnapshot) {
				handleCancelEditing();
			}
			if (isViewingShared) {
				isViewingShared = false;
				sharedRoutine = null;
			}
			if (window.location.hash || window.location.search) {
				history.replaceState(null, '', window.location.pathname);
			}
			if (currentTab !== 'routines') {
				switchTab('routines');
			}
			selectedRoutineId = routine.id;
			currentMode = 'view';
			renderRoutineList();
			renderSelectedRoutine();
		});

		dom.routineList.appendChild(li);
	});
}

/**
 * Navigate to and open an exercise's Split HUD modal from anywhere (workout view, combos, anatomy).
 * @param {Object|string} exerciseOrId
 */
function goToExercise(exerciseOrId) {
	if (!exerciseOrId) return;
	const fullEx = typeof exerciseOrId === 'string'
		? getExerciseById(exerciseOrId)
		: ((exerciseOrId.id ? getExerciseById(exerciseOrId.id) : null) || exerciseOrId);
	if (!fullEx) return;

	showExerciseVariationsModal(fullEx, {
		onPlayAsset: (asset) => {
			playPreview(fullEx, asset);
		},
		onAddToRoutine: () => {
			let routine = getSelectedRoutine();
			if (!routine) {
				routine = createRoutine('New Workout');
				routines.push(routine);
				selectedRoutineId = routine.id;
			}
			const newStep = createStepFromExercise(fullEx);
			appendStepWithBreak(routine, newStep);
			persist();
			currentMode = 'edit';
			switchTab('routines');
			showToast(`Added "${fullEx.name}" to workout!`);
		},
		onOpenInLibrary: (ex) => {
			switchTab('exercises');
			setTimeout(() => {
				highlightExerciseCard(ex.id || ex.name);
			}, 60);
		},
		onUpdated: () => {
			renderSelectedRoutine();
		}
	});
}

/**
 * Render the active mode (View Mode or Edit Mode) for the selected routine.
 */
function renderSelectedRoutine() {
	if (currentTab !== 'routines') return;

	const routine = getSelectedRoutine();

	if (!routine) {
		dom.emptyView.classList.remove('hidden');
		dom.routineView.classList.add('hidden');
		dom.editorView.classList.add('hidden');
		dom.playerView.classList.add('hidden');
		return;
	}

	dom.emptyView.classList.add('hidden');

	if (currentMode === 'view') {
		dom.routineView.classList.remove('hidden');
		dom.editorView.classList.add('hidden');
		dom.playerView.classList.add('hidden');

		renderRoutineOverview(routine, dom.routineOverviewContainer, {
			isShared: isViewingShared,
			onEdit: () => {
				if (isViewingShared) {
					handleSaveSharedToLibrary(false);
				}
				currentMode = 'edit';
				renderSelectedRoutine();
			},
			onPlay: (startIndex = 0, isPreview = false) => {
				unlockAudio();
				startRoutine(routine, startIndex, isPreview);
			},
			onPlayStep: (startIndex = 0) => {
				unlockAudio();
				startRoutine(routine, startIndex, true);
			},
			onShare: async () => {
				const shareUrl = buildRoutineUrl(routine);
				await copyToClipboard(shareUrl);
				showToast('📋 Live routine link copied to clipboard!');
				return true;
			},
			onSaveToLibrary: () => {
				handleSaveSharedToLibrary(true);
			},
			onGoToExercise: (exercise) => {
				goToExercise(exercise);
			},
			onOpenAnatomy: (muscleId) => {
				switchTab('anatomy');
			}
		});
	} else if (currentMode === 'edit') {
		dom.routineView.classList.add('hidden');
		dom.editorView.classList.remove('hidden');
		dom.playerView.classList.add('hidden');

		if (!editingRoutineSnapshot && routine) {
			editingRoutineSnapshot = JSON.parse(JSON.stringify(routine));
		}

		dom.routineTitle.value = routine.title;

		const onStepUpdate = () => {
			persist();
			renderEditor(routine, dom.stepList, {
				onUpdate: onStepUpdate,
				onTestStep: (stepIndex) => {
					unlockAudio();
					startRoutine(routine, stepIndex, true);
				}
			});
			renderRoutineList();
		};
		renderEditor(routine, dom.stepList, {
			onUpdate: onStepUpdate,
			onTestStep: (stepIndex) => {
				unlockAudio();
				startRoutine(routine, stepIndex, true);
			}
		});
	}
}

// ── Event Handlers ──────────────────────────────────────────────────────────

function handleCancelEditing() {
	if (isNewRoutineEditing && editingRoutineSnapshot) {
		// If cancelling a newly created routine, remove it
		const cur = getSelectedRoutine();
		if (cur) {
			routines = routines.filter(r => r.id !== cur.id);
			selectedRoutineId = routines.length > 0 ? routines[0].id : null;
		}
	} else if (editingRoutineSnapshot) {
		// Revert routine back to snapshot before edits
		const idx = routines.findIndex(r => r.id === editingRoutineSnapshot.id);
		if (idx !== -1) {
			routines[idx] = JSON.parse(JSON.stringify(editingRoutineSnapshot));
		}
	}
	editingRoutineSnapshot = null;
	isNewRoutineEditing = false;
	currentMode = 'view';
	persist(true);
	renderRoutineList();
	renderSelectedRoutine();
	showToast('Changes discarded');
}

function handleSaveSharedToLibrary(notify = true) {
	if (!sharedRoutine) return;
	const clonedId = `routine_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const routineToSave = {
		...sharedRoutine,
		id: clonedId,
		title: sharedRoutine.title
	};
	delete routineToSave.creatorUser;
	routines.push(routineToSave);
	selectedRoutineId = routineToSave.id;
	isViewingShared = false;
	sharedRoutine = null;
	history.replaceState(null, '', window.location.pathname);
	persist(true);
	renderRoutineList();
	renderSelectedRoutine();
	if (notify) {
		showAlert({
			title: 'Saved to Library!',
			message: `"${routineToSave.title}" has been saved to your workouts as a private editable copy.`
		});
	}
}

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
	if (isViewingShared) {
		isViewingShared = false;
		sharedRoutine = null;
		history.replaceState(null, '', window.location.pathname);
	}
	if (currentTab !== 'routines') {
		switchTab('routines');
	}
	isNewRoutineEditing = true;
	editingRoutineSnapshot = JSON.parse(JSON.stringify(routine));
	currentMode = 'edit';
	persist(true);
	renderRoutineList();
	renderSelectedRoutine();
}

async function handleDeleteRoutine() {
	const routine = getSelectedRoutine();
	if (!routine) return;
	if (isViewingShared) {
		isViewingShared = false;
		sharedRoutine = null;
		history.replaceState(null, '', window.location.pathname);
		selectedRoutineId = routines.length > 0 ? routines[0].id : null;
		renderRoutineList();
		renderSelectedRoutine();
		return;
	}

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

function handleAddTimer() {
	const routine = getSelectedRoutine();
	if (!routine) return;
	const newStep = createTimerStep();
	routine.steps.push(newStep);
	expandStep(newStep.id);
	persist(true);
	renderSelectedRoutine();
}

function handleAddBreak() {
	const routine = getSelectedRoutine();
	if (!routine) return;
	const newStep = createBreakStep();
	routine.steps.push(newStep);
	expandStep(newStep.id);
	persist(true);
	renderSelectedRoutine();
}

// ── Workout Completion Modal ──────────────────────────────────────────────

let completedWorkoutRoutine = null;

function closeCompletionModal() {
	if (dom.completionModalBackdrop) {
		dom.completionModalBackdrop.classList.add('hidden');
	}
	if (currentTab === 'routines') {
		renderSelectedRoutine();
	}
}

async function showCompletionModal(session, completedRoutine) {
	if (!completedRoutine || completedRoutine.id === 'preview-routine' || completedRoutine.id === 'preview-combo-routine') {
		return;
	}
	completedWorkoutRoutine = completedRoutine;
	if (!dom.completionModalBackdrop) return;

	// Populate title
	if (dom.completionRoutineTitle) {
		dom.completionRoutineTitle.textContent = completedRoutine?.title || 'Workout';
	}

	// Calculate total active duration
	let totalSecs = session?.duration_seconds || 0;
	if (totalSecs <= 0 && completedRoutine?.steps) {
		totalSecs = completedRoutine.steps.reduce((sum, s) => {
			const cls = classifyStep(s);
			return sum + (cls.targetDuration || 0);
		}, 0);
	}
	if (dom.completionStatDuration) {
		dom.completionStatDuration.textContent = formatFriendlyDuration(totalSecs);
	}

	// Steps completed count
	const totalSteps = completedRoutine?.steps?.length || 0;
	if (dom.completionStatSteps) {
		dom.completionStatSteps.textContent = `${totalSteps} / ${totalSteps}`;
	}
	if (dom.completionStepsCount) {
		dom.completionStepsCount.textContent = `${totalSteps} steps`;
	}

	// Fetch streak info asynchronously
	if (dom.completionStatStreak) {
		dom.completionStatStreak.textContent = '🔥 Updating...';
		try {
			const stats = await fetchStats();
			if (stats && typeof stats.current_streak === 'number') {
				dom.completionStatStreak.textContent = stats.current_streak > 0
					? `${stats.current_streak} ${stats.current_streak === 1 ? 'day' : 'days'}`
					: '1 day';
			} else {
				dom.completionStatStreak.textContent = '🔥 Active';
			}
		} catch (err) {
			dom.completionStatStreak.textContent = '🔥 Active';
		}
	}

	// Populate steps list
	if (dom.completionStepsList && completedRoutine?.steps) {
		dom.completionStepsList.innerHTML = '';
		completedRoutine.steps.forEach((step, idx) => {
			const item = document.createElement('div');
			item.className = 'completion-step-item';

			let iconSvg = '';
			let typeLabel = '';
			let durStr = '';

			const cls = classifyStep(step);
			if (cls.mode === 'break') {
				iconSvg = getBreakIcon(16);
				typeLabel = 'Rest Break';
				durStr = formatFriendlyDuration(cls.targetDuration || 0);
			} else if (cls.mode === 'reps') {
				iconSvg = getTimerIcon(16);
				typeLabel = `${cls.targetReps} Reps`;
				durStr = `${cls.targetReps} reps`;
			} else if (cls.video) {
				iconSvg = getClipIcon(16);
				typeLabel = `Follow-Along · ${formatTime(cls.video.startSeconds || 0)} → ${formatTime(cls.video.endSeconds || 0)}`;
				durStr = formatFriendlyDuration(cls.targetDuration);
			} else {
				iconSvg = getTimerIcon(16);
				typeLabel = 'Exercise Timer';
				durStr = formatFriendlyDuration(cls.targetDuration || 0);
			}

			item.innerHTML = `
				<span class="completion-step-num">${idx + 1}</span>
				<span class="completion-step-icon">${iconSvg}</span>
				<div class="completion-step-info">
					<span class="completion-step-name">${escapeHtml(getStepDisplayName(step))}</span>
					<span class="completion-step-meta">${escapeHtml(typeLabel)}</span>
				</div>
				<span class="completion-step-dur">${escapeHtml(durStr)}</span>
			`;
			dom.completionStepsList.appendChild(item);
		});
	}

	dom.completionModalBackdrop.classList.remove('hidden');
}

function updateMusicPlayPauseBtn(isPlaying) {
	if (!dom.musicPlayPauseBtn) return;
	dom.musicPlayPauseBtn.innerHTML = isPlaying ? getMusicPauseIcon(13) : getMusicPlayIcon(13);
	dom.musicPlayPauseBtn.title = isPlaying ? 'Pause music (M)' : 'Play music (M)';
	const musicToggleBtn = document.getElementById('player-music-toggle-btn');
	if (musicToggleBtn) {
		musicToggleBtn.classList.toggle('is-paused', !isPlaying);
	}
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

async function initMusicModule() {
	await initMusic(dom.ytMusicPlayer, {
		onTrackChange: (track) => {
			const title = track.liveTitle || track.label || (track.source === 'youtube' ? (track.videoId || track.playlistId) : track.fileName) || 'Music';
			if (dom.musicTrackName) {
				dom.musicTrackName.textContent = title;
			}
			const quickTitle = document.getElementById('music-quick-title');
			if (quickTitle) {
				quickTitle.textContent = title;
			}
		},
		onPlayStateChange: (state) => {
			updateMusicPlayPauseBtn(state.isPlaying);
		}
	});
}

document.addEventListener('DOMContentLoaded', init);
