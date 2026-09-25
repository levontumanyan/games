import { fetchStats, fetchSessions, deleteSession } from './storage.js';
import { formatTime, escapeHtml } from './utils.js';
import { showConfirm, showAlert } from './modal.js';
import {
	CATEGORIES, DISCIPLINES,
	getCategoryBadgeHtml, getDisciplineBadgeHtml
} from './taxonomy.js';
import {
	getFlameIcon, getTimerIcon, getRepsIcon, getTrophyIcon,
	getChartIcon, getCalendarIcon, getHistoryIcon, getTargetIcon,
	getDisciplineIcon, getCategoryIcon
} from './icons.js';

let cachedStats = null;

/**
 * Render the stats dashboard inside container.
 * @param {HTMLElement} container
 */
export async function renderStatsDashboard(container) {
	// SWR: If we have cached stats, render immediately without any loading spinner!
	if (cachedStats) {
		renderStatsContent(container, cachedStats);
		// Silently revalidate fresh stats in background
		fetchStats().then(freshStats => {
			cachedStats = freshStats;
			updateStatsMetrics(container, freshStats);
		}).catch(err => {
			console.warn('Background stats refresh failed:', err);
		});
		return;
	}

	container.innerHTML = `
		<div class="stats-loading">
			<div class="spinner"></div>
			<p>Loading your workout stats...</p>
		</div>
	`;

	try {
		const stats = await fetchStats();
		cachedStats = stats;
		renderStatsContent(container, stats);
	} catch (err) {
		console.error('Failed to load stats:', err);
		container.innerHTML = `
			<div class="stats-error">
				<p>⚠️ Could not load stats.</p>
				<button id="stats-retry-btn" class="btn btn-sm btn-primary">Retry</button>
			</div>
		`;
		const retryBtn = container.querySelector('#stats-retry-btn');
		if (retryBtn) {
			retryBtn.addEventListener('click', () => {
				cachedStats = null;
				renderStatsDashboard(container);
			});
		}
	}
}

/**
 * Render stats UI with data.
 * @param {HTMLElement} container
 * @param {Object} stats
 */
