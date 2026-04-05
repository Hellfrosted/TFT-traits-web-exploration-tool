function createSearchResponse({
    success = true,
    cancelled = false,
    fromCache = false,
    results = [],
    error = null
} = {}) {
    return { success, cancelled, fromCache, results, error };
}

function createSearchService({
    engine,
    normalizeSearchParams,
    cacheService,
    Worker,
    workerPath,
    ipcChannels,
    getMainWindow,
    getDataCache
}) {
    let activeSearch = null;

    async function getSearchEstimate(params) {
        const dataCache = getDataCache();
        if (!dataCache) return { count: 0, remainingSlots: 0 };
        const normalizedParams = normalizeSearchParams(params);
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

        const normalizedParams = normalizeSearchParams(params);
        const searchDataCache = dataCache;
        const searchFingerprint = searchDataCache.dataFingerprint;
        const cacheKey = cacheService.getCacheKey(searchFingerprint, normalizedParams);
        const { preparedContext } = cacheService.getPreparedSearchContext(searchDataCache, normalizedParams);
        const searchContext = {
            cancelled: false,
            worker: null,
            settle: null,
            completed: false
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
                return createSearchResponse({ cancelled: true });
            }
            if (cached) {
                cleanup();
                return createSearchResponse({
                    success: true,
                    fromCache: true,
                    results: cached
                });
            }

            return await new Promise((resolve) => {
                let resolved = false;

                const safeResolve = (value) => {
                    if (resolved) return;
                    resolved = true;
                    searchContext.settle = null;
                    cleanup();
                    resolve(value);
                };

                const terminateWorker = () => {
                    if (!searchContext.worker) return;
                    try {
                        const result = searchContext.worker.terminate();
                        if (result?.catch) {
                            void result.catch(() => {});
                        }
                    } catch {
                        // Ignore best-effort cleanup failures after the search is already resolving.
                    }
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
                    terminateWorker();
                    safeResolve(createSearchResponse({ cancelled: true }));
                    return;
                }

                searchContext.worker.on('message', (msg) => {
                    if (msg.type === 'progress') {
                        const mainWindow = getMainWindow();
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send(ipcChannels.SEARCH_PROGRESS, {
                                pct: msg.pct,
                                checked: msg.checked,
                                total: msg.total
                            });
                        }
                    } else if (msg.type === 'done') {
                        searchContext.completed = true;
                        if (searchContext.cancelled) {
                            terminateWorker();
                            safeResolve(createSearchResponse({ cancelled: true }));
                            return;
                        }
                        if (msg.success) {
                            if (msg.results.length > 0 && !msg.results[0].error) {
                                safeResolve(createSearchResponse({
                                    success: true,
                                    fromCache: false,
                                    results: msg.results
                                }));
                                void cacheService.writeCache(cacheKey, searchFingerprint, normalizedParams, msg.results)
                                    .catch(() => {})
                                    .finally(() => {
                                        terminateWorker();
                                    });
                                return;
                            }
                            safeResolve(createSearchResponse({
                                success: true,
                                fromCache: false,
                                results: msg.results
                            }));
                        } else {
                            safeResolve(createSearchResponse({
                                success: false,
                                error: msg.error
                            }));
                        }
                        terminateWorker();
                    }
                });

                searchContext.worker.on('error', (error) => {
                    safeResolve(
                        searchContext.cancelled
                            ? createSearchResponse({ cancelled: true })
                            : createSearchResponse({
                                success: false,
                                error: error.toString()
                            })
                    );
                });

                searchContext.worker.on('exit', (code) => {
                    if (searchContext.completed) {
                        return;
                    }
                    if (searchContext.cancelled) {
                        safeResolve(createSearchResponse({ cancelled: true }));
                        return;
                    }
                    if (code === 0) {
                        safeResolve(createSearchResponse({
                            success: false,
                            error: 'Search worker exited before returning a result.'
                        }));
                        return;
                    }
                    safeResolve(createSearchResponse({
                        success: false,
                        error: `Worker exited with code ${code}`
                    }));
                });
            });
        } catch (error) {
            cleanup();
            if (searchContext.cancelled) {
                return createSearchResponse({ cancelled: true });
            }
            return createSearchResponse({
                success: false,
                error: error.toString()
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
        hasActiveSearch
    };
}

module.exports = {
    createSearchResponse,
    createSearchService
};
