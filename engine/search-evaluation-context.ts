const { calculateSynergyScore: defaultCalculateSynergyScore } = require('./search-state.js');
const { evaluateBoardSelection: defaultEvaluateBoardSelection } = require('./search-evaluator.js');

function createScoreLoop(scoreIndexes, scoreBreakpoints, scoreTrait) {
    return (counts) => {
        let score = 0;
        for (let entryIndex = 0; entryIndex < scoreIndexes.length; entryIndex++) {
            const count = counts[scoreIndexes[entryIndex]];
            if (count === 0) {
                continue;
            }

            score += scoreTrait(count, scoreBreakpoints[entryIndex]);
        }
        return score;
    };
}

function createSearchScoreCalculator(
    { allTraitNames = [], traitBreakpoints = {}, onlyActive = true, tierRank = true, includeUnique = false } = {},
    { calculateSynergyScore = defaultCalculateSynergyScore } = {}
) {
    if (calculateSynergyScore === defaultCalculateSynergyScore) {
        const scoreIndexes = [];
        const scoreBreakpoints = [];
        for (let index = 0; index < allTraitNames.length; index++) {
            const breakpoints = traitBreakpoints[allTraitNames[index]] || [1];
            const isUnique = breakpoints.length === 1 && breakpoints[0] === 1;
            if (!includeUnique && isUnique) {
                continue;
            }
            scoreIndexes.push(index);
            scoreBreakpoints.push(breakpoints);
        }

        if (tierRank && onlyActive) {
            return createScoreLoop(scoreIndexes, scoreBreakpoints, (count, breakpoints) => {
                let score = 0;
                for (const breakpoint of breakpoints) {
                    if (count >= breakpoint) {
                        score += 1;
                    } else {
                        break;
                    }
                }
                return score;
            });
        }

        if (onlyActive) {
            return createScoreLoop(scoreIndexes, scoreBreakpoints, (count, breakpoints) => {
                for (const breakpoint of breakpoints) {
                    if (count >= breakpoint) {
                        return 1;
                    }
                    break;
                }
                return 0;
            });
        }

        return createScoreLoop(scoreIndexes, scoreBreakpoints, (count, breakpoints) => {
            let levelsPassed = 0;
            for (const breakpoint of breakpoints) {
                if (count >= breakpoint) {
                    levelsPassed += 1;
                } else {
                    break;
                }
            }

            if (onlyActive && levelsPassed === 0) {
                return 0;
            }

            return tierRank ? levelsPassed : levelsPassed > 0 ? 1 : onlyActive ? 0 : 1;
        });
    }

    return (counts) =>
        calculateSynergyScore(counts, {
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
    { evaluateBoardSelection = defaultEvaluateBoardSelection } = {}
) {
    return ({ selectedUnitIndices, selectedVariantIndices, baseTraitCounts, minOccupiedSlots }) =>
        evaluateBoardSelection({
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