function renderStatsContent(container, stats) {
	const weeklyMinutes = (stats.weekly || []).reduce((sum, d) => sum + (d.minutes || 0), 0);
	const categories = stats.categories || {};
	const disciplines = stats.disciplines || {};
	const topExercises = stats.top_exercises || [];

	// Render HTML
	container.innerHTML = `
		<div class="stats-container">
			<div class="stats-header">
				<div>
					<h2 class="stats-title">Activity & Streaks</h2>
					<p class="stats-subtitle">Track your consistency, movements, and volume milestones</p>
				</div>
				<button id="stats-refresh-btn" class="btn btn-ghost btn-sm" title="Refresh stats">🔄 Refresh</button>
			</div>

			<!-- Hero Metric Cards -->
			<div class="stats-hero-grid" id="stats-hero-grid">
				${renderHeroGrid(stats)}
			</div>

			<!-- Visual Charts Grid -->
			<div class="stats-visual-grid">
				<!-- Weekly Bar Chart -->
				<div class="stats-section-card">
					<div class="section-card-header">
						<h3>${getChartIcon(18)} Weekly Activity</h3>
						<span id="weekly-total-meta" class="section-header-meta">${weeklyMinutes} mins total</span>
					</div>
					<div class="weekly-bar-chart" id="weekly-bar-chart">
						${renderWeeklyChart(stats.weekly)}
					</div>
				</div>

				<!-- Monthly Heatmap Calendar -->
				<div class="stats-section-card">
					<div class="section-card-header">
						<h3>${getCalendarIcon(18)} ${stats.monthly?.month_name || 'Monthly'} Calendar</h3>
						<span id="monthly-total-meta" class="section-header-meta">${stats.monthly?.total_minutes || 0} mins</span>
					</div>
					<div class="monthly-calendar-container" id="monthly-calendar-container">
						${renderMonthCalendar(stats.monthly)}
					</div>
				</div>
			</div>

			<!-- Personal Records & Milestone Achievements -->
			<div class="stats-visual-grid stats-pr-achievements-grid">
				<!-- Auto-Detected Rep PR Leaderboard -->
				<div class="stats-section-card">
					<div class="section-card-header">
						<h3>${getTrophyIcon(18)} Personal Records (PRs)</h3>
						<span class="section-header-meta">Movement Bests</span>
					</div>
					<div id="stats-pr-leaderboard-wrap">
						${renderRepLeaderboard(stats.rep_leaderboard || [])}
					</div>
				</div>

				<!-- Milestone Badges -->
				<div class="stats-section-card">
					<div class="section-card-header">
						<h3>${getTargetIcon(18)} Milestone Badges</h3>
						<span id="milestones-meta" class="section-header-meta">${(stats.milestones || []).filter(m => m.unlocked).length}/${(stats.milestones || []).length} Unlocked</span>
					</div>
					<div id="stats-milestones-wrap">
						${renderMilestonesGrid(stats.milestones || [])}
					</div>
				</div>
			</div>

			<!-- Movement Taxonomy & Discipline Split -->
			<div class="stats-visual-grid stats-taxonomy-grid">
				<!-- Categories Distribution -->
				<div class="stats-section-card">
					<div class="section-card-header">
						<h3>${getTargetIcon(18)} Movement Types</h3>
						<span class="section-header-meta">Categories</span>
					</div>
					<div class="stats-categories-list" id="stats-categories-list">
						${renderCategoriesList(categories)}
					</div>
				</div>

				<!-- Disciplines Split & Top Leaderboard -->
				<div class="stats-section-card">
					<div class="section-card-header">
						<h3>${getDisciplineIcon('muay_thai', 18)} Disciplines & Top Movements</h3>
						<span class="section-header-meta">Split</span>
					</div>
					<div class="stats-disciplines-list" id="stats-disciplines-list">
						${renderDisciplinesList(disciplines)}
					</div>
					<div id="stats-top-exercises-wrap">
						${renderTopExercises(topExercises)}
					</div>
				</div>
			</div>

			<!-- Recent Workout History Log -->
			<div class="stats-section-card session-history-card">
				<div class="section-card-header">
					<h3>${getHistoryIcon(18)} Workout History</h3>
					<span id="session-history-meta" class="section-header-meta">${(stats.recent_sessions || []).length} recent sessions</span>
				</div>
				<div id="session-history-list" class="session-history-list">
					${renderSessionList(stats.recent_sessions || [])}
				</div>
			</div>
		</div>
	`;

	// Bind events
	const refreshBtn = container.querySelector('#stats-refresh-btn');
	if (refreshBtn) {
		refreshBtn.addEventListener('click', async () => {
			refreshBtn.disabled = true;
			const originalText = refreshBtn.innerHTML;
			refreshBtn.innerHTML = '🔄 Refreshing...';
			try {
				const freshStats = await fetchStats();
				cachedStats = freshStats;
				updateStatsMetrics(container, freshStats);
			} catch (e) {
				console.error('Failed to refresh stats:', e);
			} finally {
				refreshBtn.innerHTML = originalText;
				refreshBtn.disabled = false;
			}
		});
	}

	bindHistoryActions(container);
}

/**
 * Render hero metric cards.
 * @param {Object} stats
 * @returns {string}
 */
