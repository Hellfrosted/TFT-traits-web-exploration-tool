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

        function buildBoardSpotlightState(
            board,
            rankIndex,
            getBoardMetric = (item) => item?.synergyScore ?? 0,
            getBoardSortLabel = () => 'Best Synergy'
        ) {
            const boardMetric = getBoardMetric(board);
            const unitCount = Array.isArray(board?.units) ? board.units.length : 0;
            const occupiedSlots = Number.isFinite(Number(board?.occupiedSlots))
                ? Number(board.occupiedSlots)
                : unitCount;

            return {
                boardMetric,
                valueScore: (boardMetric / Math.max(board?.totalCost ?? 0, 1)).toFixed(2),
                boardTitle: occupiedSlots === unitCount
                    ? `Level ${occupiedSlots} board - ${boardMetric} score`
                    : `${occupiedSlots}-slot board (${unitCount} units) - ${boardMetric} score`,
                rankLabel: `Rank #${rankIndex + 1} by ${getBoardSortLabel()}`,
                metricLabels: [
                    `Score ${boardMetric}`,
                    `1-Star ${board?.totalCost}`,
                    `2-Star ${(board?.totalCost ?? 0) * 3}`,
                    `Value ${(boardMetric / Math.max(board?.totalCost ?? 0, 1)).toFixed(2)}`
                ]
            };
        }

        function buildResultRowState(
            board,
            index,
            traits,
            getBoardMetric = (item) => item?.synergyScore ?? 0
        ) {
            const boardMetric = getBoardMetric(board);
            return {
                rankLabel: `#${index + 1}`,
                boardMetric,
                valueLabel: `Value ${(boardMetric / Math.max(board?.totalCost ?? 0, 1)).toFixed(2)}`,
                totalCostLabel: String(board?.totalCost ?? 0),
                twoStarCostLabel: String((board?.totalCost ?? 0) * 3),
                traits
            };
        }

        return {
            getVisibleResultsPage,
            resolveSelectedBoardIndex,
            buildEstimateSummaryState,
            buildResultsSummaryState,
            buildBoardSpotlightState,
            buildResultRowState
        };
    };

    ns.resultsViewState = ns.createResultsViewState();
})();
