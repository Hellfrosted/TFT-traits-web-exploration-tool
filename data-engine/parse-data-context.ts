const { getSetOverrides } = require('../setOverrides.js');
const {
    buildSetTraitIndexes,
    mergeRawTraitMetadata
} = require('./parse-data-state.js');

function buildHashDictionary(rawJSON: LooseRecord) {
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

function buildRawMetadataIndex(rawJSON: LooseRecord, source, hooks: LooseRecord) {
    return {
        hashDictionary: buildHashDictionary(rawJSON),
        rawTraitMetadata: hooks.buildRawTraitMetadata(rawJSON, source),
        rawChampionRecordMap: hooks.buildRawChampionRecordMap(rawJSON),
        rawShopDataLookup: hooks.buildRawShopDataLookup(rawJSON)
    };
}

function resolveSetParseContext({
    rawJSON,
    cdragonJSON,
    parseOptions,
    rawShopDataLookup,
    source,
    hooks
}) {
    const latestSet = hooks.detectLatestSet(cdragonJSON) || hooks.detectLatestSetFromRaw(rawJSON);
    const setOverrides = parseOptions.setOverrides || getSetOverrides({ setNumber: latestSet });
    const setData = hooks.getLatestSetData(cdragonJSON);
    const setChampionRecords = hooks.buildSetChampionRecords(setData, source, setOverrides);

    return {
        latestSet,
        setOverrides,
        setData,
        setChampionRecords,
        setChampionIdentitySet: hooks.buildChampionIdentitySet(setChampionRecords),
        championReferenceMap: hooks.buildChampionReferenceMap(setChampionRecords),
        rawShopDataLookup
    };
}

function prepareAssetLookupContext({
    assetSources,
    setData,
    latestSet,
    source,
    rawTraitMetadata,
    setOverrides,
    hooks
}) {
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
        championAssets,
        traitIcons,
        traitBreakpoints,
        traitNamesByAlias
    };
}

function buildParseDataContext(rawJSON, cdragonJSON, assetSources: LooseRecord = {}, parseOptions: LooseRecord = {}, hooks: LooseRecord = {}) {
    const source = hooks.normalizeDataSource(parseOptions.source);
    const rawMetadataIndex = buildRawMetadataIndex(rawJSON, source, hooks);
    const setContext = resolveSetParseContext({
        rawJSON,
        cdragonJSON,
        parseOptions,
        rawShopDataLookup: rawMetadataIndex.rawShopDataLookup,
        source,
        hooks
    });
    const assetLookupContext = prepareAssetLookupContext({
        assetSources,
        setData: setContext.setData,
        latestSet: setContext.latestSet,
        source,
        rawTraitMetadata: rawMetadataIndex.rawTraitMetadata,
        setOverrides: setContext.setOverrides,
        hooks
    });

    return {
        source,
        hashDictionary: rawMetadataIndex.hashDictionary,
        rawTraitMetadata: rawMetadataIndex.rawTraitMetadata,
        rawChampionRecordMap: rawMetadataIndex.rawChampionRecordMap,
        rawShopDataLookup: rawMetadataIndex.rawShopDataLookup,
        latestSet: setContext.latestSet,
        setOverrides: setContext.setOverrides,
        setData: setContext.setData,
        setChampionRecords: setContext.setChampionRecords,
        setChampionIdentitySet: setContext.setChampionIdentitySet,
        championReferenceMap: setContext.championReferenceMap,
        championAssets: assetLookupContext.championAssets,
        traitIcons: assetLookupContext.traitIcons,
        traitBreakpoints: assetLookupContext.traitBreakpoints,
        traitNamesByAlias: assetLookupContext.traitNamesByAlias
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
    buildRawMetadataIndex,
    buildHashDictionary,
    prepareAssetLookupContext,
    buildParseDataContext,
    buildParsedDataResult,
    resolveSetParseContext
};
