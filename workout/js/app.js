/**
 * App controller - coordinates UI, soft accounts, routines, stats, sharing, and player modules.
 */

import {
	loadRoutines, saveRoutines, fetchServerRoutines,
	saveServerRoutines, exportRoutines, exportSingleRoutine,
	importRoutines, encodeRoutineToShareUrl, getSharedRoutineFromUrl,
	fetchStats
} from './storage.js';
import {
	renderEditor, createClipStep, createTimerStep, createBreakStep, createRoutine,
	showAddExerciseModal, showAddComboModal, toggleAllStepCards, expandStep
} from './editor.js';
import { renderRoutineOverview } from './view.js';
import {
	initPlayer, startRoutine, stopPlayback,
	togglePause, skipStep, previousStep, resetPlayback,
	toggleFullscreen
} from './player.js';
import { initAudio } from './audio.js';
import {
	initMusic, setVolume as setMusicVolume, nextTrack, prevTrack,
	muteMusic, unmuteMusic, isMuted as isMusicMuted, unlockAudio
} from './music.js';
import { formatTime, formatFriendlyDuration, copyToClipboard, showToast } from './utils.js';
import { getClipIcon, getTimerIcon, getBreakIcon } from './icons.js';
import { showPrompt, showConfirm, showAlert } from './modal.js';
import {
	getActiveUserId, getActiveDisplayName, setActiveUser,
	fetchUsers, createUser
} from './user.js';
import { renderStatsDashboard } from './stats.js';
import { loadExercises, renderExercisesCatalog } from './exercises.js';
import { loadCombos, renderCombosCatalog } from './combos.js';
import { renderAnatomyExplorer } from './body_map.js';

let routines = [];
let selectedRoutineId = null;
let currentMode = 'view'; // 'view' | 'edit'
let currentTab = 'routines'; // 'routines' | 'combos' | 'exercises' | 'stats'
let syncTimeout = null;
let sharedRoutine = null;
let isViewingShared = false;

// DOM references
const dom = {};

/**
 * Initialize the application.
 */
