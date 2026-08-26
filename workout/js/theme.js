/**
 * Theme module - Multi-theme Zen palette support and switcher.
 */

export const THEMES = [
	// ── Dark Zen Themes ──────────────────────────────────────────────────
	{
		id: 'matcha-dark',
		name: 'Matcha & Stone',
		shortName: 'Matcha',
		category: 'dark',
		categoryLabel: '🌙 Dark Zen',
		mood: 'Botanical Japanese Tea & River Rock',
		icon: '🍵',
		bg: '#121513',
		card: '#1f2622',
		accent: '#5fa778',
		timer: '#cbb07a',
		breakColor: '#78a88a',
		textColor: '#e6eae6',
	},
	{
		id: 'wabi-sabi-dark',
		name: 'Wabi-Sabi Clay & Timber',
		shortName: 'Wabi-Sabi',
		category: 'dark',
		categoryLabel: '🌙 Dark Zen',
		mood: 'Warm Terracotta & Dark Oak',
		icon: '🏺',
		bg: '#161413',
		card: '#24201e',
		accent: '#c77953',
		timer: '#d19e5b',
		breakColor: '#82967e',
		textColor: '#f0ebe3',
	},
	{
		id: 'nordic-dark',
		name: 'Nordic Mist & Glacier',
		shortName: 'Nordic Mist',
		category: 'dark',
		categoryLabel: '🌙 Dark Zen',
		mood: 'Fjord Slate & Glacier Blue',
		icon: '🏔️',
		bg: '#101419',
		card: '#1c242e',
		accent: '#6b95b8',
		timer: '#cfa56c',
		breakColor: '#6ca396',
		textColor: '#e6edf4',
	},
	{
		id: 'kanso-dark',
		name: 'Kanso Charcoal & Brass',
		shortName: 'Kanso Charcoal',
		category: 'dark',
		categoryLabel: '🌙 Dark Zen',
		mood: 'Sumi-e Ink Wash & Antique Brass',
		icon: '🎋',
		bg: '#131313',
		card: '#222222',
		accent: '#d4b47a',
		timer: '#d4b47a',
		breakColor: '#849c89',
		textColor: '#ececec',
	},

	// ── Light Zen Themes ─────────────────────────────────────────────────
	{
		id: 'washi-light',
		name: 'Washi Rice Paper & Matcha',
		shortName: 'Washi Paper',
		category: 'light',
		categoryLabel: '☀️ Light Zen',
		mood: 'Handmade Washi & Botanical Green',
		icon: '🌾',
		bg: '#f8f7f2',
		card: '#ffffff',
		accent: '#3d7e56',
		timer: '#9e782f',
		breakColor: '#4a825e',
		textColor: '#1e2621',
	},
	{
		id: 'sandstone-light',
		name: 'Morning Sandstone & Clay',
		shortName: 'Sandstone',
		category: 'light',
		categoryLabel: '☀️ Light Zen',
		mood: 'Warm Linen, Terracotta & Ochre',
		icon: '🏺',
		bg: '#f7f4ef',
		card: '#ffffff',
		accent: '#b85d39',
		timer: '#a87232',
		breakColor: '#597356',
		textColor: '#2b2521',
	},
	{
		id: 'nordic-light',
		name: 'Nordic Glacier Dawn',
		shortName: 'Nordic Dawn',
		category: 'light',
		categoryLabel: '☀️ Light Zen',
		mood: 'Fjord Morning Mist & Navy Slate',
		icon: '🏔️',
		bg: '#f4f7fa',
		card: '#ffffff',
		accent: '#3d7299',
		timer: '#a67432',
		breakColor: '#3f7d6e',
		textColor: '#17222c',
	},
	{
		id: 'kanso-light',
		name: 'Gallery White & Brass',
		shortName: 'Gallery White',
		category: 'light',
		categoryLabel: '☀️ Light Zen',
		mood: 'Architectural Gallery White & Bronze',
		icon: '🏛️',
		bg: '#fcfcfc',
		card: '#ffffff',
		accent: '#967439',
		timer: '#967439',
		breakColor: '#4b6e54',
		textColor: '#181818',
	},

	// ── Baseline Neon ────────────────────────────────────────────────────
	{
		id: 'current',
		name: 'Current Neon Baseline',
		shortName: 'Neon (Original)',
		category: 'baseline',
		categoryLabel: '⚡ Baseline',
		mood: 'Original High Contrast & Saturated Glows',
		icon: '⚡',
		bg: '#090a10',
		card: '#161824',
		accent: '#6366f1',
		timer: '#f59e0b',
		breakColor: '#10b981',
		textColor: '#f1f2f8',
	}
];

const THEME_STORAGE_KEY = 'workout_active_theme';
const DEFAULT_THEME = 'matcha-dark';

let currentThemeId = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;

/**
 * Get current active theme ID.
 * @returns {string}
 */
export function getActiveThemeId() {
	return currentThemeId;
}

/**
 * Get active theme definition object.
 * @returns {Object}
 */
export function getActiveTheme() {
	return THEMES.find(t => t.id === currentThemeId) || THEMES[0];
}

/**
 * Apply theme by ID and persist to localStorage.
 * @param {string} themeId
 */