function renderHeroGrid(stats) {
	const currentStreak = stats.current_streak || 0;
	const longestStreak = stats.longest_streak || 0;
	const totalMinutes = stats.total_minutes || 0;
	const totalSessions = stats.total_sessions || 0;
	const completedCount = stats.completed_count || 0;
	const totalReps = stats.total_reps || 0;
	const weeklyMinutes = (stats.weekly || []).reduce((sum, d) => sum + (d.minutes || 0), 0);
	const categories = stats.categories || {};

	return `
		<div class="stat-card streak-card ${currentStreak > 0 ? 'streak-active' : ''}">
			<div class="stat-card-icon">${getFlameIcon(22)}</div>
			<div class="stat-card-body">
				<div class="stat-value">${currentStreak} <span class="stat-unit">days</span></div>
				<div class="stat-label">Current Streak</div>
			</div>
			<div class="stat-footer-badge">Best: ${longestStreak} days</div>
		</div>

		<div class="stat-card">
			<div class="stat-card-icon">${getTimerIcon(22)}</div>
			<div class="stat-card-body">
				<div class="stat-value">${formatMinutesToReadable(totalMinutes)}</div>
				<div class="stat-label">Active Time</div>
			</div>
			<div class="stat-footer-badge">${weeklyMinutes}m this week</div>
		</div>

		<div class="stat-card">
			<div class="stat-card-icon">${getRepsIcon(22)}</div>
			<div class="stat-card-body">
				<div class="stat-value">${totalReps.toLocaleString()} <span class="stat-unit">reps</span></div>
				<div class="stat-label">Total Reps</div>
			</div>
			<div class="stat-footer-badge">${Object.keys(categories).length} movement types</div>
		</div>

		<div class="stat-card">
			<div class="stat-card-icon">${getTrophyIcon(22)}</div>
			<div class="stat-card-body">
				<div class="stat-value">${totalSessions}</div>
				<div class="stat-label">Workouts</div>
			</div>
			<div class="stat-footer-badge">${completedCount} completed</div>
		</div>
	`;
}

/**
 * Render weekly bar chart HTML.
 * @param {Array} weekly
 * @returns {string}
 */
function renderWeeklyChart(weekly) {
	const weeklyList = weekly || [];
	const maxDayMinutes = Math.max(...weeklyList.map(d => d.minutes || 0), 30);
	return weeklyList.map(d => {
		const heightPct = Math.min(100, Math.round((d.minutes / maxDayMinutes) * 100));
		return `
			<div class="bar-col ${d.isToday ? 'is-today' : ''} ${d.minutes > 0 ? 'has-activity' : ''}">
				<div class="bar-track">
					<div class="bar-fill" style="height: ${heightPct}%;" title="${d.day}: ${d.minutes} mins (${d.sessions} workouts)"></div>
				</div>
				<div class="bar-label">${d.day}</div>
				<div class="bar-val">${d.minutes > 0 ? d.minutes + 'm' : '—'}</div>
			</div>
		`;
	}).join('');
}

/**
 * Update metrics, charts, and taxonomy in-place without touching scroll or list.
 * @param {HTMLElement} container
 * @param {Object} stats
 */
function updateStatsMetrics(container, stats) {
	if (!stats || !container) return;
	const weeklyMinutes = (stats.weekly || []).reduce((sum, d) => sum + (d.minutes || 0), 0);

	const heroGrid = container.querySelector('#stats-hero-grid');
	if (heroGrid) heroGrid.innerHTML = renderHeroGrid(stats);

	const weeklyMeta = container.querySelector('#weekly-total-meta');
	if (weeklyMeta) weeklyMeta.textContent = `${weeklyMinutes} mins total`;

	const weeklyChart = container.querySelector('#weekly-bar-chart');
	if (weeklyChart) weeklyChart.innerHTML = renderWeeklyChart(stats.weekly);

	const monthlyMeta = container.querySelector('#monthly-total-meta');
	if (monthlyMeta) monthlyMeta.textContent = `${stats.monthly?.total_minutes || 0} mins`;

	const monthlyCalendar = container.querySelector('#monthly-calendar-container');
	if (monthlyCalendar) monthlyCalendar.innerHTML = renderMonthCalendar(stats.monthly);

	const catList = container.querySelector('#stats-categories-list');
	if (catList) catList.innerHTML = renderCategoriesList(stats.categories || {});

	const discList = container.querySelector('#stats-disciplines-list');
	if (discList) discList.innerHTML = renderDisciplinesList(stats.disciplines || {});

	const topExWrap = container.querySelector('#stats-top-exercises-wrap');
	if (topExWrap) topExWrap.innerHTML = renderTopExercises(stats.top_exercises || []);

	const prWrap = container.querySelector('#stats-pr-leaderboard-wrap');
	if (prWrap) prWrap.innerHTML = renderRepLeaderboard(stats.rep_leaderboard || []);

	const milestonesMeta = container.querySelector('#milestones-meta');
	if (milestonesMeta) {
		const unlockedCnt = (stats.milestones || []).filter(m => m.unlocked).length;
		milestonesMeta.textContent = `${unlockedCnt}/${(stats.milestones || []).length} Unlocked`;
	}

	const mileWrap = container.querySelector('#stats-milestones-wrap');
	if (mileWrap) mileWrap.innerHTML = renderMilestonesGrid(stats.milestones || []);

	const historyMeta = container.querySelector('#session-history-meta');
	if (historyMeta) {
		historyMeta.textContent = `${(stats.recent_sessions || []).length} recent sessions`;
	}

	const historyList = container.querySelector('#session-history-list');
	if (historyList) {
		historyList.innerHTML = renderSessionList(stats.recent_sessions || []);
		bindHistoryActions(container);
	}
}

