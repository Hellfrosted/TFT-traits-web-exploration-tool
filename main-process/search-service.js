const {
    createSearchResponse,
    createSearchContext,
    createMissingDataResponse,
    createBusySearchResponse,
    createCachedSearchResponse,
    createCancelledSearchResponse,
    createWorkerProgressPayload,
    shouldPersistSearchResults,
    createWorkerDoneResponse,
    createWorkerErrorResponse,
    createWorkerExitResponse
} = require('./search-service-state.js');

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
        if (!dataCache) return { count: 0, remainingSlots: 0 };
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

    async function searchBoards(params) {
        const dataCache = getDataCache();
        if (!dataCache) {
            return createMissingDataResponse();
        }

        if (activeSearch) {
            return createBusySearchResponse();
        }

        const normalizedParams = normalizeForActiveData(params);
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

            return await new Promise((resolve) => {
                let resolved = false;

                const safeResolve = (value) => {
                    if (resolved) return;
                    resolved = true;
                    searchContext.settle = null;
                    resolve(value);
                };

                const terminateWorker = () => {
                    if (searchContext.terminated) {
                        return searchContext.terminatePromise || Promise.resolve();
                    }
                    if (!searchContext.worker) {
                        searchContext.terminated = true;
                        cleanup();
                        return Promise.resolve();
                    }
                    searchContext.terminated = true;
                    try {
                        const result = searchContext.worker.terminate();
                        searchContext.terminatePromise = Promise.resolve(result)
                            .catch(() => {})
                            .finally(() => {
                                cleanup();
                            });
                    } catch {
                        cleanup();
                        return Promise.resolve();
                    }
                    return searchContext.terminatePromise;
                };

                searchContext.settle = safeResolve;
                searchContext.worker = new Worker(workerPath, {
                    workerData: {
                        dataCache: searchDataCache,
                        params: normalizedParams,
                        preparedSearchContext: preparedContext
                    }
                });
                if (searchContext.cancelled) {
                    void terminateWorker();
                    safeResolve(createCancelledSearchResponse(searchContext.searchId));
                    return;
                }

                searchContext.worker.on('message', (msg) => {
                    if (msg.type === 'progress') {
                        const mainWindow = getMainWindow();
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send(
                                ipcChannels.SEARCH_PROGRESS,
                                createWorkerProgressPayload(searchContext.searchId, msg)
                            );
                        }
                    } else if (msg.type === 'done') {
                        searchContext.completed = true;
                        if (searchContext.cancelled) {
                            void terminateWorker();
                            safeResolve(createCancelledSearchResponse(searchContext.searchId));
                            return;
                        }
                        const response = createWorkerDoneResponse(msg, searchContext.searchId);
                        safeResolve(response);
                        if (shouldPersistSearchResults(msg.results)) {
                            void cacheService.writeCache(cacheKey, searchFingerprint, normalizedParams, msg.results)
                                .catch(() => {})
                                .finally(() => {
                                    void terminateWorker();
                                });
                            return;
                        }
                        void terminateWorker();
                    }
                });

                searchContext.worker.on('error', (error) => {
                    safeResolve(
                        createWorkerErrorResponse(error, searchContext.searchId, searchContext.cancelled)
                    );
                });

                searchContext.worker.on('exit', (code) => {
                    cleanup();
                    if (searchContext.completed) {
                        return;
                    }
                    safeResolve(createWorkerExitResponse(code, searchContext.searchId, searchContext.cancelled));
                });
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
            if (!searchContext.worker) {
                if (activeSearch === searchContext) {
                    activeSearch = null;
                }
                searchContext.settle?.(createCancelledSearchResponse());
                return { success: true };
            }
            try {
                await searchContext.worker.terminate();
            } finally {
                searchContext.settle?.(createCancelledSearchResponse());
            }
            return { success: true };
        }
        return { success: false, error: 'No active search to cancel.' };
    }

    function hasActiveSearch() {
        return !!activeSearch;
    }

    return {
        getSearchEstimate,
        searchBoards,
        cancelSearch,
        normalizeForActiveData,
        normalizePayload,
        hasActiveSearch
    };
}

module.exports = {
    createSearchResponse,
    createSearchService
};
