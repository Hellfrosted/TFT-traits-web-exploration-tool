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
    let latestRequestedFetchToken = 0;
    const latestRequestedFallbackFetchTokenBySource = new Map();

    async function fetchData(requestedSource = defaultDataSource) {
        const source = dataEngine.normalizeDataSource(requestedSource);
        const fetchToken = ++latestRequestedFetchToken;
        const sourceFetchToken = (latestRequestedFallbackFetchTokenBySource.get(source) || 0) + 1;
        latestRequestedFallbackFetchTokenBySource.set(source, sourceFetchToken);
        const fetchedData = await dataEngine.fetchAndParse({
            source,
            readFallback: async () => await cacheService.readDataFallback(source),
            writeFallback: async (data) => {
                // Only the newest fetch for this source may write its on-disk fallback snapshot.
                if (latestRequestedFallbackFetchTokenBySource.get(source) === sourceFetchToken) {
                    await cacheService.writeDataFallback(source, data);
                }
            }
        });

        // Only the newest fetch invocation may mutate shared main-process state.
        if (fetchToken === latestRequestedFetchToken) {
            dataCache = fetchedData;
            try {
                await cacheService.pruneCache(dataCache.dataFingerprint);
            } catch (error) {
                console.warn('Failed to prune search cache after fetch commit:', error.message || String(error));
            }
        }

        // Stale fetches still return their payload to the original caller.
        return mapDataResponse(fetchedData);
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
