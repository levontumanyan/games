import { formatTime, formatFriendlyDuration, escapeHtml } from './utils.js';
import { isBreakStep, resolveStepMediaUrl } from './editor.js';
import { getClipIcon, getTimerIcon, getBreakIcon, getStepsIcon, getShareIcon, getSaveIcon } from './icons.js';
import { getCategoryBadgeHtml, getDisciplineBadgeHtml, inferMusclesForExercise, getMuscleBadgeHtml, getExerciseById, getExercises } from './exercises.js';
import { getFlowTypeBadgeHtml } from './combos.js';
import { MUSCLE_DEFINITIONS } from './body_map.js';

/**
 * Helper to resolve an exercise definition for a step.
 * @param {Object} step
 * @returns {Object|null}
 */
export function resolveExerciseForStep(step) {
	if (!step) return null;
	if (Array.isArray(step.exercises) && step.exercises.length === 1) {
		const ex = step.exercises[0];
		return (ex.id ? getExerciseById(ex.id) : null) || ex;
	}
	if (step.exercise_id) {
		return getExerciseById(step.exercise_id);
	}
	if (step.label) {
		const name = String(step.label).trim().toLowerCase();
		const match = getExercises().find(e => e.name.toLowerCase() === name || String(e.id).toLowerCase() === name);
		if (match) return match;
	}
	return null;
}

