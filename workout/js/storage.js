/**
 * Storage module - localStorage persistence and JSON import/export.
 */

import { generateId } from './utils.js';

const STORAGE_KEY = 'custom_workout_routines';

/**
 * Default seed routine so the app isn't empty on first launch.
 */
function createSeedRoutines() {
	return [
		{
			id: generateId(),
			title: 'Quick Full Body Warmup',
			steps: [
				{
					id: generateId(),
					type: 'clip',
					videoId: 'JOhAdqQLEFI',
					startSeconds: 0,
					endSeconds: 60,
					label: 'Dynamic Stretches'
				},
				{
					id: generateId(),
					type: 'timer',
					durationSeconds: 30,
					label: 'Push-ups',
					musicTracks: []
				},
				{
					id: generateId(),
					type: 'timer',
					durationSeconds: 15,
					label: 'Rest',
					musicTracks: []
				},
				{
					id: generateId(),
					type: 'timer',
					durationSeconds: 30,
					label: 'Jumping Jacks',
					musicTracks: []
				},
				{
					id: generateId(),
					type: 'timer',
					durationSeconds: 15,
					label: 'Rest',
					musicTracks: []
				},
				{
					id: generateId(),
					type: 'timer',
					durationSeconds: 45,
					label: 'Plank',
					musicTracks: []
				},
				{
					id: generateId(),
					type: 'clip',
					videoId: 'JOhAdqQLEFI',
					startSeconds: 60,
					endSeconds: 120,
					label: 'Cool-down Stretch'
				}
			]
		}
	];
}

/**
 * Load all routines from localStorage.
 * @returns {Array} Array of Routine objects
 */
export function loadRoutines() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed) && parsed.length > 0) {
				return parsed;
			}
		}
	} catch (e) {
		console.error('Failed to load routines from localStorage:', e);
	}

	// Seed on first launch
	const seed = createSeedRoutines();
	saveRoutines(seed);
	return seed;
}

/**
 * Save all routines to localStorage.
 * @param {Array} routines
 */
export function saveRoutines(routines) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(routines));
	} catch (e) {
		console.error('Failed to save routines to localStorage:', e);
	}
}

/**
 * Export routines as a JSON file download.
 * @param {Array} routines
 */
export function exportRoutines(routines) {
	const blob = new Blob([JSON.stringify(routines, null, '\t')], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `workout_routines_${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Import routines from a JSON file.
 * @returns {Promise<Array>} Parsed routines array
 */
export function importRoutines() {
	return new Promise((resolve, reject) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = (e) => {
			const file = e.target.files[0];
			if (!file) return reject(new Error('No file selected'));

			const reader = new FileReader();
			reader.onload = (evt) => {
				try {
					const data = JSON.parse(evt.target.result);
					if (!Array.isArray(data)) {
						return reject(new Error('Invalid format: expected an array of routines'));
					}
					// Basic validation
					for (const routine of data) {
						if (!routine.id || !routine.title || !Array.isArray(routine.steps)) {
							return reject(new Error('Invalid routine structure'));
						}
						for (const step of routine.steps) {
							if (!step.id || !step.type || !step.label) {
								return reject(new Error('Invalid step structure'));
							}
						}
					}
					resolve(data);
				} catch (err) {
					reject(new Error('Failed to parse JSON: ' + err.message));
				}
			};
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsText(file);
		};
		input.click();
	});
}
