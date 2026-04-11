const { getSetOverrides } = require('../setOverrides.js');

function buildHashDictionary(rawJSON) {
    const hashDictionary = {};

    for (const [key, val] of Object.entries(rawJSON)) {
        if (key.startsWith('{') && key.endsWith('}')) {
            const name = val.name || val.mName || val.mDisplayName || val.mLabel || val.mCharacterName;
            if (name) hashDictionary[key] = name;
        }
    }

    for (const [key, val] of Object.entries(rawJSON)) {
        if (val.mName || val.mDisplayName || key.includes('Trait') || key.includes('CharacterRole')) {
            if (!hashDictionary[key]) {
                hashDictionary[key] = val.mName || val.mDisplayName || val.mCharacterName || key;
            }
        }
    }

    return hashDictionary;
}

function buildParseContext(engine, rawJSON, cdragonJSON, assetSources, parseOptions) {
    const source = engine.normalizeDataSource(parseOptions.source);
    const hashDictionary = buildHashDictionary(rawJSON);
    const rawTraitMetadata = engine._buildRawTraitMetadata(rawJSON, source);
    const rawChampionRecordMap = engine._buildRawChampionRecordMap(rawJSON);
    const rawShopDataLookup = engine._buildRawShopDataLookup(rawJSON);
    const latestSet = engine._detectLatestSet(cdragonJSON) || engine._detectLatestSetFromRaw(rawJSON);
    const setOverrides = parseOptions.setOverrides || getSetOverrides({ setNumber: latestSet });
    const setData = engine._getLatestSetData(cdragonJSON);
    const setChampionRecords = engine._buildSetChampionRecords(setData, source, setOverrides);
    const setChampionIdentitySet = engine._buildChampionIdentitySet(setChampionRecords);
    const championReferenceMap = engine._buildChampionReferenceMap(setChampionRecords);
    const championAssets = engine._buildChampionAssetMap(assetSources.rawChampionSplashesHtml, latestSet, source);
    const traitIcons = engine._buildTraitIconMap(
        assetSources.rawTraitIconsHtml,
        setData,
        latestSet,
        source,
        rawTraitMetadata
    );

    return {
        source,
        hashDictionary,
        rawTraitMetadata,
        rawChampionRecordMap,
        rawShopDataLookup,
        latestSet,
        setOverrides,
        setData,
        setChampionRecords,
        setChampionIdentitySet,
        championReferenceMap,
        championAssets,
        traitIcons,
        traitNamesByAlias: {},
        traitBreakpoints: {},
        matchedChampionReferenceNames: new Set()
    };
}

