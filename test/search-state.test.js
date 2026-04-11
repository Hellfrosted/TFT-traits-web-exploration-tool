const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildTraitIndex,
    buildMustIncludeTraitTargets,
    calculateSynergyScore,
    scoreBoard,
    resolveSearchSpaceError
} = require('../engine/search-state.js');

describe('search state helpers', () => {
    it('builds trait indexes and must-include targets', () => {
        const allTraitNames = ['Bruiser', 'Sniper', 'Unique'];
        const traitIndex = buildTraitIndex(allTraitNames);
        const targets = buildMustIncludeTraitTargets([0, 2], allTraitNames, {
            Bruiser: [2, 4],
            Unique: [1]
        });

        assert.deepEqual(traitIndex, {
            Bruiser: 0,
            Sniper: 1,
            Unique: 2
        });
        assert.deepEqual(targets, [2, 1]);
    });

    it('calculates synergy scores with unique and inactive trait controls', () => {
        const counts = Uint8Array.from([4, 1, 1]);
        const allTraitNames = ['Bruiser', 'Sniper', 'Unique'];
        const traitBreakpoints = {
            Bruiser: [2, 4],
            Sniper: [2],
            Unique: [1]
        };

        assert.equal(calculateSynergyScore(counts, {
            allTraitNames,
            traitBreakpoints,
            onlyActive: true,
            tierRank: true,
            includeUnique: false
        }), 2);

        assert.equal(calculateSynergyScore(counts, {
            allTraitNames,
            traitBreakpoints,
            onlyActive: false,
            tierRank: false,
            includeUnique: true
        }), 3);
    });

    it('scores boards and formats oversized-search errors', () => {
        assert.equal(scoreBoard(7, 42), 70042);
        assert.match(
            resolveSearchSpaceError(7_500_000_000, { COMBINATION_LIMIT: 1_000_000_000 }),
            /7\.5B combinations/
        );
        assert.match(resolveSearchSpaceError(Number.NaN), /7 empty slots/);
    });
});
