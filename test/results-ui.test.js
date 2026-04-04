const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createResultsUiForSortMode(sortMode) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'results-ui.js'),
        'utf8'
    );

    const sandbox = {
        console,
        window: {
            TFTRenderer: {
                shared: {
                    escapeHtml: (value) => String(value ?? ''),
                    renderIconImage: () => '',
                    getBoardMetric: (board) => board.synergyScore ?? board.traitsCount ?? 0,
                    formatBoardEstimate: (value) => String(value ?? '')
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

    vm.runInNewContext(source, sandbox, { filename: 'renderer/results-ui.js' });

    return sandbox.window.TFTRenderer.createResultsUi({
        state: {}
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
});
