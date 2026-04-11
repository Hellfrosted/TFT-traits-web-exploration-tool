const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../engine.js');
const { normalizeSearchParams } = require('../searchParams.js');
const { buildSearchExecutionContext } = require('../engine/search-execution-context.js');
const {
    mechaSlotDataCache,
    mockDataCache
} = require('./fixtures/engine-fixtures.js');

function createExecutionContext(dataCache, params) {
    const normalizedParams = normalizeSearchParams(params);
    return buildSearchExecutionContext({
        dataCache,
        normalizedParams,
        preparedSearchContext: Engine.prepareSearchContext(dataCache, normalizedParams),
        engine: Engine
    });
}

describe('search execution context', () => {
    it('builds a dfs-ready search context for fixed-slot searches', () => {
        const context = createExecutionContext(mockDataCache, {
            boardSize: 3,
            maxResults: 10,
            mustInclude: [],
            mustExclude: [],
            mustIncludeTraits: [],
            mustExcludeTraits: [],
            tankRoles: [],
            carryRoles: [],
            extraEmblems: [],
            onlyActive: false,
            tierRank: false,
            includeUnique: true
        });

        assert.equal(context.totalCombinations, 56);
        assert.equal(context.searchSpaceError, null);
        assert.equal(context.dfsInput.boardSize, 3);
        assert.equal(context.dfsInput.availableIndices.length, 8);
        assert.equal(context.dfsInput.initialState.currentMinSlots, 0);
        assert.equal(context.dfsInput.initialState.currentSlotFlex, 0);
        assert.deepEqual(context.dfsInput.pruneState.mustIncludeTraitIndices, []);
    });

    it('enables must-include trait pruning for simple fixed-slot searches', () => {
        const context = createExecutionContext(mockDataCache, {
            boardSize: 3,
            maxResults: 10,
            mustIncludeTraits: ['Mage']
        });

        assert.equal(context.searchSpaceError, null);
        assert.equal(context.dfsInput.pruneState.useMustIncludePruning, true);
        assert.deepEqual(context.dfsInput.pruneState.mustIncludeTraitTargets, [2]);
    });

    it('disables must-include trait pruning when variants and slot-flex are involved', () => {
        const context = createExecutionContext(mechaSlotDataCache, {
            boardSize: 2,
            maxResults: 10,
            mustIncludeTraits: ['Mecha']
        });

        assert.ok(Number.isFinite(context.totalCombinations));
        assert.equal(context.searchSpaceError, null);
        assert.equal(context.dfsInput.pruneState.useMustIncludePruning, false);
        assert.deepEqual(context.dfsInput.pruneState.mustIncludeTraitTargets, [2]);
    });
});