async function init() {
	cacheDom();
	updateProfileButtonLabel();

	// Fast initial render from localStorage cache
	routines = loadRoutines();
	if (routines.length > 0) {
		selectedRoutineId = routines[0].id;
	}

	// Warm up exercise and combos taxonomy caches
	loadExercises().catch(() => {});
	loadCombos().catch(() => {});

	// Check if URL contains a shared routine
	const incomingShared = await getSharedRoutineFromUrl();
	if (incomingShared) {
		sharedRoutine = incomingShared;
		isViewingShared = true;
	}

	renderRoutineList();
	renderSelectedRoutine();
	initSidebarState();
	bindEvents();

	// Fetch server state as source of truth
	await syncWithServerOnStartup();

	// If a shared routine was loaded, keep it active after server sync
	if (sharedRoutine) {
		isViewingShared = true;
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
			timerMediaContainer: dom.timerMediaContainer,
			timerMediaImg: dom.timerMediaImg,
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
			playerBackBtn: dom.playerBackBtn,
			playerRoutineTitle: dom.playerRoutineTitle,
			fullscreenTopBtn: dom.fullscreenTopBtn,
			fullscreenDockBtn: dom.fullscreenDockBtn,
			upNextCard: dom.upNextCard,
			upNextLabel: dom.upNextLabel,
			upNextMeta: dom.upNextMeta,
			upNextMediaThumb: dom.upNextMediaThumb,
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
	dom.stepList = document.getElementById('step-list');
	dom.addExerciseBtn = document.getElementById('add-exercise-btn');
	dom.addComboBtn = document.getElementById('add-combo-btn');
	dom.addBreakBtn = document.getElementById('add-break-btn');
	dom.doneEditingBtn = document.getElementById('done-editing-btn');
	dom.deleteRoutineBtn = document.getElementById('delete-routine-btn');

	// Sidebar & Layout
	dom.appContainer = document.querySelector('.app-container');
	dom.sidebar = document.getElementById('app-sidebar');
	dom.sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
	dom.sidebarExpandBtn = document.getElementById('sidebar-expand-btn');

	// Soft Accounts & Navigation
	dom.userProfileBtn = document.getElementById('user-profile-btn');
	dom.userProfileName = document.getElementById('user-profile-name');
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
	dom.timerMediaContainer = document.getElementById('timer-media-container');
	dom.timerMediaImg = document.getElementById('timer-media-img');
	dom.timerDisplay = document.getElementById('timer-display');
	dom.timerLabel = document.getElementById('timer-label');
	dom.timerRing = document.getElementById('timer-ring');
	dom.upNextCard = document.getElementById('up-next-card');
	dom.upNextLabel = document.getElementById('up-next-label');
	dom.upNextMeta = document.getElementById('up-next-meta');
	dom.upNextMediaThumb = document.getElementById('up-next-media-thumb');

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
	dom.musicVolume = document.getElementById('music-volume');
	dom.musicMuteBtn = document.getElementById('music-mute-btn');
	dom.musicPrevBtn = document.getElementById('music-prev-btn');
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
	if (dom.userProfileName) {
		dom.userProfileName.textContent = getActiveDisplayName();
	}
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
					const isVideo = asset && (asset.type === 'video' || Boolean(asset.videoId));
					const step = isVideo ? {
						id: 'preview-step',
						type: 'clip',
						videoId: asset.videoId || parseYouTubeId(asset.url),
						startSeconds: asset.startSeconds || 0,
						endSeconds: asset.endSeconds || ((asset.startSeconds || 0) + 60),
						label: `${exercise.name}: ${asset.title || 'Instruction'}`
					} : {
						id: 'preview-step',
						type: 'timer',
						stepMode: exercise.default_mode || 'reps',
						targetReps: exercise.default_quantity || 20,
						durationSeconds: exercise.default_quantity || 30,
						label: exercise.name,
						gifUrl: asset?.url || exercise.media_url || '',
						exercises: [exercise]
					};
					const previewRoutine = {
						id: 'preview-routine',
						title: `Preview: ${exercise.name}`,
						steps: [step]
					};
					unlockAudio();
					startRoutine(previewRoutine, 0, true);
				},
				onAddToRoutine: (exercise) => {
					let routine = getSelectedRoutine();
					if (!routine) {
						routine = createRoutine('New Workout');
						routines.push(routine);
						selectedRoutineId = routine.id;
					}
					const isReps = (exercise.default_mode || 'reps') === 'reps';
					const newStep = createTimerStep(
						exercise.name,
						isReps ? 30 : (exercise.default_quantity || 30),
						exercise.media_url || ''
					);
					newStep.stepMode = exercise.default_mode || 'reps';
					if (isReps) newStep.targetReps = exercise.default_quantity || 20;
					newStep.exercises = [{ id: exercise.id, name: exercise.name, category: exercise.category, discipline: exercise.discipline }];
					routine.steps.push(newStep);
					expandStep(newStep.id);
					persist();
					currentMode = 'edit';
					switchTab('routines');
					showToast(`Added "${exercise.name}" to workout!`);
				}
			});
		}
	} else if (tab === 'stats') {
		if (dom.statsView) {
			dom.statsView.classList.remove('hidden');
			renderStatsDashboard(dom.statsView);
		}
	} else if (tab === 'combos') {
		if (dom.routineView) dom.routineView.classList.add('hidden');
		if (dom.editorView) dom.editorView.classList.add('hidden');
		if (dom.emptyView) dom.emptyView.classList.add('hidden');
		if (dom.statsView) dom.statsView.classList.add('hidden');
		if (dom.exercisesView) dom.exercisesView.classList.add('hidden');
		if (dom.combosView) {
			dom.combosView.classList.remove('hidden');
			renderCombosCatalog(dom.combosView, {
				onPlayCombo: (combo) => {
					const exList = (combo.exercise_ids || []).map(id => getExerciseById(id)).filter(Boolean);
					const asset = (combo.media_assets || [])[0];
					const isVideo = asset && (asset.type === 'video' || Boolean(asset.videoId));
					const step = isVideo ? {
						id: 'preview-combo-step',
						type: 'clip',
						videoId: asset.videoId || parseYouTubeId(asset.url || combo.media_url),
						startSeconds: asset.startSeconds || 0,
						endSeconds: asset.endSeconds || ((asset.startSeconds || 0) + (combo.default_quantity || 190)),
						label: combo.name,
						flow_type: combo.flow_type || 'alternating',
						exercises: exList
					} : {
						id: 'preview-combo-step',
						type: 'timer',
						stepMode: combo.default_mode || 'time',
						targetReps: combo.default_quantity || 20,
						durationSeconds: combo.default_quantity || 190,
						label: combo.name,
						flow_type: combo.flow_type || 'alternating',
						gifUrl: asset?.url || combo.media_url || '',
						exercises: exList
					};
					const previewRoutine = {
						id: 'preview-combo-routine',
						title: `Preview: ${combo.name}`,
						steps: [step]
					};
					unlockAudio();
					startRoutine(previewRoutine, 0, true);
				},
				onBreakDownCombo: (combo) => {
					const exList = (combo.exercise_ids || []).map(id => getExerciseById(id)).filter(Boolean);
					if (exList.length === 0) {
						showToast('No constituent exercises to break down.');
						return;
					}
					const totalSec = combo.default_quantity || 190;
					const perSec = Math.max(20, Math.floor(totalSec / exList.length));
					const steps = exList.map(e => {
						const isReps = (e.default_mode || 'time') === 'reps';
						const s = createTimerStep(
							e.name,
							isReps ? 30 : (e.default_quantity || perSec),
							e.media_url || ''
						);
						s.stepMode = e.default_mode || 'time';
						if (isReps) s.targetReps = e.default_quantity || 20;
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
				onAddToRoutine: (combo) => {
					let routine = getSelectedRoutine();
					if (!routine) {
						routine = createRoutine('New Workout');
						routines.push(routine);
						selectedRoutineId = routine.id;
					}
					const exList = (combo.exercise_ids || []).map(id => getExerciseById(id)).filter(Boolean);
					const asset = (combo.media_assets || [])[0];
					const isVideo = asset && (asset.type === 'video' || Boolean(asset.videoId));
					let newStep;
					if (isVideo) {
						newStep = createClipStep(
							combo.name,
							asset.videoId || parseYouTubeId(asset.url || combo.media_url),
							asset.startSeconds || 0,
							asset.endSeconds || ((asset.startSeconds || 0) + (combo.default_quantity || 190))
						);
					} else {
						const isReps = (combo.default_mode || 'time') === 'reps';
						newStep = createTimerStep(
							combo.name,
							isReps ? 30 : (combo.default_quantity || 190),
							combo.media_url || ''
						);
						newStep.stepMode = combo.default_mode || 'time';
						if (isReps) newStep.targetReps = combo.default_quantity || 20;
					}
					newStep.flow_type = combo.flow_type || 'alternating';
					newStep.exercises = exList;
					routine.steps.push(newStep);
					expandStep(newStep.id);
					persist();
					currentMode = 'edit';
					switchTab('routines');
					showToast(`Added "${combo.name}" to workout!`);
				}
			});
		}
	} else if (tab === 'exercises') {
		if (dom.routineView) dom.routineView.classList.add('hidden');
		if (dom.editorView) dom.editorView.classList.add('hidden');
		if (dom.emptyView) dom.emptyView.classList.add('hidden');
		if (dom.combosView) dom.combosView.classList.add('hidden');
		if (dom.statsView) dom.statsView.classList.add('hidden');
		if (dom.exercisesView) {
			dom.exercisesView.classList.remove('hidden');
			renderExercisesCatalog(dom.exercisesView, {
				onOpenAnatomy: () => switchTab('anatomy'),
				onPlayExercise: (exercise, asset) => {
					const isVideo = asset && (asset.type === 'video' || Boolean(asset.videoId));
					const step = isVideo ? {
						id: 'preview-step',
						type: 'clip',
						videoId: asset.videoId || parseYouTubeId(asset.url),
						startSeconds: asset.startSeconds || 0,
						endSeconds: asset.endSeconds || ((asset.startSeconds || 0) + 60),
						label: `${exercise.name}: ${asset.title || 'Instruction'}`
					} : {
						id: 'preview-step',
						type: 'timer',
						stepMode: exercise.default_mode || 'reps',
						targetReps: exercise.default_quantity || 20,
						durationSeconds: exercise.default_quantity || 30,
						label: exercise.name,
						gifUrl: asset?.url || exercise.media_url || '',
						exercises: [exercise]
					};
					const previewRoutine = {
						id: 'preview-routine',
						title: `Preview: ${exercise.name}`,
						steps: [step]
					};
					unlockAudio();
					startRoutine(previewRoutine, 0, true);
				},
				onAddToRoutine: (exercise) => {
					let routine = getSelectedRoutine();
					if (!routine) {
						routine = createRoutine('New Workout');
						routines.push(routine);
						selectedRoutineId = routine.id;
					}
					const isReps = (exercise.default_mode || 'reps') === 'reps';
					const newStep = createTimerStep(
						exercise.name,
						isReps ? 30 : (exercise.default_quantity || 30),
						exercise.media_url || ''
					);
					newStep.stepMode = exercise.default_mode || 'reps';
					if (isReps) newStep.targetReps = exercise.default_quantity || 20;
					newStep.exercises = [{ id: exercise.id, name: exercise.name, category: exercise.category, discipline: exercise.discipline }];
					routine.steps.push(newStep);
					expandStep(newStep.id);
					persist();
					currentMode = 'edit';
					switchTab('routines');
					showToast(`Added "${exercise.name}" to workout!`);
				}
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
	dom.exportBtn.addEventListener('click', handleExport);
	dom.importBtn.addEventListener('click', handleImport);
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
		currentMode = 'view';
		renderSelectedRoutine();
	});
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

	// Soft Profile modal
	if (dom.userProfileBtn) {
		dom.userProfileBtn.addEventListener('click', openProfileModal);
	}
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
		const clipCount = sharedRoutine.steps.filter(s => s.type === 'clip').length;
		const timerCount = sharedRoutine.steps.filter(s => s.type === 'timer').length;
		const totalTime = sharedRoutine.steps.reduce((sum, s) => {
			if (s.type === 'timer') return sum + (s.durationSeconds || 0);
			if (s.type === 'clip') return sum + Math.max(0, (s.endSeconds || 0) - (s.startSeconds || 0));
			return sum;
		}, 0);
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
		const clipCount = routine.steps.filter(s => s.type === 'clip').length;
		const timerCount = routine.steps.filter(s => s.type === 'timer').length;
		const totalTime = routine.steps.reduce((sum, s) => {
			if (s.type === 'timer') return sum + (s.durationSeconds || 0);
			if (s.type === 'clip') return sum + Math.max(0, (s.endSeconds || 0) - (s.startSeconds || 0));
			return sum;
		}, 0);
		meta.textContent = `${routine.steps.length} steps · ${clipCount} clips · ${timerCount} timers · ~${formatTime(totalTime)}`;

		info.append(title, meta);
		li.appendChild(info);

		li.addEventListener('click', () => {
			if (isViewingShared) {
				isViewingShared = false;
				sharedRoutine = null;
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
				const shareUrl = await encodeRoutineToShareUrl(routine);
				await copyToClipboard(shareUrl);
				showToast('📋 Link copied to clipboard!');
				return true;
			},
			onSaveToLibrary: () => {
				handleSaveSharedToLibrary(true);
			}
		});
	} else if (currentMode === 'edit') {
		dom.routineView.classList.add('hidden');
		dom.editorView.classList.remove('hidden');
		dom.playerView.classList.add('hidden');

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

function handleSaveSharedToLibrary(notify = true) {
	if (!sharedRoutine) return;
	const routineToSave = { ...sharedRoutine };
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
			title: 'Saved!',
			message: `"${routineToSave.title}" has been saved to your workouts.`
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

function handleAddClip() {
	const routine = getSelectedRoutine();
	if (!routine) return;
	const newStep = createClipStep();
	routine.steps.push(newStep);
	expandStep(newStep.id);
	persist(true);
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

function handleExport() {
	exportRoutines(routines);
}

async function handleImport() {
	try {
		const { routines: imported, isSingle } = await importRoutines();
		if (isSingle && imported.length > 0) {
			const newRoutine = imported[0];
			routines.push(newRoutine);
			selectedRoutineId = newRoutine.id;
			if (isViewingShared) {
				isViewingShared = false;
				sharedRoutine = null;
				history.replaceState(null, '', window.location.pathname);
			}
			currentMode = 'view';
			persist(true);
			renderRoutineList();
			renderSelectedRoutine();
			await showAlert({
				title: 'Workout Imported',
				message: `"${newRoutine.title}" was successfully added to your workouts.`
			});
		} else {
			routines = imported;
			selectedRoutineId = routines.length > 0 ? routines[0].id : null;
			if (isViewingShared) {
				isViewingShared = false;
				sharedRoutine = null;
				history.replaceState(null, '', window.location.pathname);
			}
			currentMode = 'view';
			persist(true);
			renderRoutineList();
			renderSelectedRoutine();
		}
	} catch (err) {
		await showAlert({
			title: 'Import Failed',
			message: 'Could not import routines: ' + err.message
		});
	}
}

function escapeHtml(str) {
	const div = document.createElement('div');
	div.textContent = str;
	return div.innerHTML;
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
			if (s.type === 'timer') return sum + (s.durationSeconds || 0);
			if (s.type === 'clip') return sum + Math.max(0, (s.endSeconds || 0) - (s.startSeconds || 0));
			return sum;
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

			if (step.type === 'clip') {
				iconSvg = getClipIcon(16);
				const clipDur = Math.max(0, (step.endSeconds || 0) - (step.startSeconds || 0));
				typeLabel = `Video Clip · ${formatTime(step.startSeconds || 0)} → ${formatTime(step.endSeconds || 0)}`;
				durStr = formatFriendlyDuration(clipDur);
			} else {
				const isBreak = step.label?.toLowerCase().includes('rest') || step.label?.toLowerCase().includes('break');
				iconSvg = isBreak ? getBreakIcon(16) : getTimerIcon(16);
				typeLabel = isBreak ? 'Rest Break' : 'Exercise Timer';
				durStr = formatFriendlyDuration(step.durationSeconds || 0);
			}

			item.innerHTML = `
				<span class="completion-step-num">${idx + 1}</span>
				<span class="completion-step-icon">${iconSvg}</span>
				<div class="completion-step-info">
					<span class="completion-step-name">${escapeHtml(step.label || 'Step')}</span>
					<span class="completion-step-meta">${escapeHtml(typeLabel)}</span>
				</div>
				<span class="completion-step-dur">${escapeHtml(durStr)}</span>
			`;
			dom.completionStepsList.appendChild(item);
		});
	}

	dom.completionModalBackdrop.classList.remove('hidden');
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

async function initMusicModule() {
	await initMusic(dom.ytMusicPlayer, {
		onTrackChange: (track) => {
			if (dom.musicTrackName) {
				dom.musicTrackName.textContent = track.label || 'Music';
			}
		},
	});
}

document.addEventListener('DOMContentLoaded', init);
