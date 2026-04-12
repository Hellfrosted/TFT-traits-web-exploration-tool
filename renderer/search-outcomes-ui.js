(function initializeSearchOutcomesUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    function requireSearchUiState() {
        const searchUiState = ns.searchUiState || ns.createSearchUiState?.(ns.shared || {});
        if (!searchUiState) {
            throw new Error('Renderer search UI state unavailable.');
        }

        return searchUiState;
    }

    ns.createSearchOutcomesUi = function createSearchOutcomesUi(app, { showAlert } = {}) {
        const { state } = app;
        const { setResultsBodyMessage } = ns.shared || {};
        const searchUiState = requireSearchUiState();

        function renderSearchResultsRow(tbody, message, className = 'results-message-row results-message-row-error') {
            setResultsBodyMessage(app, tbody, message, className);
        }

        function getInterruptedSearchUiState(type, options = {}) {
            return searchUiState.getInterruptedSearchUiState(type, options);
        }

        function getUnexpectedSearchFailureUiState(error) {
            return searchUiState.getUnexpectedSearchFailureUiState(error);
        }

        function getSearchResultsUiState(results, fromCache = false, elapsed = '0.0') {
            return searchUiState.getSearchResultsUiState(results, fromCache, elapsed);
        }

        function applyInterruptedSearchUiState(tbody, params, uiState) {
            if (uiState?.clearResults) {
                state.currentResults = [];
            }
            if (uiState?.statusMessage) {
                app.queryUi.setStatusMessage(uiState.statusMessage);
            }
            if (uiState?.alertMessage && typeof showAlert === 'function') {
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

        function handleMissingDataState(tbody) {
            applyInterruptedSearchUiState(
                tbody,
                null,
                getInterruptedSearchUiState('missingData')
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

        function renderUnexpectedSearchFailure(tbody, params, error) {
            const uiState = getUnexpectedSearchFailureUiState(error);
            app.queryUi.setStatusMessage(uiState.statusMessage);
            if (typeof showAlert === 'function') {
                void showAlert(uiState.alertMessage, uiState.alertTitle);
            }
            app.results.renderEmptySummary(uiState.emptySummary);
            app.queryUi.renderQuerySummary(params, uiState.querySummaryMeta);
            renderSearchResultsRow(tbody, uiState.rowMessage);
        }

        return {
            renderSearchResultsRow,
            getInterruptedSearchUiState,
            getUnexpectedSearchFailureUiState,
            getSearchResultsUiState,
            applyInterruptedSearchUiState,
            handleMissingDataState,
            handleLargeBoardState,
            handleAbortedSearchState,
            handleCancelledSearchState,
            handleFailedSearchState,
            applySearchResults,
            renderUnexpectedSearchFailure
        };
    };
})();
