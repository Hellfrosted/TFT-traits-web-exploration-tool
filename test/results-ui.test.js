const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createResultsUiForSortMode(sortMode) {
    const sources = [
        'results-model.js',
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

