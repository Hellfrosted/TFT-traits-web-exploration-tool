const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let helpersPromise = null;

async function loadHelpers() {
    if (helpersPromise) {
        return await helpersPromise;
    }

    helpersPromise = (async () => {
        const sourcePath = path.join(__dirname, '..', 'src', 'renderer', 'helpers.js');
        const source = await fs.promises.readFile(sourcePath, 'utf8');
        const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
        return await import(moduleUrl);
    })();

    return await helpersPromise;
}

describe('react renderer helpers', () => {
    it('normalizes query params to the renderer contract', async () => {
        const { normalizeSearchParams } = await loadHelpers();

        assert.deepEqual(normalizeSearchParams({
            boardSize: '30',
            maxResults: '5000',
            mustInclude: ['Aatrox', { id: 'Jax' }, 'Aatrox', ''],
            mustExcludeTraits: [{ value: 'Bruiser' }],
            variantLocks: {
                MissFortune: 'conduit',
                AutoUnit: 'auto',
                EmptyUnit: ''
            },
            onlyActive: 0,
            tierRank: 1,
            includeUnique: ''
        }, {
            DEFAULT_MAX_RESULTS: 250,
            MAX_RESULTS: 1000
        }), {
            boardSize: 20,
            maxResults: 1000,
            mustInclude: ['Aatrox', 'Jax'],
            mustExclude: [],
            mustIncludeTraits: [],
            mustExcludeTraits: ['Bruiser'],
            tankRoles: [],
            carryRoles: [],
            extraEmblems: [],
            variantLocks: {
                MissFortune: 'conduit'
            },
            onlyActive: false,
            tierRank: true,
            includeUnique: false
        });
    });

    it('derives default role filters without surfacing unknown carry roles', async () => {
        const {
            deriveDefaultTankRoles,
            deriveDefaultCarryRoles
        } = await loadHelpers();
        const roles = ['Tank', 'Magic Tank', 'Carry', 'Ranged', 'Unknown', 'Carry'];

        assert.deepEqual(deriveDefaultTankRoles(roles), ['Tank', 'Magic Tank']);
        assert.deepEqual(deriveDefaultCarryRoles(roles), ['Carry', 'Ranged']);
    });

    it('sorts boards by the active result ordering mode', async () => {
        const { sortBoards } = await loadHelpers();
        const boards = [
            { units: ['A'], synergyScore: 3, totalCost: 12 },
            { units: ['B'], synergyScore: 5, totalCost: 9 },
            { units: ['C'], synergyScore: 5, totalCost: 15 }
        ];

        assert.deepEqual(sortBoards(boards, 'mostTraits').map((board) => board.units[0]), ['C', 'B', 'A']);
        assert.deepEqual(sortBoards(boards, 'lowestCost').map((board) => board.units[0]), ['B', 'A', 'C']);
        assert.deepEqual(sortBoards(boards, 'highestCost').map((board) => board.units[0]), ['C', 'A', 'B']);
        assert.deepEqual(sortBoards(boards, 'bestValue').map((board) => board.units[0]), ['B', 'C', 'A']);
    });

    it('builds active data maps and trait summaries for result rendering', async () => {
        const {
            buildTraitSummary,
            createActiveData,
            getAssetCoverageLabel
        } = await loadHelpers();
        const activeData = createActiveData({
            units: [
                { id: 'Aatrox', displayName: 'Aatrox' },
                { id: 'Jax', displayName: 'Jax' }
            ],
            traits: ['Bruiser', 'Duelist', 'Ace'],
            roles: ['Tank', 'Carry'],
            traitBreakpoints: {
                Bruiser: [2, 4],
                Duelist: [2, 4],
                Ace: [1]
            },
            traitIcons: {
                Bruiser: 'bruiser.png'
            },
            assetValidation: {
                valid: 2,
                total: 3
            },
            dataSource: 'latest',
            dataFingerprint: 'fingerprint'
        }, 'pbe');

        const summaryWithoutUnique = buildTraitSummary({
            traitCounts: {
                Bruiser: 2,
                Duelist: 1,
                Ace: 1
            }
        }, activeData, {
            includeUnique: false,
            extraEmblems: ['Duelist']
        });
        const summaryWithUnique = buildTraitSummary({
            traitCounts: {
                Ace: 1
            }
        }, activeData, {
            includeUnique: true,
            extraEmblems: []
        });

        assert.equal(activeData.unitMap.get('Jax').displayName, 'Jax');
        assert.equal(activeData.dataSource, 'latest');
        assert.equal(getAssetCoverageLabel(activeData.assetValidation), '2/3');
        assert.deepEqual(summaryWithoutUnique.map((trait) => trait.label), [
            'Bruiser 2/2',
            'Duelist 2/2'
        ]);
        assert.deepEqual(summaryWithUnique.map((trait) => trait.label), ['Ace 1/1']);
    });

    it('collects trait labels from base units and variants', async () => {
        const { collectUnitTraitLabels } = await loadHelpers();

        assert.deepEqual(collectUnitTraitLabels({
            traits: ['Bruiser'],
            traitContributions: {
                Vanguard: 1
            },
            variants: [
                { traits: ['Duelist'] },
                { traitContributions: { Ace: 1 } }
            ]
        }), ['Ace', 'Duelist', 'Vanguard']);
    });
});
