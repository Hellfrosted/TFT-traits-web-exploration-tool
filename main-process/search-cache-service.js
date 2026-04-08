const path = require('path');
const { serializeSearchParams: defaultSerializeSearchParams } = require('../searchParams.js');

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
    const cacheDir = storagePaths.cacheDir;

    function ensureCacheDir() {
        ensureStorageDirs(storagePaths);
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
            preparedSearchContextMemoryCache.set(contextKey, preparedContext);
        }
        return {
            contextKey,
            preparedContext
        };
    }

    function getCachedEstimate(key) {
        return searchEstimateMemoryCache.get(key) || null;
    }

    function setCachedEstimate(key, estimate) {
        searchEstimateMemoryCache.set(key, estimate);
        return estimate;
    }

    async function writeCachePayload(filePath, payload) {
        const tempPath = `${filePath}.${process.pid || 'cache'}.${Date.now()}.tmp`;
        await fsp.writeFile(tempPath, payload, 'utf-8');
        try {
            await fsp.rename(tempPath, filePath);
        } catch (renameError) {
            if (!['EEXIST', 'EPERM'].includes(renameError?.code)) {
                throw renameError;
            }
            await fsp.unlink(filePath).catch(() => {});
            await fsp.rename(tempPath, filePath);
        }
    }

    async function readCache(key, dataFingerprint) {
        const memoryEntry = searchResultMemoryCache.get(key);
        if (
            memoryEntry &&
            memoryEntry.dataFingerprint === dataFingerprint &&
            memoryEntry.searchVersion === searchCacheVersion
        ) {
            return memoryEntry.results;
        }

        try {
            const filePath = resolveCacheEntryPath(storagePaths, key);
            const data = await fsp.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(data);
            if (
                parsed &&
                parsed.results &&
                parsed.dataFingerprint === dataFingerprint &&
                (parsed.searchVersion ?? 1) === searchCacheVersion
            ) {
                searchResultMemoryCache.set(key, {
                    dataFingerprint,
                    searchVersion: searchCacheVersion,
                    results: parsed.results
                });
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
        searchResultMemoryCache.set(key, {
            dataFingerprint,
            searchVersion: searchCacheVersion,
            results
        });
        try {
            const filePath = resolveCacheEntryPath(storagePaths, key);
            const payload = JSON.stringify({
                searchVersion: searchCacheVersion,
                dataFingerprint,
                params,
                results,
                timestamp: Date.now()
            });
            await writeCachePayload(filePath, payload);
        } catch (error) {
            console.error('Failed to write cache:', error.message);
        }
    }

    async function migrateCanonicalParams({ canonicalizeByFingerprint } = {}) {
        ensureCacheDir();
        const files = (await fsp.readdir(cacheDir)).filter((file) => file.endsWith('.json'));
        if (files.length === 0) {
            return {
                rewritten: 0,
                removed: 0
            };
        }

        const stagedByKey = new Map();
        const processedPaths = [];

        for (const file of files) {
            const filePath = path.join(cacheDir, file);
            let parsed;

            try {
                const raw = await fsp.readFile(filePath, 'utf-8');
                parsed = JSON.parse(raw);
            } catch (error) {
                console.warn(`Skipping corrupt cache file during migration ${file}:`, error.message);
                continue;
            }

            if ((parsed?.searchVersion ?? 1) !== searchCacheVersion || !parsed?.params) {
                continue;
            }

            processedPaths.push(filePath);
            const dataFingerprint = typeof parsed.dataFingerprint === 'string' ? parsed.dataFingerprint : null;
            let canonicalParams = parsed.params;
            if (typeof canonicalizeByFingerprint === 'function') {
                try {
                    canonicalParams = canonicalizeByFingerprint(dataFingerprint, parsed.params);
                } catch (error) {
                    console.warn(`Failed to canonicalize params for cache file ${file}:`, error.message || String(error));
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
            await writeCachePayload(outputPath, JSON.stringify(staged.payload));
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
        return {
            rewritten: stagedByKey.size,
            removed
        };
    }

    async function writeDataFallback(source, rawData) {
        ensureCacheDir();
        try {
            const filePath = resolveDataFallbackPath(storagePaths, source);
            await fsp.writeFile(filePath, JSON.stringify(rawData));
        } catch (error) {
            console.warn('Failed to write data fallback:', error.message);
        }
    }

    async function readDataFallback(source) {
        try {
            const filePath = resolveDataFallbackPath(storagePaths, source);
            const data = await fsp.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('Failed to read data fallback:', error.message);
            }
        }
        return null;
    }

    async function pruneCache(_activeDataFingerprint) {
        ensureCacheDir();
        try {
            clearSearchMemoryCaches();
            const files = (await fsp.readdir(cacheDir)).filter((file) => file.endsWith('.json'));
            await Promise.all(files.map(async (file) => {
                const filePath = path.join(cacheDir, file);
                try {
                    const raw = await fsp.readFile(filePath, 'utf-8');
                    const parsed = JSON.parse(raw);
                    if ((parsed?.searchVersion ?? 1) !== searchCacheVersion) {
                        await fsp.unlink(filePath);
                    }
                } catch {
                    await fsp.unlink(filePath).catch(() => {});
                }
            }));
        } catch (error) {
            console.warn('Failed to prune cache:', error.message);
        }
    }

    async function listCacheEntries(activeDataFingerprint = null) {
        ensureCacheDir();
        const files = (await fsp.readdir(cacheDir)).filter((file) => file.endsWith('.json'));
        const entries = [];
        for (const file of files) {
            try {
                const raw = await fsp.readFile(path.join(cacheDir, file), 'utf-8');
                const parsed = JSON.parse(raw);
                const key = file.replace('.json', '');
                if ((parsed?.searchVersion ?? 1) !== searchCacheVersion) {
                    continue;
                }
                if (activeDataFingerprint && parsed?.dataFingerprint !== activeDataFingerprint) {
                    continue;
                }
                if (parsed && parsed.params) {
                    entries.push({
                        key,
                        params: parsed.params,
                        resultCount: parsed.results ? parsed.results.length : 0,
                        timestamp: parsed.timestamp || null
                    });
                }
            } catch (error) {
                console.warn(`Skipping corrupt cache file ${file}:`, error.message);
            }
        }
        entries.sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0));
        return entries;
    }

    async function deleteCacheEntry(key) {
        searchResultMemoryCache.delete(key);
        searchEstimateMemoryCache.delete(key);
        preparedSearchContextMemoryCache.delete(key);
        const filePath = resolveCacheEntryPath(storagePaths, key);
        await fsp.unlink(filePath).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
        });
    }

    async function clearAllCache() {
        ensureCacheDir();
        clearSearchMemoryCaches();
        const files = (await fsp.readdir(cacheDir)).filter((file) => file.endsWith('.json'));
        for (const file of files) {
            await fsp.unlink(path.join(cacheDir, file));
        }
        return files.length;
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
