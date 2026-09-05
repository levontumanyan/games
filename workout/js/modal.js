/**
 * Modern modal dialogs replacing browser prompt(), confirm(), alert().
 */

import { copyToClipboard } from './utils.js';


let modalBackdrop = null;
let modalTitle = null;
let modalMessage = null;
let modalInput = null;
let modalInputGroup = null;
let modalConfirmBtn = null;
let modalCancelBtn = null;
let modalCloseBtn = null;
let currentResolve = null;

function initModalElements() {
	if (modalBackdrop) return;

	modalBackdrop = document.getElementById('modal-backdrop');
	if (!modalBackdrop) return;

	modalTitle = document.getElementById('modal-title');
	modalMessage = document.getElementById('modal-message');
	modalInput = document.getElementById('modal-input');
	modalInputGroup = document.getElementById('modal-input-group');
	modalConfirmBtn = document.getElementById('modal-confirm-btn');
	modalCancelBtn = document.getElementById('modal-cancel-btn');
	modalCloseBtn = document.getElementById('modal-close-btn');

	modalCancelBtn.addEventListener('click', () => close(null));
	modalCloseBtn.addEventListener('click', () => close(null));

	modalBackdrop.addEventListener('click', (e) => {
		if (e.target === modalBackdrop) {
			close(null);
		}
	});

	window.addEventListener('keydown', (e) => {
		if (!modalBackdrop || modalBackdrop.classList.contains('hidden')) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close(null);
		} else if (e.key === 'Enter') {
			if (e.target === modalInput || !modalInputGroup || modalInputGroup.classList.contains('hidden')) {
				e.preventDefault();
				e.stopPropagation();
				modalConfirmBtn.click();
			}
		}
	}, true);
}

function close(result) {
	if (!modalBackdrop) return;
	modalBackdrop.classList.add('hidden');
	if (modalInput) {
		modalInput.readOnly = false;
	}
	if (currentResolve) {
		const res = currentResolve;
		currentResolve = null;
		res(result);
	}
}

/**
 * Show a prompt modal with an input field.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.placeholder]
 * @param {string} [options.defaultValue]
 * @param {string} [options.confirmText]
 * @param {string} [options.cancelText]
 * @returns {Promise<string|null>}
 */
export function showPrompt({
	title = 'Input',
	message = '',
	placeholder = '',
	defaultValue = '',
	confirmText = 'OK',
	cancelText = 'Cancel'
} = {}) {
	initModalElements();
	return new Promise((resolve) => {
		currentResolve = resolve;

		modalTitle.textContent = title;
		modalMessage.textContent = message;
		modalMessage.style.display = message ? 'block' : 'none';

		modalInputGroup.classList.remove('hidden');
		modalInput.value = defaultValue;
		modalInput.placeholder = placeholder;

		modalConfirmBtn.textContent = confirmText;
		modalConfirmBtn.className = 'btn btn-primary';
		modalCancelBtn.textContent = cancelText;
		modalCancelBtn.classList.remove('hidden');

		modalConfirmBtn.onclick = () => {
			close(modalInput.value);
		};

		modalBackdrop.classList.remove('hidden');
		setTimeout(() => {
			modalInput.focus();
			modalInput.select();
		}, 50);
	});
}

/**
 * Show a confirmation modal.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmText]
 * @param {string} [options.cancelText]
 * @param {boolean} [options.danger]
 * @returns {Promise<boolean>}
 */
export function showConfirm({
	title = 'Confirm',
	message = '',
	confirmText = 'Confirm',
	cancelText = 'Cancel',
	danger = false
} = {}) {
	initModalElements();
	return new Promise((resolve) => {
		currentResolve = resolve;

		modalTitle.textContent = title;
		modalMessage.textContent = message;
		modalMessage.style.display = 'block';

		modalInputGroup.classList.add('hidden');

		modalConfirmBtn.textContent = confirmText;
		modalConfirmBtn.className = danger ? 'btn btn-danger-solid' : 'btn btn-primary';
		modalCancelBtn.textContent = cancelText;
		modalCancelBtn.classList.remove('hidden');

		modalConfirmBtn.onclick = () => {
			close(true);
		};

		modalBackdrop.classList.remove('hidden');
		setTimeout(() => {
			modalConfirmBtn.focus();
		}, 50);
	});
}

/**
 * Show an alert modal.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmText]
 * @returns {Promise<void>}
 */
