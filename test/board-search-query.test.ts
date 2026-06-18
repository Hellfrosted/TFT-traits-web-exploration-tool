const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    createDefaultSearchQuery,
    normalizeBoolean,
    normalizeSearchParams,
    normalizeSearchParamsForData,
    normalizeStringList,
    normalizeStringMap,
    serializeSearchParams,
    summarizeSearchParams,
    withDefaultRoleFilters
} = require('../src/shared/board-search-query.js');

describe('board search query contract', () => {
    it('creates default queries with active-data role defaults', () => {
        const query = createDefaultSearchQuery(
            {
                roles: ['Tank', 'Magic Tank', 'Carry', 'Ranged', 'Unknown']
            },
            {
                DEFAULT_MAX_RESULTS: 250,
                MAX_RESULTS: 1000
            }
        );

        assert.deepEqual(query.tankRoles, ['Tank', 'Magic Tank']);
        assert.deepEqual(query.carryRoles, ['Carry', 'Ranged']);
        assert.equal(query.maxResults, 250);
    });

    it('preserves selected roles when applying active-data defaults', () => {
        const query = withDefaultRoleFilters(
            {
                tankRoles: ['Custom Tank'],
                carryRoles: ['Custom Carry']
            },
            {
                roles: ['Tank', 'Carry']
            }
        );

        assert.deepEqual(query.tankRoles, ['Custom Tank']);
        assert.deepEqual(query.carryRoles, ['Custom Carry']);
    });

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
        const query = normalizeSearchParams({
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

        assert.equal(query.boardSize, 1);
        assert.equal(query.maxResults, 1000);
        assert.deepEqual(query.mustIncludeTraits, ['Challenger']);
        assert.deepEqual(query.extraEmblems, ['Replicator']);
        assert.deepEqual(query.tankRoles, ['Tank']);
        assert.deepEqual(query.carryRoles, ['Carry']);
        assert.deepEqual(query.variantLocks, {
            MissFortune: 'conduit',
            Vex: 'shadow'
        });
        assert.equal(query.onlyActive, true);
        assert.equal(query.tierRank, false);
        assert.equal(query.includeUnique, true);
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

    it('normalizes against active data and drops auto variant locks', () => {
        const query = normalizeSearchParamsForData(
            {
                mustInclude: ['KnownUnit', 'UnknownUnit'],
                mustExclude: ['UnknownUnit'],
                mustIncludeTraits: ['KnownTrait', 'UnknownTrait'],
                mustExcludeTraits: ['KnownTrait', 'UnknownTrait'],
                tankRoles: ['Tank', 'UnknownRole'],
                carryRoles: ['Carry', 'UnknownRole'],
                extraEmblems: ['KnownTrait', 'UnknownTrait'],
                variantLocks: {
                    KnownUnit: 'mode-a',
                    AutoUnit: 'auto',
                    UnknownUnit: 'mode-z'
                },
                onlyActive: true,
                tierRank: true,
                includeUnique: false
            },
            {
                units: [
                    { id: 'KnownUnit', variants: [{ id: 'mode-a' }] },
                    { id: 'AutoUnit', variants: [{ id: 'mode-b' }] }
                ],
                traits: ['KnownTrait'],
                roles: ['Tank', 'Carry']
            }
        );

        assert.deepEqual(query.mustInclude, ['KnownUnit']);
        assert.deepEqual(query.mustExclude, []);
        assert.deepEqual(query.mustIncludeTraits, ['KnownTrait']);
        assert.deepEqual(query.mustExcludeTraits, ['KnownTrait']);
        assert.deepEqual(query.tankRoles, ['Tank']);
        assert.deepEqual(query.carryRoles, ['Carry']);
        assert.deepEqual(query.extraEmblems, ['KnownTrait']);
        assert.deepEqual(query.variantLocks, { KnownUnit: 'mode-a' });
    });

    it('summarizes and serializes normalized query params from one module', () => {
        const query = {
            boardSize: 10,
            maxResults: 500,
            mustInclude: ['B', 'A'],
            mustExcludeTraits: ['Bruiser'],
            extraEmblems: ['Duelist'],
            variantLocks: {
                B: 'mode-2',
                A: 'mode-1'
            },
            onlyActive: false,
            tierRank: false,
            includeUnique: true
        };

        assert.equal(
            summarizeSearchParams(query),
            'Level 10 • include 2 units • exclude 1 traits • 1 emblems • 2 locked modes • unique traits on • inactive counted • flat ranking'
        );
        assert.equal(
            serializeSearchParams(query),
            serializeSearchParams({
                ...query,
                mustInclude: ['A', 'B'],
                variantLocks: {
                    A: 'mode-1',
                    B: 'mode-2'
                }
            })
        );
        assert.equal(
            serializeSearchParams({
                ...query,
                onlyActive: true
            }),
            serializeSearchParams({
                ...query,
                onlyActive: 'true'
            })
        );
    });
});
