const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    createTopBoardTracker,
    finalizeTopBoards
} = require('../engine/search-results.js');

describe('search results helpers', () => {
    it('tracks only the strongest boards up to the configured max', () => {
        const tracker = createTopBoardTracker({
            maxBoards: 2,
            findWorstBoardIndex: (boards) => boards[0]._score <= boards[1]._score ? 0 : 1,
            createBoardResult: ({ unitIds, evaluation, totalCost }) => ({
                units: unitIds,
                ...evaluation,
                totalCost,
                _score: evaluation.synergyScore * 10000 + totalCost
            })
        });

        tracker.addBoard({
            unitIds: ['A'],
            evaluation: { synergyScore: 1, occupiedSlots: 1, traitCounts: {} },
            totalCost: 1
        });
        tracker.addBoard({
            unitIds: ['B'],
            evaluation: { synergyScore: 2, occupiedSlots: 1, traitCounts: {} },
            totalCost: 1
        });

        assert.equal(tracker.canAcceptScore(10000), false);

        tracker.addBoard({
            unitIds: ['C'],
            evaluation: { synergyScore: 3, occupiedSlots: 1, traitCounts: {} },
            totalCost: 1
        });

        assert.deepEqual(
            tracker.topBoards.map((board) => board.units[0]).sort(),
            ['B', 'C']
        );
    });

    it('finalizes boards by dropping scores and sorting deterministically', () => {
        const boards = finalizeTopBoards([
            { units: ['B'], synergyScore: 2, totalCost: 3, _score: 20003 },
            { units: ['A'], synergyScore: 2, totalCost: 5, _score: 20005 },
            { units: ['C'], synergyScore: 1, totalCost: 8, _score: 10008 }
        ]);

        assert.deepEqual(boards, [
            { units: ['A'], synergyScore: 2, totalCost: 5 },
            { units: ['B'], synergyScore: 2, totalCost: 3 },
            { units: ['C'], synergyScore: 1, totalCost: 8 }
        ]);
    });
});
