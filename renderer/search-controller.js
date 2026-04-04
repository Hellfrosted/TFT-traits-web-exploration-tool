(function initializeSearchControllerFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createSearchController = function createSearchController(app) {
        const { state } = app;

        function normalizeProgressPct(progressPct = null) {
            if (!Number.isFinite(progressPct)) {
                return null;
            }

            return Math.max(0, Math.min(100, Math.round(progressPct)));
        }

        function buildSearchMeta() {
            return 'Active query';
        }

        function buildSearchButtonLabel(progressPct = null) {
            const normalizedPct = normalizeProgressPct(progressPct);
            if (Number.isFinite(normalizedPct)) {
                return `Searching ${normalizedPct}%`;
            }

            if (state.isSearching) {
                return 'Searching...';
            }

            return 'Estimating...';
        }

        function buildSearchTableMessage() {
            return 'Results pending...';
        }

        function renderActiveSearchUi(progressPct = null) {
            const searchBtn = document.getElementById('searchBtn');
            const tbody = document.getElementById('resBody');
            const normalizedPct = normalizeProgressPct(progressPct);

            if (searchBtn && state.isSearching) {
                searchBtn.innerText = buildSearchButtonLabel(normalizedPct);
            }

            if (state.lastSearchParams) {
                app.queryUi.renderQuerySummary(state.lastSearchParams, buildSearchMeta());
            } else {
                app.queryUi.renderQuerySummary(null, buildSearchMeta());
            }

            app.results.renderEstimateSummary(state.activeSearchEstimate);
            app.results.renderSearchingSpotlight();

            if (tbody && state.currentResults.length === 0) {
                tbody.innerHTML = app.results.renderResultsMessageRow(buildSearchTableMessage());
            }
        }

        function setSearchState(searching) {
            state.isSearching = searching;
            const searchBtn = document.getElementById('searchBtn');
            const cancelBtn = document.getElementById('cancelBtn');

            if (searching) {
                searchBtn.disabled = true;
                searchBtn.classList.add('disabled');
                searchBtn.innerText = buildSearchButtonLabel();
                cancelBtn.style.display = 'block';
            } else {
                searchBtn.disabled = false;
                searchBtn.classList.remove('disabled');
                searchBtn.innerText = 'Compute';
                cancelBtn.style.display = 'none';
                state.activeSearchEstimate = null;
            }

            app.queryUi.syncFetchButtonState();
        }

        async function handleSearchClick() {
            if (state.isSearching) return;

            app.queryUi.clampNumericInput('boardSize', 1, 20, 9);
            app.queryUi.clampNumericInput('maxResults', 1, 10000, state.searchLimits.DEFAULT_MAX_RESULTS || 500);

            const tbody = document.getElementById('resBody');
            state.currentResults = [];
            state.activeSearchEstimate = null;

            setSearchState(true);

            if (!state.selectors.mustInclude) {
                app.results.renderEmptySummary('Data required');
                app.queryUi.renderQuerySummary(null, 'Load data first');
                tbody.innerHTML = app.results.renderResultsMessageRow('Please fetch data first.', 'results-message-row results-message-row-error');
                setSearchState(false);
                return;
            }

            try {
                const params = app.queryUi.getCurrentSearchParams();
                state.lastSearchParams = params;
                renderActiveSearchUi();

                if (!state.electronBridge?.getSearchEstimate) {
                    throw new Error('Electron preload bridge is unavailable.');
                }
                const estimate = await state.electronBridge.getSearchEstimate(params);
                state.activeSearchEstimate = estimate;
                renderActiveSearchUi();
                const maxRemainingSlots = state.searchLimits.MAX_REMAINING_SLOTS ?? 7;
                const largeSearchThreshold = state.searchLimits.LARGE_SEARCH_THRESHOLD ?? 6_000_000_000;

                if (estimate.remainingSlots > maxRemainingSlots) {
                    app.results.renderEmptySummary('Board too large');
                    app.queryUi.renderQuerySummary(params, `Too many open slots. The current engine limit is ${maxRemainingSlots} remaining slots.`);
                    tbody.innerHTML = app.results.renderResultsMessageRow(`Board too large! DFS engine supports up to ${maxRemainingSlots} empty slots.`, 'results-message-row results-message-row-error');
                    return;
                }

                if (Number.isFinite(Number(estimate.count)) && estimate.count > largeSearchThreshold) {
                    const confirmed = await showConfirm(`Search volume: ~${(estimate.count / 1e9).toFixed(1)}B combinations. This may take a minute. Continue?`, 'Performance Warning');
                    if (!confirmed) {
                        app.results.renderEmptySummary('Search aborted');
                        app.queryUi.renderQuerySummary(params, 'Search cancelled');
                        tbody.innerHTML = app.results.renderResultsMessageRow('Search aborted by user.', 'results-message-row results-message-row-muted');
                        return;
                    }
                }

                const startTime = Date.now();
                if (!state.electronBridge?.searchBoards) {
                    throw new Error('Electron preload bridge is unavailable.');
                }
                const response = await state.electronBridge.searchBoards(params);
                if (response.cancelled) {
                    state.currentResults = [];
                    app.queryUi.setStatusMessage('Search cancelled.');
                    app.results.renderEmptySummary('Search cancelled');
                    app.queryUi.renderQuerySummary(params, 'Search cancelled');
                    tbody.innerHTML = app.results.renderResultsMessageRow('Search cancelled.', 'results-message-row results-message-row-error');
                    return;
                }

                if (!response.success) {
                    const errorMessage = response.error || 'Search failed unexpectedly.';
                    state.currentResults = [];
                    app.queryUi.setStatusMessage(`Search Error: ${errorMessage}`);
                    showAlert(errorMessage, 'Search Failed');
                    app.results.renderEmptySummary('Search error');
                    app.queryUi.renderQuerySummary(params, `Error: ${errorMessage}`);
                    tbody.innerHTML = app.results.renderResultsMessageRow(errorMessage, 'results-message-row results-message-row-error');
                    return;
                }

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const results = response.results;
                const fromCache = response.fromCache;

                state.currentResults = results && results.length > 0 && !results[0].error ? results : [];

                if (state.currentResults.length > 0) {
                    const statusInfo = fromCache
                        ? `Found ${results.length} results (from cache in ${elapsed}s)`
                        : `Found ${results.length} results (computed in ${elapsed}s)`;
                    app.queryUi.setStatusMessage(statusInfo);
                    app.queryUi.renderQuerySummary(
                        params,
                        fromCache
                            ? `${results.length} cached boards in ${elapsed}s`
                            : `${results.length} boards in ${elapsed}s`
                    );
                    app.history.updateHistoryList();
                } else if (results && results[0] && results[0].error) {
                    app.queryUi.setStatusMessage(`Search Error: ${results[0].error}`);
                    app.queryUi.renderQuerySummary(params, `Error: ${results[0].error}`);
                } else {
                    app.queryUi.renderQuerySummary(params, 'No matching boards');
                }

                const sorted = state.currentResults.length > 0 ? app.results.getSortedResults(state.currentResults) : results;
                app.results.renderResults(sorted);
            } catch (error) {
                console.error(error);
                app.queryUi.setStatusMessage('Search failed unexpectedly.');
                showAlert(error.message || String(error), 'Search Failed');
                app.results.renderEmptySummary('Search error');
                app.queryUi.renderQuerySummary(state.lastSearchParams, `Unexpected failure: ${error.message || String(error)}`);
                tbody.innerHTML = app.results.renderResultsMessageRow('Search failed unexpectedly.', 'results-message-row results-message-row-error');
            } finally {
                setSearchState(false);
            }
        }

        function subscribeProgressUpdates() {
            if (!state.electronBridge?.onSearchProgress) {
                return;
            }

            const dispose = state.electronBridge.onSearchProgress((data) => {
                renderActiveSearchUi(data.pct);
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
            setSearchState,
            handleSearchClick,
            subscribeProgressUpdates
        };
    };
})();
