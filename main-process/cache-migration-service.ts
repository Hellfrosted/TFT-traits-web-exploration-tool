const path = require('path');

function createCacheMigrationService({
    cacheService,
    dataService,
    fsp,
    processRef,
    storagePaths,
    normalizeSearchParams,
    normalizeSearchParamsForData,
    searchCacheVersion
}: LooseRecord) {
    const cacheMigrationStatePath = path.join(storagePaths.storageRoot, 'cache-migration-state.json');
    const strictlyMigratedFingerprints = new Set();
    let cacheMigrationState = null;
    let cacheMigrationStatePromise = null;

    async function writeJsonFileAtomically(filePath, payload) {
        const tempPath = `${filePath}.${processRef.pid || 'runtime'}.${Date.now()}.tmp`;
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

    function normalizeCacheMigrationState(rawState) {
        const strictFingerprints = Array.isArray(rawState?.strictFingerprints)
            ? rawState.strictFingerprints.filter((value) => typeof value === 'string' && value)
            : [];
        strictFingerprints.forEach((value) => strictlyMigratedFingerprints.add(value));
        return {
            version: Number.isFinite(rawState?.version) ? rawState.version : null,
            strictFingerprints
        };
    }

    async function loadCacheMigrationState() {
        if (cacheMigrationState) {
            return cacheMigrationState;
        }
        if (cacheMigrationStatePromise) {
            return await cacheMigrationStatePromise;
        }

        cacheMigrationStatePromise = (async () => {
            try {
                const rawState = JSON.parse(await fsp.readFile(cacheMigrationStatePath, 'utf-8'));
                cacheMigrationState = normalizeCacheMigrationState(rawState);
            } catch (error) {
                if (error?.code !== 'ENOENT') {
                    console.warn('Failed to read cache migration state:', error.message || String(error));
                }
                cacheMigrationState = normalizeCacheMigrationState(null);
            } finally {
                cacheMigrationStatePromise = null;
            }

            return cacheMigrationState;
        })();

        return await cacheMigrationStatePromise;
    }

    async function saveCacheMigrationState(nextState) {
        cacheMigrationState = normalizeCacheMigrationState(nextState);
        await writeJsonFileAtomically(cacheMigrationStatePath, JSON.stringify(cacheMigrationState));
    }

    async function migrateAllCachedParamsWithBaseNormalization() {
        if (typeof cacheService.migrateCanonicalParams !== 'function') {
            return;
        }

        try {
            const migrationState = await loadCacheMigrationState();
            if (migrationState.version === searchCacheVersion) {
                return;
            }
            await cacheService.migrateCanonicalParams({
                canonicalizeByFingerprint: (_dataFingerprint, params) => normalizeSearchParams(params)
            });
            await saveCacheMigrationState({
                ...migrationState,
                version: searchCacheVersion
            });
        } catch (error) {
            console.warn('Failed to migrate cached search params during startup:', error.message || String(error));
        }
    }

    async function migrateFingerprintWithStrictNormalization(dataFingerprint) {
        if (
            typeof cacheService.migrateCanonicalParams !== 'function'
            || typeof dataFingerprint !== 'string'
            || !dataFingerprint
            || strictlyMigratedFingerprints.has(dataFingerprint)
        ) {
            return;
        }

        try {
            const migrationState = await loadCacheMigrationState();
            if (strictlyMigratedFingerprints.has(dataFingerprint)) {
                return;
            }
            await cacheService.migrateCanonicalParams({
                canonicalizeByFingerprint: (entryFingerprint, params) => {
                    const baseNormalized = normalizeSearchParams(params);
                    if (entryFingerprint !== dataFingerprint) {
                        return baseNormalized;
                    }

                    const activeDataCache = dataService.getDataCache();
                    if (!activeDataCache || activeDataCache.dataFingerprint !== dataFingerprint) {
                        return baseNormalized;
                    }

                    return normalizeSearchParamsForData(params, activeDataCache);
                }
            });
            strictlyMigratedFingerprints.add(dataFingerprint);
            await saveCacheMigrationState({
                ...migrationState,
                version: migrationState.version ?? searchCacheVersion,
                strictFingerprints: [...strictlyMigratedFingerprints].sort()
            });
        } catch (error) {
            console.warn(`Failed to migrate cached params for fingerprint ${dataFingerprint}:`, error.message || String(error));
        }
    }

    return {
        migrateAllCachedParamsWithBaseNormalization,
        migrateFingerprintWithStrictNormalization
    };
}

module.exports = {
    createCacheMigrationService
};