export function setTheme(themeId) {
	const theme = THEMES.find(t => t.id === themeId);
	if (!theme) return;

	currentThemeId = theme.id;
	localStorage.setItem(THEME_STORAGE_KEY, currentThemeId);
	document.documentElement.setAttribute('data-theme', currentThemeId);

	// Update topbar trigger text and icon
	const themeNameEl = document.getElementById('active-theme-name');
	const themeIconEl = document.getElementById('active-theme-icon');
	if (themeNameEl) themeNameEl.textContent = theme.shortName;
	if (themeIconEl) themeIconEl.textContent = theme.icon;

	// Highlight active cards inside theme modal if rendered
	document.querySelectorAll('.theme-preview-card').forEach(card => {
		const isTarget = card.dataset.themeId === currentThemeId;
		card.classList.toggle('active', isTarget);
		const badge = card.querySelector('.theme-active-pill');
		if (badge) {
			badge.style.display = isTarget ? 'inline-flex' : 'none';
		}
	});

	// Dispatch custom event for modules that need to adjust canvas/colors
	document.dispatchEvent(new CustomEvent('workout:themechanged', {
		detail: { theme: currentThemeId, definition: theme }
	}));
}

/**
 * Open the Theme Switcher Modal.
 */
export function openThemeModal() {
	const backdrop = document.getElementById('theme-modal-backdrop');
	if (!backdrop) return;
	renderThemeCards();
	backdrop.classList.remove('hidden');
}

/**
 * Close the Theme Switcher Modal.
 */
export function closeThemeModal() {
	const backdrop = document.getElementById('theme-modal-backdrop');
	if (backdrop) backdrop.classList.add('hidden');
}

/**
 * Render Concept 4 visual miniature mockup cards inside the modal.
 */
export function renderThemeCards() {
	const darkGrid = document.getElementById('theme-dark-grid');
	const lightGrid = document.getElementById('theme-light-grid');
	const baselineGrid = document.getElementById('theme-baseline-grid');

	if (!darkGrid || !lightGrid) return;

	const darkThemes = THEMES.filter(t => t.category === 'dark');
	const lightThemes = THEMES.filter(t => t.category === 'light');
	const baselineThemes = THEMES.filter(t => t.category === 'baseline');

	const renderCard = (theme) => {
		const isActive = theme.id === currentThemeId;
		return `
			<div class="theme-preview-card ${isActive ? 'active' : ''}" data-theme-id="${theme.id}" tabindex="0" role="button" title="Select ${theme.name}">
				<div class="mini-ui-stage" style="background: ${theme.bg};">
					<div class="mini-ui-topbar" style="background: ${theme.card};">
						<span style="font-size: 0.55rem;">${theme.icon}</span>
						<span class="mini-ui-pill" style="background: ${theme.accent};"></span>
					</div>
					<div class="mini-ui-card" style="background: ${theme.card}; color: ${theme.textColor}; border-left: 3px solid ${theme.accent};">
						<span class="mini-ui-dot" style="background: ${theme.accent};"></span>
						<span class="mini-ui-text">Routine Step</span>
					</div>
					<div class="mini-ui-actions">
						<div class="mini-ui-btn" style="background: ${theme.accent};"></div>
						<div class="mini-ui-btn-sub" style="background: ${theme.timer};"></div>
					</div>
				</div>
				<div class="theme-card-body">
					<div class="theme-card-title-row">
						<span class="theme-card-name">${theme.name}</span>
						<span class="theme-active-pill" style="display: ${isActive ? 'inline-flex' : 'none'};">✓ Active</span>
					</div>
					<div class="theme-card-mood">${theme.mood}</div>
					<div class="theme-swatch-strip">
						<span class="swatch-dot" style="background: ${theme.bg};" title="Background"></span>
						<span class="swatch-dot" style="background: ${theme.card};" title="Surface"></span>
						<span class="swatch-dot" style="background: ${theme.accent};" title="Accent"></span>
						<span class="swatch-dot" style="background: ${theme.timer};" title="Timer / Secondary"></span>
						<span class="swatch-dot" style="background: ${theme.breakColor};" title="Break"></span>
					</div>
				</div>
			</div>
		`;
	};

	darkGrid.innerHTML = darkThemes.map(renderCard).join('');
	lightGrid.innerHTML = lightThemes.map(renderCard).join('');
	if (baselineGrid) {
		baselineGrid.innerHTML = baselineThemes.map(renderCard).join('');
	}

	// Attach click listeners to all cards
	document.querySelectorAll('.theme-preview-card').forEach(card => {
		card.addEventListener('click', () => {
			const themeId = card.dataset.themeId;
			if (themeId) {
				setTheme(themeId);
			}
		});
		card.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				const themeId = card.dataset.themeId;
				if (themeId) setTheme(themeId);
			}
		});
	});
}

/**
 * Initialize theme system on boot.
 */
export function initTheme() {
	// Apply initial theme immediately to prevent flashing
	const stored = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
	setTheme(stored);

	// Setup topbar button click
	const switcherBtn = document.getElementById('theme-switcher-btn');
	if (switcherBtn) {
		switcherBtn.addEventListener('click', () => {
			openThemeModal();
		});
	}

	// Setup close buttons
	const closeBtn = document.getElementById('theme-modal-close-btn');
	if (closeBtn) {
		closeBtn.addEventListener('click', closeThemeModal);
	}

	const backdrop = document.getElementById('theme-modal-backdrop');
	if (backdrop) {
		backdrop.addEventListener('click', (e) => {
			if (e.target === backdrop) closeThemeModal();
		});
	}

	window.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && backdrop && !backdrop.classList.contains('hidden')) {
			closeThemeModal();
		}
	});
}
