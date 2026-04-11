const { getSetOverrides } = require('../setOverrides.js');
const {
    buildSetTraitIndexes,
    mergeRawTraitMetadata
} = require('./parse-data-state.js');

function buildHashDictionary(rawJSON) {
    const hashDictionary = {};

    for (const [key, val] of Object.entries(rawJSON)) {
        if (key.startsWith('{') && key.endsWith('}')) {
            const name = val.name || val.mName || val.mDisplayName || val.mLabel || val.mCharacterName;
            if (name) {
                hashDictionary[key] = name;
            }
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

function buildParseDataContext(rawJSON, cdragonJSON, assetSources = {}, parseOptions = {}, hooks = {}) {
    const source = hooks.normalizeDataSource(parseOptions.source);
    const hashDictionary = buildHashDictionary(rawJSON);
    const rawTraitMetadata = hooks.buildRawTraitMetadata(rawJSON, source);
    const rawChampionRecordMap = hooks.buildRawChampionRecordMap(rawJSON);
    const rawShopDataLookup = hooks.buildRawShopDataLookup(rawJSON);
    const latestSet = hooks.detectLatestSet(cdragonJSON) || hooks.detectLatestSetFromRaw(rawJSON);
    const setOverrides = parseOptions.setOverrides || getSetOverrides({ setNumber: latestSet });
    const setData = hooks.getLatestSetData(cdragonJSON);
    const setChampionRecords = hooks.buildSetChampionRecords(setData, source, setOverrides);
    const setChampionIdentitySet = hooks.buildChampionIdentitySet(setChampionRecords);
    const championReferenceMap = hooks.buildChampionReferenceMap(setChampionRecords);
    const championAssets = hooks.buildChampionAssetMap(assetSources.rawChampionSplashesHtml, latestSet, source);
    const traitIcons = hooks.buildTraitIconMap(
        assetSources.rawTraitIconsHtml,
        setData,
        latestSet,
        source,
        rawTraitMetadata
    );
    const traitBreakpoints = {};
    const traitNamesByAlias = {};

    const setTraitIndexes = buildSetTraitIndexes(setData, hooks.normalizeBreakpoints);
    Object.assign(traitNamesByAlias, setTraitIndexes.traitNamesByAlias);
    Object.assign(traitBreakpoints, setTraitIndexes.traitBreakpoints);

    mergeRawTraitMetadata({
        rawTraitMetadata,
        traitNamesByAlias,
        traitBreakpoints,
        traitIcons,
        setOverrides,
        latestSet,
        isExcludedTraitName: hooks.isExcludedTraitName,
        shouldPreferRawAsset: hooks.shouldPreferRawAsset
    });

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
        traitBreakpoints,
        traitNamesByAlias
    };
}

function buildParsedDataResult({
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
    createDataFingerprint
}) {
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
        dataFingerprint: createDataFingerprint(parsedData)
    };
}

module.exports = {
    buildHashDictionary,
    buildParseDataContext,
    buildParsedDataResult
};
