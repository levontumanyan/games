/**
 * IndexedDB wrapper for storing audio file blobs.
 * localStorage is too small for audio data, so we use IndexedDB.
 */

const DB_NAME = 'workout_music_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_files';

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = (e) => {
			const db = e.target.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Save an audio file blob to IndexedDB.
 * @param {string} id - Unique track ID
 * @param {Blob} blob - Audio file blob
 * @param {string} fileName - Original file name
 */
export async function saveAudioFile(id, blob, fileName) {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).put({ id, blob, fileName });
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

/**
 * Retrieve an audio file from IndexedDB.
 * @param {string} id - Track ID
 * @returns {Promise<{id: string, blob: Blob, fileName: string}|null>}
 */
export async function getAudioFile(id) {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const request = tx.objectStore(STORE_NAME).get(id);
		request.onsuccess = () => resolve(request.result || null);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Delete an audio file from IndexedDB.
 * @param {string} id - Track ID
 */
export async function deleteAudioFile(id) {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
