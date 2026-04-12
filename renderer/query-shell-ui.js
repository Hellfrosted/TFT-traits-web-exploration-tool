(function initializeQueryShellUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createQueryShellUi = function createQueryShellUi(app, hooks = {}) {
        const { state } = app;
        const {
            querySummaryUi,
            queryControlState
        } = hooks;

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
            if (!stats) {
                return;
            }

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

        function syncFetchButtonState() {
            const { fetchBtn } = resolveSummaryShell();
            if (!fetchBtn) {
                return;
            }

            const uiState = queryControlState.getFetchButtonUiState({
                isSearching: state.isSearching,
                isFetchingData: state.isFetchingData
            });
            queryControlState.applyFetchButtonUi(fetchBtn, uiState);
        }

        function syncSearchButtonState() {
            const { searchBtn } = resolveSummaryShell();
            if (!searchBtn) {
                return;
            }

            const uiState = queryControlState.getSearchButtonUiState({
                isSearching: state.isSearching,
                isFetchingData: state.isFetchingData,
                hasActiveData: !!state.activeData
            });
            queryControlState.applySearchButtonUi(searchBtn, uiState);
        }

        return {
            resolveSummaryShell,
            resolveQueryControls,
            setResultsSummary,
            setQuerySummary,
            setDataStats,
            setStatusMessage,
            getSelectedDataSource,
            getDataSourceLabel,
            syncFetchButtonState,
            syncSearchButtonState
        };
    };
})();
