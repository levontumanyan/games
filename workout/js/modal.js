/**
 * Modern modal dialogs replacing browser prompt(), confirm(), alert().
 */

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
			close(null);
		} else if (e.key === 'Enter' && e.target === modalInput) {
			e.preventDefault();
			modalConfirmBtn.click();
		}
	});
}

function close(result) {
	if (!modalBackdrop) return;
	modalBackdrop.classList.add('hidden');
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
