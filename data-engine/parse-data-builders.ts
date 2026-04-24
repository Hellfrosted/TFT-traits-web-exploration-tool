const {
    shouldIncludeChampionRecord
} = require('./parse-data-state.js');
const {
    resolveChampionLinkedTraits,
    collectResolvedUnitTaxonomy,
    resolvePreferredChampionIcon
} = require('./parse-data-units.js');

function buildParseDataHooks(dataEngine: LooseRecord) {
    return {
        normalizeDataSource: dataEngine.normalizeDataSource.bind(dataEngine),
        buildRawTraitMetadata: dataEngine._buildRawTraitMetadata.bind(dataEngine),
        buildRawChampionRecordMap: dataEngine._buildRawChampionRecordMap.bind(dataEngine),
        buildRawShopDataLookup: dataEngine._buildRawShopDataLookup.bind(dataEngine),
        detectLatestSet: dataEngine._detectLatestSet.bind(dataEngine),
        detectLatestSetFromRaw: dataEngine._detectLatestSetFromRaw.bind(dataEngine),
        getLatestSetData: dataEngine._getLatestSetData.bind(dataEngine),
        buildSetChampionRecords: dataEngine._buildSetChampionRecords.bind(dataEngine),
        buildChampionIdentitySet: dataEngine._buildChampionIdentitySet.bind(dataEngine),
        buildChampionReferenceMap: dataEngine._buildChampionReferenceMap.bind(dataEngine),
        buildChampionAssetMap: dataEngine._buildChampionAssetMap.bind(dataEngine),
        buildTraitIconMap: dataEngine._buildTraitIconMap.bind(dataEngine),
        normalizeBreakpoints: dataEngine._normalizeBreakpoints.bind(dataEngine),
        isExcludedTraitName: dataEngine._isExcludedTraitName.bind(dataEngine),
        shouldPreferRawAsset: dataEngine._shouldPreferRawAsset.bind(dataEngine),
        isChampionRecord: dataEngine._isChampionRecord.bind(dataEngine),
        isExcludedUnit: dataEngine._isExcludedUnit.bind(dataEngine),
        normalizeChampionIdentity: dataEngine._normalizeChampionIdentity.bind(dataEngine),
        detectRawUnitSetNumber: dataEngine._detectRawUnitSetNumber.bind(dataEngine),
        toDisplayName: dataEngine._toDisplayName.bind(dataEngine),
        findChampionReference: dataEngine._findChampionReference.bind(dataEngine),
        getUnitOverride: dataEngine._getUnitOverride.bind(dataEngine),
        resolveRoleName: dataEngine._resolveRoleName.bind(dataEngine),
        buildDetectedVariantOverrides: dataEngine._buildDetectedVariantOverrides.bind(dataEngine),
        mergeUnitOverrides: dataEngine._mergeUnitOverrides.bind(dataEngine),
        applyUnitTraitOverrides: dataEngine._applyUnitTraitOverrides.bind(dataEngine),
        buildTraitContributionMap: dataEngine._buildTraitContributionMap.bind(dataEngine),
        buildUnitVariants: dataEngine._buildUnitVariants.bind(dataEngine),
        normalizeConditionalEffects: dataEngine._normalizeConditionalEffects.bind(dataEngine),
        buildConditionalProfiles: dataEngine._buildConditionalProfiles.bind(dataEngine),
        deriveStableVariantRole: dataEngine._deriveStableVariantRole.bind(dataEngine),
        resolveRawChampionIcon: dataEngine._resolveRawChampionIcon.bind(dataEngine),
        findChampionIcon: dataEngine._findChampionIcon.bind(dataEngine),
        assetMatchesSet: dataEngine._assetMatchesSet.bind(dataEngine),
        rankChampionIconAsset: dataEngine._rankChampionIconAsset.bind(dataEngine),
        createDataFingerprint: dataEngine._createDataFingerprint.bind(dataEngine)
    };
}

