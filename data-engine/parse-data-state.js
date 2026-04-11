function buildSetTraitIndexes(setData, normalizeBreakpoints) {
    const traitNamesByAlias = {};
    const traitBreakpoints = {};

    if (!setData?.traits || !Array.isArray(setData.traits)) {
        return { traitNamesByAlias, traitBreakpoints };
    }

    setData.traits.forEach((trait) => {
        const bps = normalizeBreakpoints(trait.effects);
        const displayName = trait.displayName || trait.name || trait.apiName || trait.traitId;
        if (!displayName) return;

        const aliases = [
            trait.apiName,
            trait.name,
            trait.displayName,
            trait.traitId
        ].filter(Boolean);

        aliases.forEach((alias) => {
            traitNamesByAlias[alias] = displayName;
            if (bps.length > 0) {
                traitBreakpoints[alias] = bps;
            }
        });
    });

    return { traitNamesByAlias, traitBreakpoints };
}

function mergeRawTraitMetadata({
    rawTraitMetadata,
    traitNamesByAlias,
    traitBreakpoints,
    traitIcons,
    setOverrides,
    latestSet,
    isExcludedTraitName,
    shouldPreferRawAsset
}) {
    Object.entries(rawTraitMetadata.traitBreakpoints).forEach(([alias, breakpoints]) => {
        const resolvedName = traitNamesByAlias[alias] || alias;
        if (isExcludedTraitName(resolvedName, setOverrides)) return;

        if (!traitBreakpoints[alias]) {
            traitBreakpoints[alias] = breakpoints;
        }
        if (!traitBreakpoints[resolvedName]) {
            traitBreakpoints[resolvedName] = breakpoints;
        }
    });

    Object.entries(rawTraitMetadata.traitIcons).forEach(([alias, iconUrl]) => {
        const resolvedName = traitNamesByAlias[alias] || alias;
        if (isExcludedTraitName(resolvedName, setOverrides)) return;

        if (!traitIcons[alias] || shouldPreferRawAsset(iconUrl, traitIcons[alias], latestSet)) {
            traitIcons[alias] = iconUrl;
        }
        if (!traitIcons[resolvedName] || shouldPreferRawAsset(iconUrl, traitIcons[resolvedName], latestSet)) {
            traitIcons[resolvedName] = iconUrl;
        }
    });
}

function shouldIncludeChampionRecord({
    key,
    value,
    rawJSON,
    rawShopDataLookup,
    latestSet,
    setChampionIdentitySet,
    setOverrides,
    isChampionRecord,
    isExcludedUnit,
    normalizeChampionIdentity,
    detectRawUnitSetNumber
}) {
    if (!isChampionRecord(key, value)) {
        return false;
    }

    const rawName = value.mCharacterName || '';
    if (isExcludedUnit(rawName, setOverrides) || value.tier === 0) {
        return false;
    }

    if (setChampionIdentitySet.size > 0) {
        const rawIdentity = normalizeChampionIdentity(rawName);
        return setChampionIdentitySet.has(rawIdentity);
    }

    if (!latestSet) {
        return true;
    }

    const rawSetNumber = detectRawUnitSetNumber(value, rawJSON, rawShopDataLookup);
    return !rawSetNumber || rawSetNumber === latestSet;
}

module.exports = {
    buildSetTraitIndexes,
    mergeRawTraitMetadata,
    shouldIncludeChampionRecord
};
