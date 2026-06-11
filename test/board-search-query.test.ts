const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    createDefaultSearchQuery,
    normalizeSearchParamsForData,
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

    it('normalizes against active data and drops auto variant locks', () => {
        const query = normalizeSearchParamsForData(
            {
                mustInclude: ['KnownUnit', 'UnknownUnit'],
                mustExcludeTraits: ['KnownTrait', 'UnknownTrait'],
                tankRoles: ['Tank', 'UnknownRole'],
                extraEmblems: ['KnownTrait', 'UnknownTrait'],
                variantLocks: {
                    KnownUnit: 'mode-a',
                    AutoUnit: 'auto',
                    UnknownUnit: 'mode-z'
                }
            },
            {
                units: [
                    { id: 'KnownUnit', variants: [{ id: 'mode-a' }] },
                    { id: 'AutoUnit', variants: [{ id: 'mode-b' }] }
                ],
                traits: ['KnownTrait'],
                roles: ['Tank']
            }
        );

        assert.deepEqual(query.mustInclude, ['KnownUnit']);
        assert.deepEqual(query.mustExcludeTraits, ['KnownTrait']);
        assert.deepEqual(query.tankRoles, ['Tank']);
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
    });
});
