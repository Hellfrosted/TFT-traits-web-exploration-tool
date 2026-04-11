(function initializeSearchControllerFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { resolveShellElements, formatBoardEstimate, reportRendererIssue, createDialogInvoker, setResultsBodyMessage } = ns.shared;
    const searchUiState = ns.searchUiState || ns.createSearchUiState?.(ns.shared);

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
        const outcomesUi = ns.createSearchOutcomesUi(app, { showAlert });

        function buildSearchMeta() {
            return searchUiState.buildSearchMeta();
        }

        function buildSearchButtonLabel(progress = null) {
            return searchUiState.buildSearchButtonLabel(progress, {
                isSearching: state.isSearching,
                formatBoardEstimate
            });
        }

        function buildSearchTableMessage() {
            return searchUiState.buildSearchTableMessage();
        }

        function resolveProgressSearchId(data, activeSearchId = null, lastCompletedSearchId = null) {
            return searchUiState.resolveProgressSearchId(data, activeSearchId, lastCompletedSearchId);
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

        function getSearchControlUiState(searching, searchLabel = buildSearchButtonLabel()) {
            return searchUiState.getSearchControlUiState(searching, searchLabel);
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
            return searchUiState.getActiveSearchUiState({
                isSearching,
                progress,
                fallbackProgress,
                lastSearchParams,
                currentResults
            });
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
            app.queryUi.clampNumericInput(
                'maxResults',
                1,
                state.searchLimits.MAX_RESULTS || 1000,
                state.searchLimits.DEFAULT_MAX_RESULTS || 500
            );

            state.currentResults = [];
            state.activeSearchEstimate = null;
            setSearchState(true);

            return shell.resBody;
        }

        function renderMissingDataState(tbody) {
            outcomesUi.handleMissingDataState(tbody);
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
            return outcomesUi.getInterruptedSearchUiState(type, options);
        }

        function handleLargeBoardState(tbody, params, maxRemainingSlots) {
            outcomesUi.handleLargeBoardState(tbody, params, maxRemainingSlots);
        }

        function handleAbortedSearchState(tbody, params) {
            outcomesUi.handleAbortedSearchState(tbody, params);
        }

        function handleCancelledSearchState(tbody, params) {
            outcomesUi.handleCancelledSearchState(tbody, params);
        }

        function handleFailedSearchState(tbody, params, errorMessage) {
            outcomesUi.handleFailedSearchState(tbody, params, errorMessage);
        }

        function getSearchResultsUiState(results, fromCache = false, elapsed = '0.0') {
            return outcomesUi.getSearchResultsUiState(results, fromCache, elapsed);
        }

        function applySearchResults(response, params, elapsed) {
            outcomesUi.applySearchResults(response, params, elapsed);
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
                outcomesUi.renderUnexpectedSearchFailure(tbody, state.lastSearchParams, error);
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
                getActiveSearchUiState,
                getUnexpectedSearchFailureUiState: outcomesUi.getUnexpectedSearchFailureUiState
            }
        };
    };
})();
