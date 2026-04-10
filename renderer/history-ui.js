(function initializeHistoryUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { escapeHtml, summarizeParams, formatTimestamp, reportRendererIssue, createDialogInvoker } = ns.shared;

    ns.createHistoryUi = function createHistoryUi(app) {
        const { state } = app;
        const reporterState = {
            missingDialogDependency: false
        };
        const showAlert = typeof createDialogInvoker === 'function'
            ? createDialogInvoker(app, reporterState, {
                methodName: 'showAlert'
            })
            : function fallbackShowAlert(message, title = 'Attention') {
                const alertFn = state.dependencies?.showAlert;
                if (typeof alertFn === 'function') {
                    return alertFn(message, title);
                }

                reportRendererIssue(app, reporterState, 'missingDialogDependency', {
                    consoleMessage: '[Renderer Dependency Missing] showAlert is unavailable.',
                    consoleDetail: { title, message },
                    statusMessage: 'Renderer dependency mismatch: dialog controls unavailable.'
                });
                return Promise.resolve(false);
            };

        async function updateHistoryList() {
            const listEl = document.getElementById('historyList');
            if (!listEl) return;
            if (!state.electronBridge?.listCache) {
                listEl.innerHTML = '<div class="history-empty">History unavailable</div>';
                return;
            }

            let res;
            try {
                res = await state.electronBridge.listCache();
            } catch (error) {
                listEl.innerHTML = `<div class="history-empty">History unavailable: ${escapeHtml(error.message || String(error))}</div>`;
                return;
            }

            if (!res.success || res.entries.length === 0) {
                listEl.innerHTML = res.success
                    ? '<div class="history-empty">No history</div>'
                    : `<div class="history-empty">History unavailable: ${escapeHtml(res.error || 'Unknown error')}</div>`;
                return;
            }

            const recent = res.entries.slice(0, 5);
            listEl.innerHTML = '';

            recent.forEach((entry) => {
                const item = document.createElement('div');
                item.className = 'history-item';

                const paramsStr = summarizeParams(entry.params);
                const title = entry.params ? `Level ${entry.params.boardSize}` : 'Saved Search';

                item.innerHTML = `
                    <div class="history-title">${escapeHtml(title)}</div>
                    <div class="history-params" title="${escapeHtml(paramsStr)}">${escapeHtml(paramsStr)}</div>
                    <div class="history-meta">
                        <span>${entry.resultCount} results</span>
                        <span>${escapeHtml(formatTimestamp(entry.timestamp))}</span>
                    </div>
                `;

                item.addEventListener('click', () => loadSearchFromHistory(entry));
                listEl.appendChild(item);
            });
        }

        async function loadSearchFromHistory(entry) {
            if (state.isSearching || state.isFetchingData) {
                void showAlert('Wait for current search to finish or cancel it.');
                return;
            }

            const { params } = entry;
            if (!params) return;

            try {
                const normalizePayload = typeof app.queryUi.normalizeSearchParams === 'function'
                    ? await app.queryUi.normalizeSearchParams(params)
                    : { params };
                const canonicalParams = normalizePayload?.params || params;
                app.queryUi.applySearchParams(canonicalParams);

                if (state.activeData?.hashMap) {
                    state.selectors.tankRoles?.resolvePills(state.activeData.hashMap);
                    state.selectors.carryRoles?.resolvePills(state.activeData.hashMap);
                }

                app.queryUi.renderQuerySummary(canonicalParams, 'Loaded a recent search. Replaying canonical query now.');
                document.getElementById('searchBtn')?.click();
            } catch (error) {
                console.error('[History Replay Failed]', error);
                if (typeof app.queryUi.setStatusMessage === 'function') {
                    app.queryUi.setStatusMessage(`Failed to replay cached query: ${error.message || String(error)}`);
                }
            }
        }

        return {
            updateHistoryList,
            loadSearchFromHistory
        };
    };
})();
