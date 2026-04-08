(function initializeSearchControllerFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { resolveShellElements } = ns.shared;

    ns.createSearchController = function createSearchController(app) {
        const { state } = app;
        let hasReportedShellMismatch = false;

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

        function reportShellMismatchOnce(missingIds, contextMessage) {
            if (!hasReportedShellMismatch) {
                console.error(`[Renderer Shell Mismatch] ${contextMessage}`, { missingIds });
                hasReportedShellMismatch = true;
            }

            app.queryUi.setStatusMessage('Renderer shell mismatch: search controls unavailable.');
            app.queryUi.renderQuerySummary(state.lastSearchParams || null, 'Shell mismatch');
        }

        function resolveSearchShell(contextMessage, options = {}) {
            const { elements, missingIds } = resolveShellElements(['searchBtn', 'cancelBtn', 'resBody']);
            if (missingIds.length === 0) {
                return elements;
            }

            reportShellMismatchOnce(missingIds, contextMessage);
            if (options.requireStableState) {
                state.isSearching = false;
                state.isCancellingSearch = false;
                state.activeSearchEstimate = null;
                state.activeSearchId = null;
                app.queryUi.syncFetchButtonState();
                app.queryUi.syncSearchButtonState();
            }

            return null;
        }

        function renderActiveSearchUi(progressPct = null) {
            const shell = resolveSearchShell('Unable to render active search UI.');
            if (!shell) {
                return;
            }

            const { searchBtn, resBody: tbody } = shell;
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
            }
            const { searchBtn, cancelBtn } = shell;

            if (searching) {
                searchBtn.disabled = true;
                searchBtn.classList.add('disabled');
                searchBtn.innerText = buildSearchButtonLabel();
                cancelBtn.style.display = 'block';
                cancelBtn.disabled = false;
            } else {
                setCancellingSearch(false);
                app.queryUi.syncSearchButtonState();
                cancelBtn.style.display = 'none';
                state.activeSearchEstimate = null;
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

            app.queryUi.clampNumericInput('boardSize', 1, 20, 9);
            app.queryUi.clampNumericInput('maxResults', 1, 10000, state.searchLimits.DEFAULT_MAX_RESULTS || 500);

            const { resBody: tbody } = shell;
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
                if (response?.searchId !== null && response?.searchId !== undefined) {
                    state.activeSearchId = response.searchId;
                }
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
                state.currentResultsFingerprint = state.activeData?.dataFingerprint || null;

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
                    app.queryUi.setStatusMessage('No matching boards found.');
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
                if (!state.isSearching || state.isCancellingSearch) {
                    return;
                }
                if (!data || data.searchId === null || data.searchId === undefined) {
                    return;
                }
                if (state.activeSearchId === null || state.activeSearchId === undefined) {
                    const lwm = state.lastCompletedSearchId;
                    if (lwm !== null && lwm !== undefined && data.searchId <= lwm) {
                        return;
                    }
                    state.activeSearchId = data.searchId;
                }
                if (data.searchId !== state.activeSearchId) {
                    return;
                }
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
            setCancellingSearch,
            setSearchState,
            requestCancelSearch,
            handleSearchClick,
            subscribeProgressUpdates
        };
    };
})();
