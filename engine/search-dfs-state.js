const { LIMITS } = require('../constants.js');

function buildRemainingUnitPotential(availableIndices, unitInfo) {
    const remainingTankThreePlusFrom = new Uint8Array(availableIndices.length + 1);
    const remainingTankFourPlusFrom = new Uint8Array(availableIndices.length + 1);
    const remainingCarryFourPlusFrom = new Uint8Array(availableIndices.length + 1);
    const remainingMaxSlotsFrom = new Uint8Array(availableIndices.length + 1);

    for (let index = availableIndices.length - 1; index >= 0; index--) {
        const info = unitInfo[availableIndices[index]];
        remainingTankThreePlusFrom[index] = remainingTankThreePlusFrom[index + 1] + info.qualifyingTankThreePlus;
        remainingTankFourPlusFrom[index] = remainingTankFourPlusFrom[index + 1] + info.qualifyingTankFourPlus;
        remainingCarryFourPlusFrom[index] = remainingCarryFourPlusFrom[index + 1] + info.qualifyingCarryFourPlus;
        remainingMaxSlotsFrom[index] = remainingMaxSlotsFrom[index + 1] + info.maxSlotCost;
    }

    return {
        remainingTankThreePlusFrom,
        remainingTankFourPlusFrom,
        remainingCarryFourPlusFrom,
        remainingMaxSlotsFrom
    };
}

function buildRemainingTraitPotential({
    useMustIncludePruning,
    mustIncludeTraitIndices,
    availableIndices,
    unitInfo
}) {
    if (!useMustIncludePruning) {
        return [];
    }

    const remainingTraitPotentialFrom = mustIncludeTraitIndices.map(
        () => new Uint8Array(availableIndices.length + 1)
    );

    for (let traitPos = 0; traitPos < mustIncludeTraitIndices.length; traitPos++) {
        const requiredTraitIndex = mustIncludeTraitIndices[traitPos];
        const potential = remainingTraitPotentialFrom[traitPos];
        for (let index = availableIndices.length - 1; index >= 0; index--) {
            const info = unitInfo[availableIndices[index]];
            potential[index] = potential[index + 1] + (info.traitContributionByIndex[requiredTraitIndex] || 0);
        }
    }

    return remainingTraitPotentialFrom;
}

function shouldPruneSearchBranch({
    startIdx,
    currentMinSlots,
    currentSlotFlex,
    boardSize,
    requireTank,
    requireCarry,
    tankThreePlusCount,
    tankFourPlusCount,
    carryFourPlusCount,
    meetsTankRequirement,
    meetsCarryRequirement,
    remainingTankThreePlusFrom,
    remainingTankFourPlusFrom,
    remainingCarryFourPlusFrom,
    remainingMaxSlotsFrom,
    useMustIncludePruning,
    mustIncludeTraitIndices,
    mustIncludeTraitTargets,
    currentTraitCounts,
    remainingTraitPotentialFrom
}) {
    if (currentMinSlots > boardSize) {
        return true;
    }

    if (
        requireTank &&
        !meetsTankRequirement(tankThreePlusCount, tankFourPlusCount) &&
        !(
            tankFourPlusCount + remainingTankFourPlusFrom[startIdx] >= 1 ||
            tankThreePlusCount + remainingTankThreePlusFrom[startIdx] >= 2
        )
    ) {
        return true;
    }

    if (
        requireCarry &&
        !meetsCarryRequirement(carryFourPlusCount) &&
        (carryFourPlusCount + remainingCarryFourPlusFrom[startIdx] < 1)
    ) {
        return true;
    }

    if ((currentMinSlots + currentSlotFlex + remainingMaxSlotsFrom[startIdx]) < boardSize) {
        return true;
    }

    if (useMustIncludePruning) {
        for (let traitPos = 0; traitPos < mustIncludeTraitIndices.length; traitPos++) {
            const traitIndexValue = mustIncludeTraitIndices[traitPos];
            const target = mustIncludeTraitTargets[traitPos];
            if ((currentTraitCounts[traitIndexValue] + remainingTraitPotentialFrom[traitPos][startIdx]) < target) {
                return true;
            }
        }
    }

    return false;
}

function shouldEmitProgress(combinationsChecked, lastProgressReport, progressInterval = LIMITS.PROGRESS_INTERVAL) {
    return combinationsChecked - lastProgressReport >= progressInterval;
}

module.exports = {
    buildRemainingUnitPotential,
    buildRemainingTraitPotential,
    shouldPruneSearchBranch,
    shouldEmitProgress
};
