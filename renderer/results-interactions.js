(function initializeResultsInteractionsFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createResultsInteractions = function createResultsInteractions(app, hooks = {}) {
        const { state } = app;
        const {
            resolveResultsShell,
            clearNode,
            renderResults,
            renderBoardSpotlight
        } = hooks;

        function getResultsPageSize() {
            const pageSize = Number.parseInt(state.searchLimits?.RESULTS_PAGE_SIZE, 10);
            return Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 100;
        }

        function clearResultsPager() {
            const { resultsPager } = resolveResultsShell();
            if (resultsPager) {
                clearNode(resultsPager);
            }
        }

        function renderResultsPager(results, pageData) {
            const { resultsPager } = resolveResultsShell();
            if (!resultsPager) {
                return;
            }

            clearNode(resultsPager);
            if (!Array.isArray(results) || results.length === 0 || pageData.totalPages <= 1) {
                return;
            }

            const status = document.createElement('div');
            status.className = 'results-pager-status';
            status.textContent = `Showing ${pageData.startIndex + 1}-${pageData.endIndex} of ${results.length} boards`;

            const controls = document.createElement('div');
            controls.className = 'results-pager-controls';

            const previousButton = document.createElement('button');
            previousButton.type = 'button';
            previousButton.className = 'btn-outline results-pager-btn';
            previousButton.textContent = 'Previous';
            previousButton.disabled = pageData.page === 0;
            previousButton.addEventListener('click', () => {
                renderResults(results, {
                    page: pageData.page - 1
                });
            });

            const pageLabel = document.createElement('span');
            pageLabel.className = 'results-pager-label';
            pageLabel.textContent = `Page ${pageData.page + 1} / ${pageData.totalPages}`;

            const nextButton = document.createElement('button');
            nextButton.type = 'button';
            nextButton.className = 'btn-outline results-pager-btn';
            nextButton.textContent = 'Next';
            nextButton.disabled = pageData.page >= pageData.totalPages - 1;
            nextButton.addEventListener('click', () => {
                renderResults(results, {
                    page: pageData.page + 1
                });
            });

            controls.appendChild(previousButton);
            controls.appendChild(pageLabel);
            controls.appendChild(nextButton);
            resultsPager.appendChild(status);
            resultsPager.appendChild(controls);
        }

        function bindRowSelection(row, results, index, selectedRowRef) {
            const selectRow = () => {
                if (selectedRowRef.current) {
                    selectedRowRef.current.classList.remove('result-row-selected');
                    selectedRowRef.current.setAttribute('aria-selected', 'false');
                }

                state.selectedBoardIndex = index;
                selectedRowRef.current = row;
                selectedRowRef.current.classList.add('result-row-selected');
                selectedRowRef.current.setAttribute('aria-selected', 'true');
                renderBoardSpotlight(results[state.selectedBoardIndex], state.selectedBoardIndex);
            };

            row.addEventListener('click', selectRow);
            row.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }
                event.preventDefault();
                selectRow();
            });
        }

        return {
            getResultsPageSize,
            clearResultsPager,
            renderResultsPager,
            bindRowSelection
        };
    };
})();
