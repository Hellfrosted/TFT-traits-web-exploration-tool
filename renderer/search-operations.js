(function initializeSearchOperationsFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createSearchOperations = function createSearchOperations(app, hooks = {}) {
        const { state } = app;
        const {
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
            renderUnexpectedSearchFailure,
            resolveProgressSearchId
        } = hooks;

        function requireBridgeMethod(methodName) {
            const method = state.electronBridge?.[methodName];
            if (typeof method !== 'function') {
                throw new Error('Electron preload bridge is unavailable.');
            }
            return method;
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

        async function requestCancelSearch() {
            if (!state.isSearching || state.isCancellingSearch) {
                return;
            }
            if (!resolveSearchShell('Unable to cancel search: required controls missing.', {
                requireStableState: true
            })) {
                return;
            }

            const cancelSearch = requireBridgeMethod('cancelSearch');
            setCancellingSearch(true);
            app.queryUi.setStatusMessage('Cancelling search...');
            app.queryUi.renderQuerySummary(state.lastSearchParams, 'Cancelling active search...');

            try {
                const response = await cancelSearch();
                if (!response?.success) {
                    setCancellingSearch(false);
                    app.queryUi.setStatusMessage(response?.error || 'Unable to cancel the active search.');
                }
            } catch (error) {
                setCancellingSearch(false);
                throw error;
            }
        }

        async function submitSearch(params = null) {
            if (params) {
                app.queryUi.applySearchParams(params);
            }

            return await handleSearchClick();
        }

        async function handleSearchClick() {
            if (state.isSearching) {
                return;
            }
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

                const getSearchEstimate = requireBridgeMethod('getSearchEstimate');
                const estimate = await getSearchEstimate(params);
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

                const searchBoards = requireBridgeMethod('searchBoards');
                const startTime = Date.now();
                const response = await searchBoards(params);
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
                hooks.applySearchResults(response, params, elapsed);
            } catch (error) {
                console.error(error);
                renderUnexpectedSearchFailure(tbody, state.lastSearchParams, error);
            } finally {
                setSearchState(false);
            }
        }

        function subscribeProgressUpdates() {
            const onSearchProgress = state.electronBridge?.onSearchProgress;
            if (typeof onSearchProgress !== 'function') {
                return;
            }

            const dispose = onSearchProgress((data) => {
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
            normalizeCurrentSearchParams,
            confirmLargeSearchVolume,
            requestCancelSearch,
            submitSearch,
            handleSearchClick,
            subscribeProgressUpdates,
            __test: {
                requireBridgeMethod
            }
        };
    };
})();
