const crypto = require('crypto');
const { getSetOverrides } = require('../setOverrides.js');

module.exports = {
    _isChampionRecord(key, val) {
        if (!val || typeof val !== 'object') return false;

        const rawTags = val.unitTagsString;
        const hasChampionTag = Array.isArray(rawTags)
            ? rawTags.includes('Champion')
            : String(rawTags || '').includes('Champion');

        const looksLikeCharacterRecord =
            key.includes('CharacterRecords/Root') ||
            key.includes('Characters/');

        return looksLikeCharacterRecord && hasChampionTag && typeof val.mCharacterName === 'string';
    },

    _detectLatestSet(cdragonJSON) {
        if (!cdragonJSON || !cdragonJSON.sets) return null;

        const setKeys = Object.keys(cdragonJSON.sets)
            .map(Number)
            .filter((value) => !isNaN(value));

        if (setKeys.length === 0) return null;

        return String(Math.max(...setKeys));
    },

    _detectLatestSetFromRaw(rawJSON) {
        const setNumbers = new Set();

        for (const [key, val] of Object.entries(rawJSON || {})) {
            if (!this._isChampionRecord(key, val)) {
                if (val?.__type === 'TftShopData') {
                    this._extractSetNumbersFromText([
                        val.mName,
                        val.TeamPlannerPortraitPath,
                        val.SquareSplashPath,
                        val.TeamPlannerSplashPath,
                        val.PcSplashPath,
                        val.AbilityIconPath
                    ].join(' ')).forEach((setNumber) => setNumbers.add(Number(setNumber)));
                }

                if (val?.__type === 'TftTraitData') {
                    this._extractSetNumbersFromText([val.mName, val.mIconPath].join(' '))
                        .forEach((setNumber) => setNumbers.add(Number(setNumber)));
                }

                continue;
            }

            const setNumber = this._resolveHighestSetNumber([val.mCharacterName]);
            if (setNumber) {
                setNumbers.add(Number(setNumber));
            }
        }

        if (setNumbers.size === 0) {
            return null;
        }

        return String(Math.max(...setNumbers));
    },

    _getLatestSetData(cdragonJSON) {
        const latestSet = this._detectLatestSet(cdragonJSON);
        if (!latestSet || !cdragonJSON?.sets?.[latestSet]) {
            return null;
        }
        return cdragonJSON.sets[latestSet];
    },

    _resolveRoleName({
        cleanName,
        rawName,
        roleId,
        hashDictionary,
        championReference,
        setOverrides
    }) {
        const roleOverrides = setOverrides.roleOverrides || {};
        const roleOverride = roleOverrides[cleanName] || roleOverrides[rawName] || null;
        if (roleOverride) return roleOverride;

        const hashedRole = hashDictionary[roleId];
        if (hashedRole && hashedRole !== 'Unknown') return hashedRole;

        const referenceRole = championReference?.record?.role;
        if (referenceRole && referenceRole !== 'Unknown') return referenceRole;

        return 'Unknown';
    },

    _deriveStableVariantRole(baseRole, variants) {
        if (baseRole && baseRole !== 'Unknown') {
            return baseRole;
        }

        const variantRoles = [...new Set(
            (variants || [])
                .map((variant) => variant?.role)
                .filter((roleName) => roleName && roleName !== 'Unknown')
        )];

        if (variantRoles.length !== 1) {
            return baseRole;
        }

        const [variantRole] = variantRoles;
        const allVariantsMatch = (variants || []).every((variant) => variant?.role === variantRole);
        return allVariantsMatch ? variantRole : baseRole;
    },

    _detectRawUnitSetNumber(rawChampionRecord, rawJSON, rawShopDataLookup = null) {
        const rawName = rawChampionRecord?.mCharacterName || '';
        const cleanName = this._normalizeUnitAlias(rawName);
        const displayName = this._toDisplayName(cleanName) || cleanName;
        const shopData = this._findRawShopData(
            rawChampionRecord,
            rawJSON,
            rawShopDataLookup,
            rawName,
            cleanName,
            displayName
        );
        const linkedTraitSignals = (rawChampionRecord?.mLinkedTraits || []).flatMap((traitLink) => {
            const traitRecord = rawJSON?.[traitLink?.TraitData];
            if (!traitRecord || traitRecord.__type !== 'TftTraitData') {
                return [];
            }

            return [traitRecord.mName, traitRecord.mIconPath];
        });

        return this._resolveHighestSetNumber([
            rawName,
            shopData?.mName,
            shopData?.TeamPlannerPortraitPath,
            shopData?.SquareSplashPath,
            shopData?.TeamPlannerSplashPath,
            shopData?.PcSplashPath,
            shopData?.AbilityIconPath,
            ...linkedTraitSignals
        ]);
    },

    _createDataFingerprint(parsedData) {
        const fingerprintPayload = JSON.stringify({
            setNumber: parsedData.setNumber,
            units: parsedData.units.map((unit) => ({
                id: unit.id,
                cost: unit.cost,
                role: unit.role,
                traits: unit.traits,
                traitContributions: unit.traitContributions || null,
                conditionalEffects: unit.conditionalEffects || null,
                conditionalProfiles: unit.conditionalProfiles || null,
                variants: unit.variants || null
            })),
            traits: parsedData.traits,
            roles: parsedData.roles,
            traitBreakpoints: parsedData.traitBreakpoints
        });

        return crypto.createHash('sha1').update(fingerprintPayload).digest('hex');
    },

    parseData(rawJSON, cdragonJSON, assetSources = {}, parseOptions = {}) {
        const source = this.normalizeDataSource(parseOptions.source);
        const units = [];
        const traits = new Set();
        const roles = new Set();
        const hashDictionary = {};
        const traitNamesByAlias = {};
        const rawTraitMetadata = this._buildRawTraitMetadata(rawJSON, source);
        const rawChampionRecordMap = this._buildRawChampionRecordMap(rawJSON);
        const rawShopDataLookup = this._buildRawShopDataLookup(rawJSON);

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

        if (setData?.traits && Array.isArray(setData.traits)) {
            setData.traits.forEach((trait) => {
                const bps = this._normalizeBreakpoints(trait.effects);
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
            if (this._isExcludedTraitName(resolvedName, setOverrides)) return;

            if (!traitBreakpoints[alias]) {
                traitBreakpoints[alias] = breakpoints;
            }
            if (!traitBreakpoints[resolvedName]) {
                traitBreakpoints[resolvedName] = breakpoints;
            }
        });

        Object.entries(rawTraitMetadata.traitIcons).forEach(([alias, iconUrl]) => {
            const resolvedName = traitNamesByAlias[alias] || alias;
            if (this._isExcludedTraitName(resolvedName, setOverrides)) return;

            if (!traitIcons[alias] || this._shouldPreferRawAsset(iconUrl, traitIcons[alias], latestSet)) {
                traitIcons[alias] = iconUrl;
            }
            if (!traitIcons[resolvedName] || this._shouldPreferRawAsset(iconUrl, traitIcons[resolvedName], latestSet)) {
                traitIcons[resolvedName] = iconUrl;
            }
        });

        for (const [key, val] of Object.entries(rawJSON)) {
            if (!this._isChampionRecord(key, val)) {
                continue;
            }

            const rawName = val.mCharacterName || '';
            if (this._isExcludedUnit(rawName, setOverrides) || val.tier === 0) continue;
            if (setChampionIdentitySet.size > 0) {
                const rawIdentity = this._normalizeChampionIdentity(rawName);
                if (!setChampionIdentitySet.has(rawIdentity)) {
                    continue;
                }
            } else if (latestSet) {
                const rawSetNumber = this._detectRawUnitSetNumber(val, rawJSON, rawShopDataLookup);
                if (rawSetNumber && rawSetNumber !== latestSet) {
                    continue;
                }
            }

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
