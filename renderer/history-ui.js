(function initializeHistoryUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createHistoryUi = function createHistoryUi(app) {
        const {
            escapeHtml,
            summarizeParams,
            formatTimestamp,
            reportRendererIssue,
            createDialogInvoker
        } = ns.shared || {};
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

        function getHistoryItemDisplayState(entry = {}) {
            const paramsText = summarizeParams(entry.params);
            return {
                title: entry.params ? `Level ${entry.params.boardSize}` : 'Saved Search',
                paramsText,
                resultCountText: `${entry.resultCount} results`,
                timestampText: formatTimestamp(entry.timestamp)
            };
        }

        function createHistoryMeta(displayState) {
            const meta = document.createElement('div');
            meta.className = 'history-meta';

            const resultCount = document.createElement('span');
            resultCount.textContent = displayState.resultCountText;

            const timestamp = document.createElement('span');
            timestamp.textContent = displayState.timestampText;

            meta.appendChild(resultCount);
            meta.appendChild(timestamp);
            return meta;
        }

        function createHistoryItem(entry) {
            const item = document.createElement('div');
            item.className = 'history-item';
            const displayState = getHistoryItemDisplayState(entry);

            const titleEl = document.createElement('div');
            titleEl.className = 'history-title';
            titleEl.textContent = displayState.title;

            const paramsEl = document.createElement('div');
            paramsEl.className = 'history-params';
            paramsEl.title = displayState.paramsText;
            paramsEl.textContent = displayState.paramsText;

            item.appendChild(titleEl);
            item.appendChild(paramsEl);
            item.appendChild(createHistoryMeta(displayState));
            item.addEventListener('click', () => loadSearchFromHistory(entry));
            return item;
        }

        function getHistoryListStateMessage(result, error = null) {
            if (error) {
                return `History unavailable: ${error.message || String(error)}`;
            }

            if (!result?.success) {
                return `History unavailable: ${result?.error || 'Unknown error'}`;
            }

            if (!Array.isArray(result.entries) || result.entries.length === 0) {
                return 'No history';
            }

            return null;
        }

        function renderHistoryEntries(listEl, entries) {
            const recent = entries.slice(0, 5);
            listEl.innerHTML = '';

            recent.forEach((entry) => {
                listEl.appendChild(createHistoryItem(entry));
            });
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
                res = await state.electronBridge.listCache({ limit: 5 });
            } catch (error) {
                renderHistoryEmptyState(listEl, getHistoryListStateMessage(null, error));
                return;
            }

            const stateMessage = getHistoryListStateMessage(res);
            if (stateMessage) {
                renderHistoryEmptyState(listEl, stateMessage);
                return;
            }

            renderHistoryEntries(listEl, res.entries);
        }

        async function resolveReplayParams(params) {
            if (typeof app.queryUi.normalizeSearchParams !== 'function') {
                return params;
            }

            const normalizePayload = await app.queryUi.normalizeSearchParams(params);
            return normalizePayload?.params || params;
        }

        function resolveReplayRolePills() {
            if (!state.activeData?.hashMap) {
                return;
            }

            state.selectors.tankRoles?.resolvePills(state.activeData.hashMap);
            state.selectors.carryRoles?.resolvePills(state.activeData.hashMap);
        }

        function replayHistorySearch(canonicalParams) {
            app.queryUi.applySearchParams(canonicalParams);
            resolveReplayRolePills();
            app.queryUi.renderQuerySummary(canonicalParams, 'Loaded a recent search. Replaying canonical query now.');
            const { searchBtn } = resolveHistoryShell();
            searchBtn?.click();
        }

        function getHistoryReplayBusyMessage() {
            if (state.isSearching || state.isFetchingData) {
                return 'Wait for current search to finish or cancel it.';
            }

            return null;
        }

        function getHistoryReplayFailureMessage(error) {
            return `Failed to replay cached query: ${error?.message || String(error)}`;
        }

        async function loadSearchFromHistory(entry) {
            const replayBusyMessage = getHistoryReplayBusyMessage();
            if (replayBusyMessage) {
                void showAlert(replayBusyMessage);
                return;
            }

            const { params } = entry;
            if (!params) return;

            try {
                const canonicalParams = await resolveReplayParams(params);
                replayHistorySearch(canonicalParams);
            } catch (error) {
                console.error('[History Replay Failed]', error);
                if (typeof app.queryUi.setStatusMessage === 'function') {
                    app.queryUi.setStatusMessage(getHistoryReplayFailureMessage(error));
                }
            }
        }

        return {
            updateHistoryList,
            loadSearchFromHistory,
            __test: {
                getHistoryReplayBusyMessage,
                getHistoryReplayFailureMessage,
                getHistoryItemDisplayState
            }
        };
    };
})();