/**
 * Render top exercises chips.
 * @param {Array} topExercises
 * @returns {string}
 */
function renderTopExercises(topExercises) {
	if (!topExercises || topExercises.length === 0) return '';
	return `
		<div class="stats-top-exercises-sub">
			<div class="sub-header">Top Movements</div>
			<div class="top-exercises-chips">
				${topExercises.slice(0, 6).map(ex => `
					<div class="top-ex-badge" title="${escapeHtml(ex.name)}: ${ex.count} sets${ex.reps > 0 ? ', ' + ex.reps + ' reps' : ''}">
						<span class="top-ex-name">${escapeHtml(ex.name)}</span>
						<span class="top-ex-count">${ex.reps > 0 ? ex.reps + 'r' : ex.count + ' sets'}</span>
					</div>
				`).join('')}
			</div>
		</div>
	`;
}

/**
 * Render category progress rows.
 */
function renderCategoriesList(categories) {
	const keys = Object.keys(categories);
	if (keys.length === 0) {
		return '<p class="text-muted empty-sub">No categorized exercises recorded yet.</p>';
	}

	const maxSets = Math.max(...keys.map(k => categories[k].sets || 0), 1);

	return keys.map(k => {
		const catInfo = CATEGORIES[k] || { label: k, icon: '💪', color: '#6366f1' };
		const data = categories[k];
		const sets = data.sets ?? data.count ?? 0;
		const reps = data.reps || 0;
		const pct = Math.min(100, Math.round((sets / maxSets) * 100));

		return `
			<div class="cat-stat-row">
				<div class="cat-stat-header">
					<span class="cat-stat-name"><span class="cat-icon">${getCategoryIcon(k, 14)}</span> ${catInfo.label}</span>
					<span class="cat-stat-nums"><strong>${sets}</strong> sets${reps > 0 ? ` · ${reps} reps` : ''}</span>
				</div>
				<div class="cat-stat-track">
					<div class="cat-stat-fill" style="width: ${pct}%; background: ${catInfo.color};"></div>
				</div>
			</div>
		`;
	}).join('');
}

/**
 * Render discipline progress tags.
 */
function renderDisciplinesList(disciplines) {
	const keys = Object.keys(disciplines);
	if (keys.length === 0) {
		return '<p class="text-muted empty-sub">Tag your steps with Muay Thai, Boxing, or Calisthenics to see your split.</p>';
	}

	return `
		<div class="discipline-chips-grid">
			${keys.map(k => {
				const discInfo = DISCIPLINES[k] || { label: k.replace('_', ' ').toUpperCase(), icon: '🏋️', color: '#9ea2bd' };
				const data = disciplines[k];
				const sets = data.sets ?? data.count ?? 0;
				const reps = data.reps || 0;

				return `
					<div class="disc-stat-card">
						<div class="disc-stat-icon">${getDisciplineIcon(k, 16)}</div>
						<div class="disc-stat-body">
							<div class="disc-stat-title">${discInfo.label}</div>
							<div class="disc-stat-val">${sets} sets${reps > 0 ? ` · ${reps}r` : ''}</div>
						</div>
					</div>
				`;
			}).join('')}
		</div>
	`;
}

