import { formatTime, formatFriendlyDuration } from './utils.js';
import { isBreakStep } from './editor.js';
import { getClipIcon, getTimerIcon, getBreakIcon, getStepsIcon, getShareIcon, getSaveIcon } from './icons.js';

/**
 * Render the read-only routine overview.
 * @param {Object} routine - The routine to render
 * @param {HTMLElement} container - The container element
 * @param {Object} actions - Action callbacks: { onEdit, onPlay, onPlayStep, onShare, onSaveToLibrary, isShared }
 */
export function renderRoutineOverview(routine, container, actions = {}) {
	container.innerHTML = '';

	if (!routine) {
		container.innerHTML = '<p class="empty-message">Select or create a workout to get started.</p>';
		return;
	}

	// ── Shared Routine Banner ────────────────────────────────────────────────
	if (actions.isShared) {
		const banner = document.createElement('div');
		banner.className = 'shared-routine-banner';

		const bannerContent = document.createElement('div');
		bannerContent.className = 'shared-banner-content';
		bannerContent.innerHTML = `
			<span class="shared-banner-badge">✨ Shared Workout</span>
			<span class="shared-banner-subtext">You're viewing a shared workout routine. Play it now or save it to your library!</span>
		`;

		const saveLibBtn = document.createElement('button');
		saveLibBtn.className = 'btn btn-primary btn-sm btn-save-shared';
		saveLibBtn.innerHTML = `${getSaveIcon(14)} Save to My Workouts`;
		saveLibBtn.addEventListener('click', () => actions.onSaveToLibrary?.());

		banner.append(bannerContent, saveLibBtn);
		container.appendChild(banner);
	}

	const steps = routine.steps || [];
	const clipCount = steps.filter(s => s.type === 'clip').length;
	const breakCount = steps.filter(s => isBreakStep(s)).length;
	const timerCount = steps.filter(s => s.type === 'timer' && !isBreakStep(s)).length;
	const totalSeconds = steps.reduce((sum, s) => {
		if (s.type === 'timer') return sum + (s.durationSeconds || 0);
		if (s.type === 'clip') {
			const dur = (s.endSeconds || 0) - (s.startSeconds || 0);
			return sum + Math.max(0, dur);
		}
		return sum;
	}, 0);

	// ── Hero Header ──────────────────────────────────────────────────────────
	const header = document.createElement('div');
	header.className = 'view-hero-header';

	const titleInfo = document.createElement('div');
	titleInfo.className = 'view-title-info';

	const title = document.createElement('h2');
	title.className = 'view-routine-title';
	title.textContent = routine.title || 'Untitled Workout';

	const statsRow = document.createElement('div');
	statsRow.className = 'view-stats-row';

	const stats = [
		{ label: `${steps.length} Steps`, icon: getStepsIcon(14) },
		{ label: `~${formatTime(totalSeconds)}`, icon: getTimerIcon(14) },
		{ label: `${clipCount} Videos`, icon: getClipIcon(14) },
		{ label: `${timerCount} Timers`, icon: getTimerIcon(14) },
	];

	if (breakCount > 0) {
		stats.push({ label: `${breakCount} Breaks`, icon: getBreakIcon(14) });
	}

	stats.forEach(stat => {
		const pill = document.createElement('span');
		pill.className = 'view-stat-pill';
		pill.innerHTML = `${stat.icon} ${stat.label}`;
		statsRow.appendChild(pill);
	});

	titleInfo.append(title, statsRow);

	const actionsGroup = document.createElement('div');
	actionsGroup.className = 'view-actions-group';

	const shareBtn = document.createElement('button');
	shareBtn.className = 'btn btn-ghost';
	shareBtn.innerHTML = `${getShareIcon(15)} Share`;
	shareBtn.title = 'Share this Workout';
	shareBtn.addEventListener('click', () => actions.onShare?.());

	const editBtn = document.createElement('button');
	editBtn.className = 'btn btn-ghost';
	editBtn.innerHTML = '✏️ Edit';
	editBtn.addEventListener('click', () => actions.onEdit?.());

	const fullscreenBtn = document.createElement('button');
	fullscreenBtn.className = 'btn btn-ghost';
	fullscreenBtn.innerHTML = '⛶ Fullscreen';
	fullscreenBtn.title = 'Toggle Fullscreen (F)';
	fullscreenBtn.addEventListener('click', () => actions.onToggleFullscreen?.());

	const playBtn = document.createElement('button');
	playBtn.className = 'btn btn-primary btn-hero-play';
	playBtn.innerHTML = '▶ Start Workout';
	playBtn.disabled = steps.length === 0;
	playBtn.addEventListener('click', () => actions.onPlay?.(0));

	if (actions.isShared) {
		const headerSaveBtn = document.createElement('button');
		headerSaveBtn.className = 'btn btn-primary';
		headerSaveBtn.innerHTML = `${getSaveIcon(14)} Save to My Workouts`;
		headerSaveBtn.addEventListener('click', () => actions.onSaveToLibrary?.());

		actionsGroup.append(shareBtn, headerSaveBtn, fullscreenBtn, playBtn);
	} else {
		actionsGroup.append(shareBtn, editBtn, fullscreenBtn, playBtn);
	}

	header.append(titleInfo, actionsGroup);
	container.appendChild(header);


	// ── Empty State ──────────────────────────────────────────────────────────
	if (steps.length === 0) {
		const emptyBox = document.createElement('div');
		emptyBox.className = 'view-empty-card';
		emptyBox.innerHTML = `
			<div class="empty-icon">🏋️</div>
			<h3>This workout is empty</h3>
			<p>Add video clips or timer intervals to build your workout.</p>
		`;
		const addBtn = document.createElement('button');
		addBtn.className = 'btn btn-primary';
		addBtn.textContent = '✏️ Edit Workout & Add Steps';
		addBtn.addEventListener('click', () => actions.onEdit?.());
		emptyBox.appendChild(addBtn);
		container.appendChild(emptyBox);
		return;
	}

	// ── Steps Feed ───────────────────────────────────────────────────────────
	const feed = document.createElement('div');
	feed.className = 'view-steps-feed';

	steps.forEach((step, index) => {
		const card = createViewStepCard(step, index, actions);
		feed.appendChild(card);
	});

	container.appendChild(feed);

	// ── Bottom Play CTA ──────────────────────────────────────────────────────
	if (steps.length > 2) {
		const bottomBar = document.createElement('div');
		bottomBar.className = 'view-bottom-cta';

		const bottomPlayBtn = document.createElement('button');
		bottomPlayBtn.className = 'btn btn-primary btn-hero-play';
		bottomPlayBtn.innerHTML = '▶ Start Workout';
		bottomPlayBtn.addEventListener('click', () => actions.onPlay?.(0));

		bottomBar.appendChild(bottomPlayBtn);
		container.appendChild(bottomBar);
	}
}

