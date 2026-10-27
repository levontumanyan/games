/**
 * Audio module - synthetic countdown beeps using Web Audio API.
 * No external sound files needed.
 */

let audioCtx = null;

/**
 * Lazily initialize the AudioContext (must be triggered by user gesture).
 */
function ensureContext() {
	if (!audioCtx) {
		audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	}
	if (audioCtx.state === 'suspended') {
		audioCtx.resume();
	}
	return audioCtx;
}

/**
 * Play a synthetic beep tone.
 * @param {number} frequency - Frequency in Hz (e.g., 440, 880)
 * @param {number} duration - Duration in seconds (e.g., 0.15)
 * @param {number} [volume=0.5] - Volume 0.0 to 1.0
 */
function playTone(frequency, duration, volume = 0.5) {
	const ctx = ensureContext();
	const oscillator = ctx.createOscillator();
	const gainNode = ctx.createGain();

	oscillator.connect(gainNode);
	gainNode.connect(ctx.destination);

	oscillator.type = 'sine';
	oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
	gainNode.gain.setValueAtTime(volume, ctx.currentTime);

	// Fade out at the end to avoid clicks
	gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

	oscillator.start(ctx.currentTime);
	oscillator.stop(ctx.currentTime + duration);
}

/**
 * Play the countdown beep for a given remaining-seconds value.
 * Called each second during timer countdown.
 * @param {number} secondsRemaining
 */
export function playCountdownBeep(secondsRemaining) {
	if (secondsRemaining === 3 || secondsRemaining === 2 || secondsRemaining === 1) {
		// Short 440 Hz beep
		playTone(440, 0.15, 0.5);
	} else if (secondsRemaining === 0) {
		// Longer 880 Hz beep for transition
		playTone(880, 0.4, 0.6);
	}
}

/**
 * Play a rich, resonant chime with harmonic overtone.
 * Uses triangle fundamental + subtle octave-and-fifth harmonic with exponential decay.
 * @param {number} frequency - Fundamental frequency in Hz
 * @param {number} duration - Duration in seconds
 * @param {number} [volume=0.85] - Volume
 */
function playResonantChime(frequency, duration = 0.35, volume = 0.85) {
	const ctx = ensureContext();
	const osc1 = ctx.createOscillator();
	const osc2 = ctx.createOscillator();
	const gainNode = ctx.createGain();

	osc1.type = 'triangle';
	osc1.frequency.setValueAtTime(frequency, ctx.currentTime);

	// Harmonic overtone adds bright metallic ring that pierces through music
	osc2.type = 'sine';
	osc2.frequency.setValueAtTime(frequency * 2.75, ctx.currentTime);

	const overtoneGain = ctx.createGain();
	overtoneGain.gain.setValueAtTime(0.3, ctx.currentTime);
	osc2.connect(overtoneGain);
	overtoneGain.connect(gainNode);

	osc1.connect(gainNode);
	gainNode.connect(ctx.destination);

	gainNode.gain.setValueAtTime(volume, ctx.currentTime);
	gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

	osc1.start(ctx.currentTime);
	osc2.start(ctx.currentTime);
	osc1.stop(ctx.currentTime + duration);
	osc2.stop(ctx.currentTime + duration);
}

/**
 * Play a high-clarity dual chime to signal switching sides.
 */
export function playSwitchCue() {
	// Ascending crisp chime: D5 (587 Hz) then A5 (880 Hz)
	playResonantChime(587, 0.22, 0.85);
	setTimeout(() => {
		playResonantChime(880, 0.45, 0.9);
	}, 150);
}

/**
 * Play subtle pre-switch warning tick.
 */
export function playPreSwitchTick() {
	playTone(520, 0.08, 0.35);
}

/**
 * Initialize audio context on first user interaction.
 * Call this from a click/touch handler to unlock audio on mobile.
 */
export function initAudio() {
	ensureContext();
}
