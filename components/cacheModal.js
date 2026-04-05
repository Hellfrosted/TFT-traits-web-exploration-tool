// --- Cache Management Modal ---

const { escapeHtml: _sharedEscapeHtml, summarizeParams: _sharedSummarizeParams, formatTimestamp: _sharedFormatTimestamp } = window.TFTRenderer?.shared || {};
const modalEscapeHtml = _sharedEscapeHtml || ((value) => String(value ?? ''));
const summarizeHistoryParams = _sharedSummarizeParams || ((params) => JSON.stringify(params || {}));
const formatHistoryTimestamp = _sharedFormatTimestamp || ((value) => String(value ?? '-'));
let cacheModal = null;
let cacheModalBody = null;

function closeModal() {
    cacheModal?.classList.remove('active');
}

function refreshHistorySidebar() {
    window.updateHistoryList?.();
}

async function renderCacheList() {
    if (!cacheModalBody) return;
    cacheModalBody.innerHTML = '<p class="cache-empty">Loading...</p>';
    let res;
    try {
        if (!window.electronAPI?.listCache) {
            throw new Error('Electron preload bridge is unavailable.');
        }
        res = await window.electronAPI.listCache();
    } catch (error) {
        cacheModalBody.innerHTML = `<p class="cache-empty">Failed to load cache: ${modalEscapeHtml(error.message || String(error))}</p>`;
        return;
    }
    if (!res.success || res.entries.length === 0) {
        const message = res.success
            ? 'No cached searches found.'
            : `Failed to load cache: ${modalEscapeHtml(res.error || 'Unknown error')}`;
        cacheModalBody.innerHTML = `<p class="cache-empty">${message}</p>`;
        return;
    }

    let html = `<table class="cache-table">
        <thead><tr><th>Search Parameters</th><th>Results</th><th>Cached</th><th></th></tr></thead>
        <tbody>`;
    
    for (const entry of res.entries) {
        const summary = summarizeHistoryParams(entry.params);
        html += `<tr data-key="${entry.key}">
            <td class="cache-table-summary-cell" title="${modalEscapeHtml(summary)}">${modalEscapeHtml(summary)}</td>
            <td>${entry.resultCount}</td>
            <td class="cache-table-timestamp-cell">${modalEscapeHtml(formatHistoryTimestamp(entry.timestamp))}</td>
            <td><button class="btn-sm btn-danger cache-delete-btn" data-key="${modalEscapeHtml(entry.key)}">Delete</button></td>
        </tr>`;
    }
    html += '</tbody></table>';
    cacheModalBody.innerHTML = html;

    // Bind delete buttons
    cacheModalBody.querySelectorAll('.cache-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.key;
            const result = await window.electronAPI.deleteCacheEntry(key);
            if (!result?.success) {
                await showAlert(result?.error || 'Failed to delete cache entry.', 'Cache Error');
                return;
            }
            refreshHistorySidebar();
            renderCacheList();
        });
    });
}

function initializeCacheModal() {
    cacheModal = document.getElementById('cacheModal');
    cacheModalBody = document.getElementById('cacheModalBody');
    const closeBtn = document.getElementById('cacheModalClose');
    const doneBtn = document.getElementById('cacheModalDone');
    const manageBtn = document.getElementById('manageCacheBtn');
    const clearAllBtn = document.getElementById('clearAllCacheBtn');

    if (!cacheModal || !cacheModalBody || !closeBtn || !doneBtn || !manageBtn || !clearAllBtn) {
        console.warn('[Cache Modal] Missing DOM nodes. Cache modal boot skipped.');
        return;
    }

    closeBtn.addEventListener('click', closeModal);
    doneBtn.addEventListener('click', closeModal);
    cacheModal.addEventListener('click', (e) => {
        if (e.target === cacheModal) {
            closeModal();
        }
    });

    manageBtn.addEventListener('click', () => {
        cacheModal.classList.add('active');
        renderCacheList();
    });

    clearAllBtn.addEventListener('click', async () => {
        const confirmed = await showConfirm('Are you sure you want to delete all cached search results? This action cannot be undone.', 'Clear All Cache');
        if (!confirmed) return;

        if (!window.electronAPI?.clearAllCache) {
            await showAlert('Electron preload bridge is unavailable.', 'Cache Error');
            return;
        }

        const result = await window.electronAPI.clearAllCache();
        if (!result?.success) {
            await showAlert(result?.error || 'Failed to clear cache.', 'Cache Error');
            return;
        }
        refreshHistorySidebar();
        renderCacheList();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCacheModal, { once: true });
} else {
    initializeCacheModal();
}

// Export to window
window.renderCacheList = renderCacheList;
