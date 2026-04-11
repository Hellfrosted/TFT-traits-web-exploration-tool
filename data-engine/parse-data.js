const { getSetOverrides } = require('../setOverrides.js');
const {
    buildSetTraitIndexes,
    mergeRawTraitMetadata,
    shouldIncludeChampionRecord
} = require('./parse-data-state.js');

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

module.exports = {
    parseData(rawJSON, cdragonJSON, assetSources = {}, parseOptions = {}) {
        const source = this.normalizeDataSource(parseOptions.source);
        const units = [];
        const traits = new Set();
        const roles = new Set();
        const hashDictionary = buildHashDictionary(rawJSON);
        const traitNamesByAlias = {};
        const rawTraitMetadata = this._buildRawTraitMetadata(rawJSON, source);
        const rawChampionRecordMap = this._buildRawChampionRecordMap(rawJSON);
        const rawShopDataLookup = this._buildRawShopDataLookup(rawJSON);
        const traitBreakpoints = {};
        const latestSet = this._detectLatestSet(cdragonJSON) || this._detectLatestSetFromRaw(rawJSON);
        const setOverrides = parseOptions.setOverrides || getSetOverrides({ setNumber: latestSet });
        const setData = this._getLatestSetData(cdragonJSON);
        const setChampionRecords = this._buildSetChampionRecords(setData, source, setOverrides);
        const setChampionIdentitySet = this._buildChampionIdentitySet(setChampionRecords);
        const championReferenceMap = this._buildChampionReferenceMap(setChampionRecords);
        const championAssets = this._buildChampionAssetMap(assetSources.rawChampionSplashesHtml, latestSet, source);
        const traitIcons = this._buildTraitIconMap(assetSources.rawTraitIconsHtml, setData, latestSet, source, rawTraitMetadata);
        const matchedChampionReferenceNames = new Set();

        const setTraitIndexes = buildSetTraitIndexes(setData, this._normalizeBreakpoints.bind(this));
        Object.assign(traitNamesByAlias, setTraitIndexes.traitNamesByAlias);
        Object.assign(traitBreakpoints, setTraitIndexes.traitBreakpoints);

        mergeRawTraitMetadata({
            rawTraitMetadata,
            traitNamesByAlias,
            traitBreakpoints,
            traitIcons,
            setOverrides,
            latestSet,
            isExcludedTraitName: this._isExcludedTraitName.bind(this),
            shouldPreferRawAsset: this._shouldPreferRawAsset.bind(this)
        });

        for (const [key, val] of Object.entries(rawJSON)) {
            if (!shouldIncludeChampionRecord({
                key,
                value: val,
                rawJSON,
                rawShopDataLookup,
                latestSet,
                setChampionIdentitySet,
                setOverrides,
                isChampionRecord: this._isChampionRecord.bind(this),
                isExcludedUnit: this._isExcludedUnit.bind(this),
                normalizeChampionIdentity: this._normalizeChampionIdentity.bind(this),
                detectRawUnitSetNumber: this._detectRawUnitSetNumber.bind(this)
            })) {
                continue;
            }

            const rawName = val.mCharacterName || '';
            const tier = val.tier || 1;
            const cleanName = rawName.replace(/^TFT\d+_/, '');
            const displayName = this._toDisplayName(cleanName) || cleanName;
            const championReference = this._findChampionReference(championReferenceMap, rawName, cleanName, displayName);
            const unitOverride = this._getUnitOverride(cleanName, rawName, setOverrides);
            const roleName = this._resolveRoleName({
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
                this._isExcludedTraitName(resolvedName, setOverrides)
            );
            const linkedTraits = allLinkedTraits.filter(({ resolvedName }) =>
                !this._isExcludedTraitName(resolvedName, setOverrides)
            );
            const linkedTraitNames = linkedTraits.map(({ resolvedName }) => resolvedName);
            const autoDetectedVariantOverride = !unitOverride?.variants?.length && !unitOverride?.selectionGroups?.length
                ? this._buildDetectedVariantOverrides({
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
            const mergedUnitOverride = this._mergeUnitOverrides(unitOverride, autoDetectedVariantOverride);
            const overrideContributionTraits = Object.entries(mergedUnitOverride?.traitContributions || {})
                .filter(([, count]) => Number(count) > 0)
                .map(([trait]) => trait);
            const effectiveTraitNames = this._applyUnitTraitOverrides(
                [...linkedTraitNames, ...overrideContributionTraits],
                mergedUnitOverride
            );
            const effectiveTraitSet = new Set(effectiveTraitNames);
            const linkedTraitIds = linkedTraits
                .filter(({ resolvedName }) => effectiveTraitSet.has(resolvedName))
                .map(({ traitId }) => traitId);
            const traitContributions = this._buildTraitContributionMap(effectiveTraitNames, mergedUnitOverride);
            const variants = this._buildUnitVariants(effectiveTraitNames, roleName, mergedUnitOverride);
            const conditionalEffects = this._normalizeConditionalEffects(mergedUnitOverride?.conditionalEffects);
            const conditionalProfiles = this._buildConditionalProfiles(
                effectiveTraitNames,
                mergedUnitOverride?.conditionalProfiles
            );
            const resolvedRoleName = this._deriveStableVariantRole(roleName, variants);
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
            const rawShopIcon = this._resolveRawChampionIcon(
                val,
                rawJSON,
                rawShopDataLookup,
                rawName,
                cleanName,
                displayName,
                source
            );
            const championIcon = this._findChampionIcon(championAssets, rawName, cleanName, displayName);
            const preferredMetadataIcon = championReference?.record?.iconUrl
                ? {
                    url: championReference.record.iconUrl,
                    rank: this._rankChampionIconAsset(championReference.record.iconUrl)
                }
                : championIcon
                    ? {
                        url: championIcon.url,
                        rank: championIcon.rank ?? this._rankChampionIconAsset(championIcon.url)
                    }
                    : null;
            const rawIconBeatsMetadata = rawShopIcon && (
                this._shouldPreferRawAsset(rawShopIcon.url, preferredMetadataIcon?.url, latestSet) ||
                (
                    this._assetMatchesSet(rawShopIcon.url, latestSet) &&
                    this._assetMatchesSet(preferredMetadataIcon?.url, latestSet) &&
                    rawShopIcon.rank > (preferredMetadataIcon?.rank ?? -1)
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

        const sortedTraits = Array.from(traits).sort();
        const missingChampionIcons = units
            .filter((unit) => !unit.iconUrl)
            .map((unit) => unit.displayName);

        const parsedData = {
            units,
            traits: sortedTraits,
            roles: Array.from(roles).sort(),
            traitBreakpoints,
            traitIcons,
            hashMap: hashDictionary,
            setNumber: latestSet,
            dataSource: source,
            setOverrides,
            assetValidation: {
                championAssetCount: setChampionRecords.length,
                matchedChampionCount: matchedChampionReferenceNames.size,
                totalUnits: units.length,
                missingChampionIcons,
                unmatchedChampionAssets: Math.max(0, setChampionRecords.length - matchedChampionReferenceNames.size),
                traitIconCount: Object.keys(traitIcons).length,
                totalTraits: sortedTraits.length
            }
        };

        return {
            ...parsedData,
            dataFingerprint: this._createDataFingerprint(parsedData)
        };
    }
};