/**
 * Render the read-only routine overview.
 * @param {Object} routine - The routine to render
 * @param {HTMLElement} container - The container element
 * @param {Object} actions - Action callbacks: { onEdit, onPlay, onPlayStep, onShare, onSaveToLibrary, isShared, onGoToExercise, onOpenAnatomy }
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
	const repsCount = steps.filter(s => s.stepMode === 'reps' || s.targetReps).length;
	const timerCount = steps.filter(s => s.type === 'timer' && !isBreakStep(s) && s.stepMode !== 'reps' && !s.targetReps).length;
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
	];

	if (repsCount > 0) {
		stats.push({ label: `${repsCount} Rep Sets`, icon: '🔢' });
	}
	if (timerCount > 0) {
		stats.push({ label: `${timerCount} Timers`, icon: getTimerIcon(14) });
	}
	if (breakCount > 0) {
		stats.push({ label: `${breakCount} Breaks`, icon: getBreakIcon(14) });
	}
	if (routine.musicTracks && routine.musicTracks.length > 0) {
		stats.push({ label: `${routine.musicTracks.length} Music Tracks`, icon: '🎵' });
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
	shareBtn.className = 'btn btn-ghost btn-share-action';
	shareBtn.innerHTML = `${getShareIcon(15)} Share`;
	shareBtn.title = 'Copy Shareable Link';
	shareBtn.addEventListener('click', async () => {
		if (actions.onShare) {
			const success = await actions.onShare();
			if (success !== false) {
				const originalHtml = shareBtn.innerHTML;
				shareBtn.innerHTML = `✓ Copied!`;
				shareBtn.classList.add('btn-share-success');
				setTimeout(() => {
					shareBtn.innerHTML = originalHtml;
					shareBtn.classList.remove('btn-share-success');
				}, 2500);
			}
		}
	});

	const editBtn = document.createElement('button');
	editBtn.className = 'btn btn-ghost';
	editBtn.innerHTML = '✏️ Edit';
	editBtn.addEventListener('click', () => actions.onEdit?.());

	const playBtn = document.createElement('button');
	playBtn.className = 'btn btn-primary btn-hero-play';
	playBtn.innerHTML = '▶ Start Workout';
	playBtn.disabled = steps.length === 0;
	playBtn.addEventListener('click', () => actions.onPlay?.(0, false));

	if (actions.isShared) {
		const headerSaveBtn = document.createElement('button');
		headerSaveBtn.className = 'btn btn-primary';
		headerSaveBtn.innerHTML = `${getSaveIcon(14)} Save to My Workouts`;
		headerSaveBtn.addEventListener('click', () => actions.onSaveToLibrary?.());

		actionsGroup.append(shareBtn, headerSaveBtn, playBtn);
	} else {
		actionsGroup.append(shareBtn, editBtn, playBtn);
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

	// ── Target Muscle Engagement Breakdown ──────────────────────────────────
	const muscleCounts = {};
	const regionCounts = { upper: 0, core: 0, lower: 0 };
	let totalMuscleHits = 0;

	steps.forEach(s => {
		if (isBreakStep(s)) return;
		// Resolve exercise object or infer from label
		const linkedEx = (s.exercises && s.exercises[0]) || (s.exercise_id ? getExerciseById(s.exercise_id) : null);
		const muscles = inferMusclesForExercise(linkedEx || { name: s.label, description: s.description });

		(muscles.primary || []).forEach(m => {
			muscleCounts[m] = (muscleCounts[m] || 0) + 2;
			totalMuscleHits += 2;
			const def = MUSCLE_DEFINITIONS[m];
			if (def && def.region && regionCounts[def.region] !== undefined) {
				regionCounts[def.region] += 2;
			}
		});

		(muscles.secondary || []).forEach(m => {
			muscleCounts[m] = (muscleCounts[m] || 0) + 1;
			totalMuscleHits += 1;
			const def = MUSCLE_DEFINITIONS[m];
			if (def && def.region && regionCounts[def.region] !== undefined) {
				regionCounts[def.region] += 1;
			}
		});
	});

	if (totalMuscleHits > 0) {
		const sortedMuscles = Object.entries(muscleCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);

		const upperPct = Math.round((regionCounts.upper / totalMuscleHits) * 100);
		const corePct = Math.round((regionCounts.core / totalMuscleHits) * 100);
		const lowerPct = Math.round((regionCounts.lower / totalMuscleHits) * 100);

		const muscleCard = document.createElement('div');
		muscleCard.className = 'view-muscle-breakdown-card';
		muscleCard.innerHTML = `
			<div class="muscle-breakdown-header">
				<div class="muscle-breakdown-title">
					<span class="breakdown-icon">🧬</span>
					<h4>Muscle Engagement & Anatomy</h4>
				</div>
				<div class="muscle-region-distribution">
					<span class="region-pill reg-upper" title="Upper Body Load">Upper ${upperPct}%</span>
					<span class="region-pill reg-core" title="Core & Abs Load">Core ${corePct}%</span>
					<span class="region-pill reg-lower" title="Lower Body Load">Lower ${lowerPct}%</span>
				</div>
			</div>

			<div class="muscle-breakdown-bar-track">
				<div class="muscle-bar-seg seg-upper" style="width: ${upperPct}%" title="Upper Body: ${upperPct}%"></div>
				<div class="muscle-bar-seg seg-core" style="width: ${corePct}%" title="Core: ${corePct}%"></div>
				<div class="muscle-bar-seg seg-lower" style="width: ${lowerPct}%" title="Lower Body: ${lowerPct}%"></div>
			</div>

			<div class="muscle-top-tags">
				<span class="top-tags-label">Primary Activations:</span>
				${sortedMuscles.map(([mId, count]) => {
					const def = MUSCLE_DEFINITIONS[mId];
					if (!def) return '';
					return `<button type="button" class="muscle-tag-chip clickable-muscle-chip" data-muscle="${mId}" style="--chip-color:${def.color}" title="View ${def.label} in Anatomy Map">
						<span>${def.icon}</span> <span>${def.label}</span>
					</button>`;
				}).join('')}
			</div>
		`;

		muscleCard.querySelectorAll('.clickable-muscle-chip').forEach(chip => {
			chip.addEventListener('click', () => {
				const m = chip.getAttribute('data-muscle');
				if (m) actions.onOpenAnatomy?.(m);
			});
		});

		container.appendChild(muscleCard);
	}

	// ── Workout Background Music Summary ─────────────────────────────────────
	if (routine.musicTracks && routine.musicTracks.length > 0) {
		const musicCard = document.createElement('div');
		musicCard.className = 'view-music-summary-card';
		musicCard.innerHTML = `
			<div class="view-music-summary-header">
				<span class="view-music-title">🎵 Background Music Playlist (${routine.musicTracks.length} tracks)</span>
				<span class="view-music-subtext">Plays during timer & rest steps</span>
			</div>
			<div class="view-music-list">
				${routine.musicTracks.map(t => `
					<div class="view-music-chip">
						<span class="track-source-badge">${t.source === 'youtube' ? '▶ YT' : '📁 File'}</span>
						<span class="track-chip-label">${escapeHtml(t.label || (t.source === 'youtube' ? t.videoId : t.fileName))}</span>
					</div>
				`).join('')}
			</div>
		`;
		container.appendChild(musicCard);
	}

	// ── Steps Feed ───────────────────────────────────────────────────────────
	const feed = document.createElement('div');
	feed.className = 'view-steps-feed';

	steps.forEach((step, index) => {
		const card = createViewStepCard(step, index, steps, actions);
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
		bottomPlayBtn.addEventListener('click', () => actions.onPlay?.(0, false));

		bottomBar.appendChild(bottomPlayBtn);
		container.appendChild(bottomBar);
	}
}

/**
 * Create a single step preview card for View Mode.
 */
