(function initializeSearchControllerFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { resolveShellElements, formatBoardEstimate, reportRendererIssue, createDialogInvoker, setResultsBodyMessage } = ns.shared;

    ns.createSearchController = function createSearchController(app) {
        const { state } = app;
        const reporterState = {
            shellMismatch: false,
            missingDialogDependencies: false
        };

        function reportMissingDialogDependencies() {
            reportRendererIssue(app, reporterState, 'missingDialogDependencies', {
                consoleMessage: '[Renderer Dependency Missing] Dialog helpers are unavailable.',
                statusMessage: 'Renderer dependency mismatch: dialog controls unavailable.',
                querySummary: {
                    params: state.lastSearchParams || null,
                    meta: 'Dependency mismatch'
                }
            });
        }

        const showAlert = typeof createDialogInvoker === 'function'
            ? createDialogInvoker(app, reporterState, {
                methodName: 'showAlert',
                issueKey: 'missingDialogDependencies'
            })
            : function fallbackShowAlert(message, title = 'Attention') {
                const alertFn = state.dependencies?.showAlert;
                if (typeof alertFn === 'function') {
                    return alertFn(message, title);
                }

                reportMissingDialogDependencies();
                return Promise.resolve(false);
            };

        const showConfirm = typeof createDialogInvoker === 'function'
            ? createDialogInvoker(app, reporterState, {
                methodName: 'showConfirm',
                issueKey: 'missingDialogDependencies'
            })
            : async function fallbackShowConfirm(message, title = 'Confirmation') {
                const confirmFn = state.dependencies?.showConfirm;
                if (typeof confirmFn === 'function') {
                    return await confirmFn(message, title);
                }

                reportMissingDialogDependencies();
                return false;
            };

        function normalizeSearchProgress(progress = null) {
            if (Number.isFinite(progress)) {
                return {
                    pct: Math.max(0, Math.min(100, Math.round(progress))),
                    checked: null,
                    total: null
                };
            }

            if (!progress || typeof progress !== 'object') {
                return {
                    pct: null,
                    checked: null,
                    total: null
                };
            }

            let pct = Number.isFinite(progress.pct)
                ? Math.max(0, Math.min(100, Math.round(progress.pct)))
                : null;
            const checked = Number.isFinite(progress.checked) && progress.checked >= 0
                ? progress.checked
                : null;
            const total = Number.isFinite(progress.total) && progress.total >= 0
                ? progress.total
                : null;

            if (pct === null && Number.isFinite(checked) && Number.isFinite(total) && total > 0) {
                pct = Math.max(0, Math.min(100, Math.round((checked / total) * 100)));
            }

            return { pct, checked, total };
        }

        function formatCheckedProgressLabel(checked = null, total = null) {
            if (!Number.isFinite(checked)) {
                return null;
            }

            if (Number.isFinite(total) && total > 0) {
                return `${formatBoardEstimate(checked)} / ${formatBoardEstimate(total)}`;
            }

            return `${formatBoardEstimate(checked)} checked`;
        }

        function buildSearchMeta() {
            return 'Active query';
        }

        function buildSearchButtonLabel(progress = null) {
            const normalizedProgress = normalizeSearchProgress(progress);
            if (Number.isFinite(normalizedProgress.pct)) {
                return `Searching ${normalizedProgress.pct}%`;
            }

            const checkedLabel = formatCheckedProgressLabel(normalizedProgress.checked, normalizedProgress.total);
            if (checkedLabel) {
                return `Searching ${checkedLabel}`;
            }

            if (state.isSearching) {
                return 'Searching...';
            }

            return 'Estimating...';
        }

        function buildSearchTableMessage() {
            return 'Results pending...';
        }

        function resolveProgressSearchId(data, activeSearchId = null, lastCompletedSearchId = null) {
            if (!data || data.searchId === null || data.searchId === undefined) {
                return null;
            }

            if (activeSearchId === null || activeSearchId === undefined) {
                if (lastCompletedSearchId !== null && lastCompletedSearchId !== undefined && data.searchId <= lastCompletedSearchId) {
                    return null;
                }

                return data.searchId;
            }

            return data.searchId === activeSearchId
                ? activeSearchId
                : null;
        }

        function reportShellMismatchOnce(missingIds, contextMessage) {
            reportRendererIssue(app, reporterState, 'shellMismatch', {
                consoleMessage: `[Renderer Shell Mismatch] ${contextMessage}`,
                consoleDetail: { missingIds },
                statusMessage: 'Renderer shell mismatch: search controls unavailable.',
                querySummary: {
                    params: state.lastSearchParams || null,
                    meta: 'Shell mismatch'
                }
            });
        }

        function resetSearchStateForShellMismatch() {
            state.isSearching = false;
            state.isCancellingSearch = false;
            state.activeSearchEstimate = null;
            state.activeSearchId = null;
            app.queryUi.syncFetchButtonState();
            app.queryUi.syncSearchButtonState();
        }

        function resolveSearchShell(contextMessage, options = {}) {
            const { elements, missingIds } = resolveShellElements(['searchBtn', 'cancelBtn', 'resBody']);
            if (missingIds.length === 0) {
                return elements;
            }

            reportShellMismatchOnce(missingIds, contextMessage);
            if (options.requireStableState) {
                resetSearchStateForShellMismatch();
            }

            return null;
        }

        function renderSearchResultsRow(tbody, message, className = 'results-message-row results-message-row-error') {
            setResultsBodyMessage(app, tbody, message, className);
        }

        function getSearchControlUiState(searching, searchLabel = buildSearchButtonLabel()) {
            if (searching) {
                return {
                    searchDisabled: true,
                    searchClassDisabled: true,
                    searchText: searchLabel,
                    cancelDisplay: 'block',
                    cancelDisabled: false
                };
            }

            return {
                cancelDisplay: 'none'
            };
        }

        function applySearchControlUi(shell, uiState = {}) {
            const { searchBtn, cancelBtn } = shell || {};

            if (searchBtn && uiState.searchDisabled !== undefined) {
                searchBtn.disabled = !!uiState.searchDisabled;
            }
            if (searchBtn && uiState.searchClassDisabled !== undefined) {
                searchBtn.classList.toggle('disabled', !!uiState.searchClassDisabled);
            }
            if (searchBtn && uiState.searchText !== undefined && uiState.searchText !== null) {
                searchBtn.innerText = uiState.searchText;
            }
            if (cancelBtn && uiState.cancelDisplay !== undefined) {
                cancelBtn.style.display = uiState.cancelDisplay;
            }
            if (cancelBtn && uiState.cancelDisabled !== undefined) {
                cancelBtn.disabled = !!uiState.cancelDisabled;
            }
        }

        function getActiveSearchUiState({
            isSearching = false,
            progress = null,
            fallbackProgress = null,
            lastSearchParams = null,
            currentResults = []
        } = {}) {
            const activeProgress = progress ?? fallbackProgress ?? null;
            return {
                searchLabel: isSearching ? buildSearchButtonLabel(activeProgress) : null,
                querySummaryParams: lastSearchParams || null,
                querySummaryMeta: buildSearchMeta(),
                shouldRenderPendingRow: !Array.isArray(currentResults) || currentResults.length === 0,
                pendingRowMessage: buildSearchTableMessage()
            };
        }

        function renderActiveSearchUi(progress = null) {
            const shell = resolveSearchShell('Unable to render active search UI.');
            if (!shell) {
                return;
            }

            const { searchBtn, resBody: tbody } = shell;
            const uiState = getActiveSearchUiState({
                isSearching: state.isSearching,
                progress,
                fallbackProgress: state.activeSearchProgress,
                lastSearchParams: state.lastSearchParams,
                currentResults: state.currentResults
            });

            if (searchBtn && uiState.searchLabel) {
                searchBtn.innerText = uiState.searchLabel;
            }

            app.queryUi.renderQuerySummary(uiState.querySummaryParams, uiState.querySummaryMeta);

            app.results.renderEstimateSummary(state.activeSearchEstimate);
            app.results.renderSearchingSpotlight();

            if (tbody && uiState.shouldRenderPendingRow) {
                setResultsBodyMessage(app, tbody, uiState.pendingRowMessage);
            }
        }

        function setCancellingSearch(cancelling) {
            state.isCancellingSearch = cancelling;
            const shell = resolveSearchShell('Unable to update cancel search state.');
            const cancelBtn = shell?.cancelBtn;
            if (cancelBtn) {
                cancelBtn.disabled = cancelling;
            }
        }

        function setSearchState(searching) {
            const shell = resolveSearchShell('Unable to update search controls.', {
                requireStableState: true
            });
            if (!shell) {
                return;
            }

            state.isSearching = searching;
            if (searching) {
                setCancellingSearch(false);
                state.activeSearchId = null;
                state.activeSearchProgress = null;
            }

            if (searching) {
                applySearchControlUi(shell, getSearchControlUiState(searching, buildSearchButtonLabel()));
            } else {
                setCancellingSearch(false);
                app.queryUi.syncSearchButtonState();
                applySearchControlUi(shell, getSearchControlUiState(false));
                state.activeSearchEstimate = null;
                state.activeSearchProgress = null;
                if (state.activeSearchId !== null && state.activeSearchId !== undefined) {
                    state.lastCompletedSearchId = state.activeSearchId;
                }
                state.activeSearchId = null;
            }

            app.queryUi.syncFetchButtonState();
            if (searching) {
                app.queryUi.syncSearchButtonState();
            }
        }

        function prepareSearchRun(shell) {
            app.queryUi.clampNumericInput('boardSize', 1, 20, 9);
            app.queryUi.clampNumericInput('maxResults', 1, 10000, state.searchLimits.DEFAULT_MAX_RESULTS || 500);

            state.currentResults = [];
            state.activeSearchEstimate = null;
            setSearchState(true);

            return shell.resBody;
        }

        function renderMissingDataState(tbody) {
            applyInterruptedSearchUiState(
                tbody,
                null,
                getInterruptedSearchUiState('missingData')
            );
        }

        async function normalizeCurrentSearchParams() {
            const rawParams = app.queryUi.getCurrentSearchParams();
            const normalizePayload = typeof app.queryUi.normalizeSearchParams === 'function'
                ? await app.queryUi.normalizeSearchParams(rawParams)
                : { params: rawParams };
            return normalizePayload?.params || rawParams;
        }

        async function confirmLargeSearchVolume(estimate) {
            const largeSearchThreshold = state.searchLimits.LARGE_SEARCH_THRESHOLD ?? 6_000_000_000;
            if (!Number.isFinite(Number(estimate.count)) || estimate.count <= largeSearchThreshold) {
                return true;
            }

            return await showConfirm(
                `Search volume: ~${(estimate.count / 1e9).toFixed(1)}B combinations. This may take a minute. Continue?`,
                'Performance Warning'
            );
        }

        function getInterruptedSearchUiState(type, options = {}) {
            if (type === 'missingData') {
                return {
                    statusMessage: null,
                    emptySummary: 'Data required',
                    querySummaryMeta: 'Load data first',
                    rowMessage: 'Please fetch data first.',
                    rowClassName: 'results-message-row results-message-row-error',
                    clearResults: false,
                    alertMessage: null,
                    alertTitle: null
                };
            }

            if (type === 'largeBoard') {
                const maxRemainingSlots = options.maxRemainingSlots ?? 7;
                return {
                    statusMessage: null,
                    emptySummary: 'Board too large',
                    querySummaryMeta: `Too many open slots. The current engine limit is ${maxRemainingSlots} remaining slots.`,
                    rowMessage: `Board too large! DFS engine supports up to ${maxRemainingSlots} empty slots.`,
                    rowClassName: 'results-message-row results-message-row-error',
                    clearResults: false,
                    alertMessage: null,
                    alertTitle: null
                };
            }

            if (type === 'aborted') {
                return {
                    statusMessage: null,
                    emptySummary: 'Search aborted',
                    querySummaryMeta: 'Search cancelled',
                    rowMessage: 'Search aborted by user.',
                    rowClassName: 'results-message-row results-message-row-muted',
                    clearResults: false,
                    alertMessage: null,
                    alertTitle: null
                };
            }

            if (type === 'cancelled') {
                return {
                    statusMessage: 'Search cancelled.',
                    emptySummary: 'Search cancelled',
                    querySummaryMeta: 'Search cancelled',
                    rowMessage: 'Search cancelled.',
                    rowClassName: 'results-message-row results-message-row-error',
                    clearResults: true,
                    alertMessage: null,
                    alertTitle: null
                };
            }

            const errorMessage = options.errorMessage || 'Search failed unexpectedly.';
            return {
                statusMessage: `Search Error: ${errorMessage}`,
                emptySummary: 'Search error',
                querySummaryMeta: `Error: ${errorMessage}`,
                rowMessage: errorMessage,
                rowClassName: 'results-message-row results-message-row-error',
                clearResults: true,
                alertMessage: errorMessage,
                alertTitle: 'Search Failed'
            };
        }

        function applyInterruptedSearchUiState(tbody, params, uiState) {
            if (uiState?.clearResults) {
                state.currentResults = [];
            }
            if (uiState?.statusMessage) {
                app.queryUi.setStatusMessage(uiState.statusMessage);
            }
            if (uiState?.alertMessage) {
                void showAlert(uiState.alertMessage, uiState.alertTitle || 'Attention');
            }

            app.results.renderEmptySummary(uiState?.emptySummary || 'Search error');
            app.queryUi.renderQuerySummary(params, uiState?.querySummaryMeta || 'Search failed');
            renderSearchResultsRow(
                tbody,
                uiState?.rowMessage || 'Search failed unexpectedly.',
                uiState?.rowClassName || 'results-message-row results-message-row-error'
            );
        }

        function handleLargeBoardState(tbody, params, maxRemainingSlots) {
            applyInterruptedSearchUiState(
                tbody,
                params,
                getInterruptedSearchUiState('largeBoard', { maxRemainingSlots })
            );
        }

        function handleAbortedSearchState(tbody, params) {
            applyInterruptedSearchUiState(
                tbody,
                params,
                getInterruptedSearchUiState('aborted')
            );
        }

        function handleCancelledSearchState(tbody, params) {
            applyInterruptedSearchUiState(
                tbody,
                params,
                getInterruptedSearchUiState('cancelled')
            );
        }

        function handleFailedSearchState(tbody, params, errorMessage) {
            applyInterruptedSearchUiState(
                tbody,
                params,
                getInterruptedSearchUiState('failed', { errorMessage })
            );
        }

        function getSearchResultsUiState(results, fromCache = false, elapsed = '0.0') {
            const hasResults = Array.isArray(results) && results.length > 0 && !results[0].error;
            if (hasResults) {
                return {
                    statusMessage: fromCache
                        ? `Found ${results.length} results (from cache in ${elapsed}s)`
                        : `Found ${results.length} results (computed in ${elapsed}s)`,
                    querySummaryMeta: fromCache
                        ? `${results.length} cached boards in ${elapsed}s`
                        : `${results.length} boards in ${elapsed}s`,
                    shouldUpdateHistory: true
                };
            }

            if (results && results[0] && results[0].error) {
                return {
                    statusMessage: `Search Error: ${results[0].error}`,
                    querySummaryMeta: `Error: ${results[0].error}`,
                    shouldUpdateHistory: false
                };
            }

            return {
                statusMessage: 'No matching boards found.',
                querySummaryMeta: 'No matching boards',
                shouldUpdateHistory: false
            };
        }

        function applySearchResults(response, params, elapsed) {
            const results = response.results;
            const fromCache = response.fromCache;
            const uiState = getSearchResultsUiState(results, fromCache, elapsed);

            state.currentResults = results && results.length > 0 && !results[0].error ? results : [];
            state.currentResultsFingerprint = state.activeData?.dataFingerprint || null;

            app.queryUi.setStatusMessage(uiState.statusMessage);
            app.queryUi.renderQuerySummary(params, uiState.querySummaryMeta);

            if (uiState.shouldUpdateHistory) {
                app.history.updateHistoryList();
            }

            const sorted = state.currentResults.length > 0 ? app.results.getSortedResults(state.currentResults) : results;
            app.results.renderResults(sorted);
        }

        async function requestCancelSearch() {
            if (!state.isSearching || state.isCancellingSearch) {
                return;
            }
            if (!resolveSearchShell('Unable to cancel search: required controls missing.', {
                requireStableState: true
            })) {
                return;
            }
            if (!state.electronBridge?.cancelSearch) {
                throw new Error('Electron preload bridge is unavailable.');
            }

            setCancellingSearch(true);
            app.queryUi.setStatusMessage('Cancelling search...');
            app.queryUi.renderQuerySummary(state.lastSearchParams, 'Cancelling active search...');

            try {
                const response = await state.electronBridge.cancelSearch();
                if (!response?.success) {
                    setCancellingSearch(false);
                    app.queryUi.setStatusMessage(response?.error || 'Unable to cancel the active search.');
                }
            } catch (error) {
                setCancellingSearch(false);
                throw error;
            }
        }

        async function handleSearchClick() {
            if (state.isSearching) return;
            if (state.isFetchingData) {
                app.queryUi.setStatusMessage('Data refresh is still in progress. Wait for it to finish before searching.');
                app.queryUi.renderQuerySummary(state.lastSearchParams, 'Waiting for data refresh');
                return;
            }

            const shell = resolveSearchShell('Unable to start search: required controls missing.', {
                requireStableState: true
            });
            if (!shell) {
                return;
            }

            const tbody = prepareSearchRun(shell);

            if (!state.selectors.mustInclude) {
                renderMissingDataState(tbody);
                setSearchState(false);
                return;
            }

            try {
                const params = await normalizeCurrentSearchParams();
                state.lastSearchParams = params;
                renderActiveSearchUi();

                if (!state.electronBridge?.getSearchEstimate) {
                    throw new Error('Electron preload bridge is unavailable.');
                }
                const estimate = await state.electronBridge.getSearchEstimate(params);
                state.activeSearchEstimate = estimate;
                renderActiveSearchUi();

                const maxRemainingSlots = state.searchLimits.MAX_REMAINING_SLOTS ?? 7;
                if (estimate.remainingSlots > maxRemainingSlots) {
                    handleLargeBoardState(tbody, params, maxRemainingSlots);
                    return;
                }

                if (!await confirmLargeSearchVolume(estimate)) {
                    handleAbortedSearchState(tbody, params);
                    return;
                }

                const startTime = Date.now();
                if (!state.electronBridge?.searchBoards) {
                    throw new Error('Electron preload bridge is unavailable.');
                }
                const response = await state.electronBridge.searchBoards(params);
                if (response?.searchId !== null && response?.searchId !== undefined) {
                    state.activeSearchId = response.searchId;
                }
                if (response.cancelled) {
                    handleCancelledSearchState(tbody, params);
                    return;
                }

                if (!response.success) {
                    handleFailedSearchState(tbody, params, response.error || 'Search failed unexpectedly.');
                    return;
                }

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                applySearchResults(response, params, elapsed);
            } catch (error) {
                console.error(error);
                app.queryUi.setStatusMessage('Search failed unexpectedly.');
                void showAlert(error.message || String(error), 'Search Failed');
                app.results.renderEmptySummary('Search error');
                app.queryUi.renderQuerySummary(state.lastSearchParams, `Unexpected failure: ${error.message || String(error)}`);
                renderSearchResultsRow(tbody, 'Search failed unexpectedly.');
            } finally {
                setSearchState(false);
            }
        }

        function subscribeProgressUpdates() {
            if (!state.electronBridge?.onSearchProgress) {
                return;
            }

            const dispose = state.electronBridge.onSearchProgress((data) => {
                if (!state.isSearching || state.isCancellingSearch) {
                    return;
                }
                const resolvedSearchId = resolveProgressSearchId(
                    data,
                    state.activeSearchId,
                    state.lastCompletedSearchId
                );
                if (resolvedSearchId === null || resolvedSearchId === undefined) {
                    return;
                }
                state.activeSearchId = resolvedSearchId;
                state.activeSearchProgress = {
                    pct: data.pct,
                    checked: data.checked,
                    total: data.total
                };
                renderActiveSearchUi(state.activeSearchProgress);
            });

            if (typeof dispose === 'function') {
                state.cleanupFns.push(dispose);
            }
        }

        return {
            buildSearchMeta,
            buildSearchButtonLabel,
            buildSearchTableMessage,
            renderActiveSearchUi,
            setCancellingSearch,
            setSearchState,
            requestCancelSearch,
            handleSearchClick,
            subscribeProgressUpdates,
            __test: {
                resolveProgressSearchId,
                getSearchResultsUiState,
                getSearchControlUiState,
                applySearchControlUi,
                getInterruptedSearchUiState,
                getActiveSearchUiState
            }
        };
    };
})();
