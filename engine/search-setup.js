function buildRoleRequirementState(tankRoles = [], carryRoles = []) {
    const tankRoleSet = new Set(tankRoles || []);
    const carryRoleSet = new Set(carryRoles || []);
    const requireTank = tankRoleSet.size > 0;
    const requireCarry = carryRoleSet.size > 0;

    return {
        tankRoleSet,
        carryRoleSet,
        requireTank,
        requireCarry,
        meetsTankRequirement: (tankThreePlusCount, tankFourPlusCount) => (
            !requireTank ||
            tankFourPlusCount >= 1 ||
            tankThreePlusCount >= 2
        ),
        meetsCarryRequirement: (carryFourPlusCount) => (
            !requireCarry ||
            carryFourPlusCount >= 1
        )
    };
}

function buildUnitSortRank(validUnits = []) {
    const unitSortRank = Object.create(null);
    validUnits
        .map((unit) => unit.id)
        .sort((leftId, rightId) => leftId.localeCompare(rightId))
        .forEach((unitId, sortRank) => {
            unitSortRank[unitId] = sortRank;
        });
    return unitSortRank;
}

function buildUnitSearchInfo({
    validUnits,
    traitIndex,
    hashMap,
    traitBreakpoints,
    unitIndexById,
    variantLocks,
    excludedTraitSet,
    tankRoleSet,
    carryRoleSet,
    unitSortRank,
    buildTraitContributionEntries,
    getEntitySlotCost,
    buildConditionalEffectEntries,
    buildConditionalProfileEntries,
    compileConditions,
    summarizeVariantProfiles
}) {
    return validUnits.map((unit) => {
        const baseTraitContributionEntries = buildTraitContributionEntries(unit, traitIndex, hashMap);
        let fixedTraitContributionEntries = baseTraitContributionEntries;
        let variantProfiles = [];
        const baseSlotCost = getEntitySlotCost(unit);
        let minSlotCost = baseSlotCost;
        let maxSlotCost = baseSlotCost;
        const conditionalEffectEntries = buildConditionalEffectEntries(
            unit.conditionalEffects,
            traitIndex,
            hashMap
        ).map((effect) => ({
            ...effect,
            compiledConditions: compileConditions(effect.conditions, traitIndex, unitIndexById, traitBreakpoints)
        }));
        const conditionalProfileEntries = buildConditionalProfileEntries(
            unit.conditionalProfiles,
            traitIndex,
            hashMap
        ).map((profile) => ({
            ...profile,
            compiledConditions: compileConditions(profile.conditions, traitIndex, unitIndexById, traitBreakpoints)
        }));

        if (Array.isArray(unit.variants) && unit.variants.length > 0) {
            const lockedVariantId = variantLocks?.[unit.id] || null;
            const allowedVariantProfiles = unit.variants
                .filter((variant) => !lockedVariantId || variant.id === lockedVariantId)
                .filter((variant) => !variant.traits?.some((trait) => excludedTraitSet.has(trait)))
                .map((variant) => ({
                    id: variant.id,
                    label: variant.label || variant.id,
                    role: variant.role || unit.role,
                    slotCost: getEntitySlotCost(variant),
                    traits: variant.traits || [],
                    fullTraitContributionEntries: buildTraitContributionEntries(variant, traitIndex, hashMap),
                    traitContributionEntries: buildTraitContributionEntries(variant, traitIndex, hashMap),
                    compiledConditions: compileConditions(variant.conditions, traitIndex, unitIndexById, traitBreakpoints),
                    conditionalProfileEntries: buildConditionalProfileEntries(
                        variant.conditionalProfiles,
                        traitIndex,
                        hashMap
                    ).map((profile) => ({
                        ...profile,
                        compiledConditions: compileConditions(profile.conditions, traitIndex, unitIndexById, traitBreakpoints)
                    })),
                    conditionalEffectEntries: buildConditionalEffectEntries(
                        variant.conditionalEffects,
                        traitIndex,
                        hashMap
                    ).map((effect) => ({
                        ...effect,
                        compiledConditions: compileConditions(effect.conditions, traitIndex, unitIndexById, traitBreakpoints)
                    }))
                }));

            const variantSummary = summarizeVariantProfiles(allowedVariantProfiles);
            fixedTraitContributionEntries = variantSummary.fixedTraitContributionEntries;
            minSlotCost = Math.min(...allowedVariantProfiles.map((variant) => variant.slotCost));
            maxSlotCost = Math.max(...allowedVariantProfiles.map((variant) => variant.slotCost));
            variantProfiles = variantSummary.variantProfiles.map((variant, variantIndex) => ({
                ...variant,
                slotCost: allowedVariantProfiles[variantIndex].slotCost,
                slotDelta: allowedVariantProfiles[variantIndex].slotCost - minSlotCost
            }));
        }

        const traitContributionByIndex = Object.create(null);
        fixedTraitContributionEntries.forEach(({ index, count }) => {
            traitContributionByIndex[index] = count;
        });

        const isTank = tankRoleSet.has(unit.role);
        const isCarry = carryRoleSet.has(unit.role);
        return {
            cost: unit.cost,
            isTank,
            isCarry,
            minSlotCost,
            maxSlotCost,
            slotFlex: maxSlotCost - minSlotCost,
            qualifyingTankThreePlus: isTank && unit.cost >= 3 ? 1 : 0,
            qualifyingTankFourPlus: isTank && unit.cost >= 4 ? 1 : 0,
            qualifyingCarryFourPlus: isCarry && unit.cost >= 4 ? 1 : 0,
            baseTraitContributionEntries,
            fixedTraitContributionEntries,
            traitContributionByIndex,
            conditionalProfileEntries,
            conditionalEffectEntries,
            variantProfiles,
            hasComplexEvaluation: (
                conditionalProfileEntries.length > 0 ||
                conditionalEffectEntries.length > 0 ||
                variantProfiles.length > 0
            ) ? 1 : 0,
            sortRank: unitSortRank[unit.id] ?? 0,
            id: unit.id
        };
    });
}

