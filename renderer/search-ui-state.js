(function initializeSearchUiStateFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createSearchUiState = function createSearchUiState(shared = ns.shared || {}) {
        const formatBoardEstimate = typeof shared.formatBoardEstimate === 'function'
            ? shared.formatBoardEstimate
            : (value) => String(value ?? '-');

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

        function buildSearchTableMessage() {
            return 'Results pending...';
        }

        function buildSearchButtonLabel(progress = null, { isSearching = false } = {}) {
            const normalizedProgress = normalizeSearchProgress(progress);
            if (Number.isFinite(normalizedProgress.pct)) {
                return `Searching ${normalizedProgress.pct}%`;
            }

            const checkedLabel = formatCheckedProgressLabel(normalizedProgress.checked, normalizedProgress.total);
            if (checkedLabel) {
                return `Searching ${checkedLabel}`;
            }

            if (isSearching) {
                return 'Searching...';
            }

            return 'Estimating...';
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

        function getSearchControlUiState(searching, searchLabel = buildSearchButtonLabel(null, { isSearching: searching })) {
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

        function getActiveSearchUiState({
            isSearching = false,
            progress = null,
            fallbackProgress = null,
            lastSearchParams = null,
            currentResults = []
        } = {}) {
            const activeProgress = progress ?? fallbackProgress ?? null;
            return {
                searchLabel: isSearching ? buildSearchButtonLabel(activeProgress, { isSearching }) : null,
                querySummaryParams: lastSearchParams || null,
                querySummaryMeta: buildSearchMeta(),
                shouldRenderPendingRow: !Array.isArray(currentResults) || currentResults.length === 0,
                pendingRowMessage: buildSearchTableMessage()
            };
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

        function getUnexpectedSearchFailureUiState(error) {
            const errorMessage = error?.message || String(error);
            return {
                statusMessage: 'Search failed unexpectedly.',
                alertMessage: errorMessage,
                alertTitle: 'Search Failed',
                emptySummary: 'Search error',
                querySummaryMeta: `Unexpected failure: ${errorMessage}`,
                rowMessage: 'Search failed unexpectedly.'
            };
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

        return {
            buildSearchMeta,
            buildSearchButtonLabel,
            buildSearchTableMessage,
            resolveProgressSearchId,
            getSearchControlUiState,
            getActiveSearchUiState,
            getInterruptedSearchUiState,
            getUnexpectedSearchFailureUiState,
            getSearchResultsUiState
        };
    };

    ns.searchUiState = ns.createSearchUiState();
})();
