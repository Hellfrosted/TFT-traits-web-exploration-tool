(function initializeQueryUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const createVariantLockUi = ns.createVariantLockUi;
    const createQuerySummaryUi = ns.createQuerySummaryUi;
    const createQueryControlState = ns.createQueryControlState;

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

        function resolveQueryElements(ids) {
            const elements = {};
            (Array.isArray(ids) ? ids : []).forEach((id) => {
                elements[id] = document.getElementById(id);
            });
            return elements;
        }

        function resolveSummaryShell() {
            return resolveQueryElements([
                'resultsSummary',
                'resultsQuerySummary',
                'dataStats',
                'status',
                'dataSourceSelect',
                'fetchBtn',
                'searchBtn',
                'variantLocksSection',
                'variantLocksContainer'
            ]);
        }

        function resolveQueryControls() {
            return resolveQueryElements([
                'boardSize',
                'maxResults',
                'onlyActiveToggle',
                'tierRankToggle',
                'includeUniqueToggle'
            ]);
        }

        function setResultsSummary(content) {
            const { resultsSummary: summary } = resolveSummaryShell();
            if (summary) {
                summary.innerHTML = content;
            }
        }

        function setQuerySummary(content) {
            const { resultsQuerySummary: summary } = resolveSummaryShell();
            if (summary) {
                summary.innerHTML = content;
            }
        }

        function setDataStats(units = '-', traits = '-', roles = '-', assets = '-') {
            const { dataStats: stats } = resolveSummaryShell();
            if (!stats) return;

            stats.innerHTML = querySummaryUi.buildDataStatsMarkup({
                units,
                traits,
                roles,
                assets
            });
        }

        function setStatusMessage(message) {
            const { status } = resolveSummaryShell();
            if (status) {
                status.innerText = message;
            }
        }

        function getSelectedDataSource() {
            const { dataSourceSelect: sourceSelect } = resolveSummaryShell();
            return sourceSelect?.value || state.defaultDataSource;
        }

        function getDataSourceLabel(source) {
            return source === 'latest' ? 'Live' : 'PBE';
        }

        function getDefaultRoleFilterValues() {
            if (!state.activeData?.roles) return null;

            return {
                tankRoles: state.resolveDefaultTankRoles(state.activeData.roles),
                carryRoles: state.resolveDefaultCarryRoles(state.activeData.roles)
            };
        }

        function setSelectorValues(selector, values = []) {
            if (selector) {
                selector.setValues(values);
            }
        }

        function applyDefaultRoleSelectorValues(selector, values, force = false) {
            if (!selector) return;
            if (force || selector.getValues().length === 0) {
                selector.setValues(values);
            }
        }

        function applyDefaultRoleFilters(force = false) {
            const defaultRoleValues = getDefaultRoleFilterValues();
            if (!defaultRoleValues) return;

            applyDefaultRoleSelectorValues(state.selectors.tankRoles, defaultRoleValues.tankRoles, force);
            applyDefaultRoleSelectorValues(state.selectors.carryRoles, defaultRoleValues.carryRoles, force);
        }
        const variantLockUi = createVariantLockUi(app, {
            resolveSummaryShell,
            refreshDraftQuerySummary
        });

        function getAssetCoverageLabel(assetValidation) {
            return querySummaryUi.getAssetCoverageLabel(assetValidation);
        }

        function summarizeAssetValidation(assetValidation) {
            return querySummaryUi.summarizeAssetValidation(assetValidation);
        }

        function syncFetchButtonState() {
            const { fetchBtn } = resolveSummaryShell();
            if (!fetchBtn) return;
            const uiState = queryControlState.getFetchButtonUiState({
                isSearching: state.isSearching,
                isFetchingData: state.isFetchingData
            });
            queryControlState.applyFetchButtonUi(fetchBtn, uiState);
        }

        function syncSearchButtonState() {
            const { searchBtn } = resolveSummaryShell();
            if (!searchBtn) return;

            const uiState = queryControlState.getSearchButtonUiState({
                isSearching: state.isSearching,
                isFetchingData: state.isFetchingData,
                hasActiveData: !!state.activeData
            });
            queryControlState.applySearchButtonUi(searchBtn, uiState);
        }

        function renderQuerySummary(params = null, meta = 'Idle') {
            const metaClass = querySummaryUi.getQuerySummaryMetaClass(meta);
            const chips = params ? querySummaryUi.buildQuerySummaryChips(params) : [];
            setQuerySummary(querySummaryUi.buildQuerySummaryMarkup({
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

        async function normalizeSearchParams(params = getCurrentSearchParams()) {
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

        function getCurrentSearchParams() {
            const controls = resolveQueryControls();
            return {
                ...queryControlState.readQueryControlValues(controls),
                mustInclude: state.selectors.mustInclude?.getValues() || [],
                mustExclude: state.selectors.mustExclude?.getValues() || [],
                mustIncludeTraits: state.selectors.mustIncludeTraits?.getValues() || [],
                mustExcludeTraits: state.selectors.mustExcludeTraits?.getValues() || [],
                extraEmblems: state.selectors.extraEmblems?.getValues() || [],
                variantLocks: variantLockUi.getCurrentVariantLocks(),
                tankRoles: state.selectors.tankRoles?.getValues() || [],
                carryRoles: state.selectors.carryRoles?.getValues() || []
            };
        }

        function getDefaultSearchParams() {
            return queryControlState.getDefaultSearchParams();
        }

        function applySelectorSearchParams(params) {
            setSelectorValues(state.selectors.mustInclude, params.mustInclude || []);
            setSelectorValues(state.selectors.mustExclude, params.mustExclude || []);
            setSelectorValues(state.selectors.mustIncludeTraits, params.mustIncludeTraits || []);
            setSelectorValues(state.selectors.mustExcludeTraits, params.mustExcludeTraits || []);
            setSelectorValues(state.selectors.extraEmblems, params.extraEmblems || []);

            const defaultRoleValues = getDefaultRoleFilterValues();
            queryControlState.applyRoleSelectorSearchParams(
                state.selectors.tankRoles,
                params.tankRoles,
                defaultRoleValues?.tankRoles
            );
            queryControlState.applyRoleSelectorSearchParams(
                state.selectors.carryRoles,
                params.carryRoles,
                defaultRoleValues?.carryRoles
            );

            variantLockUi.applyVariantLocks(params.variantLocks || {});
        }

        function applySearchParams(params = {}) {
            const defaults = getDefaultSearchParams();
            const nextParams = {
                ...defaults,
                ...params
            };
            const controls = resolveQueryControls();
            queryControlState.applyQueryControlValues(controls, nextParams);
            applySelectorSearchParams(nextParams);
        }

        function clampNumericInput(id, min, max, fallback) {
            const input = resolveQueryControls()[id];
            return queryControlState.clampNumericInput(input, min, max, fallback);
        }

        function getDraftQueryMeta(params = {}) {
            return querySummaryUi.getDraftQueryMeta(params);
        }

        function refreshDraftQuerySummary() {
            if (!state.activeData || state.isSearching) return;
            const params = getCurrentSearchParams();
            const meta = getDraftQueryMeta(params);
            renderQuerySummary(params, meta);
            void refreshDraftEstimate();
        }

        function bindNumericDraftListeners(controls) {
            ['boardSize', 'maxResults'].forEach((id) => {
                const input = controls[id];
                if (!input) return;
                input.addEventListener('change', () => {
                    if (id === 'boardSize') clampNumericInput('boardSize', 1, 20, 9);
                    if (id === 'maxResults') clampNumericInput('maxResults', 1, getMaxResultsLimit(), getDefaultMaxResults());
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
            const controls = resolveQueryControls();
            bindNumericDraftListeners(controls);
            bindToggleDraftListeners(controls);
            bindMultiselectDraftListener();
        }

        return {
            setResultsSummary,
            setQuerySummary,
            setDataStats,
            setStatusMessage,
            getSelectedDataSource,
            getDataSourceLabel,
            applyDefaultRoleFilters,
            getCurrentVariantLocks: variantLockUi.getCurrentVariantLocks,
            applyVariantLocks: variantLockUi.applyVariantLocks,
            renderVariantLockControls: variantLockUi.renderVariantLockControls,
            getAssetCoverageLabel,
            summarizeAssetValidation,
            syncFetchButtonState,
            syncSearchButtonState,
            renderQuerySummary,
            getCurrentSearchParams,
            normalizeSearchParams,
            getDefaultSearchParams,
            applySearchParams,
            clampNumericInput,
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
