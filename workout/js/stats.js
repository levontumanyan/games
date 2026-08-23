/**
 * Stats & Analytics module - Streaks, weekly charts, monthly heatmap, and session history log.
 */

import { fetchStats, fetchSessions, deleteSession } from './storage.js';
import { formatTime } from './utils.js';
import { showConfirm, showAlert } from './modal.js';

let cachedStats = null;

/**
 * Render the stats dashboard inside container.
 * @param {HTMLElement} container
 */
export async function renderStatsDashboard(container) {
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
			retryBtn.addEventListener('click', () => renderStatsDashboard(container));
		}
	}
}

/**
 * Render stats UI with data.
 * @param {HTMLElement} container
 * @param {Object} stats
 */
function renderStatsContent(container, stats) {
	const currentStreak = stats.current_streak || 0;
	const longestStreak = stats.longest_streak || 0;
	const totalMinutes = stats.total_minutes || 0;
	const totalSessions = stats.total_sessions || 0;
	const completedCount = stats.completed_count || 0;

	// Calculate weekly total
	const weeklyMinutes = (stats.weekly || []).reduce((sum, d) => sum + (d.minutes || 0), 0);
	const maxDayMinutes = Math.max(...(stats.weekly || []).map(d => d.minutes || 0), 30);

	// Render HTML
	container.innerHTML = `
		<div class="stats-container">
			<div class="stats-header">
				<div>
					<h2 class="stats-title">Activity & Streaks</h2>
					<p class="stats-subtitle">Track your consistency and workout milestones</p>
				</div>
				<button id="stats-refresh-btn" class="btn btn-ghost btn-sm" title="Refresh stats">🔄 Refresh</button>
			</div>

			<!-- Hero Metric Cards -->
			<div class="stats-hero-grid">
				<div class="stat-card streak-card ${currentStreak > 0 ? 'streak-active' : ''}">
					<div class="stat-card-icon">🔥</div>
					<div class="stat-card-body">
						<div class="stat-value">${currentStreak} <span class="stat-unit">days</span></div>
						<div class="stat-label">Current Streak</div>
					</div>
					<div class="stat-footer-badge">Best: ${longestStreak} days</div>
				</div>

				<div class="stat-card">
					<div class="stat-card-icon">⏱️</div>
					<div class="stat-card-body">
						<div class="stat-value">${formatMinutesToReadable(totalMinutes)}</div>
						<div class="stat-label">Active Time</div>
					</div>
					<div class="stat-footer-badge">${weeklyMinutes}m this week</div>
				</div>

				<div class="stat-card">
					<div class="stat-card-icon">🏆</div>
					<div class="stat-card-body">
						<div class="stat-value">${totalSessions}</div>
						<div class="stat-label">Total Workouts</div>
					</div>
					<div class="stat-footer-badge">${completedCount} completed</div>
				</div>
			</div>

			<!-- Visual Charts Grid -->
			<div class="stats-visual-grid">
				<!-- Weekly Bar Chart -->
				<div class="stats-section-card">
					<div class="section-card-header">
						<h3>📊 Weekly Activity</h3>
						<span class="section-header-meta">${weeklyMinutes} mins total</span>
					</div>
					<div class="weekly-bar-chart">
						${(stats.weekly || []).map(d => {
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
						}).join('')}
					</div>
				</div>

				<!-- Monthly Heatmap Calendar -->
				<div class="stats-section-card">
					<div class="section-card-header">
						<h3>📅 ${stats.monthly?.month_name || 'Monthly'} Calendar</h3>
						<span class="section-header-meta">${stats.monthly?.total_minutes || 0} mins</span>
					</div>
					<div class="monthly-calendar-container">
						${renderMonthCalendar(stats.monthly)}
					</div>
				</div>
			</div>

			<!-- Recent Workout History Log -->
			<div class="stats-section-card session-history-card">
				<div class="section-card-header">
					<h3>📜 Workout History</h3>
					<span class="section-header-meta">${(stats.recent_sessions || []).length} recent sessions</span>
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
		refreshBtn.addEventListener('click', () => renderStatsDashboard(container));
	}

	bindHistoryActions(container);
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
		btn.addEventListener('click', async (e) => {
			e.stopPropagation();
			const sessionId = btn.getAttribute('data-id');
			if (!sessionId) return;

			const confirmed = await showConfirm({
				title: 'Delete Session',
				message: 'Are you sure you want to delete this workout session record?',
				confirmText: 'Delete',
				danger: true
			});

			if (confirmed) {
				try {
					await deleteSession(sessionId);
					await renderStatsDashboard(container);
				} catch (err) {
					await showAlert({
						title: 'Error',
						message: 'Could not delete session: ' + err.message
					});
				}
			}
		});
	});
}

function escapeHtml(str) {
	const div = document.createElement('div');
	div.textContent = str;
	return div.innerHTML;
}
