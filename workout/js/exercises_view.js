/**
 * Exercises View Module - UI components, movement catalog grid, variations HUD, and creation/edit modals.
 */

import {
	MUSCLE_DEFINITIONS,
	CATEGORIES,
	DISCIPLINES,
	getCategoryBadgeHtml,
	getDisciplineBadgeHtml,
	getMuscleBadgeHtml,
	getMediaKindBadgeHtml,
	getCategoryOptionsHtml,
	getDisciplineOptionsHtml,
} from './taxonomy.js';
import {
	getExercises,
	getExerciseById,
	filterExercises,
	createCustomExercise,
	deleteCustomExercise,
	addMediaAssetToExercise,
	removeMediaAssetFromExercise,
	getExerciseMediaAssets,
	getExerciseFollowAlongMedia,
	inferMusclesForExercise,
	renderExerciseCardElement,
	updateExerciseDescription,
} from './exercises.js';
import { showConfirm, showAlert } from './modal.js';
import { uploadImageFile } from './storage.js';
import { escapeHtml, formatTime, parseTime, parseYouTubeId, showToast } from './utils.js';
import { getFrontBodySvg, getBackBodySvg } from './body_map.js';

/**
 * Render the full Exercise Library / Catalog view.
 * @param {HTMLElement} container
 * @param {Object} [options]
 */
export function renderExercisesCatalog(container, options = {}) {
	const onPlayExercise = options.onPlayExercise || (() => {});
	const onAddToRoutine = options.onAddToRoutine || (() => {});
	const onOpenAnatomy = options.onOpenAnatomy || (() => {});

	container.innerHTML = `
		<div class="exercises-catalog-container">
			<div class="exercises-catalog-header">
				<div>
					<h2 class="exercises-title">🥋 Exercise & Movement Library</h2>
					<p class="exercises-subtitle">Biomechanical movements, skill taxonomy, and looping form animations</p>
				</div>
				<div class="exercises-header-actions">
					<button id="btn-open-anatomy-tab" class="btn btn-ghost btn-sm" title="Open Interactive Anatomy & Muscle Map">🧬 Anatomy Map</button>
					<button id="btn-create-exercise" class="btn btn-primary btn-sm">+ New Exercise</button>
				</div>
			</div>

			<!-- Search & Filter Bar -->
			<div class="exercises-filter-bar">
				<div class="search-box-wrapper">
					<span class="search-icon">🔍</span>
					<input type="text" id="exercise-search-input" class="input search-box-input exercise-search-input clean-input" placeholder="Search exercises, muscles, techniques, cues..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
				</div>
				<div class="exercise-filter-chips" id="exercise-filter-chips"></div>
			</div>

			<!-- Exercises Grid -->
			<div id="exercises-cards-grid" class="exercises-cards-grid"></div>
		</div>
	`;

	let currentSearch = '';
	let currentFilter = 'all';
	let currentMuscleFilter = null;

	const searchInput = container.querySelector('#exercise-search-input');
	const filterChipsContainer = container.querySelector('#exercise-filter-chips');
	const gridContainer = container.querySelector('#exercises-cards-grid');
	const createBtn = container.querySelector('#btn-create-exercise');
	const anatomyBtn = container.querySelector('#btn-open-anatomy-tab');

	if (anatomyBtn) {
		anatomyBtn.addEventListener('click', () => {
			onOpenAnatomy();
		});
	}

	createBtn.addEventListener('click', () => {
		showCreateExerciseModal({
			onCreated: () => {
				renderGrid();
			}
		});
	});

	const filterOptions = [
		{ id: 'all', label: 'All Movements' },
		...Object.entries(DISCIPLINES).map(([k, d]) => ({ id: `disc:${k}`, label: d.label })),
		...Object.entries(CATEGORIES).map(([k, c]) => ({ id: `cat:${k}`, label: c.label.split(' / ')[0].split(' & ')[0] })),
	];

	function renderFilterChips() {
		filterChipsContainer.innerHTML = '';

		if (currentMuscleFilter && MUSCLE_DEFINITIONS[currentMuscleFilter]) {
			const mDef = MUSCLE_DEFINITIONS[currentMuscleFilter];
			const mBtn = document.createElement('button');
			mBtn.type = 'button';
			mBtn.className = 'ex-chip-btn active muscle-active-chip';
			mBtn.innerHTML = `<span>${mDef.icon}</span> <span>${mDef.label}</span> <span class="chip-clear-x">✕</span>`;
			mBtn.addEventListener('click', () => {
				currentMuscleFilter = null;
				renderFilterChips();
				renderGrid();
			});
			filterChipsContainer.appendChild(mBtn);
		}

		filterOptions.forEach(opt => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = `ex-chip-btn ${currentFilter === opt.id ? 'active' : ''}`;
			btn.textContent = opt.label;
			btn.addEventListener('click', () => {
				currentFilter = opt.id;
				renderFilterChips();
				renderGrid();
			});
			filterChipsContainer.appendChild(btn);
		});
	}

	function renderGrid() {
		let cat = '';
		let disc = '';
		if (currentFilter.startsWith('cat:')) {
			cat = currentFilter.replace('cat:', '');
		} else if (currentFilter.startsWith('disc:')) {
			disc = currentFilter.replace('disc:', '');
		}

		const list = filterExercises(currentSearch, cat, disc, currentMuscleFilter);

		if (list.length === 0) {
			gridContainer.innerHTML = `
				<div class="empty-sessions">
					<p>No exercises found matching your filter${currentMuscleFilter ? ` for ${MUSCLE_DEFINITIONS[currentMuscleFilter]?.label || currentMuscleFilter}` : ''}.</p>
					<p class="empty-sub">Try selecting another filter or search with a different keyword.</p>
				</div>
			`;
			return;
		}

		gridContainer.innerHTML = '';
		list.forEach(ex => {
			const card = renderExerciseCardElement(ex, {
				onPlay: (targetEx, media) => onPlayExercise(targetEx, media),
				onAddToRoutine: (targetEx, btn) => onAddToRoutine(targetEx, btn),
				onClick: (targetEx) => {
					showExerciseVariationsModal(targetEx, {
						onPlayAsset: (asset) => onPlayExercise(targetEx, asset),
						onAddToRoutine: (subTargetEx, btn) => onAddToRoutine(subTargetEx || targetEx, btn),
						onUpdated: () => renderGrid()
					});
				}
			});
			gridContainer.appendChild(card);
		});
	}

	searchInput.addEventListener('input', (e) => {
		currentSearch = e.target.value;
		renderGrid();
	});

	searchInput.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && searchInput.value) {
			searchInput.value = '';
			currentSearch = '';
			renderGrid();
		}
	});

	renderFilterChips();
	renderGrid();
}

/**
 * Highlight a specific exercise card in the library catalog and scroll to it.
 * @param {string} exerciseIdOrName
 */
export function highlightExerciseCard(exerciseIdOrName) {
	if (!exerciseIdOrName) return;
	const clean = String(exerciseIdOrName).toLowerCase();
	const cards = document.querySelectorAll('.exercise-library-card');
	for (const card of cards) {
		const id = (card.dataset.id || '').toLowerCase();
		const title = (card.querySelector('.ex-lib-title')?.textContent || '').toLowerCase();
		if (id === clean || title === clean || title.includes(clean)) {
			card.classList.add('card-highlighted-pulse');
			card.scrollIntoView({ behavior: 'smooth', block: 'center' });
			setTimeout(() => {
				card.classList.remove('card-highlighted-pulse');
			}, 2500);
			break;
		}
	}
}

/**
 * Modern Video Slicer Drawer Component.
 * Supports Full Video clean mode, multi-interval time windows with [+] button,
 * dual-handle range trimmer, fine-tuning nudge steppers, and quick expanders.
 */
