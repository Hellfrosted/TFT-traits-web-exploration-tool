function mapDataResponse(dataCache) {
    return {
        success: true,
        dataSource: dataCache.dataSource,
        count: dataCache.units.length,
        units: dataCache.units,
        traits: dataCache.traits,
        roles: dataCache.roles,
        traitBreakpoints: dataCache.traitBreakpoints,
        traitIcons: dataCache.traitIcons,
        assetValidation: dataCache.assetValidation,
        hashMap: dataCache.hashMap,
        setNumber: dataCache.setNumber,
        dataFingerprint: dataCache.dataFingerprint,
        snapshotFetchedAt: dataCache.snapshotFetchedAt || null,
        usedCachedSnapshot: !!dataCache.usedCachedSnapshot
    };
}

function createDataService({
    dataEngine,
    cacheService,
    defaultDataSource
}) {
    let dataCache = null;

    async function fetchData(requestedSource = defaultDataSource) {
        const source = dataEngine.normalizeDataSource(requestedSource);
        dataCache = await dataEngine.fetchAndParse({
            source,
            readFallback: async () => await cacheService.readDataFallback(source),
            writeFallback: async (data) => await cacheService.writeDataFallback(source, data)
        });
        await cacheService.pruneCache(dataCache.dataFingerprint);
        return mapDataResponse(dataCache);
    }

    function getDataCache() {
        return dataCache;
    }

    function setDataCache(value) {
        dataCache = value;
    }

    return {
        fetchData,
        getDataCache,
        setDataCache
    };
}

module.exports = {
    createDataService,
    mapDataResponse
};
