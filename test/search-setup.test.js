const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildRoleRequirementState,
    buildUnitSortRank,
    buildUnitSearchInfo,
    buildInitialSearchState
} = require('../engine/search-setup.js');

describe('search setup helpers', () => {
    it('builds role requirement predicates and unit sort ranks', () => {
        const roleState = buildRoleRequirementState(['Tank'], ['Carry']);
        const sortRank = buildUnitSortRank([{ id: 'Zed' }, { id: 'Aatrox' }]);

        assert.equal(roleState.requireTank, true);
        assert.equal(roleState.requireCarry, true);
        assert.equal(roleState.meetsTankRequirement(2, 0), true);
        assert.equal(roleState.meetsCarryRequirement(0), false);
        assert.deepEqual({ ...sortRank }, { Aatrox: 0, Zed: 1 });
    });

    it('builds per-unit search metadata including variant summaries', () => {
        const unitInfo = buildUnitSearchInfo({
            validUnits: [{
                id: 'Switcher',
                cost: 4,
                role: 'Tank',
                variants: [
                    { id: 'alpha', label: 'Alpha', role: 'Carry', traits: ['Arcane'], slotCost: 2 },
                    { id: 'beta', label: 'Beta', role: 'Carry', traits: ['Shadow'], slotCost: 3 }
                ]
            }],
            traitIndex: { Arcane: 0, Shadow: 1 },
            hashMap: {},
            traitBreakpoints: {},
            unitIndexById: { Switcher: 0 },
            variantLocks: null,
            excludedTraitSet: new Set(),
            tankRoleSet: new Set(['Tank']),
            carryRoleSet: new Set(['Carry']),
            unitSortRank: { Switcher: 0 },
            buildTraitContributionEntries: (entity) => (entity.traits || []).map((trait) => ({
                index: trait === 'Arcane' ? 0 : 1,
                count: 1
            })),
            getEntitySlotCost: (entity) => entity.slotCost || 1,
            buildConditionalEffectEntries: () => [],
            buildConditionalProfileEntries: () => [],
            compileConditions: () => null,
            summarizeVariantProfiles: (profiles) => ({
                fixedTraitContributionEntries: [],
                variantProfiles: profiles
            })
        });

        assert.equal(unitInfo.length, 1);
        assert.equal(unitInfo[0].isTank, true);
        assert.equal(unitInfo[0].qualifyingTankFourPlus, 1);
        assert.equal(unitInfo[0].minSlotCost, 2);
        assert.equal(unitInfo[0].maxSlotCost, 3);
        assert.equal(unitInfo[0].variantProfiles.length, 2);
        assert.equal(unitInfo[0].variantProfiles[1].slotDelta, 1);
    });

    it('builds initial must-have search state with emblems and variant units', () => {
        const initial = buildInitialSearchState({
            validUnits: [{ id: 'A' }, { id: 'B' }],
            unitInfo: [
                {
                    qualifyingTankThreePlus: 1,
                    qualifyingTankFourPlus: 0,
                    qualifyingCarryFourPlus: 0,
                    minSlotCost: 1,
                    slotFlex: 0,
                    cost: 3,
                    hasComplexEvaluation: 0,
                    fixedTraitContributionEntries: [{ index: 0, count: 1 }],
                    variantProfiles: []
                },
                {
                    qualifyingTankThreePlus: 0,
                    qualifyingTankFourPlus: 1,
                    qualifyingCarryFourPlus: 1,
                    minSlotCost: 2,
                    slotFlex: 1,
                    cost: 4,
                    hasComplexEvaluation: 1,
                    fixedTraitContributionEntries: [{ index: 1, count: 2 }],
                    variantProfiles: [{}]
                }
            ],
            mustHaveMask: 2n,
            extraEmblems: ['Arcane'],
            traitIndex: { Arcane: 0, Shadow: 1 },
            numTraits: 2
        });

        assert.equal(initial.mustHaveInitialTankThreePlusCount, 0);
        assert.equal(initial.mustHaveInitialTankFourPlusCount, 1);
        assert.equal(initial.mustHaveInitialCarryFourPlusCount, 1);
        assert.equal(initial.mustHaveInitialMinSlots, 2);
        assert.equal(initial.mustHaveInitialSlotFlex, 1);
        assert.equal(initial.mustHaveTotalCost, 4);
        assert.equal(initial.mustHaveComplexUnitCount, 1);
        assert.deepEqual(Array.from(initial.initialTraitCounts), [1, 2]);
        assert.deepEqual(Array.from(initial.activeUnitFlags), [0, 1]);
        assert.deepEqual(initial.mustHaveUnitIndices, [1]);
        assert.deepEqual(initial.mustHaveVariantUnitIndices, [1]);
    });
});
