const { serializeSearchParams: defaultSerializeSearchParams } = require('../searchParams.js');
const { createSearchCacheStore } = require('./search-cache-store.js');

function touchMemoryCacheEntry(cache, key, value) {
    if (cache.has(key)) {
        cache.delete(key);
    }
    cache.set(key, value);
    return value;
}

function trimMemoryCache(cache, maxEntries) {
    if (!Number.isFinite(maxEntries) || maxEntries <= 0) {
        return;
    }

    while (cache.size > maxEntries) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined) {
            break;
        }
        cache.delete(oldestKey);
    }
}

function isParseError(error) {
    return error instanceof SyntaxError || error?.name === 'SyntaxError';
}

function createSearchCacheService({
    storagePaths,
    ensureStorageDirs,
    resolveCacheEntryPath,
    resolveDataFallbackPath,
    engine,
    fsp,
    crypto,
    limits,
    searchCacheVersion,
    serializeSearchParams = defaultSerializeSearchParams
}) {
    const searchResultMemoryCache = new Map();
    const searchEstimateMemoryCache = new Map();
    const preparedSearchContextMemoryCache = new Map();
    const cacheStore = createSearchCacheStore({
        storagePaths,
        ensureStorageDirs,
        resolveCacheEntryPath,
        resolveDataFallbackPath,
        fsp
    });
    const { ensureCacheDir } = cacheStore;
    const memoryCacheEntryLimits = {
        results: Number.isFinite(limits?.SEARCH_RESULT_MEMORY_CACHE_MAX_ENTRIES)
            ? limits.SEARCH_RESULT_MEMORY_CACHE_MAX_ENTRIES
            : 100,
        estimates: Number.isFinite(limits?.SEARCH_ESTIMATE_MEMORY_CACHE_MAX_ENTRIES)
            ? limits.SEARCH_ESTIMATE_MEMORY_CACHE_MAX_ENTRIES
            : 250,
        preparedContexts: Number.isFinite(limits?.PREPARED_CONTEXT_MEMORY_CACHE_MAX_ENTRIES)
            ? limits.PREPARED_CONTEXT_MEMORY_CACHE_MAX_ENTRIES
            : 100
    };
    let cacheIndexEntries = null;
    let cacheIndexLoadPromise = null;

    function createCacheIndexEntry(key, payload = {}) {
        if (typeof key !== 'string' || !key) {
            return null;
        }

        if (!payload?.params || typeof payload.params !== 'object') {
            return null;
        }

        return {
            key,
            params: payload.params,
            resultCount: Array.isArray(payload.results) ? payload.results.length : (Number.isFinite(payload.resultCount) ? payload.resultCount : 0),
            timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : null,
            dataFingerprint: typeof payload.dataFingerprint === 'string' ? payload.dataFingerprint : null,
            searchVersion: Number.isFinite(payload.searchVersion) ? payload.searchVersion : searchCacheVersion
        };
    }

    function normalizeCacheIndexEntries(rawEntries) {
        const entries = Array.isArray(rawEntries) ? rawEntries : [];
        const normalizedEntries = new Map();

        entries.forEach((entry) => {
            const normalizedEntry = createCacheIndexEntry(entry?.key, entry);
            if (!normalizedEntry) {
                return;
            }

            normalizedEntries.set(normalizedEntry.key, normalizedEntry);
        });

        return normalizedEntries;
    }

    async function persistCacheIndexEntries() {
        if (!cacheIndexEntries) {
            return;
        }

        try {
            await cacheStore.writeCacheIndex([...cacheIndexEntries.values()]);
        } catch (error) {
            console.warn('Failed to write cache index:', error.message || String(error));
        }
    }

    async function rebuildCacheIndex() {
        const nextCacheIndexEntries = new Map();
        const files = await cacheStore.listCacheFiles();

        for (const file of files) {
            try {
                const parsed = await cacheStore.readJsonFile(file.filePath);
                const indexEntry = createCacheIndexEntry(file.key, parsed);
                if (!indexEntry || indexEntry.searchVersion !== searchCacheVersion) {
                    continue;
                }

                nextCacheIndexEntries.set(file.key, indexEntry);
            } catch (error) {
                console.warn(`Skipping cache index rebuild entry ${file.file}:`, error.message || String(error));
            }
        }

        cacheIndexEntries = nextCacheIndexEntries;
        await persistCacheIndexEntries();
        return cacheIndexEntries;
    }

    async function ensureCacheIndexEntries() {
        if (cacheIndexEntries) {
            return cacheIndexEntries;
        }

        if (cacheIndexLoadPromise) {
            return await cacheIndexLoadPromise;
        }

        cacheIndexLoadPromise = (async () => {
            try {
                cacheIndexEntries = normalizeCacheIndexEntries(await cacheStore.readCacheIndex());
            } catch (error) {
                if (error?.code !== 'ENOENT') {
                    console.warn('Failed to read cache index:', error.message || String(error));
                }
                await rebuildCacheIndex();
            } finally {
                cacheIndexLoadPromise = null;
            }

            return cacheIndexEntries;
        })();

        return await cacheIndexLoadPromise;
    }

    function getCacheKey(dataFingerprint, params) {
        const normalized = JSON.stringify({
            searchVersion: searchCacheVersion,
            dataFingerprint,
            params: serializeSearchParams({
                maxResults: limits.DEFAULT_MAX_RESULTS,
                ...params
            })
        });
        return crypto.createHash('md5').update(normalized).digest('hex');
    }

    function clearSearchMemoryCaches() {
        searchResultMemoryCache.clear();
        searchEstimateMemoryCache.clear();
        preparedSearchContextMemoryCache.clear();
    }

    function getPreparedSearchContext(dataCacheSnapshot, normalizedParams) {
        const contextKey = getCacheKey(dataCacheSnapshot.dataFingerprint, normalizedParams);
        let preparedContext = preparedSearchContextMemoryCache.get(contextKey);
        if (!preparedContext) {
            preparedContext = engine.prepareSearchContext(dataCacheSnapshot, normalizedParams);
            touchMemoryCacheEntry(preparedSearchContextMemoryCache, contextKey, preparedContext);
            trimMemoryCache(preparedSearchContextMemoryCache, memoryCacheEntryLimits.preparedContexts);
        } else {
            touchMemoryCacheEntry(preparedSearchContextMemoryCache, contextKey, preparedContext);
        }
        return {
            contextKey,
            preparedContext
        };
    }

    function getCachedEstimate(key) {
        const estimate = searchEstimateMemoryCache.get(key) || null;
        if (estimate) {
            touchMemoryCacheEntry(searchEstimateMemoryCache, key, estimate);
        }
        return estimate;
    }

    function setCachedEstimate(key, estimate) {
        touchMemoryCacheEntry(searchEstimateMemoryCache, key, estimate);
        trimMemoryCache(searchEstimateMemoryCache, memoryCacheEntryLimits.estimates);
        return estimate;
    }

    async function readCache(key, dataFingerprint) {
        const memoryEntry = searchResultMemoryCache.get(key);
        if (
            memoryEntry &&
            memoryEntry.dataFingerprint === dataFingerprint &&
            memoryEntry.searchVersion === searchCacheVersion
        ) {
            touchMemoryCacheEntry(searchResultMemoryCache, key, memoryEntry);
            return memoryEntry.results;
        }

        try {
            const parsed = await cacheStore.readCacheEntry(key);
            if (
                parsed &&
                parsed.results &&
                parsed.dataFingerprint === dataFingerprint &&
                (parsed.searchVersion ?? 1) === searchCacheVersion
            ) {
                touchMemoryCacheEntry(searchResultMemoryCache, key, {
                    dataFingerprint,
                    searchVersion: searchCacheVersion,
                    results: parsed.results
                });
                trimMemoryCache(searchResultMemoryCache, memoryCacheEntryLimits.results);
                return parsed.results;
            }
            return null;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn(`Failed to read cache file ${key}:`, error.message);
            }
            return null;
        }
    }

    async function writeCache(key, dataFingerprint, params, results) {
        ensureCacheDir();
        const timestamp = Date.now();
        touchMemoryCacheEntry(searchResultMemoryCache, key, {
            dataFingerprint,
            searchVersion: searchCacheVersion,
            results
        });
        trimMemoryCache(searchResultMemoryCache, memoryCacheEntryLimits.results);
        try {
            await cacheStore.writeCacheEntry(key, {
                searchVersion: searchCacheVersion,
                dataFingerprint,
                params,
                results,
                timestamp
            });
            const cacheIndex = await ensureCacheIndexEntries();
            cacheIndex.set(key, createCacheIndexEntry(key, {
                searchVersion: searchCacheVersion,
                dataFingerprint,
                params,
                results,
                timestamp
            }));
            await persistCacheIndexEntries();
        } catch (error) {
            console.error('Failed to write cache:', error.message);
        }
    }

    async function migrateCanonicalParams({ canonicalizeByFingerprint } = {}) {
        const files = await cacheStore.listCacheFiles();
        if (files.length === 0) {
            cacheIndexEntries = new Map();
            await persistCacheIndexEntries();
            return {
                rewritten: 0,
                removed: 0
            };
        }

        const stagedByKey = new Map();
        const processedPaths = [];

        for (const file of files) {
            let parsed;

            try {
                parsed = await cacheStore.readJsonFile(file.filePath);
            } catch (error) {
                console.warn(`Skipping corrupt cache file during migration ${file.file}:`, error.message);
                continue;
            }

            if ((parsed?.searchVersion ?? 1) !== searchCacheVersion || !parsed?.params) {
                continue;
            }

            processedPaths.push(file.filePath);
            const dataFingerprint = typeof parsed.dataFingerprint === 'string' ? parsed.dataFingerprint : null;
            let canonicalParams = parsed.params;
            if (typeof canonicalizeByFingerprint === 'function') {
                try {
                    canonicalParams = canonicalizeByFingerprint(dataFingerprint, parsed.params);
                } catch (error) {
                    console.warn(`Failed to canonicalize params for cache file ${file.file}:`, error.message || String(error));
                    canonicalParams = parsed.params;
                }
            }
            if (!canonicalParams || typeof canonicalParams !== 'object') {
                canonicalParams = parsed.params;
            }
            const key = getCacheKey(dataFingerprint, canonicalParams);
            const timestamp = Number.isFinite(parsed.timestamp) ? parsed.timestamp : 0;
            const stagedPayload = {
                searchVersion: searchCacheVersion,
                dataFingerprint,
                params: canonicalParams,
                results: Array.isArray(parsed.results) ? parsed.results : [],
                timestamp: Number.isFinite(parsed.timestamp) ? parsed.timestamp : null
            };

            const existing = stagedByKey.get(key);
            if (!existing || timestamp >= existing.timestamp) {
                stagedByKey.set(key, {
                    key,
                    timestamp,
                    payload: stagedPayload
                });
            }
        }

        if (processedPaths.length === 0) {
            return {
                rewritten: 0,
                removed: 0
            };
        }

        const winnerPaths = new Set();
        for (const staged of stagedByKey.values()) {
            const outputPath = resolveCacheEntryPath(storagePaths, staged.key);
            winnerPaths.add(outputPath);
            await cacheStore.writeCacheEntry(staged.key, staged.payload);
        }

        let removed = 0;
        for (const existingPath of processedPaths) {
            if (winnerPaths.has(existingPath)) {
                continue;
            }
            await fsp.unlink(existingPath).catch(() => {});
            removed += 1;
        }

        clearSearchMemoryCaches();
        await rebuildCacheIndex();
        return {
            rewritten: stagedByKey.size,
            removed
        };
    }

    async function writeDataFallback(source, rawData) {
        try {
            await cacheStore.writeDataFallback(source, rawData);
        } catch (error) {
            console.warn('Failed to write data fallback:', error.message);
        }
    }

    async function readDataFallback(source) {
        try {
            return await cacheStore.readDataFallback(source);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('Failed to read data fallback:', error.message);
                if (isParseError(error)) {
                    try {
                        const quarantinedPath = await cacheStore.quarantineDataFallback(source);
                        if (quarantinedPath) {
                            console.warn(`Quarantined malformed data fallback snapshot for ${source}: ${quarantinedPath}`);
                        }
                    } catch (quarantineError) {
                        console.warn(
                            `Failed to quarantine malformed data fallback snapshot for ${source}:`,
                            quarantineError.message || String(quarantineError)
                        );
                    }
                }
            }
        }
        return null;
    }

    async function pruneCache(activeDataFingerprint = null) {
        try {
            clearSearchMemoryCaches();
            const files = await cacheStore.listCacheFiles();
            await Promise.all(files.map(async (file) => {
                try {
                    const parsed = await cacheStore.readJsonFile(file.filePath);
                    const hasCurrentVersion = (parsed?.searchVersion ?? 1) === searchCacheVersion;
                    const hasActiveFingerprint = !activeDataFingerprint
                        || parsed?.dataFingerprint === activeDataFingerprint;

                    if (!hasCurrentVersion || !hasActiveFingerprint) {
                        await fsp.unlink(file.filePath);
                    }
                } catch {
                    await fsp.unlink(file.filePath).catch(() => {});
                }
            }));
            await rebuildCacheIndex();
        } catch (error) {
            console.warn('Failed to prune cache:', error.message);
        }
    }

    async function listCacheEntries(activeDataFingerprint = null, options = {}) {
        const limit = Number.isFinite(options?.limit) && options.limit > 0
            ? Math.trunc(options.limit)
            : null;
        const cacheIndex = await ensureCacheIndexEntries();
        const entries = [...cacheIndex.values()]
            .filter((entry) => entry.searchVersion === searchCacheVersion)
            .filter((entry) => !activeDataFingerprint || entry.dataFingerprint === activeDataFingerprint)
            .map((entry) => ({
                key: entry.key,
                params: entry.params,
                resultCount: entry.resultCount,
                timestamp: entry.timestamp
            }));
        entries.sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0));
        return limit ? entries.slice(0, limit) : entries;
    }

    async function deleteCacheEntry(key) {
        searchResultMemoryCache.delete(key);
        searchEstimateMemoryCache.delete(key);
        preparedSearchContextMemoryCache.delete(key);
        await cacheStore.deleteCacheEntryFile(key);
        const cacheIndex = await ensureCacheIndexEntries();
        cacheIndex.delete(key);
        await persistCacheIndexEntries();
    }

    async function clearAllCache() {
        clearSearchMemoryCaches();
        const deletedCacheEntries = await cacheStore.clearCacheFiles();
        const deletedFallbackSnapshots = await cacheStore.clearDataFallbackFiles();
        if (deletedCacheEntries.failures.length === 0) {
            cacheIndexEntries = new Map();
            await persistCacheIndexEntries();
        } else {
            await rebuildCacheIndex();
        }
        return {
            deleted: deletedCacheEntries.deleted + deletedFallbackSnapshots.deleted,
            failures: [
                ...deletedCacheEntries.failures,
                ...deletedFallbackSnapshots.failures
            ]
        };
    }

    return {
        ensureCacheDir,
        getCacheKey,
        clearSearchMemoryCaches,
        getPreparedSearchContext,
        getCachedEstimate,
        setCachedEstimate,
        readCache,
        writeCache,
        writeDataFallback,
        readDataFallback,
        migrateCanonicalParams,
        pruneCache,
        listCacheEntries,
        deleteCacheEntry,
        clearAllCache
    };
}

module.exports = {
    createSearchCacheService
};
