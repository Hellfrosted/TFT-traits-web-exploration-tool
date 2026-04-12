const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    createSearchScoreCalculator,
    createResolvedBoardSelectionEvaluator,
    buildSearchCandidateEvaluationContext
} = require('../engine/search-evaluation-context.js');

describe('search evaluation context helpers', () => {
    it('builds a reusable search score calculator with the supplied options', () => {
        const seenCalls = [];
        const calculateBoardSynergyScore = createSearchScoreCalculator({
            allTraitNames: ['Bruiser'],
            traitBreakpoints: { Bruiser: [2] },
            onlyActive: false,
            tierRank: false,
            includeUnique: true
        }, {
            calculateSynergyScore: (counts, options) => {
                seenCalls.push({ counts, options });
                return 7;
            }
        });

        assert.equal(calculateBoardSynergyScore(Uint8Array.from([2])), 7);
        assert.deepEqual(seenCalls, [{
            counts: Uint8Array.from([2]),
            options: {
                allTraitNames: ['Bruiser'],
                traitBreakpoints: { Bruiser: [2] },
                onlyActive: false,
                tierRank: false,
                includeUnique: true
            }
        }]);
    });

    it('builds a resolved-board evaluator with fixed search context', () => {
        let capturedArgs;
        const evaluateResolvedBoardSelection = createResolvedBoardSelectionEvaluator({
            boardSize: 9,
            unitInfo: [{ id: 'A' }],
            activeUnitFlags: Uint8Array.from([1]),
            mustIncludeTraitIndices: [0],
            mustIncludeTraitTargets: [2],
            allTraitNames: ['Bruiser'],
            calculateSynergyScore: () => 5,
            isCompiledConditionSatisfied: () => true,
            findFirstSatisfiedProfile: () => null,
            traitCountsToRecord: () => ({ Bruiser: 2 })
        }, {
            evaluateBoardSelection: (args) => {
                capturedArgs = args;
                return { synergyScore: 5 };
            }
        });

        const result = evaluateResolvedBoardSelection({
            selectedUnitIndices: [0],
            selectedVariantIndices: [],
            baseTraitCounts: Uint8Array.from([2]),
            minOccupiedSlots: 2
        });

        assert.deepEqual(result, { synergyScore: 5 });
        assert.deepEqual(capturedArgs.selectedUnitIndices, [0]);
        assert.equal(capturedArgs.boardSize, 9);
        assert.deepEqual(capturedArgs.mustIncludeTraitTargets, [2]);
    });

    it('builds the candidate evaluation payload shape expected by the dfs runner', () => {
        const evaluationContext = buildSearchCandidateEvaluationContext({
            meetsTankRequirement: () => true,
            meetsCarryRequirement: () => true,
            mustHaveTotalCost: 4,
            mustHaveUnitIndices: [1],
            mustHaveComplexUnitCount: 0,
            mustIncludeTraitIndices: [2],
            mustIncludeTraitTargets: [3],
            calculateSynergyScore: () => 8,
            scoreBoard: () => 80000,
            topBoardTracker: { canAcceptScore: () => true, addBoard() {} },
            buildSortedBoardUnits: () => ['A'],
            unitInfo: [{ id: 'A' }],
            traitCountsToRecord: () => ({ Bruiser: 3 }),
            allTraitNames: ['Bruiser'],
            mustHaveVariantUnitIndices: [0],
            evaluateBoardSelection: () => ({ synergyScore: 8 })
        });

        assert.equal(evaluationContext.mustHaveTotalCost, 4);
        assert.deepEqual(evaluationContext.mustHaveUnitIndices, [1]);
        assert.deepEqual(evaluationContext.mustIncludeTraitTargets, [3]);
        assert.deepEqual(evaluationContext.mustHaveVariantUnitIndices, [0]);
    });
});