function buildParsedUnits({
    rawJSON,
    parseContext,
    hooks
}: LooseRecord) {
    const units = [];
    const traits = new Set();
    const roles = new Set();
    const matchedChampionReferenceNames = new Set();
    const {
        source,
        hashDictionary,
        rawChampionRecordMap,
        rawShopDataLookup,
        latestSet,
        setOverrides,
        setChampionIdentitySet,
        championReferenceMap,
        championAssets,
        traitNamesByAlias
    } = parseContext;

    for (const [key, val] of Object.entries(rawJSON as LooseRecord)) {
        if (!shouldIncludeChampionRecord({
            key,
            value: val,
            rawJSON,
            rawShopDataLookup,
            latestSet,
            setChampionIdentitySet,
            setOverrides,
            isChampionRecord: hooks.isChampionRecord,
            isExcludedUnit: hooks.isExcludedUnit,
            normalizeChampionIdentity: hooks.normalizeChampionIdentity,
            detectRawUnitSetNumber: hooks.detectRawUnitSetNumber
        })) {
            continue;
        }

        const rawName = val.mCharacterName || '';
        const tier = val.tier || 1;
        const cleanName = rawName.replace(/^TFT\d+_/, '');
        const displayName = hooks.toDisplayName(cleanName) || cleanName;
        const championReference = hooks.findChampionReference(
            championReferenceMap,
            rawName,
            cleanName,
            displayName
        );
        const unitOverride = hooks.getUnitOverride(cleanName, rawName, setOverrides);
        const roleName = hooks.resolveRoleName({
            cleanName,
            rawName,
            roleId: val.CharacterRole || 'Unknown',
            hashDictionary,
            championReference,
            setOverrides
        });

        const linkedTraitState = resolveChampionLinkedTraits({
            linkedTraits: val.mLinkedTraits,
            hashDictionary,
            traitNamesByAlias,
            isExcludedTraitName: hooks.isExcludedTraitName,
            setOverrides
        });
        const autoDetectedVariantOverride = !unitOverride?.variants?.length && !unitOverride?.selectionGroups?.length
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
        const resolvedRoleName = hooks.deriveStableVariantRole(roleName, variants);
        collectResolvedUnitTaxonomy({
            traits,
            roles,
            effectiveTraitNames,
            conditionalEffects,
            conditionalProfiles,
            variants,
            resolvedRoleName
        });
        const rawShopIcon = hooks.resolveRawChampionIcon(
            val,
            rawJSON,
            rawShopDataLookup,
            rawName,
            cleanName,
            displayName,
            source
        );
        const championIcon = hooks.findChampionIcon(championAssets, rawName, cleanName, displayName);
        const resolvedIconUrl = resolvePreferredChampionIcon({
            rawShopIcon,
            championIcon,
            championReferenceIconUrl: championReference?.record?.iconUrl,
            latestSet,
            shouldPreferRawAsset: hooks.shouldPreferRawAsset,
            assetMatchesSet: hooks.assetMatchesSet,
            rankChampionIconAsset: hooks.rankChampionIconAsset
        });
        if (championReference?.record?.displayName) {
            matchedChampionReferenceNames.add(championReference.record.displayName);
        }

        units.push({
            id: cleanName,
            displayName,
            cost: tier,
            role: resolvedRoleName,
            ...(Number.isFinite(Number(mergedUnitOverride?.slotCost))
                ? { slotCost: Number(mergedUnitOverride.slotCost) }
                : {}),
            traits: effectiveTraitNames,
            traitContributions,
            ...(conditionalEffects.length > 0 ? { conditionalEffects } : {}),
            ...(conditionalProfiles.length > 0 ? { conditionalProfiles } : {}),
            traitIds: linkedTraitIds,
            ...(variants.length > 0 ? { variants } : {}),
            ...(resolvedIconUrl ? { iconUrl: resolvedIconUrl } : {})
        });
    }

    return {
        units,
        traits,
        roles,
        matchedChampionReferenceNames
    };
}

module.exports = {
    buildParseDataHooks,
    buildParsedUnits
};
