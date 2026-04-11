(function initializeResultsViewStateFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createResultsViewState = function createResultsViewState() {
        function clampResultsPage(page, totalPages) {
            const safeTotalPages = Math.max(1, Number.parseInt(totalPages, 10) || 1);
            const numericPage = Number.parseInt(page, 10);
            if (!Number.isFinite(numericPage) || numericPage < 0) {
                return 0;
            }
            return Math.min(numericPage, safeTotalPages - 1);
        }

        function getVisibleResultsPage(results = [], page = 0, pageSize = 100) {
            const safeResults = Array.isArray(results) ? results : [];
            const safePageSize = Math.max(1, Number.parseInt(pageSize, 10) || 100);
            const totalPages = Math.max(1, Math.ceil(safeResults.length / safePageSize));
            const resolvedPage = clampResultsPage(page, totalPages);
            const startIndex = resolvedPage * safePageSize;
            const endIndex = Math.min(startIndex + safePageSize, safeResults.length);

            return {
                page: resolvedPage,
                pageSize: safePageSize,
                totalPages,
                startIndex,
                endIndex,
                items: safeResults.slice(startIndex, endIndex)
            };
        }

        function resolveSelectedBoardIndex(selectedBoardIndex, pageData, totalResults) {
            if (!totalResults) {
                return -1;
            }

            if (
                Number.isInteger(selectedBoardIndex)
                && selectedBoardIndex >= pageData.startIndex
                && selectedBoardIndex < pageData.endIndex
            ) {
                return selectedBoardIndex;
            }

            return pageData.startIndex;
        }

        function buildEstimateSummaryState(estimate = null, formatBoardEstimate = (value) => String(value ?? '')) {
            const estimateCount = estimate?.count;
            const remainingSlots = estimate?.remainingSlots;
            return {
                estimateLabel: estimateCount === null
                    ? 'Variable search space'
                    : Number.isFinite(estimateCount)
                        ? `~${formatBoardEstimate(estimateCount)} boards`
                        : 'Variable / estimating',
                openSlotsLabel: Number.isFinite(Number(remainingSlots))
                    ? String(remainingSlots)
                    : '-'
            };
        }

        function buildResultsSummaryState(results = [], getBoardMetric = (board) => board?.synergyScore ?? 0) {
            const safeResults = Array.isArray(results) ? results : [];
            return {
                resultCount: safeResults.length,
                bestValue: safeResults.reduce(
                    (best, board) => Math.max(best, getBoardMetric(board) / Math.max(board.totalCost, 1)),
                    0
                ),
                lowestCost: safeResults.reduce(
                    (best, board) => Math.min(best, board.totalCost),
                    Number.POSITIVE_INFINITY
                ),
                topScore: safeResults.reduce(
                    (best, board) => Math.max(best, getBoardMetric(board)),
                    Number.NEGATIVE_INFINITY
                )
            };
        }

        return {
            getVisibleResultsPage,
            resolveSelectedBoardIndex,
            buildEstimateSummaryState,
            buildResultsSummaryState
        };
    };

    ns.resultsViewState = ns.createResultsViewState();
})();