/**
 * Render auto-detected rep-based PR leaderboard.
 * @param {Array} records
 * @returns {string}
 */
function renderRepLeaderboard(records) {
	if (!records || records.length === 0) {
		return `
			<div class="empty-sub" style="padding: 24px 16px; text-align: center;">
				<p style="font-weight: 600; margin-bottom: 4px;">No repetition movements logged yet.</p>
				<p style="font-size: 0.82rem; opacity: 0.7;">Complete reps-mode exercises to automatically establish your personal records!</p>
			</div>
		`;
	}

	const medals = ['🥇', '🥈', '🥉'];
	const defaultLimit = 5;
	const hasMore = records.length > defaultLimit;

	const renderCard = (rec, rank, hidden = false) => {
		const isPushup = /pushup|push-up/i.test(rec.name);
		const medal = medals[rank] || `#${rank + 1}`;

		return `
			<div class="pr-card ${isPushup ? 'pr-highlight' : ''} ${hidden ? 'pr-card-extra' : ''}" style="${hidden ? 'display: none;' : ''}">
				<div class="pr-card-main">
					<div class="pr-card-left">
						<span class="pr-medal-badge">${medal}</span>
						<div class="pr-title-group">
							<div class="pr-name-line">
								<span class="pr-movement-name">${escapeHtml(rec.name)}</span>
								<span class="pr-badge-tag">${escapeHtml(rec.category || 'strength')}</span>
							</div>
							<div class="pr-sub-details">
								${rec.total_reps.toLocaleString()} reps total · ${rec.sessions_count} workout${rec.sessions_count === 1 ? '' : 's'} · avg ${rec.avg_reps}r
							</div>
						</div>
					</div>
					<div class="pr-card-right">
						<div class="pr-val-badge">
							<span class="pr-val-num">${rec.max_session_reps}</span>
							<span class="pr-val-unit">reps PR</span>
						</div>
						${rec.max_session_date ? `<span class="pr-val-date">${rec.max_session_date}</span>` : ''}
					</div>
				</div>
			</div>
		`;
	};

	return `
		<div class="pr-leaderboard-grid">
			${records.map((rec, rank) => renderCard(rec, rank, rank >= defaultLimit)).join('')}
			${hasMore ? `
				<button class="pr-expand-btn" data-expanded="false" onclick="
					const isExp = this.dataset.expanded === 'true';
					const extras = this.closest('.pr-leaderboard-grid').querySelectorAll('.pr-card-extra');
					extras.forEach(el => el.style.display = isExp ? 'none' : '');
					this.dataset.expanded = isExp ? 'false' : 'true';
					this.innerHTML = isExp ? 'Show ${records.length - defaultLimit} more PRs ▾' : 'Show less ▴';
				">
					Show ${records.length - defaultLimit} more PRs ▾
				</button>
			` : ''}
		</div>
	`;
}

/**
 * Render milestone badges with earned achievements and active targets.
 * @param {Array} milestones
 * @returns {string}
 */
