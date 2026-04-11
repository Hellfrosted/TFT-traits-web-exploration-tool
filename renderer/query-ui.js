(function initializeQueryUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const createVariantLockUi = ns.createVariantLockUi;
    const createQuerySummaryUi = ns.createQuerySummaryUi;
    const createQueryControlState = ns.createQueryControlState;
    const createQueryShellUi = ns.createQueryShellUi;
    const createQueryParamsUi = ns.createQueryParamsUi;

    ns.createQueryUi = function createQueryUi(app) {
        const { state } = app;
        const getDefaultMaxResults = () => state.searchLimits.DEFAULT_MAX_RESULTS || 500;
        const getMaxResultsLimit = () => state.searchLimits.MAX_RESULTS || 1000;
        const getDefaultBoardSize = () => 9;
        let nextDraftEstimateRequestId = 0;
        const querySummaryUi = createQuerySummaryUi();
        const queryControlState = createQueryControlState({
            getDefaultBoardSize,
            getDefaultMaxResults
        });
        const queryShellUi = createQueryShellUi(app, {
            querySummaryUi,
            queryControlState
        });
        const variantLockUi = createVariantLockUi(app, {
            resolveSummaryShell: queryShellUi.resolveSummaryShell,
            refreshDraftQuerySummary
        });
        const queryParamsUi = createQueryParamsUi(app, {
            queryControlState,
            queryShellUi,
            variantLockUi
        });

        function getAssetCoverageLabel(assetValidation) {
            return querySummaryUi.getAssetCoverageLabel(assetValidation);
        }

        function summarizeAssetValidation(assetValidation) {
            return querySummaryUi.summarizeAssetValidation(assetValidation);
        }

        function renderQuerySummary(params = null, meta = 'Idle') {
            const metaClass = querySummaryUi.getQuerySummaryMetaClass(meta);
            const chips = params ? querySummaryUi.buildQuerySummaryChips(params) : [];
            queryShellUi.setQuerySummary(querySummaryUi.buildQuerySummaryMarkup({
                chips,
                meta,
                metaClass
            }));
        }

        async function refreshDraftEstimate() {
            if (!state.activeData || state.isSearching || state.isFetchingData) {
                return;
            }

            if (!state.electronBridge?.getSearchEstimate) {
                return;
            }

            const requestId = ++nextDraftEstimateRequestId;
            const normalizePayload = await normalizeSearchParams();
            if (requestId !== nextDraftEstimateRequestId) {
                return;
            }
            const params = normalizePayload.params;

            try {
                const estimate = await state.electronBridge.getSearchEstimate(params);
                if (requestId !== nextDraftEstimateRequestId) {
                    return;
                }
                if (!state.activeData || state.isSearching || state.isFetchingData) {
                    return;
                }

                state.activeSearchEstimate = estimate;
                app.results.renderEstimateSummary(estimate);
            } catch (error) {
                if (requestId !== nextDraftEstimateRequestId) {
                    return;
                }

                console.error('[Draft Estimate Failed]', error);
            }
        }

        async function normalizeSearchParams(params = queryParamsUi.getCurrentSearchParams()) {
            if (state.electronBridge?.normalizeSearchParams) {
                try {
                    const payload = await state.electronBridge.normalizeSearchParams(params);
                    if (payload && payload.params) {
                        return {
                            params: payload.params,
                            comparisonKey: typeof payload.comparisonKey === 'string' ? payload.comparisonKey : null,
                            dataFingerprint: typeof payload.dataFingerprint === 'string' ? payload.dataFingerprint : null
                        };
                    }
                } catch (error) {
                    console.error('[Query Normalization Failed]', error);
                }
            }

            return {
                params,
                comparisonKey: null,
                dataFingerprint: null
            };
        }

        function getDraftQueryMeta(params = {}) {
            return querySummaryUi.getDraftQueryMeta(params);
        }

        function refreshDraftQuerySummary() {
            if (!state.activeData || state.isSearching) return;
            const params = queryParamsUi.getCurrentSearchParams();
            const meta = getDraftQueryMeta(params);
            renderQuerySummary(params, meta);
            void refreshDraftEstimate();
        }

        function bindNumericDraftListeners(controls) {
            ['boardSize', 'maxResults'].forEach((id) => {
                const input = controls[id];
                if (!input) return;
                input.addEventListener('change', () => {
                    if (id === 'boardSize') queryParamsUi.clampNumericInput('boardSize', 1, 20, 9);
                    if (id === 'maxResults') {
                        queryParamsUi.clampNumericInput('maxResults', 1, getMaxResultsLimit(), getDefaultMaxResults());
                    }
                    refreshDraftQuerySummary();
                });
            });
        }

        function bindToggleDraftListeners(controls) {
            ['onlyActiveToggle', 'tierRankToggle', 'includeUniqueToggle'].forEach((id) => {
                controls[id]?.addEventListener('change', refreshDraftQuerySummary);
            });
        }

        function bindMultiselectDraftListener() {
            document.querySelector('.controls-body')?.addEventListener('multiselectchange', refreshDraftQuerySummary);
        }

        function bindDraftQueryListeners() {
            if (state.listeners.draftBound) return;
            state.listeners.draftBound = true;
            const controls = queryShellUi.resolveQueryControls();
            bindNumericDraftListeners(controls);
            bindToggleDraftListeners(controls);
            bindMultiselectDraftListener();
        }

        return {
            setResultsSummary: queryShellUi.setResultsSummary,
            setQuerySummary: queryShellUi.setQuerySummary,
            setDataStats: queryShellUi.setDataStats,
            setStatusMessage: queryShellUi.setStatusMessage,
            getSelectedDataSource: queryShellUi.getSelectedDataSource,
            getDataSourceLabel: queryShellUi.getDataSourceLabel,
            applyDefaultRoleFilters: queryParamsUi.applyDefaultRoleFilters,
            getCurrentVariantLocks: variantLockUi.getCurrentVariantLocks,
            applyVariantLocks: variantLockUi.applyVariantLocks,
            renderVariantLockControls: variantLockUi.renderVariantLockControls,
            getAssetCoverageLabel,
            summarizeAssetValidation,
            syncFetchButtonState: queryShellUi.syncFetchButtonState,
            syncSearchButtonState: queryShellUi.syncSearchButtonState,
            renderQuerySummary,
            getCurrentSearchParams: queryParamsUi.getCurrentSearchParams,
            normalizeSearchParams,
            getDefaultSearchParams: queryParamsUi.getDefaultSearchParams,
            applySearchParams: queryParamsUi.applySearchParams,
            clampNumericInput: queryParamsUi.clampNumericInput,
            refreshDraftEstimate,
            refreshDraftQuerySummary,
            bindDraftQueryListeners,
            __test: {
                getFetchButtonUiState: queryControlState.getFetchButtonUiState,
                applyFetchButtonUi: queryControlState.applyFetchButtonUi,
                getSearchButtonUiState: queryControlState.getSearchButtonUiState,
                applySearchButtonUi: queryControlState.applySearchButtonUi,
                countDraftQuerySignals: querySummaryUi.countDraftQuerySignals,
                getDraftQueryMeta
            }
        };
    };
})();