function createModernVideoSlicerDrawer({
	container,
	urlInput = null,
	initialUrl = '',
	initialAssets = [],
	initialStart = 0,
	initialEnd = 60,
	titleInput = null,
}) {
	let isFullVideo = false;
	let intervals = [];
	let activeIntervalId = 'win-1';

	const videoAssets = (initialAssets || []).filter(a => a && (a.type === 'video' || a.videoId || (a.url && (a.url.includes('youtube') || a.url.includes('youtu.be')))));
	if (videoAssets.length > 0) {
		intervals = videoAssets.map((a, idx) => ({
			id: a.id || `win-${idx + 1}`,
			name: a.title || `Interval ${idx + 1}`,
			start: Math.max(0, a.startSeconds || 0),
			end: Math.max((a.startSeconds || 0) + 1, a.endSeconds || ((a.startSeconds || 0) + 60))
		}));
		if (videoAssets[0].startSeconds === 0 && (!videoAssets[0].endSeconds || videoAssets[0].endSeconds <= 0)) {
			isFullVideo = true;
		}
	} else if (typeof initialStart === 'number' && typeof initialEnd === 'number' && initialEnd > initialStart) {
		intervals = [{
			id: 'win-1',
			name: 'Demonstration Slice',
			start: Math.max(0, initialStart),
			end: Math.max(initialStart + 1, initialEnd)
		}];
	} else {
		intervals = [{
			id: 'win-1',
			name: 'Demonstration Slice',
			start: 0,
			end: 60
		}];
	}
	activeIntervalId = intervals[0]?.id || 'win-1';

	function getTimelineMax() {
		let maxEnd = 120;
		intervals.forEach(i => {
			if (i.end > maxEnd) maxEnd = i.end;
		});
		return Math.max(300, Math.ceil((maxEnd * 1.35) / 60) * 60);
	}

	function formatMMSS(sec) {
		sec = Math.max(0, Math.floor(sec || 0));
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	function getActive() {
		return intervals.find(i => i.id === activeIntervalId) || intervals[0];
	}

	// Wrapper card
	const wrapper = document.createElement('div');
	wrapper.className = 'modern-media-card modern-video-slicer-drawer hidden';

	// Header Bar
	const headerBar = document.createElement('div');
	headerBar.className = 'media-header-bar';

	const metaWrap = document.createElement('div');
	metaWrap.className = 'media-preview-meta';

	const thumbBox = document.createElement('div');
	thumbBox.className = 'media-thumb-box';
	const thumbImg = document.createElement('img');
	thumbImg.alt = 'Video Preview';
	thumbImg.onerror = () => { thumbImg.src = '/workout/media/placeholder.svg'; };
	thumbBox.appendChild(thumbImg);

	const metaText = document.createElement('div');
	metaText.className = 'media-meta-text';
	const metaTitle = document.createElement('h4');
	metaTitle.textContent = 'YouTube Video Variation';
	const metaSub = document.createElement('div');
	metaSub.className = 'media-meta-sub';
	metaSub.innerHTML = '<span class="media-source-pill">YouTube</span> <span class="video-timing-label">Interactive Slicing</span>';
	metaText.append(metaTitle, metaSub);
	metaWrap.append(thumbBox, metaText);

	const modeCapsule = document.createElement('div');
	modeCapsule.className = 'mode-switch-capsule';
	const intervalsBtn = document.createElement('button');
	intervalsBtn.type = 'button';
	intervalsBtn.className = 'mode-btn active';
	intervalsBtn.innerHTML = '<span>✂️ Time Intervals</span>';
	const fullBtn = document.createElement('button');
	fullBtn.type = 'button';
	fullBtn.className = 'mode-btn';
	fullBtn.innerHTML = '<span>🎬 Full Video</span>';
	modeCapsule.append(intervalsBtn, fullBtn);
	headerBar.append(metaWrap, modeCapsule);

	// Full Video Clean Banner
	const fullBanner = document.createElement('div');
	fullBanner.className = 'full-video-clean-banner hidden';
	fullBanner.innerHTML = `
		<div class="banner-left">
			<div class="banner-icon-bubble">🎬</div>
			<div class="banner-text">
				<h5>Using Complete Video (00:00 → End)</h5>
				<p>No sliders, trim handles, or playback cuts. The player will stream the entire clip from start to finish.</p>
			</div>
		</div>
		<button type="button" class="btn-add-slice-prompt">
			<span>✂️ Add Specific Interval</span>
		</button>
	`;
	const switchFromBannerBtn = fullBanner.querySelector('.btn-add-slice-prompt');

	// Intervals Drawer
	const intervalsDrawer = document.createElement('div');
	intervalsDrawer.className = 'intervals-drawer';

	// Windows Deck
	const windowsDeck = document.createElement('div');
	windowsDeck.className = 'interval-windows-deck';
	const deckLabel = document.createElement('span');
	deckLabel.className = 'deck-label';
	deckLabel.textContent = 'Time Windows:';
	const pillsContainer = document.createElement('div');
	pillsContainer.style.display = 'flex';
	pillsContainer.style.gap = '8px';
	pillsContainer.style.flexWrap = 'wrap';
	pillsContainer.style.alignItems = 'center';

	const addIntervalBtn = document.createElement('button');
	addIntervalBtn.type = 'button';
	addIntervalBtn.className = 'btn-add-interval-pill';
	addIntervalBtn.title = 'Add another interval time window from this video';
	addIntervalBtn.innerHTML = '<span class="plus-icon">+</span><span>Add Interval</span>';
	windowsDeck.append(deckLabel, pillsContainer, addIntervalBtn);

	// Active Interval Editor
	const activeEditor = document.createElement('div');
	activeEditor.className = 'active-interval-editor';

	// Trimmer Track
	const trackWrap = document.createElement('div');
	trackWrap.className = 'trimmer-track-wrapper modern-track';
	const trackBg = document.createElement('div');
	trackBg.className = 'trimmer-track-bg modern-bg';
	const ghostOverlay = document.createElement('div');
	ghostOverlay.className = 'track-other-window';
	const highlight = document.createElement('div');
	highlight.className = 'trimmer-highlight modern-highlight';
	highlight.title = 'Drag interval window';
	const handleStart = document.createElement('div');
	handleStart.className = 'trimmer-handle modern-handle';
	handleStart.title = 'Drag Start';
	const handleEnd = document.createElement('div');
	handleEnd.className = 'trimmer-handle modern-handle end-handle';
	handleEnd.title = 'Drag End';
	trackWrap.append(trackBg, ghostOverlay, highlight, handleStart, handleEnd);

	// Time Controls Grid
	const timeGrid = document.createElement('div');
	timeGrid.className = 'modern-time-grid';

	// Start Box
	const startBox = document.createElement('div');
	startBox.className = 'modern-time-box';
	startBox.innerHTML = '<div class="modern-time-box-header"><span>Start (In)</span><span class="time-format-hint">MM:SS</span></div>';
	const startStepper = document.createElement('div');
	startStepper.className = 'modern-stepper-wrap';
	const sMinus = document.createElement('button');
	sMinus.type = 'button';
	sMinus.className = 'stepper-btn minus-step';
	sMinus.title = '-1s (Shift: -5s)';
	sMinus.textContent = '−';
	const startInput = document.createElement('input');
	startInput.type = 'text';
	startInput.className = 'modern-time-input clean-input';
	startInput.value = '00:00';
	startInput.autocomplete = 'off';
	startInput.autocorrect = 'off';
	startInput.autocapitalize = 'off';
	startInput.spellcheck = false;
	const sPlus = document.createElement('button');
	sPlus.type = 'button';
	sPlus.className = 'stepper-btn plus-step';
	sPlus.title = '+1s (Shift: +5s)';
	sPlus.textContent = '+';
	startStepper.append(sMinus, startInput, sPlus);
	startBox.appendChild(startStepper);

	// Duration Capsule
	const durCapsule = document.createElement('div');
	durCapsule.className = 'modern-duration-capsule';
	durCapsule.innerHTML = '<span class="dur-capsule-label">Duration</span><span class="dur-capsule-val">⏱️ 60s</span>';
	const durValText = durCapsule.querySelector('.dur-capsule-val');

	// End Box
	const endBox = document.createElement('div');
	endBox.className = 'modern-time-box';
	endBox.innerHTML = '<div class="modern-time-box-header"><span>End (Out)</span><span class="time-format-hint">MM:SS</span></div>';
	const endStepper = document.createElement('div');
	endStepper.className = 'modern-stepper-wrap';
	const eMinus = document.createElement('button');
	eMinus.type = 'button';
	eMinus.className = 'stepper-btn minus-step';
	eMinus.title = '-1s (Shift: -5s)';
	eMinus.textContent = '−';
	const endInput = document.createElement('input');
	endInput.type = 'text';
	endInput.className = 'modern-time-input clean-input';
	endInput.value = '01:00';
	endInput.autocomplete = 'off';
	endInput.autocorrect = 'off';
	endInput.autocapitalize = 'off';
	endInput.spellcheck = false;
	const ePlus = document.createElement('button');
	ePlus.type = 'button';
	ePlus.className = 'stepper-btn plus-step';
	ePlus.title = '+1s (Shift: +5s)';
	ePlus.textContent = '+';
	endStepper.append(eMinus, endInput, ePlus);
	endBox.appendChild(endStepper);

	timeGrid.append(startBox, durCapsule, endBox);

	activeEditor.append(trackWrap, timeGrid);
	intervalsDrawer.append(windowsDeck, activeEditor);
	wrapper.append(headerBar, fullBanner, intervalsDrawer);
	container.appendChild(wrapper);

	function renderPills() {
		pillsContainer.innerHTML = '';
		intervals.forEach((inv, idx) => {
			const pill = document.createElement('div');
			pill.className = `time-window-pill ${inv.id === activeIntervalId ? 'active' : ''}`;
			pill.dataset.winId = inv.id;

			const dur = Math.max(1, inv.end - inv.start);
			const durStr = dur >= 60 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${dur}s`;

			pill.innerHTML = `
				<span class="window-tag">Interval ${idx + 1}:</span>
				<span class="window-timestamps">${formatMMSS(inv.start)} - ${formatMMSS(inv.end)}</span>
				<span class="window-dur-tag">${durStr}</span>
				${intervals.length > 1 ? '<button type="button" class="btn-remove-window" title="Delete interval">✕</button>' : ''}
			`;

			pill.addEventListener('click', (e) => {
				if (e.target.closest('.btn-remove-window')) return;
				activeIntervalId = inv.id;
				syncVisuals();
			});

			const removeBtn = pill.querySelector('.btn-remove-window');
			if (removeBtn) {
				removeBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					if (intervals.length <= 1) return;
					intervals = intervals.filter(i => i.id !== inv.id);
					if (activeIntervalId === inv.id) {
						activeIntervalId = intervals[0].id;
					}
					syncVisuals();
				});
			}

			pillsContainer.appendChild(pill);
		});
	}

	function syncVisuals() {
		intervalsBtn.classList.toggle('active', !isFullVideo);
		fullBtn.classList.toggle('active', isFullVideo);

		if (isFullVideo) {
			fullBanner.classList.remove('hidden');
			intervalsDrawer.classList.add('hidden');
			return;
		}

		fullBanner.classList.add('hidden');
		intervalsDrawer.classList.remove('hidden');

		const active = getActive();
		if (!active) return;

		const timelineMax = getTimelineMax();
		const leftPct = (active.start / timelineMax) * 100;
		const rightPct = (active.end / timelineMax) * 100;
		const widthPct = Math.max(0, rightPct - leftPct);

		highlight.style.left = `${leftPct}%`;
		highlight.style.width = `${widthPct}%`;
		handleStart.style.left = `${leftPct}%`;
		handleEnd.style.left = `${rightPct}%`;

		// Ghost overlay for other intervals
		const other = intervals.find(i => i.id !== active.id);
		if (other) {
			ghostOverlay.style.display = 'block';
			ghostOverlay.style.left = `${(other.start / timelineMax) * 100}%`;
			ghostOverlay.style.width = `${((other.end - other.start) / timelineMax) * 100}%`;
		} else {
			ghostOverlay.style.display = 'none';
		}

		startInput.value = formatMMSS(active.start);
		endInput.value = formatMMSS(active.end);

		const dur = Math.max(1, active.end - active.start);
		const durStr = dur >= 60 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${dur}s`;
		durValText.textContent = `⏱️ ${durStr}`;

		renderPills();
	}

	// Pointer dragging for range handles
	let isDragging = null;
	let dragStartX = 0;
	let dragStartSec = 0;
	let dragEndSec = 0;

	function getSecFromPointer(e) {
		const rect = trackWrap.getBoundingClientRect();
		const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		return Math.round(frac * getTimelineMax());
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
		const active = getActive();
		dragStartSec = active.start;
		dragEndSec = active.end;
	});

	window.addEventListener('pointermove', (e) => {
		if (!isDragging) return;
		const active = getActive();
		if (!active) return;
		const timelineMax = getTimelineMax();

		if (isDragging === 'start') {
			const s = getSecFromPointer(e);
			active.start = Math.max(0, Math.min(s, active.end - 1));
			syncVisuals();
		} else if (isDragging === 'end') {
			const end = getSecFromPointer(e);
			active.end = Math.max(active.start + 1, Math.min(end, timelineMax));
			syncVisuals();
		} else if (isDragging === 'range') {
			const rect = trackWrap.getBoundingClientRect();
			const deltaSec = Math.round(((e.clientX - dragStartX) / rect.width) * timelineMax);
			const dur = dragEndSec - dragStartSec;
			let newStart = dragStartSec + deltaSec;
			if (newStart < 0) newStart = 0;
			if (newStart + dur > timelineMax) newStart = timelineMax - dur;
			active.start = newStart;
			active.end = newStart + dur;
			syncVisuals();
		}
	});

	window.addEventListener('pointerup', () => {
		isDragging = null;
	});

	// Mode switches
	intervalsBtn.addEventListener('click', () => {
		isFullVideo = false;
		syncVisuals();
	});
	fullBtn.addEventListener('click', () => {
		isFullVideo = true;
		syncVisuals();
	});
	if (switchFromBannerBtn) {
		switchFromBannerBtn.addEventListener('click', () => {
			isFullVideo = false;
			syncVisuals();
		});
	}

	// Stepper buttons with Shift support (±1s normal, ±5s on Shift)
	sMinus.addEventListener('click', (e) => {
		const a = getActive();
		if (!a) return;
		const step = e.shiftKey ? 5 : 1;
		a.start = Math.max(0, a.start - step);
		syncVisuals();
	});
	sPlus.addEventListener('click', (e) => {
		const a = getActive();
		if (!a) return;
		const step = e.shiftKey ? 5 : 1;
		a.start = Math.min(a.end - 1, a.start + step);
		syncVisuals();
	});
	eMinus.addEventListener('click', (e) => {
		const a = getActive();
		if (!a) return;
		const step = e.shiftKey ? 5 : 1;
		a.end = Math.max(a.start + 1, a.end - step);
		syncVisuals();
	});
	ePlus.addEventListener('click', (e) => {
		const a = getActive();
		if (!a) return;
		const step = e.shiftKey ? 5 : 1;
		a.end = Math.min(getTimelineMax(), a.end + step);
		syncVisuals();
	});

	// Keyboard arrow adjustments
	startInput.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			const step = e.shiftKey ? 5 : 1;
			const a = getActive();
			if (a) { a.start = Math.min(a.end - 1, a.start + step); syncVisuals(); }
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			const step = e.shiftKey ? 5 : 1;
			const a = getActive();
			if (a) { a.start = Math.max(0, a.start - step); syncVisuals(); }
		}
	});
	endInput.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			const step = e.shiftKey ? 5 : 1;
			const a = getActive();
			if (a) { a.end = Math.min(getTimelineMax(), a.end + step); syncVisuals(); }
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			const step = e.shiftKey ? 5 : 1;
			const a = getActive();
			if (a) { a.end = Math.max(a.start + 1, a.end - step); syncVisuals(); }
		}
	});

	// Direct input entry
	startInput.addEventListener('change', (e) => {
		const a = getActive();
		if (!a) return;
		const s = parseTime(e.target.value);
		a.start = Math.max(0, Math.min(s, a.end - 1));
		syncVisuals();
	});
	endInput.addEventListener('change', (e) => {
		const a = getActive();
		if (!a) return;
		const end = parseTime(e.target.value);
		a.end = Math.max(a.start + 1, Math.min(end, getTimelineMax()));
		syncVisuals();
	});

	// [+] Add interval
	addIntervalBtn.addEventListener('click', () => {
		const newId = `win-${Date.now()}`;
		const last = intervals[intervals.length - 1];
		const maxT = getTimelineMax();
		const newStart = last ? Math.min(maxT - 30, last.end + 10) : 0;
		const newEnd = Math.min(maxT, newStart + 45);

		intervals.push({
			id: newId,
			name: `Variation Clip ${intervals.length + 1}`,
			start: newStart,
			end: newEnd
		});
		activeIntervalId = newId;
		syncVisuals();
	});

	function syncWithUrl(url) {
		const clean = (url || '').trim();
		const vid = parseYouTubeId(clean);
		if (vid) {
			wrapper.classList.remove('hidden');
			thumbImg.src = `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;
			if (titleInput && titleInput.value && titleInput.value.trim()) {
				metaTitle.textContent = titleInput.value.trim();
			} else {
				metaTitle.textContent = 'YouTube Video Variation';
			}
			syncVisuals();
		} else {
			wrapper.classList.add('hidden');
		}
	}

	if (initialUrl) {
		syncWithUrl(initialUrl);
	}

	return {
		getState: () => {
			const active = getActive();
			return {
				isFullVideo,
				intervals: intervals.map(i => ({ ...i })),
				activeStart: active ? active.start : 0,
				activeEnd: active ? active.end : 60,
				primaryStart: isFullVideo ? 0 : (intervals[0]?.start ?? 0),
				primaryEnd: isFullVideo ? undefined : (intervals[0]?.end ?? undefined)
			};
		},
		syncWithUrl,
		destroy: () => {
			wrapper.remove();
		}
	};
}

/**
 * Show a Split HUD modal displaying all media variations for an exercise, with option to play, remove, or add more.
 * @param {Object} exercise
 * @param {Object} [options]
 */
export function showExerciseVariationsModal(exercise, options = {}) {
	const onPlayAsset = options.onPlayAsset || (() => {});
	const onAddToRoutine = options.onAddToRoutine || (() => {});
	const onUpdated = options.onUpdated || (() => {});
	const onOpenInLibrary = options.onOpenInLibrary || null;

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop modal-exercise-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-window modal-combo-hud-split';

	const close = () => {
		document.removeEventListener('keydown', handleEsc);
		document.removeEventListener('paste', handleGlobalPaste);
		backdrop.remove();
	};

	let isEditingDesc = false;

	const handleEsc = (e) => {
		const modalDlg = document.getElementById('modal-backdrop');
		if (modalDlg && !modalDlg.classList.contains('hidden')) {
			return;
		}
		if (e.key === 'Escape' || e.keyCode === 27) {
			if (isEditingDesc) {
				isEditingDesc = false;
				renderModalContent();
				return;
			}
			close();
		}
	};
	document.addEventListener('keydown', handleEsc);

	const handleGlobalPaste = (e) => {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (let i = 0; i < items.length; i++) {
			if (items[i].type.startsWith('image/')) {
				const file = items[i].getAsFile();
				if (file) {
					e.preventDefault();
					const kindSelect = modal.querySelector('#new-asset-kind');
					if (kindSelect && kindSelect.value !== 'photo' && kindSelect.value !== 'animation') {
						kindSelect.value = 'photo';
						const timeRow = modal.querySelector('#new-asset-time-row');
						const uploadZone = modal.querySelector('#new-asset-upload-zone');
						const urlLabel = modal.querySelector('#new-asset-url-label');
						const urlInput = modal.querySelector('#new-asset-url');
						const titleInput = modal.querySelector('#new-asset-title');
						if (timeRow) timeRow.classList.add('hidden');
						if (uploadZone) uploadZone.classList.remove('hidden');
						if (urlLabel) urlLabel.textContent = 'Or Enter Direct Image URL / Path';
						if (urlInput) urlInput.placeholder = 'https://example.com/photo.jpg or /workout/media/exercise.jpg';
						if (titleInput && !titleInput.value) titleInput.placeholder = 'e.g., Stance & Setup Reference Photo';
					}
					const addForm = modal.querySelector('#add-asset-form');
					if (addForm) addForm.classList.remove('hidden');
					const dropzoneInner = modal.querySelector('#new-asset-dropzone-inner');
					const previewBox = modal.querySelector('#new-asset-preview-box');
					const previewImg = modal.querySelector('#new-asset-preview-img');
					const previewFilename = modal.querySelector('#new-asset-preview-filename');
					const urlInput = modal.querySelector('#new-asset-url');
					const titleInput = modal.querySelector('#new-asset-title');

					uploadImageFile(file).then((uploaded) => {
						if (urlInput) urlInput.value = uploaded.url;
						if (previewImg) previewImg.src = uploaded.url;
						if (previewFilename) previewFilename.textContent = 'Pasted Screenshot';
						if (dropzoneInner) dropzoneInner.classList.add('hidden');
						if (previewBox) previewBox.classList.remove('hidden');
						if (titleInput && !titleInput.value) titleInput.value = 'Form Reference Photo';
						showToast('📷 Screenshot pasted & uploaded!');
					}).catch((err) => {
						showAlert({ title: 'Upload Failed', message: err.message });
					});
					break;
				}
			}
		}
	};
	document.addEventListener('paste', handleGlobalPaste);

	function renderModalContent() {
		const assets = getExerciseMediaAssets([exercise]);
		const muscles = inferMusclesForExercise(exercise);
		const primaryMuscles = (muscles.primary || []).map(m => getMuscleBadgeHtml(m, true));
		const secondaryMuscles = (muscles.secondary || []).map(m => getMuscleBadgeHtml(m, false));

		const primaryAsset = assets[0];
		const isVid = primaryAsset && (primaryAsset.type === 'video' || Boolean(primaryAsset.videoId));
		const vid = isVid ? (primaryAsset?.videoId || (primaryAsset?.url ? parseYouTubeId(primaryAsset.url) : null)) : null;
		const rawImg = !isVid && (primaryAsset?.url || (exercise.media_url && !exercise.media_url.includes('youtube') && !exercise.media_url.includes('youtu.be') ? exercise.media_url : null));
		const isPushupExercise = (exercise.name || '').toLowerCase().includes('pushup') || (exercise.name || '').toLowerCase().includes('push-up') || (exercise.name || '').toLowerCase().includes('push up');
		const imgUrl = (rawImg && (rawImg !== '/workout/media/pushups.svg' || isPushupExercise)) ? rawImg : null;

		const catInfo = CATEGORIES[(exercise.category || '').toLowerCase()];
		const discInfo = DISCIPLINES[(exercise.discipline || '').toLowerCase()];
		const emptyIcon = discInfo?.icon || catInfo?.icon || '🎯';

		const modeStr = (exercise.default_mode || 'reps') === 'reps'
			? `🔢 ${exercise.default_quantity || 20} Target Reps`
			: `⏱️ ${formatTime(exercise.default_quantity || 30)}`;

		modal.innerHTML = `
			<div class="hud-left-panel">
				<div class="hud-badges-row">
					${getCategoryBadgeHtml(exercise.category)}
					${exercise.discipline ? getDisciplineBadgeHtml(exercise.discipline) : ''}
					<button class="btn btn-ghost btn-xs btn-edit-this-ex" title="Edit exercise name, cues, category, or default sets">✏️ Edit Movement</button>
				</div>

				<h2 class="hud-combo-title">${escapeHtml(exercise.name)}</h2>

				<div class="hud-visual-card">
					${isVid && vid ? `
						<div class="hud-video-thumb">
							<img src="https://img.youtube.com/vi/${vid}/mqdefault.jpg" alt="${escapeHtml(exercise.name)}">
							<span class="modal-play-badge">▶</span>
						</div>
					` : imgUrl ? `
						<div class="hud-img-thumb">
							<img src="${imgUrl}" alt="${escapeHtml(exercise.name)}" onerror="this.src='/workout/media/placeholder.svg'">
						</div>
					` : `
						<div class="hud-no-media-thumb">
							<div class="hud-no-media-icon">${emptyIcon}</div>
							<div class="hud-no-media-title">No Media Attached</div>
							<div class="hud-no-media-sub">Add a video, drill, or photo below</div>
						</div>
					`}
					<div class="hud-visual-caption">Form Reference & Execution</div>
				</div>

				<div class="hud-muscles-section">
					<div class="hud-section-label">Target Anatomy</div>
					<div class="hud-muscles-row">
						${primaryMuscles.join('')}
						${secondaryMuscles.slice(0, 3).join('')}
					</div>
				</div>

				<div class="hud-left-actions">
					<button class="btn btn-primary btn-hud-play-ex" style="width:100%;">▶ Preview Follow-Along</button>
					<button class="btn btn-ghost btn-hud-add-ex" style="width:100%;">+ Add to Workout ▾</button>
					${onOpenInLibrary ? '<button class="btn btn-ghost btn-hud-open-lib" style="width:100%;font-size:0.8rem;opacity:0.85;">🔍 Show in Movement Library</button>' : ''}
				</div>
			</div>

			<div class="hud-right-panel">
				<div class="hud-right-header">
					<div class="hud-stat-pills">
						<span class="hud-stat-pill">${modeStr}</span>
						<span class="hud-stat-pill">🎬 ${assets.length} Media Variation${assets.length !== 1 ? 's' : ''}</span>
					</div>
					<button class="modal-close-btn" title="Close (ESC)">✕</button>
				</div>

				<div class="hud-desc-section">
					<div class="hud-desc-header">
						<div class="hud-section-label" style="margin-bottom:0;">📝 Description & Coaching Cues</div>
						${!isEditingDesc ? `<button type="button" class="btn btn-ghost btn-xs btn-edit-desc" title="${exercise.description ? 'Edit description' : 'Add description'}">✏️ ${exercise.description ? 'Edit' : '+ Add Description'}</button>` : ''}
					</div>
					<div class="hud-description-box ${!exercise.description && !isEditingDesc ? 'hud-desc-empty' : ''} ${isEditingDesc ? 'is-editing' : ''}">
						${isEditingDesc ? `
							<div class="hud-desc-edit-form">
								<textarea id="hud-desc-editor" class="input hud-desc-textarea clean-input" rows="3" placeholder="Describe movement mechanics, setup, cues, or tips..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">${escapeHtml(exercise.description || '')}</textarea>
								<div class="hud-desc-actions">
									<button type="button" class="btn btn-primary btn-xs btn-save-desc">Save</button>
									<button type="button" class="btn btn-ghost btn-xs btn-cancel-desc">Cancel</button>
									<span class="hud-desc-hint">⌘+Enter to save, Esc to cancel</span>
								</div>
							</div>
						` : (exercise.description ? `
							<p class="hud-desc-text">${escapeHtml(exercise.description)}</p>
						` : `
							<p class="hud-desc-text hud-desc-placeholder"><span>➕</span> Add coaching cues, technique pointers, or form execution details...</p>
						`)}
					</div>
				</div>

				<div class="hud-constituents-deck">
					<div class="hud-section-label">🎬 Tutorials, Drill Variations & Photo References (${assets.length})</div>
					
					<div class="modal-assets-list">
						${assets.length === 0 ? '<p class="empty-chip-hint">No extra media attached yet. Add a YouTube tutorial link, drill video, or photo below!</p>' : ''}
						${assets.map((a, idx) => {
							const isVideo = a.type === 'video' || Boolean(a.videoId);
							const vid = a.videoId || (a.url ? parseYouTubeId(a.url) : null);
							const thumb = isVideo && vid
								? `https://img.youtube.com/vi/${vid}/mqdefault.jpg`
								: (a.url || '/workout/media/placeholder.svg');

							let actionBtnLabel = '▶ Play Video';
							if (!isVideo) {
								actionBtnLabel = '🔍 View Photo';
							} else if (a.kind === 'instruction') {
								actionBtnLabel = '🎬 Watch Tutorial';
							} else if (a.kind === 'demonstration' || a.kind === 'drill') {
								actionBtnLabel = '⚡ Follow Along';
							}

							return `
								<div class="modal-asset-row" data-idx="${idx}">
									<div class="modal-asset-thumb">
										<img src="${thumb}" alt="${escapeHtml(a.title || '')}" onerror="this.src='/workout/media/placeholder.svg'">
										${isVideo ? '<span class="modal-play-badge">▶</span>' : '<span class="modal-play-badge" style="font-size:0.75rem;">📷</span>'}
									</div>
									<div class="modal-asset-info">
										<div class="modal-asset-badge-row">
											${getMediaKindBadgeHtml(a.kind)}
											${isVideo && a.startSeconds !== undefined && a.endSeconds ? `<span class="asset-timestamp">${formatTime(a.startSeconds)} - ${formatTime(a.endSeconds)}</span>` : ''}
										</div>
										<div class="modal-asset-title">${escapeHtml(a.title || (isVideo ? 'Video Variation' : 'Form Image'))}</div>
									</div>
									<div class="modal-asset-actions">
										<button class="btn btn-sm btn-primary btn-play-asset-now" data-idx="${idx}" title="${isVideo ? (a.kind === 'instruction' ? 'Watch technique tutorial' : 'Preview follow-along video') : 'View image reference'}">${actionBtnLabel}</button>
										<button class="btn btn-sm btn-ghost btn-remove-asset-now" data-idx="${idx}" title="Remove this media variation">🗑️</button>
									</div>
								</div>
							`;
						}).join('')}
					</div>

					<!-- Add Media Asset Form -->
					<div class="add-asset-collapse-section" style="margin-top:12px;">
						<button id="toggle-add-asset-btn" class="btn btn-ghost btn-sm">+ Add New Video or Photo Variation</button>
						<div id="add-asset-form" class="add-asset-form hidden">
							<div class="field-group">
								<label>Media Role / Kind</label>
								<select id="new-asset-kind" class="input">
									<option value="instruction">🎬 Instruction & Tutorial (YouTube Video)</option>
									<option value="demonstration">⚡ Exercise Execution / Follow-Along (YouTube Video)</option>
									<option value="photo">📷 Form Reference Photo (Upload / Screenshot / URL)</option>
									<option value="animation">✨ Looping GIF / Visual (Upload / URL)</option>
								</select>
							</div>

							<!-- Image Upload & Dropzone Area (shown for photo/animation) -->
							<div id="new-asset-upload-zone" class="media-upload-dropzone hidden">
								<input type="file" id="new-asset-file-input" accept="image/*" class="hidden-file-input">
								<div class="dropzone-inner" id="new-asset-dropzone-inner">
									<span class="dropzone-icon">📷</span>
									<div class="dropzone-text">
										<strong>Choose photo / screenshot</strong> or drag & drop here
									</div>
									<div class="dropzone-hint">
										Or paste screenshot directly from clipboard (⌘V / Ctrl+V)
									</div>
								</div>
								<div id="new-asset-preview-box" class="dropzone-preview hidden">
									<img id="new-asset-preview-img" src="" alt="Preview">
									<div class="dropzone-preview-meta">
										<span id="new-asset-preview-filename" class="preview-filename"></span>
										<button type="button" id="btn-clear-uploaded-asset" class="btn btn-ghost btn-xs">✕ Remove</button>
									</div>
								</div>
							</div>

							<div class="field-group" id="new-asset-title-group">
								<label id="new-asset-title-label">Asset Title</label>
								<input type="text" id="new-asset-title" class="input clean-input" placeholder="e.g., Coach Breakdown & Cueing" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
							</div>

							<div class="field-group" id="new-asset-url-group">
								<label id="new-asset-url-label">YouTube Video URL</label>
								<input type="text" id="new-asset-url" class="input clean-input" placeholder="https://youtube.com/watch?v=... or https://youtu.be/..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
							</div>

							<!-- Modern Slicer Drawer for Video Asset -->
							<div id="new-asset-slicer-container" style="margin-top:10px;"></div>

							<div class="add-asset-actions">
								<button id="btn-save-new-asset" class="btn btn-sm btn-primary">Save Asset</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;

		modal.querySelectorAll('.modal-close-btn').forEach(b => {
			b.addEventListener('click', close);
		});

		const editDescBtn = modal.querySelector('.btn-edit-desc');
		if (editDescBtn) {
			editDescBtn.addEventListener('click', () => {
				isEditingDesc = true;
				renderModalContent();
			});
		}

		const descEmptyBox = modal.querySelector('.hud-description-box.hud-desc-empty');
		if (descEmptyBox) {
			descEmptyBox.addEventListener('click', () => {
				isEditingDesc = true;
				renderModalContent();
			});
		}

		const saveDescBtn = modal.querySelector('.btn-save-desc');
		const cancelDescBtn = modal.querySelector('.btn-cancel-desc');
		const descEditor = modal.querySelector('#hud-desc-editor');

		const handleSaveDesc = async () => {
			if (!descEditor) return;
			const newDesc = descEditor.value.trim();
			if (saveDescBtn) {
				saveDescBtn.disabled = true;
				saveDescBtn.textContent = 'Saving...';
			}
			try {
				const updated = await updateExerciseDescription(exercise.id || exercise, newDesc);
				Object.assign(exercise, updated);
				isEditingDesc = false;
				renderModalContent();
				onUpdated();
				showToast(`Updated description for "${exercise.name}".`);
			} catch (err) {
				if (saveDescBtn) {
					saveDescBtn.disabled = false;
					saveDescBtn.textContent = 'Save';
				}
				await showAlert({ title: 'Error', message: 'Could not save description: ' + err.message });
			}
		};

		if (saveDescBtn) {
			saveDescBtn.addEventListener('click', handleSaveDesc);
		}

		if (cancelDescBtn) {
			cancelDescBtn.addEventListener('click', () => {
				isEditingDesc = false;
				renderModalContent();
			});
		}

		if (descEditor) {
			setTimeout(() => {
				descEditor.focus();
				descEditor.setSelectionRange(descEditor.value.length, descEditor.value.length);
			}, 0);

			descEditor.addEventListener('keydown', (e) => {
				if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
					e.preventDefault();
					handleSaveDesc();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					e.stopPropagation();
					isEditingDesc = false;
					renderModalContent();
				}
			});
		}

		const editExBtn = modal.querySelector('.btn-edit-this-ex');
		if (editExBtn) {
			editExBtn.addEventListener('click', () => {
				close();
				showEditExerciseModal(exercise, {
					onUpdated: (updatedEx) => {
						Object.assign(exercise, updatedEx);
						onUpdated();
						showExerciseVariationsModal(exercise, options);
					}
				});
			});
		}

		modal.querySelectorAll('.btn-play-asset-now').forEach(btn => {
			btn.addEventListener('click', () => {
				const idx = parseInt(btn.getAttribute('data-idx'), 10);
				if (assets[idx]) {
					close();
					onPlayAsset(assets[idx]);
				}
			});
		});

		modal.querySelectorAll('.btn-remove-asset-now').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const idx = parseInt(btn.getAttribute('data-idx'), 10);
				const assetToRemove = assets[idx];
				if (!assetToRemove) return;

				const confirmed = await showConfirm({
					title: 'Remove Video / Media',
					message: `Are you sure you want to remove "${assetToRemove.title || 'this video'}" from ${exercise.name}?`,
					confirmText: 'Remove',
					danger: true
				});
				if (!confirmed) return;

				try {
					const updated = await removeMediaAssetFromExercise(exercise.id || exercise, assetToRemove.id, assetToRemove.url);
					Object.assign(exercise, updated);
					renderModalContent();
					onUpdated();
					showToast(`Removed media from "${exercise.name}".`);
				} catch (err) {
					await showAlert({ title: 'Error', message: 'Could not remove video: ' + err.message });
				}
			});
		});

		const playExBtn = modal.querySelector('.btn-hud-play-ex');
		if (playExBtn) {
			playExBtn.addEventListener('click', () => {
				close();
				onPlayAsset(primaryAsset || null);
			});
		}

		const addExBtn = modal.querySelector('.btn-hud-add-ex');
		if (addExBtn) {
			addExBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				onAddToRoutine(exercise, addExBtn);
			});
		}

		const openLibBtn = modal.querySelector('.btn-hud-open-lib');
		if (openLibBtn && onOpenInLibrary) {
			openLibBtn.addEventListener('click', () => {
				close();
				onOpenInLibrary(exercise);
			});
		}

		const toggleAddBtn = modal.querySelector('#toggle-add-asset-btn');
		const addForm = modal.querySelector('#add-asset-form');
		if (toggleAddBtn && addForm) {
			toggleAddBtn.addEventListener('click', () => {
				addForm.classList.toggle('hidden');
			});
		}

		const kindSelect = modal.querySelector('#new-asset-kind');
		const uploadZone = modal.querySelector('#new-asset-upload-zone');
		const dropzoneInner = modal.querySelector('#new-asset-dropzone-inner');
		const fileInput = modal.querySelector('#new-asset-file-input');
		const previewBox = modal.querySelector('#new-asset-preview-box');
		const previewImg = modal.querySelector('#new-asset-preview-img');
		const previewFilename = modal.querySelector('#new-asset-preview-filename');
		const clearUploadBtn = modal.querySelector('#btn-clear-uploaded-asset');
		const urlLabel = modal.querySelector('#new-asset-url-label');
		const urlInput = modal.querySelector('#new-asset-url');
		const titleInput = modal.querySelector('#new-asset-title');
		const slicerContainer = modal.querySelector('#new-asset-slicer-container');
		const variationSlicer = createModernVideoSlicerDrawer({
			container: slicerContainer,
			urlInput,
			initialUrl: urlInput.value.trim(),
			initialStart: 0,
			initialEnd: 60,
			titleInput,
		});

		urlInput.addEventListener('input', () => {
			if (kindSelect.value !== 'photo' && kindSelect.value !== 'animation') {
				variationSlicer.syncWithUrl(urlInput.value.trim());
			}
		});

		function updateAddFormFields() {
			if (!kindSelect || !urlLabel || !urlInput || !titleInput) return;
			const kind = kindSelect.value;
			const isImage = kind === 'photo' || kind === 'animation';

			if (isImage) {
				if (slicerContainer) slicerContainer.classList.add('hidden');
				if (uploadZone) uploadZone.classList.remove('hidden');
				if (kind === 'photo') {
					urlLabel.textContent = 'Or Enter Direct Image URL / Path';
					urlInput.placeholder = 'https://example.com/photo.jpg or /workout/media/exercise.jpg';
					if (!titleInput.value) titleInput.placeholder = 'e.g., Stance & Setup Reference Photo';
				} else {
					urlLabel.textContent = 'Or Enter Looping GIF / Animation URL';
					urlInput.placeholder = 'https://example.com/drill.gif or /workout/media/exercise.gif';
					if (!titleInput.value) titleInput.placeholder = 'e.g., Form Animation Loop';
				}
			} else {
				if (uploadZone) uploadZone.classList.add('hidden');
				if (slicerContainer) slicerContainer.classList.remove('hidden');
				urlLabel.textContent = 'YouTube Video URL';
				urlInput.placeholder = 'https://youtube.com/watch?v=... or https://youtu.be/...';
				if (kind === 'instruction') {
					if (!titleInput.value) titleInput.placeholder = 'e.g., Technique Breakdown & Coaching Cues';
				} else {
					if (!titleInput.value) titleInput.placeholder = 'e.g., Continuous Execution Follow-Along';
				}
				variationSlicer.syncWithUrl(urlInput.value.trim());
			}
		}

		if (kindSelect) {
			kindSelect.addEventListener('change', updateAddFormFields);
			updateAddFormFields();
		}

		async function handleFileSelected(file) {
			if (!file || !file.type.startsWith('image/')) {
				await showAlert({ title: 'Invalid File', message: 'Please select an image file (PNG, JPG, SVG, WebP, GIF).' });
				return;
			}
			try {
				const uploaded = await uploadImageFile(file);
				urlInput.value = uploaded.url;
				previewImg.src = uploaded.url;
				previewFilename.textContent = file.name;
				dropzoneInner.classList.add('hidden');
				previewBox.classList.remove('hidden');
				if (!titleInput.value) {
					titleInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
				}
				showToast('📷 Image uploaded successfully!');
			} catch (err) {
				await showAlert({ title: 'Upload Failed', message: err.message });
			}
		}

		if (fileInput) {
			fileInput.addEventListener('change', (e) => {
				const file = e.target.files?.[0];
				if (file) handleFileSelected(file);
			});
		}

		if (dropzoneInner) {
			dropzoneInner.addEventListener('click', () => {
				if (fileInput) fileInput.click();
			});

			dropzoneInner.addEventListener('dragover', (e) => {
				e.preventDefault();
				dropzoneInner.parentElement.classList.add('drag-active');
			});

			dropzoneInner.addEventListener('dragleave', () => {
				dropzoneInner.parentElement.classList.remove('drag-active');
			});

			dropzoneInner.addEventListener('drop', (e) => {
				e.preventDefault();
				dropzoneInner.parentElement.classList.remove('drag-active');
				const file = e.dataTransfer?.files?.[0];
				if (file) handleFileSelected(file);
			});
		}

		if (clearUploadBtn) {
			clearUploadBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				urlInput.value = '';
				previewImg.src = '';
				previewFilename.textContent = '';
				if (fileInput) fileInput.value = '';
				previewBox.classList.add('hidden');
				dropzoneInner.classList.remove('hidden');
			});
		}

		const saveAssetBtn = modal.querySelector('#btn-save-new-asset');
		if (saveAssetBtn) {
			saveAssetBtn.addEventListener('click', async () => {
				const kind = kindSelect.value;
				const title = titleInput.value.trim() || (kind === 'instruction' ? 'Instruction Tutorial' : (kind === 'photo' ? 'Form Photo' : 'Demonstration'));
				const url = urlInput.value.trim();

				if (!url) {
					await showAlert({ title: 'Missing URL / Media', message: 'Please provide a YouTube URL or upload an image file.' });
					return;
				}

				const vid = parseYouTubeId(url);
				const isImgKind = kind === 'photo' || kind === 'animation';
				const isYtUrl = Boolean(vid);
				const finalType = isYtUrl ? 'video' : (isImgKind ? 'image' : (url.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image'));

				const slicerState = variationSlicer.getState();

				if (finalType === 'video' && !slicerState.isFullVideo && slicerState.intervals.length > 1) {
					try {
						for (let i = 0; i < slicerState.intervals.length; i++) {
							const inv = slicerState.intervals[i];
							const invAsset = {
								id: `asset-${Date.now()}-${i + 1}`,
								kind,
								type: 'video',
								title: inv.name || `${title} Part ${i + 1}`,
								url,
								videoId: vid || undefined,
								startSeconds: inv.start,
								endSeconds: inv.end,
							};
							await addMediaAssetToExercise(exercise.id, invAsset);
						}
						const updated = await getExerciseById(exercise.id);
						Object.assign(exercise, updated);
						renderModalContent();
						onUpdated();
						showToast(`Added ${slicerState.intervals.length} video variations to "${exercise.name}"!`);
						return;
					} catch (err) {
						await showAlert({ title: 'Error', message: 'Could not add media asset: ' + err.message });
						return;
					}
				}

				const start = slicerState.isFullVideo ? 0 : slicerState.activeStart;
				const end = slicerState.isFullVideo ? undefined : slicerState.activeEnd;

				const newAsset = {
					id: `asset-${Date.now()}`,
					kind,
					type: finalType,
					title,
					url,
					videoId: vid || undefined,
					startSeconds: finalType === 'video' ? start : undefined,
					endSeconds: finalType === 'video' ? end : undefined,
				};

				try {
					const updated = await addMediaAssetToExercise(exercise.id, newAsset);
					Object.assign(exercise, updated);
					renderModalContent();
					onUpdated();
					showToast(`Added "${title}" to ${exercise.name}!`);
				} catch (err) {
					await showAlert({ title: 'Error', message: 'Could not add media asset: ' + err.message });
				}
			});
		}
	}

	backdrop.appendChild(modal);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	renderModalContent();
	document.body.appendChild(backdrop);
}

