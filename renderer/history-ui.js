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

        function resolveHistoryShell() {
            return {
                historyList: document.getElementById('historyList'),
                searchBtn: document.getElementById('searchBtn')
            };
        }

        function renderHistoryEmptyState(listEl, message) {
            listEl.innerHTML = `<div class="history-empty">${escapeHtml(message)}</div>`;
        }

        function createHistoryMeta(entry) {
            const meta = document.createElement('div');
            meta.className = 'history-meta';

            const resultCount = document.createElement('span');
            resultCount.textContent = `${entry.resultCount} results`;

            const timestamp = document.createElement('span');
            timestamp.textContent = formatTimestamp(entry.timestamp);

            meta.appendChild(resultCount);
            meta.appendChild(timestamp);
            return meta;
        }

        function createHistoryItem(entry) {
            const item = document.createElement('div');
            item.className = 'history-item';

            const paramsStr = summarizeParams(entry.params);
            const title = entry.params ? `Level ${entry.params.boardSize}` : 'Saved Search';

            const titleEl = document.createElement('div');
            titleEl.className = 'history-title';
            titleEl.textContent = title;

            const paramsEl = document.createElement('div');
            paramsEl.className = 'history-params';
            paramsEl.title = paramsStr;
            paramsEl.textContent = paramsStr;

            item.appendChild(titleEl);
            item.appendChild(paramsEl);
            item.appendChild(createHistoryMeta(entry));
            item.addEventListener('click', () => loadSearchFromHistory(entry));
            return item;
        }

        async function updateHistoryList() {
            const { historyList: listEl } = resolveHistoryShell();
            if (!listEl) return;
            if (!state.electronBridge?.listCache) {
                renderHistoryEmptyState(listEl, 'History unavailable');
                return;
            }

            let res;
            try {
                res = await state.electronBridge.listCache();
            } catch (error) {
                renderHistoryEmptyState(listEl, `History unavailable: ${error.message || String(error)}`);
                return;
            }

            if (!res.success || res.entries.length === 0) {
                renderHistoryEmptyState(
                    listEl,
                    res.success ? 'No history' : `History unavailable: ${res.error || 'Unknown error'}`
                );
                return;
            }

            const recent = res.entries.slice(0, 5);
            listEl.innerHTML = '';

            recent.forEach((entry) => {
                listEl.appendChild(createHistoryItem(entry));
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
                const { searchBtn } = resolveHistoryShell();
                searchBtn?.click();
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
