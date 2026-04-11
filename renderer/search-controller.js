(function initializeSearchControllerFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { reportRendererIssue, createDialogInvoker } = ns.shared;
    const searchUiState = ns.searchUiState || ns.createSearchUiState?.(ns.shared);
    const createSearchOperations = ns.createSearchOperations;
    const createSearchShellUi = ns.createSearchShellUi;

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
        const shellUi = createSearchShellUi(app, { reporterState });

        function resolveProgressSearchId(data, activeSearchId = null, lastCompletedSearchId = null) {
            return searchUiState.resolveProgressSearchId(data, activeSearchId, lastCompletedSearchId);
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
            resolveSearchShell: shellUi.resolveSearchShell,
            prepareSearchRun: shellUi.prepareSearchRun,
            renderMissingDataState,
            renderActiveSearchUi: shellUi.renderActiveSearchUi,
            setCancellingSearch: shellUi.setCancellingSearch,
            setSearchState: shellUi.setSearchState,
            handleLargeBoardState,
            handleAbortedSearchState,
            handleCancelledSearchState,
            handleFailedSearchState,
            applySearchResults,
            renderUnexpectedSearchFailure: outcomesUi.renderUnexpectedSearchFailure,
            resolveProgressSearchId
        });

        return {
            buildSearchMeta: shellUi.buildSearchMeta,
            buildSearchButtonLabel: shellUi.buildSearchButtonLabel,
            buildSearchTableMessage: shellUi.buildSearchTableMessage,
            renderActiveSearchUi: shellUi.renderActiveSearchUi,
            setCancellingSearch: shellUi.setCancellingSearch,
            setSearchState: shellUi.setSearchState,
            requestCancelSearch: searchOperations.requestCancelSearch,
            handleSearchClick: searchOperations.handleSearchClick,
            subscribeProgressUpdates: searchOperations.subscribeProgressUpdates,
            __test: {
                resolveProgressSearchId,
                getSearchResultsUiState,
                getSearchControlUiState: shellUi.getSearchControlUiState,
                applySearchControlUi: shellUi.applySearchControlUi,
                getInterruptedSearchUiState,
                getActiveSearchUiState: shellUi.getActiveSearchUiState,
                getUnexpectedSearchFailureUiState: outcomesUi.getUnexpectedSearchFailureUiState
            }
        };
    };
})();
