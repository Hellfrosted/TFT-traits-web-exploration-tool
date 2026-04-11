const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createResultsUiForSortMode(sortMode) {
    const sources = [
        'results-model.js',
        'results-view-state.js',
        'results-tooltip.js',
        'results-renderers.js',
        'results-ui.js'
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
            getElementById: (id) => {
                if (id === 'sortMode') {
                    return { value: sortMode };
                }
                return null;
            },
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
            setResultsSummary: () => {}
        }
    });
}

function createResultsUiForSummary(summarySink) {
    const sources = [
        'results-model.js',
        'results-view-state.js',
        'results-tooltip.js',
        'results-renderers.js',
        'results-ui.js'
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

    it('derives estimate summary state through the extracted results view helper', () => {
        const resultsUi = createResultsUiForSummary(() => {});
        const state = resultsUi.__test.buildEstimateSummaryState(
            { count: 1250000, remainingSlots: 4 },
            (value) => `${value}`
        );

        assert.deepEqual(
            JSON.parse(JSON.stringify(state)),
            {
                estimateLabel: '~1250000 boards',
                openSlotsLabel: '4'
            }
        );
    });

    it('derives a bounded visible result page for large result sets', () => {
        const resultsUi = createResultsUiForSummary(() => {});
        const boards = Array.from({ length: 250 }, (_value, index) => ({
            units: [`Unit-${index + 1}`],
            totalCost: index + 1,
            synergyScore: index + 1
        }));

        const page = resultsUi.__test.getVisibleResultsPage(boards, 1, 100);

        assert.equal(page.page, 1);
        assert.equal(page.totalPages, 3);
        assert.equal(page.startIndex, 100);
        assert.equal(page.endIndex, 200);
        assert.equal(page.items.length, 100);
        assert.equal(page.items[0].units[0], 'Unit-101');
    });

    it('derives results summary state through the extracted results view helper', () => {
        const resultsUi = createResultsUiForSummary(() => {});
        const state = resultsUi.__test.buildResultsSummaryState([
            { totalCost: 10, synergyScore: 4 },
            { totalCost: 8, synergyScore: 6 }
        ], (board) => board.synergyScore);

        assert.deepEqual(
            JSON.parse(JSON.stringify(state)),
            {
                resultCount: 2,
                bestValue: 0.75,
                lowestCost: 8,
                topScore: 6
            }
        );
    });

    it('derives spotlight state through the extracted results view helper', () => {
        const resultsUi = createResultsUiForSummary(() => {});
        const state = resultsUi.__test.buildBoardSpotlightState(
            {
                units: ['A', 'B', 'C'],
                totalCost: 12,
                occupiedSlots: 4,
                synergyScore: 9
            },
            2,
            (board) => board.synergyScore,
            () => 'Best Synergy'
        );

        assert.deepEqual(
            JSON.parse(JSON.stringify(state)),
            {
                boardMetric: 9,
                valueScore: '0.75',
                boardTitle: '4-slot board (3 units) - 9 score',
                rankLabel: 'Rank #3 by Best Synergy',
                metricLabels: ['Score 9', '1-Star 12', '2-Star 36', 'Value 0.75']
            }
        );
    });

    it('derives result row state through the extracted results view helper', () => {
        const resultsUi = createResultsUiForSummary(() => {});
        const state = resultsUi.__test.buildResultRowState(
            { totalCost: 7, synergyScore: 5 },
            4,
            [{ name: 'Bruiser', isActive: true }],
            (board) => board.synergyScore
        );

        assert.deepEqual(
            JSON.parse(JSON.stringify(state)),
            {
                rankLabel: '#5',
                boardMetric: 5,
                valueLabel: 'Value 0.71',
                totalCostLabel: '7',
                twoStarCostLabel: '21',
                traits: [{ name: 'Bruiser', isActive: true }]
            }
        );
    });

    it('falls back to the current page start when the selected board is off-page', () => {
        const resultsUi = createResultsUiForSummary(() => {});
        const pageData = {
            startIndex: 100,
            endIndex: 200
        };

        assert.equal(resultsUi.__test.resolveSelectedBoardIndex(150, pageData, 250), 150);
        assert.equal(resultsUi.__test.resolveSelectedBoardIndex(7, pageData, 250), 100);
        assert.equal(resultsUi.__test.resolveSelectedBoardIndex(-1, pageData, 250), 100);
        assert.equal(resultsUi.__test.resolveSelectedBoardIndex(0, pageData, 0), -1);
    });
});