function createViewStepCard(step, index, steps, actions) {
	if (isBreakStep(step)) {
		const card = document.createElement('div');
		card.className = 'view-step-card view-step-break';
		card.title = `Click to test this step in Preview Mode (Stats Disabled)`;

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
		playAction.innerHTML = '🔍';
		playAction.title = `Preview Step ${index + 1}`;

		card.append(indexBadge, iconBox, details, playAction);

		// Single row click triggers Preview Mode so it does not count towards stats
		card.addEventListener('click', () => {
			if (actions.onPlayStep) {
				actions.onPlayStep(index);
			} else {
				actions.onPlay?.(index, true);
			}
		});

		return card;
	}

	const isCombo = Boolean((step.exercises && step.exercises.length >= 2) || step.flow_type);
	const card = document.createElement('div');
	card.className = `view-step-card view-step-${step.type}` + (isCombo ? ' view-step-combo-card' : '');
	card.title = `Click to test this step in Preview Mode (Stats Disabled)`;

	// Step index badge
	const indexBadge = document.createElement('div');
	indexBadge.className = 'view-step-index';
	indexBadge.textContent = `#${index + 1}`;

	// Media Preview Thumbnail or Timer Icon
	const mediaBox = document.createElement('div');
	mediaBox.className = 'view-step-media';

	const mediaUrl = resolveStepMediaUrl(step);
	const isReps = step.stepMode === 'reps' || (step.targetReps && step.targetReps > 0);

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
	} else if (mediaUrl) {
		const img = document.createElement('img');
		img.src = mediaUrl;
		img.alt = step.label || 'Animation';
		img.loading = 'lazy';
		img.className = 'view-media-thumb';
		img.onerror = () => {
			img.style.display = 'none';
			mediaBox.innerHTML = `
				<div class="timer-visual-box">
					<span class="timer-icon">${isReps ? '🔢' : getTimerIcon(24)}</span>
					<span class="timer-badge-sec">${isReps ? `${step.targetReps || 20}r` : formatTime(step.durationSeconds || 30)}</span>
				</div>
			`;
		};
		mediaBox.appendChild(img);

		const playOverlay = document.createElement('div');
		playOverlay.className = 'thumbnail-play-overlay';
		playOverlay.innerHTML = '▶';
		mediaBox.appendChild(playOverlay);
	} else {
		// Timer / Reps visual box
		mediaBox.innerHTML = `
			<div class="timer-visual-box ${isReps ? 'timer-visual-reps' : ''}">
				<span class="timer-icon">${isReps ? '🔢' : getTimerIcon(24)}</span>
				<span class="timer-badge-sec">${isReps ? `${step.targetReps || 20} reps` : formatTime(step.durationSeconds || 30)}</span>
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
	} else if (isReps) {
		const repsTag = document.createElement('span');
		repsTag.className = 'view-tag view-tag-reps';
		repsTag.innerHTML = `🔢 ${step.targetReps || 20} Reps Total`;
		tagsRow.appendChild(repsTag);

		if (mediaUrl) {
			const animTag = document.createElement('span');
			animTag.className = 'view-tag view-tag-anim';
			animTag.textContent = '✨ Animation';
			tagsRow.appendChild(animTag);
		}

		if (step.musicTracks && step.musicTracks.length > 0) {
			const musicTag = document.createElement('span');
			musicTag.className = 'view-tag view-tag-music';
			musicTag.textContent = `🎵 ${step.musicTracks[0].label || 'Music'}`;
			tagsRow.appendChild(musicTag);
		}
	} else {
		const dur = step.durationSeconds || 30;

		const typeTag = document.createElement('span');
		typeTag.className = 'view-tag view-tag-timer';
		typeTag.innerHTML = `${getTimerIcon(11)} Timer`;

		const durationTag = document.createElement('span');
		durationTag.className = 'view-tag view-tag-time';
		durationTag.innerHTML = `${getTimerIcon(11)} ${formatFriendlyDuration(dur)}`;

		tagsRow.append(typeTag, durationTag);

		if (mediaUrl) {
			const animTag = document.createElement('span');
			animTag.className = 'view-tag view-tag-anim';
			animTag.textContent = '✨ Animation';
			tagsRow.appendChild(animTag);
		}

		if (step.musicTracks && step.musicTracks.length > 0) {
			const musicTag = document.createElement('span');
			musicTag.className = 'view-tag view-tag-music';
			musicTag.textContent = `🎵 ${step.musicTracks[0].label || 'Music'}`;
			tagsRow.appendChild(musicTag);
		}
	}

	// Attached exercise tags & muscle badges
	const linkedEx = resolveExerciseForStep(step);
	const stepMuscles = inferMusclesForExercise(linkedEx || { name: step.label, description: step.description });
	const isCompound = Boolean(step.exercises && step.exercises.length >= 2);

	if (step.flow_type || isCompound) {
		const flowTag = document.createElement('span');
		flowTag.className = 'view-tag view-tag-flow-pill';
		flowTag.innerHTML = getFlowTypeBadgeHtml(step.flow_type || 'alternating');
		tagsRow.appendChild(flowTag);
	}

	// For single exercises, render the clickable pill badge
	if (linkedEx && !isCompound) {
		const exTag = document.createElement('button');
		exTag.type = 'button';
		exTag.className = 'view-tag view-tag-exercise-pill view-clickable-pill';
		exTag.title = `View "${linkedEx.name}" movement guide & videos`;
		exTag.innerHTML = `${getCategoryBadgeHtml(linkedEx.category)} <span class="ex-pill-name">${escapeHtml(linkedEx.name)}</span> <span class="view-pill-arrow">↗</span>`;
		exTag.addEventListener('click', (e) => {
			e.stopPropagation();
			actions.onGoToExercise?.(linkedEx);
		});
		tagsRow.appendChild(exTag);
	}

	(stepMuscles.primary || []).slice(0, 2).forEach(m => {
		const mDef = MUSCLE_DEFINITIONS[m];
		if (mDef) {
			const mTag = document.createElement('span');
			mTag.className = 'view-tag view-tag-muscle-pill';
			mTag.innerHTML = `${mDef.icon} ${mDef.label}`;
			tagsRow.appendChild(mTag);
		}
	});

	details.append(title, tagsRow);

	// If this is a compound combo step with 2+ constituent movements, render the nested sequence deck
	if (isCompound) {
		const nestedDeck = document.createElement('div');
		nestedDeck.className = 'view-compound-nested-deck';
		step.exercises.forEach((ex, sIdx) => {
			const subRow = document.createElement('div');
			subRow.className = 'view-compound-sub-row view-clickable-sub-row';
			subRow.setAttribute('role', 'button');
			subRow.setAttribute('tabindex', '0');
			subRow.title = `Click to view "${ex.name}" exercise guide & videos`;

			const isSubReps = ex.stepMode === 'reps' || ex.default_mode === 'reps' || Boolean(ex.targetReps) || (!ex.durationSeconds && step.stepMode === 'reps');
			const subReps = ex.targetReps || ex.reps || (ex.default_mode === 'reps' ? ex.default_quantity : 10);
			const subDur = ex.durationSeconds || (ex.default_mode === 'time' ? ex.default_quantity : 30);
			const exTargetStr = isSubReps ? `${subReps} reps` : formatFriendlyDuration(subDur);

			const linkedSubEx = (ex.id ? getExerciseById(ex.id) : null) || ex;
			const subMuscles = inferMusclesForExercise(linkedSubEx);
			const priSubM = (subMuscles.primary || [])[0];
			const priDef = priSubM ? MUSCLE_DEFINITIONS[priSubM] : null;
			const muscleHtml = priDef ? `<span class="sub-row-muscle" style="color:${priDef.color}">${priDef.icon} ${priDef.label}</span>` : '';

			subRow.innerHTML = `
				<span class="sub-row-name">
					<span class="sub-row-num">${sIdx + 1}.</span>
					${getCategoryBadgeHtml(ex.category)}
					<span class="sub-row-title">${escapeHtml(ex.name)}</span>
				</span>
				<span class="sub-row-meta">
					${muscleHtml}
					<span class="sub-row-target">${exTargetStr}</span>
					<span class="sub-row-goto-icon" title="View Exercise">🥋 ↗</span>
				</span>
			`;

			const handleSubClick = (e) => {
				e.stopPropagation();
				actions.onGoToExercise?.(linkedSubEx);
			};

			subRow.addEventListener('click', handleSubClick);
			subRow.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					handleSubClick(e);
				}
			});

			nestedDeck.appendChild(subRow);
		});
		details.appendChild(nestedDeck);
	}

	// Actions column (View Exercise + Quick Preview)
	const actionsWrap = document.createElement('div');
	actionsWrap.className = 'view-step-card-actions';

	if (linkedEx) {
		const viewExBtn = document.createElement('button');
		viewExBtn.type = 'button';
		viewExBtn.className = 'view-step-ex-btn';
		viewExBtn.innerHTML = '🥋';
		viewExBtn.title = `View "${linkedEx.name}" movement guide & videos`;
		viewExBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			actions.onGoToExercise?.(linkedEx);
		});
		actionsWrap.appendChild(viewExBtn);
	}

	const playAction = document.createElement('button');
	playAction.type = 'button';
	playAction.className = 'view-step-play-btn';
	playAction.innerHTML = '🔍';
	playAction.title = `Preview Step ${index + 1} (Stats Disabled)`;

	actionsWrap.appendChild(playAction);
	card.append(indexBadge, mediaBox, details, actionsWrap);

	// Single row click triggers Preview Mode so it does not count towards stats
	card.addEventListener('click', () => {
		if (actions.onPlayStep) {
			actions.onPlayStep(index);
		} else {
			actions.onPlay?.(index, true);
		}
	});

	return card;
}