/**
 * Show modal to create or edit a custom exercise.
 * @param {Object} [exercise] - Exercise object if editing, null if creating
 * @param {Object} [options]
 */
export function showEditExerciseModal(exercise = null, options = {}) {
	const isEdit = Boolean(exercise && exercise.id);
	const onSaved = options.onUpdated || options.onCreated || (() => {});

	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'modal modal-window modal-create-exercise';

	const currentPri = isEdit
		? new Set(exercise.primary_muscles || inferMusclesForExercise(exercise).primary || [])
		: new Set();
	const currentSec = isEdit
		? new Set(exercise.secondary_muscles || inferMusclesForExercise(exercise).secondary || [])
		: new Set();

	const currentMediaUrl = isEdit ? (exercise.media_url || (exercise.media_assets?.[0]?.url || '')) : '';

	modal.innerHTML = `
		<div class="modal-header">
			<h3 class="modal-title">${isEdit ? '✏️ Edit Custom Exercise' : '➕ Create Custom Exercise'}</h3>
			<button class="modal-close-btn" title="Close">✕</button>
		</div>

		<div class="modal-body">
			<div class="modal-exercise-split-layout">
				<div class="exercise-form-fields">
					<div class="field-group">
						<label>Exercise Name</label>
						<input type="text" id="create-ex-name" class="input clean-input" placeholder="e.g., Muay Thai Switch Kick, Diamond Push-ups..." value="${isEdit ? escapeHtml(exercise.name || '') : ''}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
					</div>

					<div class="field-row">
						<div class="field-group">
							<label>Category</label>
							<select id="create-ex-category" class="input">
								${getCategoryOptionsHtml(isEdit ? exercise.category : 'strength')}
							</select>
						</div>

						<div class="field-group">
							<label>Discipline</label>
							<select id="create-ex-discipline" class="input">
								${getDisciplineOptionsHtml(isEdit ? exercise.discipline : 'general')}
							</select>
						</div>
					</div>

					<div class="field-row">
						<div class="field-group">
							<label>Default Execution Mode</label>
							<select id="create-ex-mode" class="input">
								<option value="reps" ${isEdit && exercise.default_mode === 'reps' ? 'selected' : ''}>🔢 Target Reps</option>
								<option value="time" ${isEdit && exercise.default_mode === 'time' ? 'selected' : ''}>⏱️ Timed Interval</option>
							</select>
						</div>

						<div class="field-group">
							<label>Default Quantity (reps or sec)</label>
							<input type="number" id="create-ex-quantity" class="input clean-input" min="1" value="${isEdit ? (exercise.default_quantity || 20) : 20}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
						</div>
					</div>

					<!-- Targeted Anatomy Badges Tray -->
					<div class="selected-badges-tray">
						<div class="badge-group-row">
							<span class="badge-group-label label-pri">🔴 Primary Target Muscles</span>
							<div class="badges-pill-wrap" id="create-ex-primary-muscles"></div>
						</div>
						<div class="badge-group-row">
							<span class="badge-group-label label-sec">🟡 Secondary Synergist Muscles</span>
							<div class="badges-pill-wrap" id="create-ex-secondary-muscles"></div>
						</div>
					</div>

					<div class="field-group">
						<label>Description & Technical Cues</label>
						<textarea id="create-ex-desc" class="input clean-input" rows="4" placeholder="Key form cues, tempo, or setup instructions..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">${isEdit ? escapeHtml(exercise.description || '') : ''}</textarea>
					</div>

					<div class="field-group">
						<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
							<label style="margin-bottom:0;">Exercise Visual / Media (YouTube Link, Photo, or Screenshot)</label>
							${isEdit && currentMediaUrl ? '<button type="button" id="btn-clear-ex-media" class="btn btn-ghost btn-xs" style="color:var(--text-danger,#ef4444);padding:1px 6px;">✕ Clear Video/Media</button>' : ''}
						</div>
						<div class="media-input-with-upload">
							<input type="text" id="create-ex-media" class="input clean-input" placeholder="YouTube URL, image link, or upload/paste screenshot..." value="${escapeHtml(currentMediaUrl)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
							<input type="file" id="create-ex-file-input" accept="image/*" class="hidden-file-input">
							<button type="button" id="btn-browse-ex-photo" class="btn btn-ghost btn-sm" title="Upload local image / screenshot">📷 Upload</button>
						</div>
						<div id="create-ex-upload-preview" class="create-upload-preview ${currentMediaUrl && !currentMediaUrl.includes('youtube') && !currentMediaUrl.includes('youtu.be') ? '' : 'hidden'}">
							<img id="create-ex-preview-img" src="${escapeHtml(currentMediaUrl || '')}" onerror="this.parentElement.classList.add('hidden')">
							<span class="preview-hint">Image / Screenshot Preview</span>
						</div>
						<div id="create-ex-video-slicer-container" style="margin-top:12px;"></div>
					</div>
				</div>

				<!-- Anatomy Side Panel -->
				<div class="exercise-anatomy-panel">
					<div class="anatomy-controls-row">
						<span class="anatomy-panel-title">🧬 Tap Muscle:</span>
						<div class="picker-mode-switch" id="ex-anatomy-mode-switch">
							<button type="button" class="picker-mode-btn active mode-pri" data-mode="primary" title="Tap body to select Primary Target">🔴 Primary</button>
							<button type="button" class="picker-mode-btn mode-sec" data-mode="secondary" title="Tap body to select Secondary Synergist">🟡 Secondary</button>
						</div>
					</div>

					<div class="modal-mini-body-stage">
						<div class="modal-mini-body-view">
							<span class="modal-mini-body-tag">Front (Anterior)</span>
							${getFrontBodySvg()}
						</div>
						<div class="modal-mini-body-view">
							<span class="modal-mini-body-tag">Back (Posterior)</span>
							${getBackBodySvg()}
						</div>
					</div>

					<div class="muscle-hover-info" id="ex-anatomy-hover-info">Hover or tap any muscle on the model</div>
				</div>
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-ghost modal-btn-cancel">Cancel</button>
			<button id="btn-submit-create-ex" class="btn btn-primary">${isEdit ? '✓ Save Changes' : 'Create Exercise'}</button>
		</div>
	`;

	const close = () => {
		document.removeEventListener('paste', handleEditPaste);
		backdrop.remove();
	};

	modal.querySelectorAll('.modal-close-btn, .modal-btn-cancel').forEach(b => {
		b.addEventListener('click', close);
	});

	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	const mediaInput = modal.querySelector('#create-ex-media');
	const fileInput = modal.querySelector('#create-ex-file-input');
	const browseBtn = modal.querySelector('#btn-browse-ex-photo');
	const previewBox = modal.querySelector('#create-ex-upload-preview');
	const previewImg = modal.querySelector('#create-ex-preview-img');

	async function handleEditUploadedFile(file) {
		if (!file || !file.type.startsWith('image/')) {
			await showAlert({ title: 'Invalid File', message: 'Please select an image file.' });
			return;
		}
		try {
			const uploaded = await uploadImageFile(file);
			mediaInput.value = uploaded.url;
			if (previewImg) previewImg.src = uploaded.url;
			if (previewBox) previewBox.classList.remove('hidden');
			showToast('📷 Photo uploaded successfully!');
		} catch (err) {
			await showAlert({ title: 'Upload Failed', message: err.message });
		}
	}

	if (browseBtn && fileInput) {
		browseBtn.addEventListener('click', () => fileInput.click());
		fileInput.addEventListener('change', (e) => {
			const file = e.target.files?.[0];
			if (file) handleEditUploadedFile(file);
		});
	}

	const handleEditPaste = (e) => {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (let i = 0; i < items.length; i++) {
			if (items[i].type.startsWith('image/')) {
				const file = items[i].getAsFile();
				if (file) {
					e.preventDefault();
					handleEditUploadedFile(file);
					break;
				}
			}
		}
	};
	document.addEventListener('paste', handleEditPaste);

	const slicerContainer = modal.querySelector('#create-ex-video-slicer-container');
	const nameInput = modal.querySelector('#create-ex-name');
	const exerciseSlicer = createModernVideoSlicerDrawer({
		container: slicerContainer,
		urlInput: mediaInput,
		initialUrl: currentMediaUrl,
		initialAssets: isEdit && Array.isArray(exercise.media_assets) ? exercise.media_assets : [],
		titleInput: nameInput,
	});

	mediaInput.addEventListener('input', () => {
		exerciseSlicer.syncWithUrl(mediaInput.value.trim());
	});

	const clearMediaBtn = modal.querySelector('#btn-clear-ex-media');
	if (clearMediaBtn) {
		clearMediaBtn.addEventListener('click', () => {
			mediaInput.value = '';
			if (previewBox) previewBox.classList.add('hidden');
			clearMediaBtn.style.display = 'none';
			exerciseSlicer.syncWithUrl('');
		});
	}

	const priContainer = modal.querySelector('#create-ex-primary-muscles');
	const secContainer = modal.querySelector('#create-ex-secondary-muscles');

	const selectedPrimary = new Set(currentPri);
	const selectedSecondary = new Set(currentSec);
	let activePickerMode = 'primary'; // 'primary' | 'secondary'

	const modeSwitch = modal.querySelector('#ex-anatomy-mode-switch');
	const modeBtns = modeSwitch ? modeSwitch.querySelectorAll('.picker-mode-btn') : [];
	modeBtns.forEach(btn => {
		btn.addEventListener('click', () => {
			modeBtns.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			activePickerMode = btn.dataset.mode;
		});
	});

	const hoverInfo = modal.querySelector('#ex-anatomy-hover-info');
	const allModalPaths = modal.querySelectorAll('.exercise-anatomy-panel .muscle-group-path');

	function syncAnatomyState() {
		// 1. Highlight SVG paths
		allModalPaths.forEach(p => {
			const m = p.getAttribute('data-muscle');
			p.classList.toggle('muscle-primary', selectedPrimary.has(m));
			p.classList.toggle('muscle-secondary', selectedSecondary.has(m));
		});

		// 2. Render badges
		renderBadges();
	}

	function renderBadges() {
		priContainer.innerHTML = '';
		secContainer.innerHTML = '';

		if (selectedPrimary.size === 0) {
			priContainer.innerHTML = '<span class="empty-badge-hint">None selected (tap body to pick)</span>';
		} else {
			selectedPrimary.forEach(m => {
				const def = MUSCLE_DEFINITIONS[m] || { label: m, icon: '💪' };
				const pill = document.createElement('span');
				pill.className = 'target-pill pri-pill';
				pill.innerHTML = `<span>${def.icon} ${escapeHtml(def.label)}</span> <button type="button" class="btn-pill-remove" title="Remove">✕</button>`;
				pill.querySelector('.btn-pill-remove').addEventListener('click', () => {
					selectedPrimary.delete(m);
					syncAnatomyState();
				});
				priContainer.appendChild(pill);
			});
		}

		if (selectedSecondary.size === 0) {
			secContainer.innerHTML = '<span class="empty-badge-hint">None selected (optional)</span>';
		} else {
			selectedSecondary.forEach(m => {
				const def = MUSCLE_DEFINITIONS[m] || { label: m, icon: '💪' };
				const pill = document.createElement('span');
				pill.className = 'target-pill sec-pill';
				pill.innerHTML = `<span>${def.icon} ${escapeHtml(def.label)}</span> <button type="button" class="btn-pill-remove" title="Remove">✕</button>`;
				pill.querySelector('.btn-pill-remove').addEventListener('click', () => {
					selectedSecondary.delete(m);
					syncAnatomyState();
				});
				secContainer.appendChild(pill);
			});
		}
	}

	allModalPaths.forEach(path => {
		const muscleId = path.getAttribute('data-muscle');
		const def = MUSCLE_DEFINITIONS[muscleId];

		path.addEventListener('mouseenter', () => {
			if (hoverInfo && def) {
				const regionStr = (def.region || '').toUpperCase();
				hoverInfo.textContent = `${def.icon} ${def.label}${regionStr ? ' (' + regionStr + ')' : ''}`;
			}
		});

		path.addEventListener('mouseleave', () => {
			if (hoverInfo) hoverInfo.textContent = 'Hover or tap any muscle on the model';
		});

		path.addEventListener('click', (e) => {
			e.stopPropagation();
			if (!muscleId) return;

			if (activePickerMode === 'primary') {
				if (selectedPrimary.has(muscleId)) {
					selectedPrimary.delete(muscleId);
				} else {
					selectedPrimary.add(muscleId);
					selectedSecondary.delete(muscleId);
				}
			} else {
				if (selectedSecondary.has(muscleId)) {
					selectedSecondary.delete(muscleId);
				} else {
					selectedSecondary.add(muscleId);
					selectedPrimary.delete(muscleId);
				}
			}
			syncAnatomyState();
		});
	});

	syncAnatomyState();

	const submitBtn = modal.querySelector('#btn-submit-create-ex');
	submitBtn.addEventListener('click', async () => {
		const name = modal.querySelector('#create-ex-name').value.trim();
		const category = modal.querySelector('#create-ex-category').value;
		const discipline = modal.querySelector('#create-ex-discipline').value;
		const default_mode = modal.querySelector('#create-ex-mode').value;
		const default_quantity = parseInt(modal.querySelector('#create-ex-quantity').value, 10) || 20;
		const description = modal.querySelector('#create-ex-desc').value.trim();
		const media_url = modal.querySelector('#create-ex-media').value.trim();
		const primary_muscles = Array.from(selectedPrimary);
		const secondary_muscles = Array.from(selectedSecondary);

		if (!name) {
			await showAlert({ title: 'Missing Name', message: 'Please provide a name for the exercise.' });
			return;
		}

		const slicerState = exerciseSlicer.getState();

		let media_assets = isEdit ? (Array.isArray(exercise.media_assets) ? [...exercise.media_assets] : []) : [];
		if (!media_url) {
			if (isEdit && currentMediaUrl && media_assets.length > 0) {
				media_assets = media_assets.filter(a => a.url !== currentMediaUrl);
				if (media_assets.length > 0) {
					media_url = media_assets[0].url || '';
				}
			} else {
				media_assets = [];
			}
		} else {
			const isYt = media_url.includes('youtube') || media_url.includes('youtu.be');
			const vid = isYt ? parseYouTubeId(media_url) : null;
			if (isYt && vid) {
				const primaryStart = slicerState.isFullVideo ? 0 : slicerState.primaryStart;
				const primaryEnd = slicerState.isFullVideo ? undefined : slicerState.primaryEnd;
				const primaryTitle = slicerState.intervals[0]?.name || `${name} Video`;

				const primaryAsset = {
					id: `asset-${Date.now()}-1`,
					kind: 'demonstration',
					type: 'video',
					title: primaryTitle,
					url: media_url,
					videoId: vid || undefined,
					startSeconds: primaryStart,
					endSeconds: primaryEnd,
				};

				media_assets = [primaryAsset];

				// If additional interval windows were added via [+] button, attach them as extra video variations!
				if (!slicerState.isFullVideo && slicerState.intervals.length > 1) {
					slicerState.intervals.slice(1).forEach((inv, idx) => {
						media_assets.push({
							id: `asset-${Date.now()}-${idx + 2}`,
							kind: 'drill',
							type: 'video',
							title: inv.name || `${name} Variation ${idx + 2}`,
							url: media_url,
							videoId: vid || undefined,
							startSeconds: inv.start,
							endSeconds: inv.end,
						});
					});
				}
			} else if (media_url !== currentMediaUrl) {
				const newAsset = {
					id: `asset-${Date.now()}`,
					kind: 'animation',
					type: 'image',
					title: `${name} Visual`,
					url: media_url,
				};
				if (isEdit && currentMediaUrl && media_assets.length > 0) {
					const existingIdx = media_assets.findIndex(a => a.url === currentMediaUrl);
					if (existingIdx >= 0) {
						media_assets[existingIdx] = newAsset;
					} else {
						media_assets.unshift(newAsset);
					}
				} else {
					media_assets = [newAsset];
				}
			}
		}

		try {
			const payload = {
				name,
				category,
				discipline,
				default_mode,
				default_quantity,
				description,
				media_url,
				media_assets,
				primary_muscles,
				secondary_muscles,
			};
			if (isEdit) {
				payload.id = exercise.id;
			}
			const saved = await createCustomExercise(payload);
			close();
			onSaved(saved);
			showToast(isEdit ? `Saved changes to "${name}".` : `Created "${name}"!`);
		} catch (err) {
			await showAlert({ title: 'Error', message: `Could not save exercise: ${err.message}` });
		}
	});

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);
}

/**
 * Show modal to create a new custom exercise.
 * @param {Object} [options]
 */
export function showCreateExerciseModal(options = {}) {
	showEditExerciseModal(null, options);
}
