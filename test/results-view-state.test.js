const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadResultsViewState() {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'results-view-state.js'),
        'utf8'
    );
    const sandbox = {
        console,
        window: {
            TFTRenderer: {}
        }
    };

    vm.runInNewContext(source, sandbox, { filename: 'renderer/results-view-state.js' });
    return sandbox.window.TFTRenderer.resultsViewState;
}

describe('renderer results view state', () => {
    it('derives estimate summary state', () => {
        const resultsViewState = loadResultsViewState();
        const state = resultsViewState.buildEstimateSummaryState(
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
        const resultsViewState = loadResultsViewState();
        const boards = Array.from({ length: 250 }, (_value, index) => ({
            units: [`Unit-${index + 1}`],
            totalCost: index + 1,
            synergyScore: index + 1
        }));

        const page = resultsViewState.getVisibleResultsPage(boards, 1, 100);

        assert.equal(page.page, 1);
        assert.equal(page.totalPages, 3);
        assert.equal(page.startIndex, 100);
        assert.equal(page.endIndex, 200);
        assert.equal(page.items.length, 100);
        assert.equal(page.items[0].units[0], 'Unit-101');
    });

    it('derives results summary state', () => {
        const resultsViewState = loadResultsViewState();
        const state = resultsViewState.buildResultsSummaryState([
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

    it('derives spotlight state', () => {
        const resultsViewState = loadResultsViewState();
        const state = resultsViewState.buildBoardSpotlightState(
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

    it('derives result row state', () => {
        const resultsViewState = loadResultsViewState();
        const state = resultsViewState.buildResultRowState(
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
        const resultsViewState = loadResultsViewState();
        const pageData = {
            startIndex: 100,
            endIndex: 200
        };

        assert.equal(resultsViewState.resolveSelectedBoardIndex(150, pageData, 250), 150);
        assert.equal(resultsViewState.resolveSelectedBoardIndex(7, pageData, 250), 100);
        assert.equal(resultsViewState.resolveSelectedBoardIndex(-1, pageData, 250), 100);
        assert.equal(resultsViewState.resolveSelectedBoardIndex(0, pageData, 0), -1);
    });
});