function renderMilestonesGrid(milestones) {
	if (!milestones || milestones.length === 0) {
		return '<p class="text-muted empty-sub">No milestones available.</p>';
	}

	const unlocked = milestones.filter(m => m.unlocked);
	const inProgress = milestones.filter(m => !m.unlocked);

	return `
		<div class="milestones-container">
			${inProgress.length > 0 ? `
				<div class="milestones-sub-section">
					<div class="milestones-sub-heading">🎯 In Progress</div>
					<div class="milestones-inprogress-grid">
						${inProgress.map(m => {
							const pct = m.progress_pct || 0;
							return `
								<div class="milestone-target-card tier-${m.tier || 'bronze'}">
									<div class="milestone-target-header">
										<span class="milestone-target-icon">${m.icon || '🎯'}</span>
										<div class="milestone-target-info">
											<div class="milestone-target-title">${escapeHtml(m.title)}</div>
											<div class="milestone-target-desc">${escapeHtml(m.desc)}</div>
										</div>
										<span class="milestone-tier-pill tier-${m.tier}">${m.tier.toUpperCase()}</span>
									</div>
									<div class="milestone-target-meter">
										<div class="meter-track">
											<div class="meter-fill" style="width: ${pct}%;"></div>
										</div>
										<div class="meter-labels">
											<span>${m.progress} / ${m.target}</span>
											<span class="meter-pct">${pct}%</span>
										</div>
									</div>
								</div>
							`;
						}).join('')}
					</div>
				</div>
			` : ''}

			${unlocked.length > 0 ? `
				<div class="milestones-sub-section">
					<div class="milestones-sub-heading">🏆 Earned Badges (${unlocked.length})</div>
					<div class="milestones-earned-chips">
						${unlocked.map(m => `
							<div class="earned-badge-chip tier-${m.tier}" title="${escapeHtml(m.desc)}">
								<span class="earned-badge-icon">${m.icon}</span>
								<div class="earned-badge-text">
									<span class="earned-badge-title">${escapeHtml(m.title)}</span>
									<span class="earned-badge-tier">${m.tier.toUpperCase()}</span>
								</div>
								<span class="earned-badge-check">✓</span>
							</div>
						`).join('')}
					</div>
				</div>
			` : ''}
		</div>
	`;
}

/**
 * Format minutes into readable hour/minute string.
 * @param {number} mins
 * @returns {string}
 */
