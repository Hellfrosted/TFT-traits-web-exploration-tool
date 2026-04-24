const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../engine.js');
const { countPreparedSearchSpaceCandidates } = require('../engine/search-space-counter.js');
const { mechaSlotDataCache } = require('./fixtures/engine-fixtures.js');

describe('search space counter helpers', () => {
    it('returns zero when the prepared context cannot produce a valid board', () => {
        assert.equal(countPreparedSearchSpaceCandidates({
            remainingSlots: -1,
            hasAllRequiredUnits: true,
            getUnitSlotCostRange: Engine.getUnitSlotCostRange.bind(Engine)
        }), 0);

        assert.equal(countPreparedSearchSpaceCandidates({
            remainingSlots: 2,
            hasAllRequiredUnits: false,
            getUnitSlotCostRange: Engine.getUnitSlotCostRange.bind(Engine)
        }), 0);
    });

    it('counts prepared slot-varying search spaces with required-unit flex', () => {
        const preparedContext = Engine.prepareSearchContext(mechaSlotDataCache, {
            boardSize: 2,
            mustInclude: ['Galio'],
            mustExclude: [],
            mustExcludeTraits: [],
            variantLocks: {}
        });

        assert.equal(countPreparedSearchSpaceCandidates({
            ...preparedContext,
            getUnitSlotCostRange: Engine.getUnitSlotCostRange.bind(Engine)
        }), 8);
    });

    it('respects variant locks when counting prepared search spaces', () => {
        const preparedContext = Engine.prepareSearchContext(mechaSlotDataCache, {
            boardSize: 8,
            mustInclude: [],
            mustExclude: [],
            mustExcludeTraits: [],
            variantLocks: {
                Galio: 'two-slot'
            }
        });

        assert.equal(countPreparedSearchSpaceCandidates({
            ...preparedContext,
            variantLocks: {
                Galio: 'two-slot'
            },
            getUnitSlotCostRange: Engine.getUnitSlotCostRange.bind(Engine)
        }), 43);
    });
});
