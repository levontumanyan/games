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
 * Initialize audio context on first user interaction.
 * Call this from a click/touch handler to unlock audio on mobile.
 */
export function initAudio() {
	ensureContext();
}
