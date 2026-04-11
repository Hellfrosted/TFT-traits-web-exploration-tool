function resolveChampionLinkedTraits({
    linkedTraits,
    hashDictionary,
    traitNamesByAlias,
    isExcludedTraitName,
    setOverrides
}) {
    const allLinkedTraits = (linkedTraits || []).reduce((result, traitLink) => {
        const traitId = traitLink?.TraitData;
        if (!traitId) {
            return result;
        }

        const alias = hashDictionary[traitId] || traitId;
        const resolvedName = traitNamesByAlias[alias] || traitNamesByAlias[traitId] || alias;
        result.push({ traitId, resolvedName });
        return result;
    }, []);

    const hasExcludedLinkedTraits = allLinkedTraits.some(({ resolvedName }) =>
        isExcludedTraitName(resolvedName, setOverrides)
    );
    const includedLinkedTraits = allLinkedTraits.filter(({ resolvedName }) =>
        !isExcludedTraitName(resolvedName, setOverrides)
    );

    return {
        allLinkedTraits,
        includedLinkedTraits,
        linkedTraitNames: includedLinkedTraits.map(({ resolvedName }) => resolvedName),
        hasExcludedLinkedTraits
    };
}

function collectResolvedUnitTaxonomy({
    traits,
    roles,
    effectiveTraitNames,
    conditionalEffects,
    conditionalProfiles,
    variants,
    resolvedRoleName
}) {
    effectiveTraitNames.forEach((traitName) => traits.add(traitName));

    conditionalEffects.forEach((effect) => {
        Object.keys(effect.traitContributions).forEach((traitName) => traits.add(traitName));
    });

    conditionalProfiles.forEach((profile) => {
        profile.traits.forEach((traitName) => traits.add(traitName));
        Object.keys(profile.traitContributions).forEach((traitName) => traits.add(traitName));
    });

    variants.forEach((variant) => {
        variant.traits.forEach((traitName) => traits.add(traitName));
        (variant.conditionalEffects || []).forEach((effect) => {
            Object.keys(effect.traitContributions).forEach((traitName) => traits.add(traitName));
        });
        (variant.conditionalProfiles || []).forEach((profile) => {
            profile.traits.forEach((traitName) => traits.add(traitName));
            Object.keys(profile.traitContributions).forEach((traitName) => traits.add(traitName));
        });

        if (variant.role && variant.role !== 'Unknown') {
            roles.add(variant.role);
        }
    });

    if (resolvedRoleName && resolvedRoleName !== 'Unknown') {
        roles.add(resolvedRoleName);
    }
}

function resolvePreferredChampionIcon({
    rawShopIcon,
    championIcon,
    championReferenceIconUrl,
    latestSet,
    shouldPreferRawAsset,
    assetMatchesSet,
    rankChampionIconAsset
}) {
    const preferredMetadataIcon = championReferenceIconUrl
        ? {
            url: championReferenceIconUrl,
            rank: rankChampionIconAsset(championReferenceIconUrl)
        }
        : championIcon
            ? {
                url: championIcon.url,
                rank: championIcon.rank ?? rankChampionIconAsset(championIcon.url)
            }
            : null;

    const rawIconBeatsMetadata = rawShopIcon && (
        shouldPreferRawAsset(rawShopIcon.url, preferredMetadataIcon?.url, latestSet) ||
        (
            assetMatchesSet(rawShopIcon.url, latestSet) &&
            assetMatchesSet(preferredMetadataIcon?.url, latestSet) &&
            rawShopIcon.rank > (preferredMetadataIcon?.rank ?? -1)
        )
    );

    return rawIconBeatsMetadata
        ? rawShopIcon.url
        : (preferredMetadataIcon?.url || rawShopIcon?.url || null);
}

module.exports = {
    resolveChampionLinkedTraits,
    collectResolvedUnitTaxonomy,
    resolvePreferredChampionIcon
};
