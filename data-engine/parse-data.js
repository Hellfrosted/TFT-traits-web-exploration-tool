const {
    shouldIncludeChampionRecord
} = require('./parse-data-state.js');
const {
    buildParseDataContext,
    buildParsedDataResult
} = require('./parse-data-context.js');
const {
    resolveChampionLinkedTraits,
    collectResolvedUnitTaxonomy,
    resolvePreferredChampionIcon
} = require('./parse-data-units.js');

module.exports = {
    parseData(rawJSON, cdragonJSON, assetSources = {}, parseOptions = {}) {
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
            setChampionRecords,
            setChampionIdentitySet,
            championReferenceMap,
            championAssets,
            traitIcons,
            traitBreakpoints,
            traitNamesByAlias
        } = buildParseDataContext(rawJSON, cdragonJSON, assetSources, parseOptions, {
            normalizeDataSource: this.normalizeDataSource.bind(this),
            buildRawTraitMetadata: this._buildRawTraitMetadata.bind(this),
            buildRawChampionRecordMap: this._buildRawChampionRecordMap.bind(this),
            buildRawShopDataLookup: this._buildRawShopDataLookup.bind(this),
            detectLatestSet: this._detectLatestSet.bind(this),
            detectLatestSetFromRaw: this._detectLatestSetFromRaw.bind(this),
            getLatestSetData: this._getLatestSetData.bind(this),
            buildSetChampionRecords: this._buildSetChampionRecords.bind(this),
            buildChampionIdentitySet: this._buildChampionIdentitySet.bind(this),
            buildChampionReferenceMap: this._buildChampionReferenceMap.bind(this),
            buildChampionAssetMap: this._buildChampionAssetMap.bind(this),
            buildTraitIconMap: this._buildTraitIconMap.bind(this),
            normalizeBreakpoints: this._normalizeBreakpoints.bind(this),
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

            const linkedTraitState = resolveChampionLinkedTraits({
                linkedTraits: val.mLinkedTraits,
                hashDictionary,
                traitNamesByAlias,
                isExcludedTraitName: this._isExcludedTraitName.bind(this),
                setOverrides
            });
            const autoDetectedVariantOverride = !unitOverride?.variants?.length && !unitOverride?.selectionGroups?.length
                ? this._buildDetectedVariantOverrides({
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
            const mergedUnitOverride = this._mergeUnitOverrides(unitOverride, autoDetectedVariantOverride);
            const overrideContributionTraits = Object.entries(mergedUnitOverride?.traitContributions || {})
                .filter(([, count]) => Number(count) > 0)
                .map(([trait]) => trait);
            const effectiveTraitNames = this._applyUnitTraitOverrides(
                [...linkedTraitState.linkedTraitNames, ...overrideContributionTraits],
                mergedUnitOverride
            );
            const effectiveTraitSet = new Set(effectiveTraitNames);
            const linkedTraitIds = linkedTraitState.includedLinkedTraits
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
            collectResolvedUnitTaxonomy({
                traits,
                roles,
                effectiveTraitNames,
                conditionalEffects,
                conditionalProfiles,
                variants,
                resolvedRoleName
            });
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
            const resolvedIconUrl = resolvePreferredChampionIcon({
                rawShopIcon,
                championIcon,
                championReferenceIconUrl: championReference?.record?.iconUrl,
                latestSet,
                shouldPreferRawAsset: this._shouldPreferRawAsset.bind(this),
                assetMatchesSet: this._assetMatchesSet.bind(this),
                rankChampionIconAsset: this._rankChampionIconAsset.bind(this)
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

        return buildParsedDataResult({
            units,
            traits,
            roles,
            traitBreakpoints,
            traitIcons,
            hashDictionary,
            latestSet,
            source,
            setOverrides,
            setChampionRecords,
            matchedChampionReferenceNames,
            createDataFingerprint: this._createDataFingerprint.bind(this)
        });
    }
};
