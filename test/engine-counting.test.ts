const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../engine.js');
const {
    conditionalEffectDataCache,
    conditionalProfileDataCache,
    mechaSlotDataCache,
    mockDataCache
} = require('./fixtures/engine-fixtures.js');

describe('Engine.popcount', () => {
    it('returns 0 for 0n', () => {
        assert.equal(Engine.popcount(0n), 0);
    });

    it('counts single bit', () => {
        assert.equal(Engine.popcount(1n), 1);
        assert.equal(Engine.popcount(4n), 1);
    });

    it('counts multiple bits', () => {
        assert.equal(Engine.popcount(7n), 3);
        assert.equal(Engine.popcount(15n), 4);
        assert.equal(Engine.popcount(255n), 8);
    });

    it('handles large BigInts', () => {
        assert.equal(Engine.popcount((1n << 64n) - 1n), 64);
    });
});

describe('Engine.popcountInt', () => {
    it('returns 0 for 0', () => {
        assert.equal(Engine.popcountInt(0), 0);
    });

    it('counts bits correctly', () => {
        assert.equal(Engine.popcountInt(7), 3);
        assert.equal(Engine.popcountInt(255), 8);
    });
});

describe('Engine.combinations', () => {
    it('C(n, 0) = 1', () => {
        assert.equal(Engine.combinations(10, 0), 1);
    });

    it('C(n, n) = 1', () => {
        assert.equal(Engine.combinations(5, 5), 1);
    });

    it('C(n, 1) = n', () => {
        assert.equal(Engine.combinations(10, 1), 10);
    });

    it('returns 0 when k > n', () => {
        assert.equal(Engine.combinations(3, 5), 0);
    });

    it('calculates known values correctly', () => {
        assert.equal(Engine.combinations(5, 2), 10);
        assert.equal(Engine.combinations(10, 3), 120);
        assert.equal(Engine.combinations(52, 5), 2598960);
    });
});

describe('Engine.getCombinationCount', () => {
    it('returns correct count for simple case', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 3,
            mustInclude: [],
            mustExclude: [],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 56);
        assert.equal(result.remainingSlots, 3);
    });

    it('reduces search space with must-include', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 3,
            mustInclude: ['Garen', 'Lux'],
            mustExclude: [],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 6);
        assert.equal(result.remainingSlots, 1);
    });

    it('reduces pool with must-exclude', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 3,
            mustInclude: [],
            mustExclude: ['Garen', 'Darius'],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 20);
        assert.equal(result.remainingSlots, 3);
    });

    it('returns zero combinations when must-include unit is missing after filtering', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 3,
            mustInclude: ['Zed'],
            mustExclude: ['Zed'],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 0);
    });

    it('returns zero combinations when board size is smaller than locked units', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 1,
            mustInclude: ['Garen', 'Lux'],
            mustExclude: [],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 0);
        assert.equal(result.remainingSlots, -1);
    });

    it('filters units by excluded traits', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 3,
            mustInclude: [],
            mustExclude: [],
            mustExcludeTraits: ['Assassin']
        });
        assert.equal(result.count, 20);
        assert.equal(result.remainingSlots, 3);
    });

    it('counts candidate boards for slot-varying variant searches', () => {
        const result = Engine.getCombinationCount(mechaSlotDataCache, {
            boardSize: 9,
            mustInclude: [],
            mustExclude: [],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 19);
        assert.equal(result.remainingSlots, 9);
    });

    it('keeps slot-varying estimates bounded for one-open-slot searches', () => {
        const result = Engine.getCombinationCount(mechaSlotDataCache, {
            boardSize: 2,
            mustInclude: ['Galio'],
            mustExclude: [],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 8);
        assert.equal(result.remainingSlots, 1);
    });

    it('leaves units in the pool unless explicitly excluded', () => {
        const validUnits = Engine.getValidUnits(mockDataCache, [], []);
        assert.equal(validUnits.length, 8);
        assert.ok(validUnits.some((unit) => unit.id === 'Zed'));
    });

    it('applies explicit unit exclusions only when requested', () => {
        const validUnits = Engine.getValidUnits(mockDataCache, ['Zed'], []);
        assert.equal(validUnits.length, 7);
        assert.ok(!validUnits.some((unit) => unit.id === 'Zed'));
    });

    it('treats conditional-effect traits as excluded traits during unit filtering', () => {
        const validUnits = Engine.getValidUnits(conditionalEffectDataCache, [], ['Arcane']);
        assert.ok(!validUnits.some((unit) => unit.id === 'Catalyst'));
    });

    it('treats conditional-profile traits as excluded traits during unit filtering', () => {
        const validUnits = Engine.getValidUnits(conditionalProfileDataCache, [], ['Arcane']);
        assert.ok(!validUnits.some((unit) => unit.id === 'Shifter'));
    });
});
