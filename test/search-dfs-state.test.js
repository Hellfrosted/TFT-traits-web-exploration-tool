const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildRemainingUnitPotential,
    buildRemainingTraitPotential,
    shouldPruneSearchBranch,
    shouldEmitProgress
} = require('../engine/search-dfs-state.js');

describe('search dfs state helpers', () => {
    it('builds suffix potential arrays for role thresholds and slot capacity', () => {
        const availableIndices = [0, 1];
        const unitInfo = [
            { qualifyingTankThreePlus: 1, qualifyingTankFourPlus: 0, qualifyingCarryFourPlus: 0, maxSlotCost: 2 },
            { qualifyingTankThreePlus: 0, qualifyingTankFourPlus: 1, qualifyingCarryFourPlus: 1, maxSlotCost: 3 }
        ];

        const state = buildRemainingUnitPotential(availableIndices, unitInfo);

        assert.deepEqual(Array.from(state.remainingTankThreePlusFrom), [1, 0, 0]);
        assert.deepEqual(Array.from(state.remainingTankFourPlusFrom), [1, 1, 0]);
        assert.deepEqual(Array.from(state.remainingCarryFourPlusFrom), [1, 1, 0]);
        assert.deepEqual(Array.from(state.remainingMaxSlotsFrom), [5, 3, 0]);
    });

    it('builds suffix trait potential only when must-include pruning is enabled', () => {
        const availableIndices = [0, 1];
        const unitInfo = [
            { traitContributionByIndex: { 2: 1 } },
            { traitContributionByIndex: { 2: 2 } }
        ];

        const enabled = buildRemainingTraitPotential({
            useMustIncludePruning: true,
            mustIncludeTraitIndices: [2],
            availableIndices,
            unitInfo
        });
        const disabled = buildRemainingTraitPotential({
            useMustIncludePruning: false,
            mustIncludeTraitIndices: [2],
            availableIndices,
            unitInfo
        });

        assert.deepEqual(Array.from(enabled[0]), [3, 2, 0]);
        assert.deepEqual(disabled, []);
    });

    it('prunes impossible branches and emits progress on threshold', () => {
        const shouldPrune = shouldPruneSearchBranch({
            startIdx: 0,
            currentMinSlots: 2,
            currentSlotFlex: 0,
            boardSize: 5,
            requireTank: true,
            requireCarry: false,
            tankThreePlusCount: 0,
            tankFourPlusCount: 0,
            carryFourPlusCount: 0,
            meetsTankRequirement: (tankThree, tankFour) => tankFour >= 1 || tankThree >= 2,
            meetsCarryRequirement: () => true,
            remainingTankThreePlusFrom: Uint8Array.from([1, 0]),
            remainingTankFourPlusFrom: Uint8Array.from([0, 0]),
            remainingCarryFourPlusFrom: Uint8Array.from([0, 0]),
            remainingMaxSlotsFrom: Uint8Array.from([2, 0]),
            useMustIncludePruning: true,
            mustIncludeTraitIndices: [1],
            mustIncludeTraitTargets: [2],
            currentTraitCounts: Uint8Array.from([0, 0]),
            remainingTraitPotentialFrom: [Uint8Array.from([1, 0])]
        });

        assert.equal(shouldPrune, true);
        assert.equal(shouldEmitProgress(1000, 0, 1000), true);
        assert.equal(shouldEmitProgress(999, 0, 1000), false);
    });
});