function formatMinutesToReadable(mins) {
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	const rem = mins % 60;
	return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

/**
 * Render month calendar grid.
 * @param {Object} monthly
 * @returns {string}
 */
function renderMonthCalendar(monthly) {
	if (!monthly) return '<p class="text-muted">No monthly data</p>';

	const year = monthly.year;
	const month = monthly.month; // 1-12
	const activeMap = {};
	(monthly.active_days || []).forEach(ad => {
		activeMap[ad.date] = ad.minutes;
	});

	const firstDay = new Date(year, month - 1, 1);
	const lastDay = new Date(year, month, 0);
	const totalDays = lastDay.getDate();
	const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Convert Sun=0 to Mon=0

	const now = new Date();
	const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === month;
	const todayDate = now.getDate();

	let html = '<div class="calendar-grid">';
	const dayHeaders = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
	dayHeaders.forEach(dh => {
		html += `<div class="cal-header">${dh}</div>`;
	});

	// Empty cells before start of month
	for (let i = 0; i < startDayOfWeek; i++) {
		html += `<div class="cal-day cal-empty"></div>`;
	}

	// Month days
	for (let d = 1; d <= totalDays; d++) {
		const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		const minutes = activeMap[dateStr] || 0;
		const isToday = isCurrentMonth && d === todayDate;
		const hasActivity = minutes > 0;

		html += `
			<div class="cal-day ${isToday ? 'is-today' : ''} ${hasActivity ? 'has-activity' : ''}"
			     title="${dateStr}${hasActivity ? ': ' + minutes + ' mins' : ''}">
				<span class="day-num">${d}</span>
				${hasActivity ? `<span class="day-dot" title="${minutes}m"></span>` : ''}
			</div>
		`;
	}

	html += '</div>';
	return html;
}

/**
 * Render session history items.
 * @param {Array} sessions
 * @returns {string}
 */
function renderSessionList(sessions) {
	if (!sessions || sessions.length === 0) {
		return `
			<div class="empty-sessions">
				<p>No workouts recorded yet.</p>
				<p class="empty-sub">Start a workout from the sidebar to begin tracking your streaks!</p>
			</div>
		`;
	}

	return sessions.map(s => {
		const isCompleted = s.status === 'completed';
		const dateStr = formatSessionDate(s.started_at);
		const durationFormatted = formatTime(s.duration_seconds || 0);
		const stepsStr = s.total_steps > 0 ? `${s.completed_steps}/${s.total_steps} steps` : '';

		return `
			<div class="session-item" data-session-id="${s.id}">
				<div class="session-item-left">
					<div class="session-icon-badge ${isCompleted ? 'badge-completed' : 'badge-partial'}">
						${isCompleted ? '✅' : '⏳'}
					</div>
					<div class="session-info">
						<div class="session-title">${escapeHtml(s.routine_title || 'Workout')}</div>
						<div class="session-meta">
							<span>${dateStr}</span>
							${stepsStr ? `<span>·</span><span>${stepsStr}</span>` : ''}
							<span class="session-status-tag ${isCompleted ? 'tag-completed' : 'tag-partial'}">
								${isCompleted ? 'Completed' : 'Partial'}
							</span>
						</div>
					</div>
				</div>
				<div class="session-item-right">
					<span class="session-duration">${durationFormatted}</span>
					<button class="btn btn-ghost btn-xs btn-delete-session" title="Delete record" data-id="${s.id}">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
					</button>
				</div>
			</div>
		`;
	}).join('');
}

/**
 * Format ISO date string into friendly display string.
 * @param {string} isoString
 * @returns {string}
 */
function formatSessionDate(isoString) {
	try {
		const dt = new Date(isoString);
		const now = new Date();
		const isToday = dt.toDateString() === now.toDateString();
		const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		if (isToday) {
			return `Today, ${timeStr}`;
		}
		const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
		return `${dateStr} · ${timeStr}`;
	} catch (e) {
		return isoString || '';
	}
}

/**
 * Bind delete action on session history items.
 * @param {HTMLElement} container
 */
function bindHistoryActions(container) {
	const deleteBtns = container.querySelectorAll('.btn-delete-session');
	deleteBtns.forEach(btn => {
		if (btn.dataset.boundDelete) return;
		btn.dataset.boundDelete = 'true';

		btn.addEventListener('click', async (e) => {
			e.stopPropagation();
			e.preventDefault();
			const sessionId = btn.getAttribute('data-id');
			if (!sessionId) return;

			const confirmed = await showConfirm({
				title: 'Delete Session',
				message: 'Are you sure you want to delete this workout session record?',
				confirmText: 'Delete',
				danger: true
			});

			if (!confirmed) return;

			const sessionItem = btn.closest('.session-item');
			if (sessionItem) {
				const currentHeight = sessionItem.offsetHeight;
				sessionItem.style.maxHeight = `${currentHeight}px`;
				requestAnimationFrame(() => {
					sessionItem.classList.add('deleting');
				});
				setTimeout(() => {
					sessionItem.remove();
					const historyList = container.querySelector('#session-history-list');
					if (historyList) {
						const remaining = historyList.querySelectorAll('.session-item:not(.deleting)');
						if (remaining.length === 0) {
							historyList.innerHTML = `
								<div class="empty-sessions">
									<p>No workouts recorded yet.</p>
									<p class="empty-sub">Start a workout from the sidebar to begin tracking your streaks!</p>
								</div>
							`;
						}
						const metaEl = container.querySelector('#session-history-meta');
						if (metaEl) {
							metaEl.textContent = `${remaining.length} recent session${remaining.length === 1 ? '' : 's'}`;
						}
					}
				}, 320);
			}

			// Background server delete and stats refresh
			deleteSession(sessionId)
				.then(async () => {
					try {
						const updatedStats = await fetchStats();
						cachedStats = updatedStats;
						updateStatsMetrics(container, updatedStats);
					} catch (e) {
						console.warn('Could not refresh stats metrics after session deletion:', e);
					}
				})
				.catch(async (err) => {
					console.error('Failed to delete session:', err);
					await showAlert({
						title: 'Error',
						message: 'Could not delete session: ' + (err.message || 'Unknown error')
					});
					try {
						const currentStats = await fetchStats();
						cachedStats = currentStats;
						const scrollPos = container.scrollTop;
						renderStatsContent(container, currentStats);
						container.scrollTop = scrollPos;
					} catch {}
				});
		});
	});
}
