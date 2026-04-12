function createSearchServiceQuery({
    normalizeSearchParams,
    normalizeForData,
    serializeForComparison,
    cacheService,
    engine,
    getDataCache
}) {
    function normalizeForActiveData(params) {
        const dataCache = getDataCache();
        if (!dataCache) {
            return normalizeSearchParams(params);
        }
        return normalizeForData(params, dataCache);
    }

    function normalizePayload(params) {
        const dataCache = getDataCache();
        const normalized = dataCache
            ? normalizeForData(params, dataCache)
            : normalizeSearchParams(params);
        return {
            params: normalized,
            comparisonKey: serializeForComparison(normalized),
            dataFingerprint: dataCache?.dataFingerprint || null
        };
    }

    async function getSearchEstimate(params) {
        const dataCache = getDataCache();
        if (!dataCache) {
            return { count: 0, remainingSlots: 0 };
        }

        const normalizedParams = normalizeForActiveData(params);
        const estimateKey = cacheService.getCacheKey(dataCache.dataFingerprint, normalizedParams);
        const cachedEstimate = cacheService.getCachedEstimate(estimateKey);
        if (cachedEstimate) {
            return cachedEstimate;
        }

        const { preparedContext } = cacheService.getPreparedSearchContext(dataCache, normalizedParams);
        const estimate = engine.getCombinationCount(dataCache, normalizedParams, preparedContext);
        return cacheService.setCachedEstimate(estimateKey, estimate);
    }

    return {
        normalizeForActiveData,
        normalizePayload,
        getSearchEstimate
    };
}

module.exports = {
    createSearchServiceQuery
};
