const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeBoolean,
    normalizeSearchParamsForData,
    normalizeSearchParams,
    serializeSearchParams,
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
        assert.equal(normalized.maxResults, 1000);
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

    it('drops unknown values when normalizing against active data', () => {
        const normalized = normalizeSearchParamsForData({
            boardSize: 9,
            maxResults: 500,
            mustInclude: ['KnownUnit', 'UnknownUnit'],
            mustExclude: ['UnknownUnit'],
            mustIncludeTraits: ['KnownTrait', 'UnknownTrait'],
            mustExcludeTraits: ['UnknownTrait'],
            tankRoles: ['Tank', 'UnknownRole'],
            carryRoles: ['Carry', 'UnknownRole'],
            extraEmblems: ['KnownTrait', 'UnknownTrait'],
            variantLocks: {
                KnownUnit: 'mode-a',
                UnknownUnit: 'mode-z'
            },
            onlyActive: true,
            tierRank: true,
            includeUnique: false
        }, {
            units: [
                {
                    id: 'KnownUnit',
                    variants: [{ id: 'mode-a' }]
                }
            ],
            traits: ['KnownTrait'],
            roles: ['Tank', 'Carry']
        });

        assert.deepEqual(normalized.mustInclude, ['KnownUnit']);
        assert.deepEqual(normalized.mustExclude, []);
        assert.deepEqual(normalized.mustIncludeTraits, ['KnownTrait']);
        assert.deepEqual(normalized.mustExcludeTraits, []);
        assert.deepEqual(normalized.tankRoles, ['Tank']);
        assert.deepEqual(normalized.carryRoles, ['Carry']);
        assert.deepEqual(normalized.extraEmblems, ['KnownTrait']);
        assert.deepEqual(normalized.variantLocks, { KnownUnit: 'mode-a' });
    });

    it('serializes equivalent params deterministically regardless of ordering', () => {
        const left = serializeSearchParams({
            boardSize: 9,
            maxResults: 500,
            mustInclude: ['B', 'A'],
            variantLocks: {
                B: 'mode-2',
                A: 'mode-1'
            },
            onlyActive: true
        });
        const right = serializeSearchParams({
            maxResults: 500,
            boardSize: 9,
            mustInclude: ['A', 'B'],
            variantLocks: {
                A: 'mode-1',
                B: 'mode-2'
            },
            onlyActive: 'true'
        });

        assert.equal(left, right);
    });
});
