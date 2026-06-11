function buildUnitOverrideComposition({
    cleanName,
    rawName,
    roleName,
    linkedTraitState,
    rawChampionRecordMap,
    hashDictionary,
    traitNamesByAlias,
    setOverrides,
    hooks
}: LooseRecord) {
    const unitOverride = hooks.getUnitOverride(cleanName, rawName, setOverrides);
    const autoDetectedVariantOverride =
        !unitOverride?.variants?.length && !unitOverride?.selectionGroups?.length
            ? hooks.buildDetectedVariantOverrides({
                  rawName,
                  baseRole: roleName,
                  baseTraits: linkedTraitState.linkedTraitNames,
                  hasExcludedLinkedTraits: linkedTraitState.hasExcludedLinkedTraits,
                  rawChampionRecordMap,
                  hashDictionary,
                  traitNamesByAlias,
                  setOverrides
              })
            : null;
    const mergedUnitOverride = hooks.mergeUnitOverrides(unitOverride, autoDetectedVariantOverride);
    const overrideContributionTraits = Object.entries(mergedUnitOverride?.traitContributions || {})
        .filter(([, count]) => Number(count) > 0)
        .map(([trait]) => trait);
    const effectiveTraitNames = hooks.applyUnitTraitOverrides(
        [...linkedTraitState.linkedTraitNames, ...overrideContributionTraits],
        mergedUnitOverride
    );
    const effectiveTraitSet = new Set(effectiveTraitNames);
    const linkedTraitIds = linkedTraitState.includedLinkedTraits
        .filter(({ resolvedName }) => effectiveTraitSet.has(resolvedName))
        .map(({ traitId }) => traitId);
    const traitContributions = hooks.buildTraitContributionMap(effectiveTraitNames, mergedUnitOverride);
    const variants = hooks.buildUnitVariants(effectiveTraitNames, roleName, mergedUnitOverride);
    const conditionalEffects = hooks.normalizeConditionalEffects(mergedUnitOverride?.conditionalEffects);
    const conditionalProfiles = hooks.buildConditionalProfiles(
        effectiveTraitNames,
        mergedUnitOverride?.conditionalProfiles
    );

    return {
        mergedUnitOverride,
        effectiveTraitNames,
        linkedTraitIds,
        traitContributions,
        variants,
        conditionalEffects,
        conditionalProfiles,
        resolvedRoleName: hooks.deriveStableVariantRole(roleName, variants)
    };
}

module.exports = {
    buildUnitOverrideComposition
};
