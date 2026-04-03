// --- Generic Dialog Logic ---

/**
 * Show a modal dialog (alert or confirm style).
 * Uses AbortController to properly clean up event listeners and prevent leaks.
 * @param {string} message - Dialog body message
 * @param {string} [title='Confirmation'] - Dialog title
 * @param {boolean} [isAlert=false] - If true, hides Cancel button (alert mode)
 * @returns {Promise<boolean>} Resolves true on OK, false on Cancel/Close
 */
function showDialog(message, title = 'Confirmation', isAlert = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('dialogModal');
        const titleEl = document.getElementById('dialogTitle');
        const messageEl = document.getElementById('dialogMessage');
        const okBtn = document.getElementById('dialogOkBtn');
        const cancelBtn = document.getElementById('dialogCancelBtn');
        const closeBtn = document.getElementById('dialogClose');

        titleEl.textContent = title;
        messageEl.textContent = message;
        
        // Setup buttons
        cancelBtn.style.display = isAlert ? 'none' : 'inline-block';
        okBtn.textContent = isAlert ? 'OK' : 'Confirm';
        
        // Style for destructive actions
        const isDestructive = message.toLowerCase().includes('delete') || message.toLowerCase().includes('clear');
        okBtn.style.background = isDestructive ? '#581c1c' : '#2e7d32';
        okBtn.style.color = isDestructive ? '#e57373' : 'white';

        modal.classList.add('active');

        // Use AbortController for clean listener removal
        const controller = new AbortController();
        const { signal } = controller;

        const cleanup = (val) => {
            modal.classList.remove('active');
            controller.abort();
            resolve(val);
        };

        okBtn.addEventListener('click', () => cleanup(true), { signal });
        cancelBtn.addEventListener('click', () => cleanup(false), { signal });
        closeBtn.addEventListener('click', () => cleanup(false), { signal });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cleanup(false);
        }, { signal });
    });
}

const showAlert = (msg, title = 'Attention') => showDialog(msg, title, true);
const showConfirm = (msg, title = 'Confirmation') => showDialog(msg, title, false);

// Export to window
window.showAlert = showAlert;
window.showConfirm = showConfirm;
window.showDialog = showDialog;
