function createSearchResponse({
    success = true,
    cancelled = false,
    fromCache = false,
    results = [],
    error = null,
    searchId = null
} = {}) {
    return { success, cancelled, fromCache, results, error, searchId };
}

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
            return createSearchResponse({
                success: false,
                error: 'No TFT data loaded yet. Fetch data first.'
            });
        }

        if (activeSearch) {
            return createSearchResponse({
                success: false,
                error: 'A search is already in progress. Please cancel it first.'
            });
        }

        const normalizedParams = normalizeForActiveData(params);
        const searchDataCache = dataCache;
        const searchFingerprint = searchDataCache.dataFingerprint;
        const cacheKey = cacheService.getCacheKey(searchFingerprint, normalizedParams);
        const { preparedContext } = cacheService.getPreparedSearchContext(searchDataCache, normalizedParams);
        const searchContext = {
            searchId: nextSearchId++,
            cancelled: false,
            worker: null,
            settle: null,
            completed: false,
            terminated: false,
            terminatePromise: null
        };
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
                return createSearchResponse({ cancelled: true, searchId: searchContext.searchId });
            }
            if (cached) {
                cleanup();
                return createSearchResponse({
                    success: true,
                    fromCache: true,
                    results: cached,
                    searchId: searchContext.searchId
                });
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
                    safeResolve(createSearchResponse({ cancelled: true, searchId: searchContext.searchId }));
                    return;
                }

                searchContext.worker.on('message', (msg) => {
                    if (msg.type === 'progress') {
                        const mainWindow = getMainWindow();
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send(ipcChannels.SEARCH_PROGRESS, {
                                searchId: searchContext.searchId,
                                pct: msg.pct,
                                checked: msg.checked,
                                total: msg.total
                            });
                        }
                    } else if (msg.type === 'done') {
                        searchContext.completed = true;
                        if (searchContext.cancelled) {
                            void terminateWorker();
                            safeResolve(createSearchResponse({ cancelled: true, searchId: searchContext.searchId }));
                            return;
                        }
                        if (msg.success) {
                            if (msg.results.length > 0 && !msg.results[0].error) {
                                safeResolve(createSearchResponse({
                                    success: true,
                                    fromCache: false,
                                    results: msg.results,
                                    searchId: searchContext.searchId
                                }));
                                void cacheService.writeCache(cacheKey, searchFingerprint, normalizedParams, msg.results)
                                    .catch(() => {})
                                    .finally(() => {
                                        void terminateWorker();
                                    });
                                return;
                            }
                            safeResolve(createSearchResponse({
                                success: true,
                                fromCache: false,
                                results: msg.results,
                                searchId: searchContext.searchId
                            }));
                        } else {
                            safeResolve(createSearchResponse({
                                success: false,
                                error: msg.error,
                                searchId: searchContext.searchId
                            }));
                        }
                        void terminateWorker();
                    }
                });

                searchContext.worker.on('error', (error) => {
                    safeResolve(
                        searchContext.cancelled
                            ? createSearchResponse({ cancelled: true, searchId: searchContext.searchId })
                            : createSearchResponse({
                                success: false,
                                error: error.toString(),
                                searchId: searchContext.searchId
                            })
                    );
                });

                searchContext.worker.on('exit', (code) => {
                    cleanup();
                    if (searchContext.completed) {
                        return;
                    }
                    if (searchContext.cancelled) {
                        safeResolve(createSearchResponse({ cancelled: true, searchId: searchContext.searchId }));
                        return;
                    }
                    if (code === 0) {
                        safeResolve(createSearchResponse({
                            success: false,
                            error: 'Search worker exited before returning a result.',
                            searchId: searchContext.searchId
                        }));
                        return;
                    }
                    safeResolve(createSearchResponse({
                        success: false,
                        error: `Worker exited with code ${code}`,
                        searchId: searchContext.searchId
                    }));
                });
            });
        } catch (error) {
            cleanup();
            if (searchContext.cancelled) {
                return createSearchResponse({ cancelled: true, searchId: searchContext.searchId });
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
                searchContext.settle?.(createSearchResponse({ cancelled: true }));
                return { success: true };
            }
            try {
                await searchContext.worker.terminate();
            } finally {
                searchContext.settle?.(createSearchResponse({ cancelled: true }));
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
