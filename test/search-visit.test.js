const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    applyUnitSelectionState,
    rollbackUnitSelectionState,
    evaluateSearchCandidate
} = require('../engine/search-visit.js');

describe('search visit helpers', () => {
    it('applies and rolls back a unit selection in place', () => {
        const currentTraitCounts = Uint8Array.from([0, 0]);
        const activeUnitFlags = Uint8Array.from([0]);
        const currentIdxList = [];
        const currentVariantUnitIndices = [];
        const info = {
            fixedTraitContributionEntries: [{ index: 1, count: 2 }],
            variantProfiles: [{}]
        };

        applyUnitSelectionState({
            idx: 0,
            info,
            currentTraitCounts,
            activeUnitFlags,
            currentIdxList,
            currentVariantUnitIndices
        });

        assert.deepEqual(Array.from(currentTraitCounts), [0, 2]);
        assert.deepEqual(Array.from(activeUnitFlags), [1]);
        assert.deepEqual(currentIdxList, [0]);
        assert.deepEqual(currentVariantUnitIndices, [0]);

        rollbackUnitSelectionState({
            idx: 0,
            info,
            currentTraitCounts,
            activeUnitFlags,
            currentIdxList,
            currentVariantUnitIndices
        });

        assert.deepEqual(Array.from(currentTraitCounts), [0, 0]);
        assert.deepEqual(Array.from(activeUnitFlags), [0]);
        assert.deepEqual(currentIdxList, []);
        assert.deepEqual(currentVariantUnitIndices, []);
    });

    it('evaluates a simple candidate and adds it to the tracker', () => {
        const added = [];
        evaluateSearchCandidate({
            currentMinSlots: 2,
            boardSize: 2,
            tankThreePlusCount: 1,
            tankFourPlusCount: 0,
            carryFourPlusCount: 1,
            meetsTankRequirement: () => true,
            meetsCarryRequirement: () => true,
            mustHaveTotalCost: 2,
            currentCost: 3,
            mustHaveUnitIndices: [0],
            currentIdxList: [1],
            mustHaveComplexUnitCount: 0,
            currentComplexUnitCount: 0,
            mustIncludeTraitIndices: [0],
            mustIncludeTraitTargets: [2],
            currentTraitCounts: Uint8Array.from([2]),
            calculateSynergyScore: () => 4,
            scoreBoard: (score, cost) => score * 10000 + cost,
            topBoardTracker: {
                canAcceptScore: () => true,
                addBoard: (payload) => added.push(payload)
            },
            buildSortedBoardUnits: (selectedUnitIndices) => selectedUnitIndices.map((index) => `Unit-${index}`),
            unitInfo: [],
            traitCountsToRecord: () => ({ Arcane: 2 }),
            allTraitNames: ['Arcane'],
            mustHaveVariantUnitIndices: [],
            currentVariantUnitIndices: [],
            evaluateBoardSelection: () => null
        });

        assert.deepEqual(added, [{
            unitIds: ['Unit-0', 'Unit-1'],
            evaluation: {
                synergyScore: 4,
                occupiedSlots: 2,
                traitCounts: { Arcane: 2 }
            },
            totalCost: 5
        }]);
    });
});
