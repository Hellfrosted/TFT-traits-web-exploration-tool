const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createSearchDfsRunner } = require('../engine/search-dfs-runner.js');

describe('search dfs runner', () => {
    it('visits board-filling combinations and reports progress', () => {
        const visitedBoards = [];
        let progressMarks = 0;
        const runSearchDfs = createSearchDfsRunner({
            shouldPruneSearchBranch: () => false,
            applyUnitSelectionState: ({ idx, currentIdxList }) => {
                currentIdxList.push(idx);
            },
            rollbackUnitSelectionState: ({ currentIdxList }) => {
                currentIdxList.pop();
            },
            evaluateSearchCandidate: ({ currentIdxList, currentMinSlots }) => {
                visitedBoards.push({
                    occupiedSlots: currentMinSlots,
                    unitIndices: [...currentIdxList]
                });
            }
        });

        runSearchDfs({
            boardSize: 2,
            availableIndices: [0, 1],
            unitInfo: [
                {
                    minSlotCost: 1,
                    qualifyingTankThreePlus: 0,
                    qualifyingTankFourPlus: 0,
                    qualifyingCarryFourPlus: 0,
                    cost: 1,
                    hasComplexEvaluation: 0,
                    slotFlex: 0
                },
                {
                    minSlotCost: 1,
                    qualifyingTankThreePlus: 0,
                    qualifyingTankFourPlus: 0,
                    qualifyingCarryFourPlus: 0,
                    cost: 1,
                    hasComplexEvaluation: 0,
                    slotFlex: 0
                }
            ],
            currentTraitCounts: new Uint8Array(0),
            activeUnitFlags: new Uint8Array(2),
            progressTracker: {
                markChecked() {
                    progressMarks += 1;
                }
            },
            initialState: {
                currentMinSlots: 0,
                tankThreePlusCount: 0,
                tankFourPlusCount: 0,
                carryFourPlusCount: 0,
                currentCost: 0,
                currentComplexUnitCount: 0,
                currentSlotFlex: 0
            },
            pruneState: {
                requireTank: false,
                requireCarry: false,
                meetsTankRequirement: () => true,
                meetsCarryRequirement: () => true,
                remainingTankThreePlusFrom: new Uint8Array(3),
                remainingTankFourPlusFrom: new Uint8Array(3),
                remainingCarryFourPlusFrom: new Uint8Array(3),
                remainingMaxSlotsFrom: new Uint8Array([2, 1, 0]),
                useMustIncludePruning: false,
                mustIncludeTraitIndices: [],
                mustIncludeTraitTargets: [],
                remainingTraitPotentialFrom: []
            },
            evaluationContext: {}
        });

        assert.equal(progressMarks, 1);
        assert.deepEqual(visitedBoards, [{
            occupiedSlots: 2,
            unitIndices: [0, 1]
        }]);
    });

    it('stops immediately when the prune helper rejects the branch', () => {
        let evaluated = false;
        const runSearchDfs = createSearchDfsRunner({
            shouldPruneSearchBranch: () => true,
            applyUnitSelectionState: () => {
                throw new Error('should not apply');
            },
            rollbackUnitSelectionState: () => {
                throw new Error('should not rollback');
            },
            evaluateSearchCandidate: () => {
                evaluated = true;
            }
        });

        runSearchDfs({
            boardSize: 1,
            availableIndices: [0],
            unitInfo: [{
                minSlotCost: 1,
                qualifyingTankThreePlus: 0,
                qualifyingTankFourPlus: 0,
                qualifyingCarryFourPlus: 0,
                cost: 1,
                hasComplexEvaluation: 0,
                slotFlex: 0
            }],
            currentTraitCounts: new Uint8Array(0),
            activeUnitFlags: new Uint8Array(1),
            progressTracker: {
                markChecked() {}
            },
            initialState: {
                currentMinSlots: 0,
                tankThreePlusCount: 0,
                tankFourPlusCount: 0,
                carryFourPlusCount: 0,
                currentCost: 0,
                currentComplexUnitCount: 0,
                currentSlotFlex: 0
            },
            pruneState: {
                requireTank: false,
                requireCarry: false,
                meetsTankRequirement: () => true,
                meetsCarryRequirement: () => true,
                remainingTankThreePlusFrom: new Uint8Array(2),
                remainingTankFourPlusFrom: new Uint8Array(2),
                remainingCarryFourPlusFrom: new Uint8Array(2),
                remainingMaxSlotsFrom: new Uint8Array(2),
                useMustIncludePruning: false,
                mustIncludeTraitIndices: [],
                mustIncludeTraitTargets: [],
                remainingTraitPotentialFrom: []
            },
            evaluationContext: {}
        });

        assert.equal(evaluated, false);
    });
});
