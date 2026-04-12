(function initializeResultsUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createResultsUi = function createResultsUi(app) {
        const model = ns.createResultsModel(app);
        const tooltipController = ns.createResultsTooltip(app, model);
        const renderers = ns.createResultsRenderers(app, model, tooltipController);

        return {
            ...renderers,
            getSortedResults: model.getSortedResults,
            __test: {
                ...renderers.__test,
                buildEstimateSummaryState: ns.resultsViewState?.buildEstimateSummaryState,
                buildResultsSummaryState: ns.resultsViewState?.buildResultsSummaryState,
                buildBoardSpotlightState: ns.resultsViewState?.buildBoardSpotlightState,
                buildResultRowState: ns.resultsViewState?.buildResultRowState
            }
        };
    };
})();