export function showAlert({
	title = 'Notice',
	message = '',
	confirmText = 'Got It'
} = {}) {
	initModalElements();
	return new Promise((resolve) => {
		currentResolve = resolve;

		modalTitle.textContent = title;
		modalMessage.textContent = message;
		modalMessage.style.display = 'block';

		modalInputGroup.classList.add('hidden');

		modalConfirmBtn.textContent = confirmText;
		modalConfirmBtn.className = 'btn btn-primary';
		modalCancelBtn.classList.add('hidden');

		modalConfirmBtn.onclick = () => {
			close(true);
		};

		modalBackdrop.classList.remove('hidden');
		setTimeout(() => {
			modalConfirmBtn.focus();
		}, 50);
	});
}

/**
 * Show a Share dialog with URL and one-click copy button.
 * @param {Object} options
 * @param {string} options.routineTitle
 * @param {string} options.shareUrl
 * @param {Function} [options.onDownloadJson]
 * @returns {Promise<void>}
 */
export function showShareModal({
	routineTitle = 'Workout',
	shareUrl = '',
	onDownloadJson = null
} = {}) {
	initModalElements();
	return new Promise((resolve) => {
		currentResolve = resolve;

		modalTitle.textContent = '🔗 Share Workout';
		modalMessage.textContent = `Anyone with this link can view and play "${routineTitle}" directly in their browser:`;
		modalMessage.style.display = 'block';

		modalInputGroup.classList.remove('hidden');
		modalInput.value = shareUrl;
		modalInput.readOnly = true;

		modalConfirmBtn.textContent = '📋 Copy Link';
		modalConfirmBtn.className = 'btn btn-primary';
		modalCancelBtn.textContent = 'Close';
		modalCancelBtn.classList.remove('hidden');

		modalConfirmBtn.onclick = async () => {
			const success = await copyToClipboard(shareUrl);
			if (success) {
				modalConfirmBtn.textContent = '✓ Link Copied!';
				modalConfirmBtn.classList.add('btn-success');
				setTimeout(() => {
					modalConfirmBtn.textContent = '📋 Copy Link';
					modalConfirmBtn.classList.remove('btn-success');
				}, 2500);
			}
		};

		modalBackdrop.classList.remove('hidden');
		setTimeout(() => {
			modalInput.focus();
			modalInput.select();
		}, 50);
	});
}

/**
 * Create and show a custom modal window with standardized backdrop, close button,
 * click-outside dismissal, and Escape key handling.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} [options.bodyHtml]
 * @param {HTMLElement} [options.bodyElement]
 * @param {string} [options.footerHtml]
 * @param {string} [options.maxWidth]
 * @param {string} [options.className]
 * @param {Function} [options.onClose]
 * @returns {{ backdrop: HTMLElement, modal: HTMLElement, close: Function }}
 */
export function createCustomModal({
	title = '',
	bodyHtml = '',
	bodyElement = null,
	footerHtml = '',
	maxWidth = null,
	className = '',
	onClose = null
} = {}) {
	const backdrop = document.createElement('div');
	backdrop.className = `modal-backdrop custom-modal-backdrop ${className}`.trim();

	const modal = document.createElement('div');
	modal.className = 'modal-window custom-modal-window';
	if (maxWidth) {
		modal.style.maxWidth = maxWidth;
	}

	modal.innerHTML = `
		<div class="modal-header">
			<h3 class="modal-title">${title}</h3>
			<button class="modal-close-btn" title="Close">✕</button>
		</div>
		<div class="modal-body custom-modal-body"></div>
		${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
	`;

	const bodyContainer = modal.querySelector('.modal-body');
	if (bodyElement) {
		bodyContainer.appendChild(bodyElement);
	} else if (bodyHtml) {
		bodyContainer.innerHTML = bodyHtml;
	}

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);

	let isClosed = false;
	const close = () => {
		if (isClosed) return;
		isClosed = true;
		window.removeEventListener('keydown', handleKeyDown);
		backdrop.remove();
		if (onClose) onClose();
	};

	const handleKeyDown = (e) => {
		if (e.key === 'Escape') {
			e.stopPropagation();
			close();
		}
	};

	modal.querySelector('.modal-close-btn').addEventListener('click', close);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});
	window.addEventListener('keydown', handleKeyDown);

	return { backdrop, modal, close };
}