function mergeTraitMetadata(engine, context) {
    const {
        setData,
        setOverrides,
        rawTraitMetadata,
        traitNamesByAlias,
        traitBreakpoints,
        traitIcons,
        latestSet
    } = context;

    if (setData?.traits && Array.isArray(setData.traits)) {
        setData.traits.forEach((trait) => {
            const bps = engine._normalizeBreakpoints(trait.effects);
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
    }

    Object.entries(rawTraitMetadata.traitBreakpoints).forEach(([alias, breakpoints]) => {
        const resolvedName = traitNamesByAlias[alias] || alias;
        if (engine._isExcludedTraitName(resolvedName, setOverrides)) return;

        if (!traitBreakpoints[alias]) {
            traitBreakpoints[alias] = breakpoints;
        }
        if (!traitBreakpoints[resolvedName]) {
            traitBreakpoints[resolvedName] = breakpoints;
        }
    });

    Object.entries(rawTraitMetadata.traitIcons).forEach(([alias, iconUrl]) => {
        const resolvedName = traitNamesByAlias[alias] || alias;
        if (engine._isExcludedTraitName(resolvedName, setOverrides)) return;

        if (!traitIcons[alias] || engine._shouldPreferRawAsset(iconUrl, traitIcons[alias], latestSet)) {
            traitIcons[alias] = iconUrl;
        }
        if (!traitIcons[resolvedName] || engine._shouldPreferRawAsset(iconUrl, traitIcons[resolvedName], latestSet)) {
            traitIcons[resolvedName] = iconUrl;
        }
    });
}

function shouldIncludeChampionRecord(engine, recordKey, recordValue, context, rawJSON) {
    const {
        setOverrides,
        setChampionIdentitySet,
        latestSet,
        rawShopDataLookup
    } = context;

    if (!engine._isChampionRecord(recordKey, recordValue)) {
        return false;
    }

    const rawName = recordValue.mCharacterName || '';
    if (engine._isExcludedUnit(rawName, setOverrides) || recordValue.tier === 0) {
        return false;
    }

    if (setChampionIdentitySet.size > 0) {
        const rawIdentity = engine._normalizeChampionIdentity(rawName);
        return setChampionIdentitySet.has(rawIdentity);
    }

    if (latestSet) {
        const rawSetNumber = engine._detectRawUnitSetNumber(recordValue, rawJSON, rawShopDataLookup);
        return !rawSetNumber || rawSetNumber === latestSet;
    }

    return true;
}

function buildParsedUnits(engine, rawJSON, context) {
    const units = [];
    const traits = new Set();
    const roles = new Set();
    const {
        source,
        hashDictionary,
        rawChampionRecordMap,
        rawShopDataLookup,
        latestSet,
        setOverrides,
        championReferenceMap,
        championAssets,
        traitNamesByAlias,
        matchedChampionReferenceNames
    } = context;

    for (const [key, val] of Object.entries(rawJSON)) {
        if (!shouldIncludeChampionRecord(engine, key, val, context, rawJSON)) {
            continue;
        }

        const rawName = val.mCharacterName || '';
        const tier = val.tier || 1;
        const cleanName = rawName.replace(/^TFT\d+_/, '');
        const displayName = engine._toDisplayName(cleanName) || cleanName;
        const championReference = engine._findChampionReference(championReferenceMap, rawName, cleanName, displayName);
        const unitOverride = engine._getUnitOverride(cleanName, rawName, setOverrides);
        const roleName = engine._resolveRoleName({
            cleanName,
            rawName,
            roleId: val.CharacterRole || 'Unknown',
            hashDictionary,
            championReference,
            setOverrides
        });

        const allLinkedTraits = (val.mLinkedTraits || []).reduce((result, traitLink) => {
            const traitId = traitLink?.TraitData;
            if (!traitId) return result;

            const alias = hashDictionary[traitId] || traitId;
            const resolvedName = traitNamesByAlias[alias] || traitNamesByAlias[traitId] || alias;
            result.push({ traitId, resolvedName });
            return result;
        }, []);
        const hasExcludedLinkedTraits = allLinkedTraits.some(({ resolvedName }) =>
            engine._isExcludedTraitName(resolvedName, setOverrides)
        );
        const linkedTraits = allLinkedTraits.filter(({ resolvedName }) =>
            !engine._isExcludedTraitName(resolvedName, setOverrides)
        );
        const linkedTraitNames = linkedTraits.map(({ resolvedName }) => resolvedName);
        const autoDetectedVariantOverride = !unitOverride?.variants?.length && !unitOverride?.selectionGroups?.length
            ? engine._buildDetectedVariantOverrides({
                rawName,
                baseRole: roleName,
                baseTraits: linkedTraitNames,
                hasExcludedLinkedTraits,
                rawChampionRecordMap,
                hashDictionary,
                traitNamesByAlias,
                setOverrides
            })
            : null;
        const mergedUnitOverride = engine._mergeUnitOverrides(unitOverride, autoDetectedVariantOverride);
        const overrideContributionTraits = Object.entries(mergedUnitOverride?.traitContributions || {})
            .filter(([, count]) => Number(count) > 0)
            .map(([trait]) => trait);
        const effectiveTraitNames = engine._applyUnitTraitOverrides(
            [...linkedTraitNames, ...overrideContributionTraits],
            mergedUnitOverride
        );
        const effectiveTraitSet = new Set(effectiveTraitNames);
        const linkedTraitIds = linkedTraits
            .filter(({ resolvedName }) => effectiveTraitSet.has(resolvedName))
            .map(({ traitId }) => traitId);
        const traitContributions = engine._buildTraitContributionMap(effectiveTraitNames, mergedUnitOverride);
        const variants = engine._buildUnitVariants(effectiveTraitNames, roleName, mergedUnitOverride);
        const conditionalEffects = engine._normalizeConditionalEffects(mergedUnitOverride?.conditionalEffects);
        const conditionalProfiles = engine._buildConditionalProfiles(
            effectiveTraitNames,
            mergedUnitOverride?.conditionalProfiles
        );
        const resolvedRoleName = engine._deriveStableVariantRole(roleName, variants);
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
        const rawShopIcon = engine._resolveRawChampionIcon(
            val,
            rawJSON,
            rawShopDataLookup,
            rawName,
            cleanName,
            displayName,
            source
        );
        const championIcon = engine._findChampionIcon(championAssets, rawName, cleanName, displayName);
        const preferredMetadataIcon = championReference?.record?.iconUrl
            ? {
                url: championReference.record.iconUrl,
                rank: engine._rankChampionIconAsset(championReference.record.iconUrl)
            }
            : championIcon
                ? {
                    url: championIcon.url,
                    rank: championIcon.rank ?? engine._rankChampionIconAsset(championIcon.url)
                }
                : null;
        const rawIconBeatsMetadata = rawShopIcon && (
            engine._shouldPreferRawAsset(rawShopIcon.url, preferredMetadataIcon?.url, latestSet)
            || (
                engine._assetMatchesSet(rawShopIcon.url, latestSet)
                && engine._assetMatchesSet(preferredMetadataIcon?.url, latestSet)
                && rawShopIcon.rank > (preferredMetadataIcon?.rank ?? -1)
            )
        );
        const resolvedIconUrl = rawIconBeatsMetadata
            ? rawShopIcon.url
            : (preferredMetadataIcon?.url || rawShopIcon?.url || null);
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
        roles
    };
}

function buildParsedDataPayload(context, parsedUnits) {
    const sortedTraits = Array.from(parsedUnits.traits).sort();
    const missingChampionIcons = parsedUnits.units
        .filter((unit) => !unit.iconUrl)
        .map((unit) => unit.displayName);

    return {
        units: parsedUnits.units,
        traits: sortedTraits,
        roles: Array.from(parsedUnits.roles).sort(),
        traitBreakpoints: context.traitBreakpoints,
        traitIcons: context.traitIcons,
        hashMap: context.hashDictionary,
        setNumber: context.latestSet,
        dataSource: context.source,
        setOverrides: context.setOverrides,
        assetValidation: {
            championAssetCount: context.setChampionRecords.length,
            matchedChampionCount: context.matchedChampionReferenceNames.size,
            totalUnits: parsedUnits.units.length,
            missingChampionIcons,
            unmatchedChampionAssets: Math.max(0, context.setChampionRecords.length - context.matchedChampionReferenceNames.size),
            traitIconCount: Object.keys(context.traitIcons).length,
            totalTraits: sortedTraits.length
        }
    };
}

module.exports = {
    parseData(rawJSON, cdragonJSON, assetSources = {}, parseOptions = {}) {
        const context = buildParseContext(this, rawJSON, cdragonJSON, assetSources, parseOptions);
        mergeTraitMetadata(this, context);
        const parsedUnits = buildParsedUnits(this, rawJSON, context);
        const parsedData = buildParsedDataPayload(context, parsedUnits);

        return {
            ...parsedData,
            dataFingerprint: this._createDataFingerprint(parsedData)
        };
    }
};
