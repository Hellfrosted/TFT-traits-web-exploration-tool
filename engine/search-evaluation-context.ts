const { calculateSynergyScore: defaultCalculateSynergyScore } = require('./search-state.js');
const { evaluateBoardSelection: defaultEvaluateBoardSelection } = require('./search-evaluator.js');

function createSearchScoreCalculator(
    {
        allTraitNames = [],
        traitBreakpoints = {},
        onlyActive = true,
        tierRank = true,
        includeUnique = false
    } = {},
    {
        calculateSynergyScore = defaultCalculateSynergyScore
    } = {}
) {
    return (counts) => calculateSynergyScore(counts, {
        allTraitNames,
        traitBreakpoints,
        onlyActive,
        tierRank,
        includeUnique
    });
}

function createResolvedBoardSelectionEvaluator(
    {
        boardSize,
        unitInfo,
        activeUnitFlags,
        mustIncludeTraitIndices,
        mustIncludeTraitTargets,
        allTraitNames,
        calculateSynergyScore,
        isCompiledConditionSatisfied,
        findFirstSatisfiedProfile,
        traitCountsToRecord
    },
    {
        evaluateBoardSelection = defaultEvaluateBoardSelection
    } = {}
) {
    return ({
        selectedUnitIndices,
        selectedVariantIndices,
        baseTraitCounts,
        minOccupiedSlots
    }) => evaluateBoardSelection({
        selectedUnitIndices,
        selectedVariantIndices,
        baseTraitCounts,
        minOccupiedSlots,
        boardSize,
        unitInfo,
        activeUnitFlags,
        mustIncludeTraitIndices,
        mustIncludeTraitTargets,
        allTraitNames,
        calculateSynergyScore,
        isCompiledConditionSatisfied,
        findFirstSatisfiedProfile,
        traitCountsToRecord
    });
}

function buildSearchCandidateEvaluationContext({
    meetsTankRequirement,
    meetsCarryRequirement,
    mustHaveTotalCost,
    mustHaveUnitIndices,
    mustHaveComplexUnitCount,
    mustIncludeTraitIndices,
    mustIncludeTraitTargets,
    calculateSynergyScore,
    scoreBoard,
    topBoardTracker,
    buildSortedBoardUnits,
    unitInfo,
    traitCountsToRecord,
    allTraitNames,
    mustHaveVariantUnitIndices,
    evaluateBoardSelection
}) {
    return {
        meetsTankRequirement,
        meetsCarryRequirement,
        mustHaveTotalCost,
        mustHaveUnitIndices,
        mustHaveComplexUnitCount,
        mustIncludeTraitIndices,
        mustIncludeTraitTargets,
        calculateSynergyScore,
        scoreBoard,
        topBoardTracker,
        buildSortedBoardUnits,
        unitInfo,
        traitCountsToRecord,
        allTraitNames,
        mustHaveVariantUnitIndices,
        evaluateBoardSelection
    };
}

module.exports = {
    createSearchScoreCalculator,
    createResolvedBoardSelectionEvaluator,
    buildSearchCandidateEvaluationContext
};
