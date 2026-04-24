const {
    createSearchResponse,
    createSearchContext,
    createMissingDataResponse,
    createBusySearchResponse,
    createCachedSearchResponse,
    createCancelledSearchResponse
} = require('./search-service-state.js');
const { createSearchWorkerRunner } = require('./search-worker-runner.js');
const { createSearchServiceQuery } = require('./search-service-query.js');

function createSearchService({
    engine,
    normalizeSearchParams,
    normalizeSearchParamsForData,
    serializeSearchParams,
    cacheService,
    Worker,
    workerPath,
    ipcChannels,
    getMainWindow,
    getDataCache
}) {
    const normalizeForData = typeof normalizeSearchParamsForData === 'function'
        ? normalizeSearchParamsForData
        : normalizeSearchParams;
    const serializeForComparison = typeof serializeSearchParams === 'function'
        ? serializeSearchParams
        : (params) => JSON.stringify(normalizeSearchParams(params));
    let activeSearch = null;
    let nextSearchId = 1;
    const runWorkerSearch = createSearchWorkerRunner({
        Worker,
        workerPath,
        ipcChannels,
        getMainWindow
    });
    const searchQuery = createSearchServiceQuery({
        normalizeSearchParams,
        normalizeForData,
        serializeForComparison,
        cacheService,
        engine,
        getDataCache
    });

    async function searchBoards(params) {
        const dataCache = getDataCache();
        if (!dataCache) {
            return createMissingDataResponse();
        }

        if (activeSearch) {
            return createBusySearchResponse();
        }

        const normalizedParams = searchQuery.normalizeForActiveData(params);
        const searchDataCache = dataCache;
        const searchFingerprint = searchDataCache.dataFingerprint;
        const cacheKey = cacheService.getCacheKey(searchFingerprint, normalizedParams);
        const { preparedContext } = cacheService.getPreparedSearchContext(searchDataCache, normalizedParams);
        const searchContext = createSearchContext(nextSearchId++);
        activeSearch = searchContext;

        const cleanup = () => {
            if (activeSearch === searchContext) {
                activeSearch = null;
            }
        };

        try {
            const cached = await cacheService.readCache(cacheKey, searchFingerprint);
            if (searchContext.cancelled) {
                cleanup();
                return createCancelledSearchResponse(searchContext.searchId);
            }
            if (cached) {
                cleanup();
                return createCachedSearchResponse(cached, searchContext.searchId);
            }

            return await runWorkerSearch({
                searchContext,
                workerData: {
                    dataCache: searchDataCache,
                    params: normalizedParams,
                    preparedSearchContext: preparedContext
                },
                cacheService,
                cacheKey,
                searchFingerprint,
                normalizedParams,
                cleanup
            });
        } catch (error) {
            cleanup();
            if (searchContext.cancelled) {
                return createCancelledSearchResponse(searchContext.searchId);
            }
            return createSearchResponse({
                success: false,
                error: error.toString(),
                searchId: searchContext.searchId
            });
        }
    }

    async function cancelSearch() {
        if (activeSearch) {
            const searchContext = activeSearch;
            searchContext.cancelled = true;
            if (activeSearch === searchContext) {
                activeSearch = null;
            }
            if (!searchContext.worker) {
                searchContext.settle?.(createCancelledSearchResponse(searchContext.searchId));
                return { success: true };
            }

            searchContext.settle?.(createCancelledSearchResponse(searchContext.searchId));

            if (typeof searchContext.terminate === 'function') {
                void searchContext.terminate();
            } else {
                try {
                    void Promise.resolve(searchContext.worker.terminate()).catch(() => {});
                } catch {
                    // The search is already resolved as cancelled; termination is best-effort here.
                }
            }
            return { success: true };
        }
        return { success: false, error: 'No active search to cancel.' };
    }

    function hasActiveSearch() {
        return !!activeSearch;
    }

    return {
        getSearchEstimate: searchQuery.getSearchEstimate,
        searchBoards,
        cancelSearch,
        normalizeForActiveData: searchQuery.normalizeForActiveData,
        normalizePayload: searchQuery.normalizePayload,
        hasActiveSearch
    };
}

module.exports = {
    createSearchResponse,
    createSearchService
};
