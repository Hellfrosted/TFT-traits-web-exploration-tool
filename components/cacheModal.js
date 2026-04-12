// --- Cache Management Modal ---

(function initializeCacheModalFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createCacheModal = function createCacheModal(app) {
        const { state } = app;
        const shared = app.shared || ns.shared || {};
        const escapeHtml = typeof shared.escapeHtml === 'function'
            ? shared.escapeHtml
            : (value) => String(value ?? '');
        const summarizeParams = typeof shared.summarizeParams === 'function'
            ? shared.summarizeParams
            : (params) => JSON.stringify(params || {});
        const formatTimestamp = typeof shared.formatTimestamp === 'function'
            ? shared.formatTimestamp
            : (value) => String(value ?? '-');

        let modal = null;
        let modalBody = null;

        function showAlert(message, title = 'Attention') {
            const alertFn = state.dependencies?.showAlert;
            if (typeof alertFn === 'function') {
                return alertFn(message, title);
            }

            console.error('[Renderer Dependency Missing] showAlert is unavailable.', { title, message });
            app.queryUi.setStatusMessage('Renderer dependency mismatch: dialog controls unavailable.');
            return Promise.resolve(false);
        }

        async function showConfirm(message, title = 'Confirmation') {
            const confirmFn = state.dependencies?.showConfirm;
            if (typeof confirmFn === 'function') {
                return await confirmFn(message, title);
            }

            console.error('[Renderer Dependency Missing] showConfirm is unavailable.', { title, message });
            app.queryUi.setStatusMessage('Renderer dependency mismatch: dialog controls unavailable.');
            return false;
        }

        function closeModal() {
            modal?.classList.remove('active');
        }

        function refreshHistorySidebar() {
            app.history?.updateHistoryList?.();
        }

        async function renderCacheList() {
            if (!modalBody) return;
            modalBody.innerHTML = '<p class="cache-empty">Loading...</p>';

            let response;
            try {
                if (!state.electronBridge?.listCache) {
                    throw new Error('Electron preload bridge is unavailable.');
                }
                response = await state.electronBridge.listCache();
            } catch (error) {
                modalBody.innerHTML = `<p class="cache-empty">Failed to load cache: ${escapeHtml(error.message || String(error))}</p>`;
                return;
            }

            if (!response.success || response.entries.length === 0) {
                const message = response.success
                    ? 'No cached searches found.'
                    : `Failed to load cache: ${escapeHtml(response.error || 'Unknown error')}`;
                modalBody.innerHTML = `<p class="cache-empty">${message}</p>`;
                return;
            }

            let html = `<table class="cache-table">
        <thead><tr><th>Search Parameters</th><th>Results</th><th>Cached</th><th></th></tr></thead>
        <tbody>`;

            for (const entry of response.entries) {
                const summary = summarizeParams(entry.params);
                html += `<tr data-key="${entry.key}">
            <td class="cache-table-summary-cell" title="${escapeHtml(summary)}">${escapeHtml(summary)}</td>
            <td>${entry.resultCount}</td>
            <td class="cache-table-timestamp-cell">${escapeHtml(formatTimestamp(entry.timestamp))}</td>
            <td><button class="btn-sm btn-danger cache-delete-btn" data-key="${escapeHtml(entry.key)}">Delete</button></td>
        </tr>`;
            }
            html += '</tbody></table>';
            modalBody.innerHTML = html;

            modalBody.querySelectorAll('.cache-delete-btn').forEach((button) => {
                button.addEventListener('click', async () => {
                    const key = button.dataset.key;
                    const result = await state.electronBridge?.deleteCacheEntry?.(key);
                    if (!result?.success) {
                        await showAlert(result?.error || 'Failed to delete cache entry.', 'Cache Error');
                        return;
                    }
                    refreshHistorySidebar();
                    await renderCacheList();
                });
            });
        }

        function bindModalListeners() {
            const closeButton = document.getElementById('cacheModalClose');
            const doneButton = document.getElementById('cacheModalDone');
            const manageButton = document.getElementById('manageCacheBtn');
            const clearAllButton = document.getElementById('clearAllCacheBtn');

            if (!modal || !modalBody || !closeButton || !doneButton || !manageButton || !clearAllButton) {
                console.warn('[Cache Modal] Missing DOM nodes. Cache modal boot skipped.');
                return false;
            }

            closeButton.addEventListener('click', closeModal);
            doneButton.addEventListener('click', closeModal);
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    closeModal();
                }
            });

            manageButton.addEventListener('click', () => {
                modal.classList.add('active');
                void renderCacheList();
            });

            clearAllButton.addEventListener('click', async () => {
                const confirmed = await showConfirm(
                    'Are you sure you want to delete all cached search results and fallback snapshots? This action cannot be undone.',
                    'Clear All Cache'
                );
                if (!confirmed) {
                    return;
                }

                if (!state.electronBridge?.clearAllCache) {
                    await showAlert('Electron preload bridge is unavailable.', 'Cache Error');
                    return;
                }

                const result = await state.electronBridge.clearAllCache();
                if (!result?.success) {
                    await showAlert(result?.error || 'Failed to clear cache.', 'Cache Error');
                    return;
                }

                if (Array.isArray(result.failures) && result.failures.length > 0) {
                    const failureSummary = result.failures
                        .slice(0, 3)
                        .map((failure) => `${failure.filePath}: ${failure.message}`)
                        .join('\n');
                    await showAlert(
                        `Deleted ${result.deleted || 0} cache files, but some entries could not be removed:\n${failureSummary}`,
                        'Partial Cache Clear'
                    );
                }

                refreshHistorySidebar();
                await renderCacheList();
            });

            return true;
        }

        function start() {
            modal = document.getElementById('cacheModal');
            modalBody = document.getElementById('cacheModalBody');

            if (!bindModalListeners()) {
                return false;
            }

            return true;
        }

        return {
            start,
            renderCacheList
        };
    };
})();
