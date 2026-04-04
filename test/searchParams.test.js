const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeBoolean,
    normalizeSearchParams,
    normalizeStringList,
    normalizeStringMap
} = require('../searchParams.js');

describe('search param normalization', () => {
    it('normalizes option objects into distinct string values', () => {
        assert.deepEqual(
            normalizeStringList([
                { value: 'Challenger', label: 'Challenger' },
                { id: 'Lux' },
                { name: 'Mage' },
                'Lux',
                '  Challenger  ',
                '',
                null
            ]),
            ['Challenger', 'Lux', 'Mage']
        );
    });

    it('clamps numeric inputs and sanitizes array params', () => {
        const normalized = normalizeSearchParams({
            boardSize: '0',
            maxResults: '500000',
            mustIncludeTraits: [{ value: 'Challenger' }, { value: 'Challenger' }],
            extraEmblems: [{ label: 'Replicator' }],
            tankRoles: ['Tank', 'Tank'],
            carryRoles: [{ value: 'Carry' }],
            variantLocks: {
                MissFortune: 'conduit',
                Vex: { value: 'shadow' },
                '': 'bad'
            },
            onlyActive: 1,
            tierRank: 0,
            includeUnique: 'yes'
        });

        assert.equal(normalized.boardSize, 1);
        assert.equal(normalized.maxResults, 10000);
        assert.deepEqual(normalized.mustIncludeTraits, ['Challenger']);
        assert.deepEqual(normalized.extraEmblems, ['Replicator']);
        assert.deepEqual(normalized.tankRoles, ['Tank']);
        assert.deepEqual(normalized.carryRoles, ['Carry']);
        assert.deepEqual(normalized.variantLocks, {
            MissFortune: 'conduit',
            Vex: 'shadow'
        });
        assert.equal(normalized.onlyActive, true);
        assert.equal(normalized.tierRank, false);
        assert.equal(normalized.includeUnique, true);
    });

    it('normalizes string and numeric booleans predictably', () => {
        assert.equal(normalizeBoolean('false'), false);
        assert.equal(normalizeBoolean('0'), false);
        assert.equal(normalizeBoolean('off'), false);
        assert.equal(normalizeBoolean('yes'), true);
        assert.equal(normalizeBoolean(0), false);
        assert.equal(normalizeBoolean(1), true);
    });

    it('normalizes variant lock objects into stable string maps', () => {
        assert.deepEqual(
            normalizeStringMap({
                MissFortune: { value: 'conduit' },
                Vex: '  shadow  ',
                ' ': 'ignored',
                Annie: ''
            }),
            {
                MissFortune: 'conduit',
                Vex: 'shadow'
            }
        );
    });
});
