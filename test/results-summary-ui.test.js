const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadResultsSummaryUiFactory(sandbox) {
    const sources = [
        'results-view-state.js',
        'results-summary-ui.js'
    ].map((fileName) => ({
        fileName,
        source: fs.readFileSync(
            path.join(__dirname, '..', 'renderer', fileName),
            'utf8'
        )
    }));

    sources.forEach(({ fileName, source }) => {
        vm.runInNewContext(source, sandbox, { filename: `renderer/${fileName}` });
    });

    return sandbox.window.TFTRenderer.createResultsSummaryUi;
}

describe('renderer results summary ui', () => {
    it('renders empty and estimate summaries through the summary sink', () => {
        const renderedSummaries = [];
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: {
                        escapeHtml: (value) => String(value ?? ''),
                        formatBoardEstimate: (value) => String(value ?? '')
                    }
                }
            }
        };
        const createResultsSummaryUi = loadResultsSummaryUiFactory(sandbox);
        const resultsSummaryUi = createResultsSummaryUi({
            queryUi: {
                setResultsSummary(markup) {
                    renderedSummaries.push(markup);
                }
            }
        }, {
            getBoardMetric(board) {
                return board.synergyScore;
            }
        });

        resultsSummaryUi.renderEmptySummary('No results');
        resultsSummaryUi.renderEstimateSummary({ count: null, remainingSlots: 5 });

        assert.match(renderedSummaries[0], /No results/);
        assert.match(renderedSummaries[1], /Variable search space/);
        assert.match(renderedSummaries[1], />5</);
    });

    it('renders populated result summaries and message rows', () => {
        const renderedSummaries = [];
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: {
                        escapeHtml: (value) => String(value ?? ''),
                        formatBoardEstimate: (value) => String(value ?? '')
                    }
                }
            }
        };
        const createResultsSummaryUi = loadResultsSummaryUiFactory(sandbox);
        const resultsSummaryUi = createResultsSummaryUi({
            queryUi: {
                setResultsSummary(markup) {
                    renderedSummaries.push(markup);
                }
            }
        }, {
            getBoardMetric(board) {
                return board.synergyScore;
            }
        });

        resultsSummaryUi.renderResultsSummary([
            { totalCost: 10, synergyScore: 4 },
            { totalCost: 8, synergyScore: 6 }
        ]);

        assert.match(renderedSummaries[0], /2 boards/);
        assert.match(renderedSummaries[0], />6</);
        assert.match(renderedSummaries[0], />8</);
        assert.match(renderedSummaries[0], />0\.75</);
        assert.equal(
            resultsSummaryUi.renderResultsMessageRow('Failure', 'results-error'),
            '<tr><td colspan="6" class="results-error">Failure</td></tr>'
        );
    });
});
