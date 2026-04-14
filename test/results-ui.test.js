const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createResultsUiForSortMode(sortMode) {
    const sources = [
        'results-ui.js',
        'results-renderers.js',
        'results-spotlight.js',
        'results-summary-ui.js',
        'results-interactions.js',
        'results-tooltip.js',
        'results-model.js',
        'results-view-state.js'
    ].map((fileName) => ({
        fileName,
        source: fs.readFileSync(
            path.join(__dirname, '..', 'renderer', fileName),
            'utf8'
        )
    }));

    const sandbox = {
        console,
        window: {
            TFTRenderer: {
                shared: {
                    escapeHtml: (value) => String(value ?? ''),
                    renderIconImage: () => '',
                    getBoardMetric: (board) => board.synergyScore ?? board.traitsCount ?? 0,
                    formatBoardEstimate: (value) => String(value ?? ''),
                    resolveShellElements: () => ({
                        elements: {},
                        missingIds: []
                    }),
                    setResultsBodyMessage: () => false
                }
            }
        },
        document: {
            getElementById: () => null,
            querySelector: () => null,
            addEventListener: () => {},
            body: {
                contains: () => false
            }
        }
    };

    sources.forEach(({ fileName, source }) => {
        vm.runInNewContext(source, sandbox, { filename: `renderer/${fileName}` });
    });

    return sandbox.window.TFTRenderer.createResultsUi({
        state: {
            currentSortMode: sortMode
        },
        queryUi: {
            setResultsSummary: () => {}
        }
    });
}

function createResultsUiForSummary(summarySink) {
    const sources = [
        'results-ui.js',
        'results-renderers.js',
        'results-spotlight.js',
        'results-summary-ui.js',
        'results-interactions.js',
        'results-tooltip.js',
        'results-model.js',
        'results-view-state.js'
    ].map((fileName) => ({
        fileName,
        source: fs.readFileSync(
            path.join(__dirname, '..', 'renderer', fileName),
            'utf8'
        )
    }));

    const sandbox = {
        console,
        window: {
            TFTRenderer: {
                shared: {
                    escapeHtml: (value) => String(value ?? ''),
                    renderIconImage: () => '',
                    getBoardMetric: (board) => board.synergyScore ?? board.traitsCount ?? 0,
                    formatBoardEstimate: (value) => String(value ?? ''),
                    resolveShellElements: () => ({
                        elements: {},
                        missingIds: []
                    }),
                    setResultsBodyMessage: () => false
                }
            }
        },
        document: {
            getElementById: () => null,
            querySelector: () => null,
            addEventListener: () => {},
            body: {
                contains: () => false
            }
        }
    };

    sources.forEach(({ fileName, source }) => {
        vm.runInNewContext(source, sandbox, { filename: `renderer/${fileName}` });
    });

    return sandbox.window.TFTRenderer.createResultsUi({
        state: {},
        queryUi: {
            setResultsSummary: summarySink
        }
    });
}

describe('results UI sorting', () => {
    it('breaks lowest-cost ties by synergy score', () => {
        const resultsUi = createResultsUiForSortMode('lowestCost');
        const boards = [
            { units: ['A'], totalCost: 10, synergyScore: 3 },
            { units: ['B'], totalCost: 8, synergyScore: 1 },
            { units: ['C'], totalCost: 8, synergyScore: 5 }
        ];

        const sorted = Array.from(resultsUi.getSortedResults(boards));
        assert.deepEqual(
            sorted.map((board) => board.units[0]),
            ['C', 'B', 'A']
        );
    });

    it('breaks highest-cost ties by synergy score', () => {
        const resultsUi = createResultsUiForSortMode('highestCost');
        const boards = [
            { units: ['A'], totalCost: 12, synergyScore: 3 },
            { units: ['B'], totalCost: 15, synergyScore: 1 },
            { units: ['C'], totalCost: 15, synergyScore: 5 }
        ];

        const sorted = Array.from(resultsUi.getSortedResults(boards));
        assert.deepEqual(
            sorted.map((board) => board.units[0]),
            ['C', 'B', 'A']
        );
    });

    it('renders a variable search-space label when the estimate count is null', () => {
        const summaries = [];
        const resultsUi = createResultsUiForSummary((content) => summaries.push(content));

        resultsUi.renderEstimateSummary({
            count: null,
            remainingSlots: 6
        });

        assert.match(summaries.at(-1), /Variable search space/);
        assert.doesNotMatch(summaries.at(-1), /~-\s*boards/);
        assert.match(summaries.at(-1), />6</);
    });

});

