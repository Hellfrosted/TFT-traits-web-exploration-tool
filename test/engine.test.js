const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../engine.js');
const {
    aliasedTraitDataCache,
    conditionalEffectDataCache,
    conditionalEffectVariantDataCache,
    conditionalProfileDataCache,
    conditionalProfileVariantDataCache,
    conditionalVariantDataCache,
    mechaSlotDataCache,
    mockDataCache,
    roleThresholdDataCache,
    singlePassConditionalDataCache,
    variantTraitDataCache,
    weightedTraitDataCache
} = require('./fixtures/engine-fixtures.js');

describe('Engine.search', () => {
    const baseParams = {
        boardSize: 3,
        mustInclude: [],
        mustExclude: [],
        mustIncludeTraits: [],
        mustExcludeTraits: [],
        tankRoles: [],
        carryRoles: [],
        extraEmblems: [],
        onlyActive: false,
        tierRank: false,
        includeUnique: true,
        maxResults: 10
    };

    it('returns results array', () => {
        const results = Engine.search(mockDataCache, baseParams);
        assert.ok(Array.isArray(results));
    });

    it('all results have required fields', () => {
        const results = Engine.search(mockDataCache, baseParams);
        for (const result of results) {
            if (result.error) continue;
            assert.ok(Array.isArray(result.units), 'units should be an array');
            assert.ok(typeof result.synergyScore === 'number', 'synergyScore should be a number');
            assert.ok(typeof result.totalCost === 'number', 'totalCost should be a number');
            assert.equal(result.units.length, baseParams.boardSize, 'board should have correct unit count');
        }
    });

    it('respects must-include constraint', () => {
        const params = { ...baseParams, mustInclude: ['Garen'] };
        const results = Engine.search(mockDataCache, params);
        for (const result of results) {
            if (result.error) continue;
            assert.ok(result.units.includes('Garen'), 'every result should include Garen');
        }
    });

    it('respects must-exclude constraint', () => {
        const params = { ...baseParams, mustExclude: ['Zed'] };
        const results = Engine.search(mockDataCache, params);
        for (const result of results) {
            if (result.error) continue;
            assert.ok(!result.units.includes('Zed'), 'no result should include Zed');
        }
    });

    it('keeps Zed available when no explicit exclusion is set', () => {
        const results = Engine.search(mockDataCache, baseParams);
        assert.ok(results.some((result) => !result.error && result.units.includes('Zed')));
    });

    it('respects explicitly required units', () => {
        const params = { ...baseParams, mustInclude: ['Zed'] };
        const results = Engine.search(mockDataCache, params);
        assert.ok(results.length > 0);
        for (const result of results) {
            if (result.error) continue;
            assert.ok(result.units.includes('Zed'), 'required unit should appear in every result');
        }
    });

    it('requires either two 3-cost tanks or one 4-cost tank, plus one 4-cost carry', () => {
        const results = Engine.search(roleThresholdDataCache, {
            ...baseParams,
            tankRoles: ['Tank'],
            carryRoles: ['Carry']
        });

        assert.ok(results.length > 0);
        results.forEach((result) => {
            const units = result.units.map((unitId) =>
                roleThresholdDataCache.units.find((unit) => unit.id === unitId)
            );
            const tanks = units.filter((unit) => unit.role === 'Tank');
            const carries = units.filter((unit) => unit.role === 'Carry');
            const tankThreePlusCount = tanks.filter((unit) => unit.cost >= 3).length;
            const tankFourPlusCount = tanks.filter((unit) => unit.cost >= 4).length;
            const carryFourPlusCount = carries.filter((unit) => unit.cost >= 4).length;

            assert.ok(tankFourPlusCount >= 1 || tankThreePlusCount >= 2);
            assert.ok(carryFourPlusCount >= 1);
        });
    });

    it('treats an empty tank role list as no tank-role requirement', () => {
        const params = {
            ...baseParams,
            tankRoles: [],
            carryRoles: ['Carry'],
            boardSize: 2,
            mustInclude: ['CheapCarry', 'EliteCarry']
        };
        const results = Engine.search(roleThresholdDataCache, params);
        assert.ok(results.length > 0);
        results.forEach((result) => {
            assert.ok(result.units.includes('CheapCarry'));
            assert.ok(result.units.includes('EliteCarry'));
        });
    });

    it('treats an empty carry role list as no carry-role requirement', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            tankRoles: ['Tank'],
            carryRoles: [],
            mustInclude: ['MidTankA', 'MidTankB']
        };
        const results = Engine.search(roleThresholdDataCache, params);
        assert.ok(results.length > 0);
        results.forEach((result) => {
            assert.ok(result.units.includes('MidTankA'));
            assert.ok(result.units.includes('MidTankB'));
        });
    });

    it('rejects boards that have role matches but miss the new cost thresholds', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            tankRoles: ['Tank'],
            carryRoles: ['Carry'],
            mustInclude: ['CheapTank', 'CheapCarry', 'Flex']
        };
        const results = Engine.search(roleThresholdDataCache, params);
        assert.deepEqual(results, []);
    });

    it('allows one 4-cost tank to satisfy the tank requirement', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            tankRoles: ['Tank'],
            carryRoles: ['Carry'],
            mustInclude: ['EliteTank', 'EliteCarry']
        };
        const results = Engine.search(roleThresholdDataCache, params);
        assert.equal(results.length, 1);
        assert.deepEqual(results[0].units, ['EliteCarry', 'EliteTank']);
    });

    it('prefers higher-cost boards when synergy scores tie', () => {
        const expensiveTieDataCache = {
            units: [
                { id: 'FrontlineCheap', cost: 1, role: 'Tank', traits: ['Alpha'], traitIds: ['Alpha'] },
                { id: 'FrontlineExpensive', cost: 5, role: 'Tank', traits: ['Alpha'], traitIds: ['Alpha'] },
                { id: 'BacklineCheap', cost: 1, role: 'Carry', traits: ['Beta'], traitIds: ['Beta'] },
                { id: 'BacklineExpensive', cost: 5, role: 'Carry', traits: ['Beta'], traitIds: ['Beta'] }
            ],
            traits: ['Alpha', 'Beta'],
            roles: ['Tank', 'Carry'],
            traitBreakpoints: {
                Alpha: [1],
                Beta: [1]
            },
            hashMap: {
                Alpha: 'Alpha',
                Beta: 'Beta'
            }
        };

        const params = {
            ...baseParams,
            boardSize: 2,
            mustInclude: [],
            mustExclude: [],
            mustIncludeTraits: [],
            mustExcludeTraits: [],
            includeUnique: true,
            onlyActive: true,
            tierRank: false,
            maxResults: 5
        };

        const results = Engine.search(expensiveTieDataCache, params);

        assert.equal(results[0].synergyScore, 2);
        assert.equal(results[0].totalCost, 10);
        assert.deepEqual(results[0].units, ['BacklineExpensive', 'FrontlineExpensive']);
    });

    it('returns empty array when must-include units are not all found', () => {
        const params = { ...baseParams, mustInclude: ['NonExistentUnit'] };
        const results = Engine.search(mockDataCache, params);
        assert.equal(results.length, 0);
    });

    it('returns empty array when board size is smaller than required units', () => {
        const params = { ...baseParams, boardSize: 1, mustInclude: ['Garen', 'Lux'] };
        const results = Engine.search(mockDataCache, params);
        assert.deepEqual(results, []);
    });

    it('counts traits from resolved display names even when raw trait ids map to different aliases', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            maxResults: 5,
            includeUnique: false
        };
        const results = Engine.search(aliasedTraitDataCache, params);
        assert.equal(results.length, 1);
        assert.equal(results[0].synergyScore, 1);
    });

    it('applies the includeUnique toggle for alias-mapped trait data', () => {
        const paramsWithoutUnique = {
            ...baseParams,
            boardSize: 2,
            maxResults: 5,
            includeUnique: false
        };
        const paramsWithUnique = {
            ...paramsWithoutUnique,
            includeUnique: true
        };

        const withoutUnique = Engine.search(aliasedTraitDataCache, paramsWithoutUnique);
        const withUnique = Engine.search(aliasedTraitDataCache, paramsWithUnique);

        assert.equal(withoutUnique[0].synergyScore, 1);
        assert.equal(withUnique[0].synergyScore, 2);
    });

    it('supports explicit multi-count trait contributions from parsed unit data', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            mustIncludeTraits: ['Mage'],
            maxResults: 5,
            includeUnique: false
        };

        const results = Engine.search(weightedTraitDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].synergyScore, 1);
        assert.deepEqual(results[0].units, ['Amplifier', 'Caster']);
    });

    it('selects the best unit variant for board scoring and reports the assignment', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['MissFortune', 'Lux', 'Braum'],
            mustIncludeTraits: ['Conduit'],
            includeUnique: true
        };

        const results = Engine.search(variantTraitDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].synergyScore, 3);
        assert.equal(results[0].variantAssignments.MissFortune.label, 'Conduit Mode');
        assert.equal(results[0].traitCounts.Conduit, 2);
    });

    it('keeps variant-capable units searchable when banned traits only exclude some modes', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            mustInclude: ['MissFortune', 'Braum'],
            mustExcludeTraits: ['Conduit'],
            includeUnique: true
        };

        const results = Engine.search(variantTraitDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.MissFortune.label, 'Challenger Mode');
        assert.equal(results[0].traitCounts.Conduit, undefined);
    });

    it('respects explicit variant locks in the query params', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['MissFortune', 'Lux', 'Braum'],
            variantLocks: {
                MissFortune: 'challenger'
            },
            includeUnique: true
        };

        const results = Engine.search(variantTraitDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.MissFortune.label, 'Challenger Mode');
        assert.equal(results[0].traitCounts.Challenger, 1);
        assert.equal(results[0].traitCounts.Conduit, 1);
    });

    it('returns no boards when a required unit is locked to a missing variant', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            mustInclude: ['MissFortune', 'Braum'],
            variantLocks: {
                MissFortune: 'does-not-exist'
            }
        };

        const results = Engine.search(variantTraitDataCache, params);

        assert.deepEqual(results, []);
    });

    it('supports board-state conditions on variant legality', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Switcher', 'Warden', 'Mage'],
            tankRoles: [],
            carryRoles: [],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalVariantDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.Switcher.label, 'Arcane Mode');
        assert.equal(results[0].traitCounts.Arcane, 2);
        assert.equal(results[0].synergyScore, 1);
    });

    it('rejects conditional variants when the board state does not satisfy them', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            maxResults: 5,
            mustInclude: ['Switcher', 'Mage'],
            tankRoles: [],
            carryRoles: [],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalVariantDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.Switcher.label, 'Shadow Mode');
        assert.equal(results[0].traitCounts.Arcane, 1);
        assert.equal(results[0].synergyScore, 0);
    });

    it('applies unit-level conditional trait contributions when their board conditions are satisfied', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Catalyst', 'Warden', 'Mage'],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalEffectDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 2);
        assert.equal(results[0].synergyScore, 1);
    });

    it('skips unit-level conditional trait contributions when their board conditions are unmet', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Catalyst', 'Mage', 'Scout'],
            tankRoles: [],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalEffectDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 1);
        assert.equal(results[0].synergyScore, 0);
    });

    it('can satisfy required traits only through conditional effects', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Catalyst', 'Warden', 'Mage'],
            mustIncludeTraits: ['Arcane'],
            includeUnique: false
        };

        const results = Engine.search(conditionalEffectDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 2);
    });

    it('applies variant-level conditional effects for the selected mode only', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Switcher', 'Warden', 'Mage'],
            tankRoles: [],
            carryRoles: [],
            mustIncludeTraits: ['Arcane'],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalEffectVariantDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.Switcher.label, 'Arcane Mode');
        assert.equal(results[0].traitCounts.Arcane, 3);
        assert.equal(results[0].synergyScore, 1);
    });

    it('applies conditional effects with single-pass semantics', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Looper', 'Mage', 'Warden'],
            tankRoles: [],
            carryRoles: [],
            includeUnique: false,
            onlyActive: false
        };

        const results = Engine.search(singlePassConditionalDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 1);
        assert.equal(results[0].traitCounts.Shadow, 1);
    });

    it('applies unit-level conditional profiles when their conditions are satisfied', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Shifter', 'Warden', 'Mage'],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalProfileDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 2);
        assert.equal(results[0].traitCounts.Shadow, undefined);
        assert.equal(results[0].synergyScore, 1);
    });

    it('falls back to the base profile when no conditional profile matches', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            maxResults: 5,
            mustInclude: ['Shifter', 'Mage'],
            tankRoles: [],
            includeUnique: false,
            onlyActive: false
        };

        const results = Engine.search(conditionalProfileDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Shadow, 1);
        assert.equal(results[0].traitCounts.Arcane, 1);
    });

    it('can satisfy required traits through a conditional profile swap', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Shifter', 'Warden', 'Mage'],
            mustIncludeTraits: ['Arcane'],
            includeUnique: false
        };

        const results = Engine.search(conditionalProfileDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 2);
    });

    it('uses the first matching conditional profile when multiple profiles match', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Shifter', 'Warden', 'Mage'],
            includeUnique: false,
            onlyActive: false
        };

        const results = Engine.search(conditionalProfileDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 2);
        assert.equal(results[0].traitCounts.Spirit, undefined);
    });

    it('applies variant-level conditional profiles for the selected mode only', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['ProfileSwitcher', 'Warden', 'Mage'],
            tankRoles: [],
            carryRoles: [],
            mustIncludeTraits: ['Arcane'],
            includeUnique: false
        };

        const results = Engine.search(conditionalProfileVariantDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.ProfileSwitcher.label, 'Adaptive Mode');
        assert.equal(results[0].traitCounts.Arcane, 2);
        assert.equal(results[0].traitCounts.Shadow, undefined);
    });

    it('respects maxResults limit', () => {
        const params = { ...baseParams, maxResults: 2, boardSize: 4 };
        const results = Engine.search(mockDataCache, params);
        assert.ok(results.length <= 2);
    });

    it('reports progress during search', () => {
        const params = { ...baseParams, boardSize: 4 };
        Engine.search(mockDataCache, params, (pct) => {
            assert.ok(pct >= 0 && pct <= 100);
        });
        assert.ok(true);
    });

    it('reports percentage progress for slot-varying searches using the counted candidate total', () => {
        const progressUpdates = [];
        const params = {
            ...baseParams,
            boardSize: 9,
            mustInclude: ['Galio', 'AurelionSol'],
            tankRoles: [],
            carryRoles: []
        };
        const expectedTotal = Engine.getCombinationCount(mechaSlotDataCache, params).count;

        Engine.search(mechaSlotDataCache, params, (pct, checked, total) => {
            progressUpdates.push({ pct, checked, total });
        });

        assert.deepEqual(progressUpdates.at(-1), {
            pct: 100,
            checked: expectedTotal,
            total: expectedTotal
        });
    });

    it('returns error for oversized search space', () => {
        const params = { ...baseParams, boardSize: 50 };
        const results = Engine.search(mockDataCache, params);
        assert.ok(results.length > 0);
        assert.ok(results[0].error);
    });

    it('can fill a 9-slot board with 8 units by selecting one 2-slot Mecha form', () => {
        const params = {
            ...baseParams,
            boardSize: 9,
            maxResults: 5,
            mustInclude: ['Galio', 'VoyagerTwo', 'VoyagerThree', 'ConduitTwo', 'ConduitThree', 'BrawlerTwo', 'Lux', 'Braum'],
            tankRoles: [],
            carryRoles: [],
            includeUnique: true
        };

        const extendedCache = {
            ...mechaSlotDataCache,
            units: [
                ...mechaSlotDataCache.units.filter((unit) => unit.id !== 'AurelionSol' && unit.id !== 'Urgot'),
                { id: 'Lux', cost: 2, role: 'Carry', traits: ['Scholar'], traitIds: ['Scholar'] },
                { id: 'Braum', cost: 2, role: 'Tank', traits: ['Warden'], traitIds: ['Warden'] }
            ],
            traits: ['Brawler', 'Conduit', 'Mecha', 'Scholar', 'Voyager', 'Warden'],
            traitBreakpoints: {
                Brawler: [2],
                Conduit: [2],
                Mecha: [2, 4],
                Scholar: [1],
                Voyager: [2],
                Warden: [1]
            },
            hashMap: {
                Brawler: 'Brawler',
                Conduit: 'Conduit',
                Mecha: 'Mecha',
                Scholar: 'Scholar',
                Voyager: 'Voyager',
                Warden: 'Warden'
            }
        };

        const results = Engine.search(extendedCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].units.length, 8);
        assert.equal(results[0].occupiedSlots, 9);
        assert.equal(results[0].variantAssignments.Galio.label, '2-Slot Mecha');
        assert.equal(results[0].traitCounts.Mecha, 2);
    });

    it('can fill a 9-slot board with 7 units by selecting two 2-slot Mecha forms', () => {
        const params = {
            ...baseParams,
            boardSize: 9,
            maxResults: 5,
            mustInclude: ['Galio', 'AurelionSol', 'VoyagerTwo', 'ConduitTwo', 'ConduitThree', 'BrawlerTwo', 'Lux'],
            variantLocks: {
                Galio: 'two-slot',
                AurelionSol: 'two-slot'
            },
            tankRoles: [],
            carryRoles: [],
            includeUnique: true
        };

        const extendedCache = {
            ...mechaSlotDataCache,
            units: [
                ...mechaSlotDataCache.units.filter((unit) => unit.id !== 'Urgot'),
                { id: 'Lux', cost: 2, role: 'Carry', traits: ['Scholar'], traitIds: ['Scholar'] }
            ],
            traits: ['Brawler', 'Conduit', 'Mecha', 'Scholar', 'Voyager'],
            traitBreakpoints: {
                Brawler: [1],
                Conduit: [2],
                Mecha: [2, 4],
                Scholar: [1],
                Voyager: [2]
            },
            hashMap: {
                Brawler: 'Brawler',
                Conduit: 'Conduit',
                Mecha: 'Mecha',
                Scholar: 'Scholar',
                Voyager: 'Voyager'
            }
        };

        const results = Engine.search(extendedCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].units.length, 7);
        assert.equal(results[0].occupiedSlots, 9);
        assert.equal(results[0].variantAssignments.Galio.label, '2-Slot Mecha');
        assert.equal(results[0].variantAssignments.AurelionSol.label, '2-Slot Mecha');
        assert.equal(results[0].traitCounts.Mecha, 4);
    });

    it('rejects Mecha 2-slot locks that overfill the board', () => {
        const params = {
            ...baseParams,
            boardSize: 7,
            maxResults: 5,
            mustInclude: ['Galio', 'VoyagerTwo', 'VoyagerThree', 'ConduitTwo', 'ConduitThree', 'BrawlerTwo', 'Lux'],
            variantLocks: {
                Galio: 'two-slot'
            },
            tankRoles: [],
            carryRoles: [],
            includeUnique: true
        };

        const extendedCache = {
            ...mechaSlotDataCache,
            units: [
                ...mechaSlotDataCache.units.filter((unit) => unit.id !== 'AurelionSol' && unit.id !== 'Urgot'),
                { id: 'Lux', cost: 2, role: 'Carry', traits: ['Scholar'], traitIds: ['Scholar'] }
            ],
            traits: ['Brawler', 'Conduit', 'Mecha', 'Scholar', 'Voyager'],
            traitBreakpoints: {
                Brawler: [1],
                Conduit: [2],
                Mecha: [2, 4],
                Scholar: [1],
                Voyager: [2]
            },
            hashMap: {
                Brawler: 'Brawler',
                Conduit: 'Conduit',
                Mecha: 'Mecha',
                Scholar: 'Scholar',
                Voyager: 'Voyager'
            }
        };

        const results = Engine.search(extendedCache, params);

        assert.deepEqual(results, []);
    });
});
