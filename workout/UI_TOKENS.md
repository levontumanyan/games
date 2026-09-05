# UI Design Tokens & Component Guide

A canonical reference for UI classes, design tokens, and shared component primitives in the Workout Player app. All new features and views must reuse these styles and components rather than creating one-off elements.

## Design Tokens & Variables

All visual styling is driven by CSS custom properties defined in root themes:

| Token | Purpose | Example / Fallback |
| --- | --- | --- |
| `--bg-app` | Overall page background | `#0f1015` |
| `--bg-card` | Standard card container background | `#181a20` |
| `--bg-card-elevated` | Floating pills, elevated cards, popovers | `#1e2129` |
| `--bg-input` | Input background | `#14161d` |
| `--border` | Default hairline border | `rgba(255, 255, 255, 0.08)` |
| `--accent` | Theme primary brand color | `#5fa778` (Forest), `#c77953` (Rust), etc. |
| `--accent-glow` | Focus ring glow effect | `rgba(95, 167, 120, 0.25)` |
| `--radius-sm` | Small inputs and button radius | `8px` |
| `--radius-md` | Cards and dialog radius | `14px` |
| `--radius-lg` | Modal window radius | `20px` |
| `--radius-pill`| Fully rounded chips and pills | `9999px` |
| `--transition-fast` | Interaction hover/focus speed | `0.15s ease` |

## Standard Input & Search Components

Always disable browser autocomplete/history popups on search and text fields: `autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"`.

### Search Box Component
Used across all catalog views and modal search bars:
```html
<div class="search-box-wrapper">
	<span class="search-icon">🔍</span>
	<input type="text" class="input search-box-input" placeholder="Search..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
</div>
```
- `.search-box-wrapper`: Flex container with `:focus-within` border accent and box-shadow glow.
- `.search-box-input`: Borderless, transparent input with full-height caret matching `--accent` and smooth placeholder hiding on `:focus`.

### Standard Form Inputs
```html
<input type="text" class="input" placeholder="Name..." autocomplete="off">
<input type="text" class="modal-input" placeholder="Value..." autocomplete="off">
```

## Button Hierarchy

| Class | Appearance | Usage |
| --- | --- | --- |
| `.btn.btn-primary` | Solid accent background | Primary CTA ("+ New Exercise", "Start Workout") |
| `.btn.btn-secondary` | Subtle surface with border | Secondary actions, alternative choices |
| `.btn.btn-ghost` | Transparent background, borderless | Ancillary controls ("Preview", "Cancel", navigation) |
| `.btn.btn-danger` | Red accent outline / fill | Destructive actions ("Delete") |
| `.btn-sm` | Compact height & font | Toolbar buttons, card action buttons |

## Filter Chips & Taxonomy Badges

### Filter Chips
For interactive filtering rows:
```html
<button type="button" class="ex-chip-btn active">All Movements</button>
<button type="button" class="ex-chip-btn">🥊 Boxing</button>
```

### Taxonomy Badges (Import from `./taxonomy.js`)
- `getCategoryBadgeHtml(category)`: Formats category pill (strength, technique, drill, cardio, stretch).
- `getDisciplineBadgeHtml(discipline)`: Formats discipline badge (Muay Thai, Boxing, Calisthenics, Yoga).
- `getMuscleBadgeHtml(muscleKey, isPrimary)`: Formats anatomy target tag.

## Modal Windows

Do not create manual `div.modal-backdrop` elements with custom click listeners. Use `createCustomModal` from `./modal.js`:

```javascript
import { createCustomModal } from './modal.js';

const { modal, close } = createCustomModal({
	title: 'My Modal Title',
	bodyHtml: `<p>Modal content goes here...</p>`,
	footerHtml: `
		<button class="btn btn-ghost modal-btn-cancel">Cancel</button>
		<button class="btn btn-primary" id="btn-submit">Submit</button>
	`,
	maxWidth: '560px',
	onClose: () => console.log('Closed')
});

modal.querySelector('.modal-btn-cancel').addEventListener('click', close);
```
- Handles backdrop creation, centering, click-outside dismissal, and <kbd>Esc</kbd> key handling automatically.

## Exercise Library Cards

To render standard exercise cards with video badges and action buttons, use `renderExerciseCardElement` from `./exercises.js`:

```javascript
import { renderExerciseCardElement } from './exercises.js';

const card = renderExerciseCardElement(exercise, {
	onPlay: (ex, media) => { /* Preview video or form */ },
	onAddToRoutine: (ex, btn) => { /* Add exercise to routine */ },
	onClick: (ex) => { /* Open details / variations modal */ },
	onMouseEnter: (ex) => { /* Anatomy map highlight */ },
	onMouseLeave: (ex) => { /* Clear anatomy highlight */ },
});
container.appendChild(card);
```
