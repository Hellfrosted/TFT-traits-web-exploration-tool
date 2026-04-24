function applyUnitSelectionState({
    idx,
    info,
    currentTraitCounts,
    activeUnitFlags,
    currentIdxList,
    currentVariantUnitIndices
}) {
    for (const { index, count } of info.fixedTraitContributionEntries) {
        currentTraitCounts[index] += count;
    }

    activeUnitFlags[idx] = 1;
    currentIdxList.push(idx);
    if (info.variantProfiles.length > 0) {
        currentVariantUnitIndices.push(idx);
    }
}

function rollbackUnitSelectionState({
    idx,
    info,
    currentTraitCounts,
    activeUnitFlags,
    currentIdxList,
    currentVariantUnitIndices
}) {
    if (info.variantProfiles.length > 0) {
        currentVariantUnitIndices.pop();
    }
    currentIdxList.pop();
    activeUnitFlags[idx] = 0;

    for (const { index, count } of info.fixedTraitContributionEntries) {
        currentTraitCounts[index] -= count;
    }
}

function evaluateSearchCandidate({
    currentMinSlots,
    boardSize,
    tankThreePlusCount,
    tankFourPlusCount,
    carryFourPlusCount,
    meetsTankRequirement,
    meetsCarryRequirement,
    mustHaveTotalCost,
    currentCost,
    mustHaveUnitIndices,
    currentIdxList,
    mustHaveComplexUnitCount,
    currentComplexUnitCount,
    mustIncludeTraitIndices,
    mustIncludeTraitTargets,
    currentTraitCounts,
    calculateSynergyScore,
    scoreBoard,
    topBoardTracker,
    buildSortedBoardUnits,
    unitInfo,
    traitCountsToRecord,
    allTraitNames,
    mustHaveVariantUnitIndices,
    currentVariantUnitIndices,
    evaluateBoardSelection
}) {
    if (!meetsTankRequirement(tankThreePlusCount, tankFourPlusCount)) return;
    if (!meetsCarryRequirement(carryFourPlusCount)) return;

    const totalCost = mustHaveTotalCost + currentCost;
    const selectedUnitIndices = mustHaveUnitIndices.concat(currentIdxList);
    const totalComplexUnitCount = mustHaveComplexUnitCount + currentComplexUnitCount;

    if (totalComplexUnitCount === 0) {
        if (currentMinSlots !== boardSize) {
            return;
        }
        for (let traitPos = 0; traitPos < mustIncludeTraitIndices.length; traitPos++) {
            const traitIndexValue = mustIncludeTraitIndices[traitPos];
            const requiredThreshold = mustIncludeTraitTargets[traitPos];
            if ((currentTraitCounts[traitIndexValue] || 0) < requiredThreshold) {
                return;
            }
        }

        const synergyScore = calculateSynergyScore(currentTraitCounts);
        const totalScore = scoreBoard(synergyScore, totalCost);
        if (!topBoardTracker.canAcceptScore(totalScore)) return;

        topBoardTracker.addBoard({
            unitIds: buildSortedBoardUnits(selectedUnitIndices, unitInfo),
            evaluation: {
                synergyScore,
                occupiedSlots: currentMinSlots,
                traitCounts: traitCountsToRecord(currentTraitCounts, allTraitNames)
            },
            totalCost
        });
        return;
    }

    const selectedVariantIndices = mustHaveVariantUnitIndices.concat(currentVariantUnitIndices);
    const evaluation = evaluateBoardSelection({
        selectedUnitIndices,
        selectedVariantIndices,
        baseTraitCounts: currentTraitCounts,
        minOccupiedSlots: currentMinSlots
    });
    if (!evaluation) {
        return;
    }

    const totalScore = scoreBoard(evaluation.synergyScore, totalCost);
    if (!topBoardTracker.canAcceptScore(totalScore)) {
        return;
    }

    topBoardTracker.addBoard({
        unitIds: buildSortedBoardUnits(selectedUnitIndices, unitInfo),
        evaluation,
        totalCost
    });
}

module.exports = {
    applyUnitSelectionState,
    rollbackUnitSelectionState,
    evaluateSearchCandidate
};
