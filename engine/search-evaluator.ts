function evaluateBoardSelection({
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
}) {
    const workingCounts = new Uint8Array(baseTraitCounts);
    const selectedVariantByUnitIndex = [];
    let bestEvaluation = null;

    const finalizeVariantSelection = () => {
        let occupiedSlots = minOccupiedSlots;
        for (const unitIndex of selectedVariantIndices) {
            const variant = selectedVariantByUnitIndex[unitIndex];
            if (!isCompiledConditionSatisfied(variant?.compiledConditions, workingCounts, activeUnitFlags)) {
                return;
            }
            occupiedSlots += variant?.slotDelta || 0;
        }

        if (occupiedSlots !== boardSize) {
            return;
        }

        const resolvedCounts = new Uint8Array(workingCounts);
        for (const unitIndex of selectedUnitIndices) {
            const info = unitInfo[unitIndex];
            const selectedVariant = selectedVariantByUnitIndex[unitIndex] || null;
            const activeConditionalProfile = findFirstSatisfiedProfile(
                selectedVariant?.conditionalProfileEntries || info.conditionalProfileEntries,
                workingCounts,
                activeUnitFlags
            );

            if (!activeConditionalProfile) {
                continue;
            }

            const currentContributionEntries = selectedVariant?.fullTraitContributionEntries || info.baseTraitContributionEntries;
            for (const { index, count } of currentContributionEntries) {
                resolvedCounts[index] -= count;
            }
            for (const { index, count } of activeConditionalProfile.traitContributionEntries) {
                resolvedCounts[index] += count;
            }
        }

        const effectConditionCounts = new Uint8Array(resolvedCounts);
        for (const unitIndex of selectedUnitIndices) {
            const info = unitInfo[unitIndex];
            for (const effect of info.conditionalEffectEntries || []) {
                if (!isCompiledConditionSatisfied(effect.compiledConditions, effectConditionCounts, activeUnitFlags)) {
                    continue;
                }

                for (const { index, count } of effect.traitContributionEntries) {
                    resolvedCounts[index] += count;
                }
            }
        }
        for (const unitIndex of selectedVariantIndices) {
            const variant = selectedVariantByUnitIndex[unitIndex];
            for (const effect of variant?.conditionalEffectEntries || []) {
                if (!isCompiledConditionSatisfied(effect.compiledConditions, effectConditionCounts, activeUnitFlags)) {
                    continue;
                }

                for (const { index, count } of effect.traitContributionEntries) {
                    resolvedCounts[index] += count;
                }
            }
        }

        for (let traitPos = 0; traitPos < mustIncludeTraitIndices.length; traitPos++) {
            const traitIndexValue = mustIncludeTraitIndices[traitPos];
            const requiredThreshold = mustIncludeTraitTargets[traitPos];
            if ((resolvedCounts[traitIndexValue] || 0) < requiredThreshold) {
                return;
            }
        }

        const synergyScore = calculateSynergyScore(resolvedCounts);
        if (bestEvaluation && synergyScore <= bestEvaluation.synergyScore) {
            return;
        }

        let variantAssignments = null;
        if (selectedVariantIndices.length > 0) {
            variantAssignments = {};
            for (const unitIndex of selectedVariantIndices) {
                const variant = selectedVariantByUnitIndex[unitIndex];
                if (!variant) {
                    continue;
                }
                const info = unitInfo[unitIndex];
                variantAssignments[info.id] = {
                    id: variant.id,
                    label: variant.label || variant.id
                };
            }
        }

        bestEvaluation = {
            synergyScore,
            occupiedSlots,
            traitCounts: traitCountsToRecord(resolvedCounts, allTraitNames),
            ...(variantAssignments && Object.keys(variantAssignments).length > 0
                ? { variantAssignments }
                : {})
        };
    };

    const searchVariants = (variantPos) => {
        if (variantPos >= selectedVariantIndices.length) {
            finalizeVariantSelection();
            return;
        }

        const info = unitInfo[selectedVariantIndices[variantPos]];
        for (const variant of info.variantProfiles) {
            for (const { index, count } of variant.traitContributionEntries) {
                workingCounts[index] += count;
            }
            selectedVariantByUnitIndex[selectedVariantIndices[variantPos]] = variant;

            searchVariants(variantPos + 1);

            selectedVariantByUnitIndex[selectedVariantIndices[variantPos]] = null;
            for (const { index, count } of variant.traitContributionEntries) {
                workingCounts[index] -= count;
            }
        }
    };

    searchVariants(0);
    return bestEvaluation;
}

function createBoardResult({
    unitIds,
    evaluation,
    totalCost,
    scoreBoard
}) {
    const totalScore = scoreBoard(evaluation.synergyScore, totalCost);
    return {
        units: unitIds,
        synergyScore: evaluation.synergyScore,
        occupiedSlots: evaluation.occupiedSlots,
        totalCost,
        traitCounts: evaluation.traitCounts,
        ...(evaluation.variantAssignments && Object.keys(evaluation.variantAssignments).length > 0
            ? { variantAssignments: evaluation.variantAssignments }
            : {}),
        _score: totalScore
    };
}

module.exports = {
    evaluateBoardSelection,
    createBoardResult
};
