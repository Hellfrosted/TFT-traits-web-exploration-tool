(function initializeSearchControllerFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { resolveShellElements, formatBoardEstimate, reportRendererIssue, createDialogInvoker, setResultsBodyMessage } = ns.shared;
    const searchUiState = ns.searchUiState || ns.createSearchUiState?.(ns.shared);
    const createSearchOperations = ns.createSearchOperations;

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

        const searchOperations = createSearchOperations(app, {
            showConfirm,
            resolveSearchShell,
            prepareSearchRun,
            renderMissingDataState,
            renderActiveSearchUi,
            setCancellingSearch,
            setSearchState,
            handleLargeBoardState,
            handleAbortedSearchState,
            handleCancelledSearchState,
            handleFailedSearchState,
            applySearchResults,
            renderUnexpectedSearchFailure: outcomesUi.renderUnexpectedSearchFailure,
            resolveProgressSearchId
        });

        return {
            buildSearchMeta,
            buildSearchButtonLabel,
            buildSearchTableMessage,
            renderActiveSearchUi,
            setCancellingSearch,
            setSearchState,
            requestCancelSearch: searchOperations.requestCancelSearch,
            handleSearchClick: searchOperations.handleSearchClick,
            subscribeProgressUpdates: searchOperations.subscribeProgressUpdates,
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