/**
 * Create a single step preview card for View Mode.
 */
function createViewStepCard(step, index, actions) {
	if (isBreakStep(step)) {
		const card = document.createElement('div');
		card.className = 'view-step-card view-step-break';
		card.title = `Click to start workout from step #${index + 1}`;

		const indexBadge = document.createElement('div');
		indexBadge.className = 'view-step-index';
		indexBadge.textContent = `#${index + 1}`;

		const iconBox = document.createElement('div');
		iconBox.className = 'view-break-icon-box';
		iconBox.innerHTML = getBreakIcon(18);

		const details = document.createElement('div');
		details.className = 'view-step-details';

		const title = document.createElement('h4');
		title.className = 'view-step-title view-break-title';
		title.textContent = step.label || 'Rest';

		const tag = document.createElement('span');
		tag.className = 'view-tag view-tag-break';
		tag.innerHTML = `${getTimerIcon(11)} ${formatFriendlyDuration(step.durationSeconds || 30)}`;

		details.append(title, tag);

		const playAction = document.createElement('button');
		playAction.className = 'view-step-play-btn';
		playAction.innerHTML = '▶';
		playAction.title = `Start from Step ${index + 1}`;

		card.append(indexBadge, iconBox, details, playAction);

		card.addEventListener('click', () => {
			actions.onPlay?.(index);
		});

		return card;
	}

	const card = document.createElement('div');
	card.className = `view-step-card view-step-${step.type}`;
	card.title = `Click to start workout from step #${index + 1}`;

	// Step index badge
	const indexBadge = document.createElement('div');
	indexBadge.className = 'view-step-index';
	indexBadge.textContent = `#${index + 1}`;

	// Media Preview Thumbnail or Timer Icon
	const mediaBox = document.createElement('div');
	mediaBox.className = 'view-step-media';

	if (step.type === 'clip') {
		if (step.videoId) {
			const img = document.createElement('img');
			img.src = `https://img.youtube.com/vi/${step.videoId}/mqdefault.jpg`;
			img.alt = step.label || 'Video Clip';
			img.loading = 'lazy';
			img.onerror = () => {
				img.style.display = 'none';
				mediaBox.innerHTML = `<div class="media-fallback">${getClipIcon(26)}</div>`;
			};
			mediaBox.appendChild(img);

			const playOverlay = document.createElement('div');
			playOverlay.className = 'thumbnail-play-overlay';
			playOverlay.innerHTML = '▶';
			mediaBox.appendChild(playOverlay);
		} else {
			mediaBox.innerHTML = `<div class="media-fallback">${getClipIcon(26)}</div>`;
		}
	} else {
		// Timer visual box
		mediaBox.innerHTML = `
			<div class="timer-visual-box">
				<span class="timer-icon">${getTimerIcon(24)}</span>
				<span class="timer-badge-sec">${formatTime(step.durationSeconds || 30)}</span>
			</div>
		`;
	}

	// Step Meta Details
	const details = document.createElement('div');
	details.className = 'view-step-details';

	const title = document.createElement('h4');
	title.className = 'view-step-title';
	title.textContent = step.label || (step.type === 'clip' ? 'Video Clip' : 'Exercise Interval');

	const tagsRow = document.createElement('div');
	tagsRow.className = 'view-step-tags';

	if (step.type === 'clip') {
		const start = step.startSeconds || 0;
		const end = step.endSeconds || (start + 60);
		const dur = Math.max(0, end - start);

		const typeTag = document.createElement('span');
		typeTag.className = 'view-tag view-tag-clip';
		typeTag.innerHTML = `${getClipIcon(11)} Video`;

		const durationTag = document.createElement('span');
		durationTag.className = 'view-tag view-tag-time';
		durationTag.innerHTML = `${getTimerIcon(11)} ${formatFriendlyDuration(dur)} (${formatTime(start)} → ${formatTime(end)})`;

		tagsRow.append(typeTag, durationTag);
	} else {
		const dur = step.durationSeconds || 30;

		const typeTag = document.createElement('span');
		typeTag.className = 'view-tag view-tag-timer';
		typeTag.innerHTML = `${getTimerIcon(11)} Timer`;

		const durationTag = document.createElement('span');
		durationTag.className = 'view-tag view-tag-time';
		durationTag.innerHTML = `${getTimerIcon(11)} ${formatFriendlyDuration(dur)}`;

		tagsRow.append(typeTag, durationTag);

		if (step.musicTracks && step.musicTracks.length > 0) {
			const musicTag = document.createElement('span');
			musicTag.className = 'view-tag view-tag-music';
			musicTag.textContent = `🎵 ${step.musicTracks[0].label || 'Music'}`;
			tagsRow.appendChild(musicTag);
		}
	}

	details.append(title, tagsRow);

	// Quick Play Action Button
	const playAction = document.createElement('button');
	playAction.className = 'view-step-play-btn';
	playAction.innerHTML = '▶';
	playAction.title = `Start from Step ${index + 1}`;

	card.append(indexBadge, mediaBox, details, playAction);

	card.addEventListener('click', () => {
		actions.onPlay?.(index);
	});

	return card;
}
