(function initializeResultsRenderersFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    function requireFactory(factoryName) {
        const factory = ns[factoryName];
        if (typeof factory !== 'function') {
            throw new Error(`Renderer factory unavailable: ${factoryName}`);
        }

        return factory;
    }

    function requireResultsViewState() {
        const resultsViewState = ns.resultsViewState || ns.createResultsViewState?.();
        if (!resultsViewState) {
            throw new Error('Renderer results view state unavailable.');
        }

        return resultsViewState;
    }

    ns.createResultsRenderers = function createResultsRenderers(app, model, tooltipController) {
        const { state } = app;
        const { resolveShellElements, setResultsBodyMessage } = ns.shared || {};
        const resultsViewState = requireResultsViewState();
        const createResultsInteractions = requireFactory('createResultsInteractions');
        const createResultsSpotlight = requireFactory('createResultsSpotlight');
        const createResultsSummaryUi = requireFactory('createResultsSummaryUi');

        function clearNode(node) {
            while (node.firstChild) {
                node.removeChild(node.firstChild);
            }
        }

        function resolveResultsShell() {
            return resolveShellElements(['boardSpotlight', 'resBody', 'resultsPager']).elements;
        }

        function getVisibleResultsPage(results = [], page = 0, pageSize = resultsInteractions.getResultsPageSize()) {
            return resultsViewState.getVisibleResultsPage(results, page, pageSize);
        }

        function resolveSelectedBoardIndex(selectedBoardIndex, pageData, totalResults) {
            return resultsViewState.resolveSelectedBoardIndex(selectedBoardIndex, pageData, totalResults);
        }

        const resultsSpotlight = createResultsSpotlight(model, tooltipController, {
            resolveResultsShell,
            clearNode
        });
        const resultsSummaryUi = createResultsSummaryUi(app, model);
        const renderEmptySummary = resultsSummaryUi.renderEmptySummary;
        const renderEstimateSummary = resultsSummaryUi.renderEstimateSummary;
        const renderResultsMessageRow = resultsSummaryUi.renderResultsMessageRow;
        const renderEmptySpotlight = resultsSpotlight.renderEmptySpotlight;
        const renderSearchingSpotlight = resultsSpotlight.renderSearchingSpotlight;
        const renderBoardSpotlight = resultsSpotlight.renderBoardSpotlight;
        const resultsInteractions = createResultsInteractions(app, {
            resolveResultsShell,
            clearNode,
            renderResults,
            renderBoardSpotlight
        });

        function renderResults(results, options = {}) {
            const { resBody: tbody } = resolveResultsShell();
            if (!tbody) return;
            tooltipController.hideTraitTooltip();
            clearNode(tbody);
            state.currentResultsPage = 0;

            if (!results || results.length === 0) {
                state.selectedBoardIndex = -1;
                renderEmptySummary('No results');
                setResultsBodyMessage(app, tbody, 'No results found for these constraints.', 'results-message-row results-message-row-error');
                renderEmptySpotlight('No boards matched the current filters. Relax constraints or widen the search.');
                resultsInteractions.clearResultsPager();
                return;
            }

            if (results[0].error) {
                state.selectedBoardIndex = -1;
                renderEmptySummary('Search error');
                setResultsBodyMessage(app, tbody, results[0].error, 'results-message-row results-message-row-error');
                renderEmptySpotlight('Search failed before a board could be inspected.');
                resultsInteractions.clearResultsPager();
                return;
            }

            const pageData = getVisibleResultsPage(results, options.page, resultsInteractions.getResultsPageSize());
            state.currentResultsPage = pageData.page;
            state.selectedBoardIndex = resolveSelectedBoardIndex(state.selectedBoardIndex, pageData, results.length);
            resultsSummaryUi.renderResultsSummary(results);

            const selectedRowRef = {
                current: null
            };
            const fragment = document.createDocumentFragment();
            pageData.items.forEach((board, pageIndex) => {
                const index = pageData.startIndex + pageIndex;
                const row = document.createElement('tr');
                row.className = index === state.selectedBoardIndex ? 'result-row-selected' : '';
                row.tabIndex = 0;
                row.setAttribute('aria-selected', index === state.selectedBoardIndex ? 'true' : 'false');
                if (index === state.selectedBoardIndex) {
                    selectedRowRef.current = row;
                }

                const traits = model.buildBoardTraitSummary(board, { showInactive: true });
                const rowState = resultsViewState.buildResultRowState(
                    board,
                    index,
                    traits,
                    model.getBoardMetric
                );

                const rankCell = document.createElement('td');
                rankCell.className = 'rank-cell';
                rankCell.textContent = rowState.rankLabel;

                const scoreCell = document.createElement('td');
                const scoreStack = document.createElement('div');
                scoreStack.className = 'score-stack';
                const score = document.createElement('strong');
                score.textContent = String(rowState.boardMetric);
                const value = document.createElement('span');
                value.textContent = rowState.valueLabel;
                scoreStack.appendChild(score);
                scoreStack.appendChild(value);
                scoreCell.appendChild(scoreStack);

                const traitCell = document.createElement('td');
                traitCell.appendChild(resultsSpotlight.createTraitChipList(rowState.traits));

                const costCell = document.createElement('td');
                costCell.textContent = rowState.totalCostLabel;

                const twoStarCell = document.createElement('td');
                twoStarCell.textContent = rowState.twoStarCostLabel;

                const unitsCell = document.createElement('td');
                unitsCell.appendChild(resultsSpotlight.createUnitPillList(board));

                row.appendChild(rankCell);
                row.appendChild(scoreCell);
                row.appendChild(traitCell);
                row.appendChild(costCell);
                row.appendChild(twoStarCell);
                row.appendChild(unitsCell);

                resultsInteractions.bindRowSelection(row, results, index, selectedRowRef);
                fragment.appendChild(row);
            });
            tbody.appendChild(fragment);

            resultsInteractions.renderResultsPager(results, pageData);
            tooltipController.bindTooltipListeners();
            renderBoardSpotlight(results[state.selectedBoardIndex], state.selectedBoardIndex);
        }

        return {
            renderEmptySummary,
            renderEstimateSummary,
            renderEmptySpotlight,
            renderSearchingSpotlight,
            renderResultsMessageRow,
            renderBoardSpotlight,
            renderResults,
            __test: {
                getVisibleResultsPage,
                resolveSelectedBoardIndex
            }
        };
    };
})();
