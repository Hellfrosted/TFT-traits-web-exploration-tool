const { calculateSynergyScore: defaultCalculateSynergyScore } = require('./search-state.js');
const { evaluateBoardSelection: defaultEvaluateBoardSelection } = require('./search-evaluator.js');

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
            return (counts) => {
                let score = 0;
                for (let entryIndex = 0; entryIndex < scoreIndexes.length; entryIndex++) {
                    const count = counts[scoreIndexes[entryIndex]];
                    if (count === 0) {
                        continue;
                    }

                    const breakpoints = scoreBreakpoints[entryIndex];
                    for (const breakpoint of breakpoints) {
                        if (count >= breakpoint) {
                            score += 1;
                        } else {
                            break;
                        }
                    }
                }
                return score;
            };
        }

        if (onlyActive) {
            return (counts) => {
                let score = 0;
                for (let entryIndex = 0; entryIndex < scoreIndexes.length; entryIndex++) {
                    const count = counts[scoreIndexes[entryIndex]];
                    if (count === 0) {
                        continue;
                    }

                    const breakpoints = scoreBreakpoints[entryIndex];
                    for (const breakpoint of breakpoints) {
                        if (count >= breakpoint) {
                            score += 1;
                            break;
                        }
                        break;
                    }
                }
                return score;
            };
        }

        return (counts) => {
            let score = 0;
            for (let entryIndex = 0; entryIndex < scoreIndexes.length; entryIndex++) {
                const count = counts[scoreIndexes[entryIndex]];
                if (count === 0) {
                    continue;
                }

                let levelsPassed = 0;
                const breakpoints = scoreBreakpoints[entryIndex];
                for (const breakpoint of breakpoints) {
                    if (count >= breakpoint) {
                        levelsPassed += 1;
                    } else {
                        break;
                    }
                }

                if (onlyActive && levelsPassed === 0) {
                    continue;
                }

                score += tierRank ? levelsPassed : levelsPassed > 0 ? 1 : onlyActive ? 0 : 1;
            }
            return score;
        };
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
