/**
 * Music module - background music playback engine.
 * Supports two backends:
 *   - YouTube (hidden iframe player) for YouTube/YouTube Music links
 *   - HTML5 Audio for local audio files (stored in IndexedDB)
 *
 * Music plays continuously during timer steps and auto-mutes during video clip steps.
 * Loops through the playlist and wraps around.
 */

import { getAudioFile } from './musicdb.js';

/** @type {YT.Player|null} */
let ytMusicPlayer = null;
let ytMusicReady = false;

/** @type {HTMLAudioElement|null} */
let audioElement = null;

let playlist = [];
let currentTrackIndex = -1;
let musicVolume = 0.5;
let isMusicPlaying = false;
let isMusicMuted = false;
let activeSource = null; // 'youtube' | 'file' | null
let onTrackChangeCallback = null;

let pendingPlay = false;

/**
 * Wait for the YouTube IFrame API to be available.
 * It should already be loading from player.js.
 */
function waitForYTApi() {
	return new Promise((resolve) => {
		if (window.YT && window.YT.Player) {
			resolve();
			return;
		}
		const check = setInterval(() => {
			if (window.YT && window.YT.Player) {
				clearInterval(check);
				resolve();
			}
		}, 100);
	});
}

/**
 * Initialize the music playback engine.
 * @param {HTMLElement} containerEl - Hidden container element for YouTube music iframe
 * @param {Object} [callbacks] - Event callbacks
 * @param {Function} [callbacks.onTrackChange] - Called when the active track changes
 */
export async function initMusic(containerEl, callbacks) {
	onTrackChangeCallback = callbacks?.onTrackChange || null;

	// Create HTML5 Audio element for local files
	audioElement = new Audio();
	audioElement.loop = false;
	audioElement.volume = musicVolume;
	audioElement.addEventListener('ended', () => handleTrackEnded());

	// Create hidden YouTube player for music
	await waitForYTApi();

	ytMusicPlayer = new YT.Player(containerEl.id, {
		height: '200',
		width: '200',
		playerVars: {
			controls: 0,
			disablekb: 1,
			enablejsapi: 1,
			modestbranding: 1,
			rel: 0,
			fs: 0,
			playsinline: 1
		},
		events: {
			onReady: () => {
				ytMusicReady = true;
				if (pendingPlay) {
					pendingPlay = false;
					playCurrentTrack();
				}
			},
			onStateChange: (event) => {
				if (event.data === YT.PlayerState.ENDED) {
					handleTrackEnded();
				}
			},
			onError: (err) => {
				console.warn('YouTube music player error:', err);
				handleTrackEnded();
			}
		}
	});
}

/**
 * Unlock / prime audio on initial user gesture (Click, Start Workout).
 */
export function unlockAudio() {
	if (audioElement) {
		audioElement.play().then(() => {
			audioElement.pause();
		}).catch(() => {});
	}
	if (ytMusicPlayer && ytMusicReady) {
		try {
			ytMusicPlayer.unMute();
		} catch {}
	}
}

/**
 * Handle track end - advance to next track in playlist (loops).
 */
function handleTrackEnded() {
	if (!isMusicPlaying || playlist.length === 0) return;
	if (playlist.length === 1) {
		if (activeSource === 'file' && audioElement) {
			audioElement.currentTime = 0;
			audioElement.play().catch(() => {});
			return;
		}
		if (activeSource === 'youtube' && ytMusicReady && ytMusicPlayer) {
			ytMusicPlayer.seekTo(0);
			ytMusicPlayer.playVideo();
			return;
		}
	}
	currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
	playCurrentTrack();
}

/**
 * Set the music playlist from routine's musicTracks array.
 * @param {Array} tracks - Array of MusicTrack objects
 */
export function setPlaylist(tracks) {
	const newTracks = tracks || [];
	const isSame = playlist.length === newTracks.length &&
		playlist.every((t, i) => t.source === newTracks[i].source && (t.videoId === newTracks[i].videoId || t.fileId === newTracks[i].fileId));
	if (isSame) return;
	playlist = newTracks;
	if (currentTrackIndex < 0 || currentTrackIndex >= playlist.length) {
		currentTrackIndex = playlist.length > 0 ? 0 : -1;
	}
}

/**
 * Check if the playlist has any tracks.
 * @returns {boolean}
 */
export function hasMusic() {
	return playlist.length > 0;
}

/**
 * Play the current track based on its source.
 */
