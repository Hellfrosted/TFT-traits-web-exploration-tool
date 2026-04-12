(function initializeResultsSummaryUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    function requireResultsViewState() {
        const resultsViewState = ns.resultsViewState || ns.createResultsViewState?.();
        if (!resultsViewState) {
            throw new Error('Renderer results view state unavailable.');
        }

        return resultsViewState;
    }

    ns.createResultsSummaryUi = function createResultsSummaryUi(app, model) {
        const { escapeHtml, formatBoardEstimate } = ns.shared || {};
        const resultsViewState = requireResultsViewState();
        function renderEmptySummary(message) {
            app.queryUi.setResultsSummary(`
                <div class="summary-card">
                    <span class="summary-label">Status</span>
                    <span class="summary-value">${escapeHtml(message)}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Top Score</span>
                    <span class="summary-value">-</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Lowest Cost</span>
                    <span class="summary-value">-</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Best Value</span>
                    <span class="summary-value">-</span>
                </div>
            `);
        }

        function renderEstimateSummary(estimate = null) {
            const summaryState = resultsViewState.buildEstimateSummaryState(estimate, formatBoardEstimate);

            app.queryUi.setResultsSummary(`
                <div class="summary-card">
                    <span class="summary-label">Search Space</span>
                    <span class="summary-value">${escapeHtml(summaryState.estimateLabel)}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Open Slots</span>
                    <span class="summary-value">${escapeHtml(summaryState.openSlotsLabel)}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Top Score</span>
                    <span class="summary-value">-</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Lowest Cost</span>
                    <span class="summary-value">-</span>
                </div>
            `);
        }

        function renderResultsSummary(results) {
            const summaryState = resultsViewState.buildResultsSummaryState(results, model.getBoardMetric);
            app.queryUi.setResultsSummary(`
                <div class="summary-card">
                    <span class="summary-label">Status</span>
                    <span class="summary-value">${summaryState.resultCount} boards</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Top Score</span>
                    <span class="summary-value">${summaryState.topScore}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Lowest Cost</span>
                    <span class="summary-value">${summaryState.lowestCost}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Best Value</span>
                    <span class="summary-value">${summaryState.bestValue.toFixed(2)}</span>
                </div>
            `);
        }

        function renderResultsMessageRow(message, className = 'results-message-row') {
            return `<tr><td colspan="6" class="${className}">${escapeHtml(message)}</td></tr>`;
        }

        return {
            renderEmptySummary,
            renderEstimateSummary,
            renderResultsSummary,
            renderResultsMessageRow
        };
    };
})();
