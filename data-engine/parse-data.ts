const {
    buildParseDataContext,
    buildParsedDataResult
} = require('./parse-data-context.js');
const {
    buildParseDataHooks,
    buildParsedUnits
} = require('./parse-data-builders.js');

module.exports = {
    parseData(rawJSON, cdragonJSON, assetSources: LooseRecord = {}, parseOptions: LooseRecord = {}) {
        const parseHooks = buildParseDataHooks(this);
        const parseContext = buildParseDataContext(rawJSON, cdragonJSON, assetSources, parseOptions, parseHooks);
        const {
            source,
            hashDictionary,
            latestSet,
            setOverrides,
            setChampionRecords,
            traitIcons,
            traitBreakpoints
        } = parseContext;
        const {
            units,
            traits,
            roles,
            matchedChampionReferenceNames
        } = buildParsedUnits({
            rawJSON,
            parseContext,
            hooks: parseHooks
        });

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
            createDataFingerprint: parseHooks.createDataFingerprint
        });
    }
};