function buildInitialSearchState({
    validUnits,
    unitInfo,
    mustHaveMask,
    extraEmblems,
    traitIndex,
    numTraits
}) {
    let mustHaveInitialTankThreePlusCount = 0;
    let mustHaveInitialTankFourPlusCount = 0;
    let mustHaveInitialCarryFourPlusCount = 0;
    let mustHaveInitialMinSlots = 0;
    let mustHaveInitialSlotFlex = 0;
    let mustHaveTotalCost = 0;
    const initialTraitCounts = new Uint8Array(numTraits);
    const activeUnitFlags = new Uint8Array(validUnits.length);
    const mustHaveUnitIndices = [];
    const mustHaveVariantUnitIndices = [];
    let mustHaveComplexUnitCount = 0;

    if (extraEmblems) {
        extraEmblems.forEach((emblem) => {
            const idx = traitIndex[emblem];
            if (idx !== undefined) {
                initialTraitCounts[idx] += 1;
            }
        });
    }

    for (let index = 0; index < validUnits.length; index++) {
        if ((mustHaveMask & (1n << BigInt(index))) === 0n) {
            continue;
        }

        const info = unitInfo[index];
        activeUnitFlags[index] = 1;
        mustHaveInitialTankThreePlusCount += info.qualifyingTankThreePlus;
        mustHaveInitialTankFourPlusCount += info.qualifyingTankFourPlus;
        mustHaveInitialCarryFourPlusCount += info.qualifyingCarryFourPlus;
        mustHaveInitialMinSlots += info.minSlotCost;
        mustHaveInitialSlotFlex += info.slotFlex;
        mustHaveTotalCost += info.cost;
        mustHaveComplexUnitCount += info.hasComplexEvaluation;
        info.fixedTraitContributionEntries.forEach(({ index: traitIndexValue, count }) => {
            initialTraitCounts[traitIndexValue] += count;
        });
        if (info.variantProfiles.length > 0) {
            mustHaveVariantUnitIndices.push(index);
        }
        mustHaveUnitIndices.push(index);
    }

    return {
        mustHaveInitialTankThreePlusCount,
        mustHaveInitialTankFourPlusCount,
        mustHaveInitialCarryFourPlusCount,
        mustHaveInitialMinSlots,
        mustHaveInitialSlotFlex,
        mustHaveTotalCost,
        initialTraitCounts,
        activeUnitFlags,
        mustHaveUnitIndices,
        mustHaveVariantUnitIndices,
        mustHaveComplexUnitCount
    };
}

module.exports = {
    buildRoleRequirementState,
    buildUnitSortRank,
    buildUnitSearchInfo,
    buildInitialSearchState
};