async function playCurrentTrack() {
	if (currentTrackIndex < 0 || currentTrackIndex >= playlist.length) return;

	const track = playlist[currentTrackIndex];

	// Stop whatever is currently playing
	stopCurrentSource();

	if (track.source === 'youtube' && track.videoId) {
		activeSource = 'youtube';
		if (ytMusicReady && ytMusicPlayer) {
			try {
				ytMusicPlayer.loadVideoById({
					videoId: track.videoId,
					suggestedQuality: 'small'
				});
				ytMusicPlayer.setVolume(musicVolume * 100);
				if (isMusicMuted) {
					ytMusicPlayer.mute();
				} else {
					ytMusicPlayer.unMute();
					try { ytMusicPlayer.playVideo(); } catch {}
				}
			} catch (err) {
				console.warn('Failed to load video on YouTube music player:', err);
			}
		} else {
			pendingPlay = true;
		}
	} else if (track.source === 'file' && track.fileId) {
		activeSource = 'file';
		try {
			const fileData = await getAudioFile(track.fileId);
			if (fileData && fileData.blob) {
				const url = URL.createObjectURL(fileData.blob);
				audioElement.src = url;
				audioElement.volume = musicVolume;
				audioElement.muted = isMusicMuted;
				audioElement.play().catch(() => {});
			}
		} catch (err) {
			console.warn('Failed to load audio file:', err);
			// Skip to next track
			handleTrackEnded();
			return;
		}
	}

	isMusicPlaying = true;
	if (onTrackChangeCallback) {
		onTrackChangeCallback(track, currentTrackIndex);
	}
}

/**
 * Stop the currently active audio source.
 */
function stopCurrentSource() {
	if (activeSource === 'youtube' && ytMusicReady && ytMusicPlayer) {
		try { ytMusicPlayer.stopVideo(); } catch {}
	}
	if (activeSource === 'file' && audioElement) {
		audioElement.pause();
		audioElement.currentTime = 0;
		// Revoke previous object URL to free memory
		if (audioElement.src && audioElement.src.startsWith('blob:')) {
			URL.revokeObjectURL(audioElement.src);
		}
	}
	activeSource = null;
}

/**
 * Start playing music (or resume if already active).
 */
export function startMusic() {
	if (playlist.length === 0) return;
	isMusicMuted = false;
	unmuteMusic();
	if (isMusicPlaying && activeSource) {
		resumeMusic();
		return;
	}
	if (currentTrackIndex < 0) currentTrackIndex = 0;
	playCurrentTrack();
}

/**
 * Pause the current music track.
 */
export function pauseMusic() {
	if (!isMusicPlaying) return;
	if (activeSource === 'youtube' && ytMusicReady && ytMusicPlayer) {
		try { ytMusicPlayer.pauseVideo(); } catch {}
	}
	if (activeSource === 'file' && audioElement) {
		audioElement.pause();
	}
}

/**
 * Resume the current music track.
 */
export function resumeMusic() {
	if (!isMusicPlaying) return;
	if (activeSource === 'youtube' && ytMusicReady && ytMusicPlayer) {
		try { ytMusicPlayer.playVideo(); } catch {}
	}
	if (activeSource === 'file' && audioElement) {
		audioElement.play().catch(() => {});
	}
}

/**
 * Stop music entirely and reset to beginning of playlist.
 */
export function stopMusic() {
	stopCurrentSource();
	isMusicPlaying = false;
	currentTrackIndex = playlist.length > 0 ? 0 : -1;
}

/**
 * Mute music (used during video clip steps).
 */
export function muteMusic() {
	isMusicMuted = true;
	if (activeSource === 'youtube' && ytMusicReady && ytMusicPlayer) {
		ytMusicPlayer.mute();
	}
	if (activeSource === 'file' && audioElement) {
		audioElement.muted = true;
	}
}

/**
 * Unmute music (used when returning to timer steps).
 */
export function unmuteMusic() {
	isMusicMuted = false;
	if (activeSource === 'youtube' && ytMusicReady && ytMusicPlayer) {
		try {
			ytMusicPlayer.unMute();
			ytMusicPlayer.setVolume(musicVolume * 100);
			ytMusicPlayer.playVideo();
		} catch {}
	}
	if (activeSource === 'file' && audioElement) {
		audioElement.muted = false;
		audioElement.play().catch(() => {});
	}
}

/**
 * Set music volume.
 * @param {number} vol - Volume from 0.0 to 1.0
 */
export function setVolume(vol) {
	musicVolume = Math.max(0, Math.min(1, vol));
	if (activeSource === 'youtube' && ytMusicReady && ytMusicPlayer) {
		try {
			ytMusicPlayer.setVolume(musicVolume * 100);
			if (musicVolume > 0 && isMusicPlaying && !isMusicMuted) {
				ytMusicPlayer.unMute();
			}
		} catch {}
	}
	if (activeSource === 'file' && audioElement) {
		audioElement.volume = musicVolume;
	}
}

/**
 * Get current volume.
 * @returns {number}
 */
export function getVolume() {
	return musicVolume;
}

/**
 * Skip to the next track in the playlist.
 */
export function nextTrack() {
	if (playlist.length === 0) return;
	currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
	if (isMusicPlaying) playCurrentTrack();
}

/**
 * Go to the previous track in the playlist.
 */
export function prevTrack() {
	if (playlist.length === 0) return;
	currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
	if (isMusicPlaying) playCurrentTrack();
}

/**
 * Get the currently playing track info.
 * @returns {{track: Object, index: number}|null}
 */
export function getCurrentTrack() {
	if (currentTrackIndex >= 0 && currentTrackIndex < playlist.length) {
		return { track: playlist[currentTrackIndex], index: currentTrackIndex };
	}
	return null;
}

/**
 * Check if music is currently muted.
 * @returns {boolean}
 */
export function isMuted() {
	return isMusicMuted;
}
