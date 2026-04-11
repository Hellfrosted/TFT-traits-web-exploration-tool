const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { createSearchCacheService } = require('../main-process/search-cache-service.js');
const {
    getStoragePaths,
    ensureStorageDirs,
    resolveCacheEntryPath,
    resolveDataFallbackPath
} = require('../storage.js');
const { LIMITS } = require('../constants.js');
const {
    normalizeSearchParams,
    normalizeSearchParamsForData
} = require('../searchParams.js');

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createService(userDataPath, engineOverride = null) {
    const storagePaths = getStoragePaths({ userDataPath });
    return createSearchCacheService({
        storagePaths,
        ensureStorageDirs,
        resolveCacheEntryPath,
        resolveDataFallbackPath,
        engine: engineOverride || {
            prepareSearchContext: () => ({ prepared: true })
        },
        fsp,
        crypto,
        limits: LIMITS,
        searchCacheVersion: 4
    });
}

describe('main-process cache service', () => {
    it('reuses prepared search contexts for the same dataset fingerprint and params', () => {
        let prepareCalls = 0;
        const service = createService('C:\\Users\\tester\\AppData\\Roaming\\TFT Tool', {
            prepareSearchContext: () => {
                prepareCalls += 1;
                return { prepared: prepareCalls };
            }
        });
        const dataCache = { dataFingerprint: 'fingerprint-1' };
        const params = { boardSize: 9, maxResults: 10 };

        const first = service.getPreparedSearchContext(dataCache, params).preparedContext;
        const second = service.getPreparedSearchContext(dataCache, params).preparedContext;

        assert.equal(prepareCalls, 1);
        assert.equal(first, second);
    });

    it('writes cache entries through a temp file before renaming into place', async () => {
        const operations = [];
        const storagePaths = {
            cacheDir: 'C:\\cache'
        };
        const service = createSearchCacheService({
            storagePaths,
            ensureStorageDirs: () => {},
            resolveCacheEntryPath: () => 'C:\\cache\\entry.json',
            resolveDataFallbackPath: () => 'C:\\cache\\data.json',
            engine: {
                prepareSearchContext: () => ({ prepared: true })
            },
            fsp: {
                writeFile: async (filePath, payload) => {
                    operations.push(['writeFile', filePath, payload]);
                },
                rename: async (fromPath, toPath) => {
                    operations.push(['rename', fromPath, toPath]);
                }
            },
            crypto,
            limits: LIMITS,
            searchCacheVersion: 4
        });

        await service.writeCache('entry', 'fingerprint-1', { boardSize: 9 }, [{ units: ['A'] }]);

        assert.equal(operations.length, 2);
        assert.equal(operations[0][0], 'writeFile');
        assert.match(operations[0][1], /entry\.json\..+\.tmp$/);
        assert.equal(operations[1][0], 'rename');
        assert.equal(operations[1][1], operations[0][1]);
        assert.equal(operations[1][2], 'C:\\cache\\entry.json');
    });

    it('writes fallback snapshots through a temp file before renaming into place', async () => {
        const operations = [];
        const storagePaths = {
            cacheDir: 'C:\\cache',
            storageRoot: 'C:\\cache-root'
        };
        const service = createSearchCacheService({
            storagePaths,
            ensureStorageDirs: () => {},
            resolveCacheEntryPath: () => 'C:\\cache\\entry.json',
            resolveDataFallbackPath: () => 'C:\\cache-root\\data_fallback_pbe.json',
            engine: {
                prepareSearchContext: () => ({ prepared: true })
            },
            fsp: {
                writeFile: async (filePath, payload) => {
                    operations.push(['writeFile', filePath, payload]);
                },
                rename: async (fromPath, toPath) => {
                    operations.push(['rename', fromPath, toPath]);
                },
                unlink: async () => {},
                readdir: async () => []
            },
            crypto,
            limits: LIMITS,
            searchCacheVersion: 4
        });

        await service.writeDataFallback('pbe', { source: 'pbe', units: [] });

        assert.equal(operations.length, 2);
        assert.equal(operations[0][0], 'writeFile');
        assert.match(operations[0][1], /data_fallback_pbe\.json\..+\.tmp$/);
        assert.equal(operations[1][0], 'rename');
        assert.equal(operations[1][1], operations[0][1]);
        assert.equal(operations[1][2], 'C:\\cache-root\\data_fallback_pbe.json');
    });

    it('prunes obsolete, corrupt, and inactive-fingerprint cache entries while preserving the active fingerprint', async () => {
        const sandboxRoot = makeTempDir('tft-cache-service-');

        try {
            const userDataPath = path.join(sandboxRoot, 'userData');
            fs.mkdirSync(userDataPath, { recursive: true });
            const service = createService(userDataPath);
            const keepParams = { boardSize: 9, maxResults: 10 };
            const alsoKeepParams = { boardSize: 8, maxResults: 10 };
            const keepKey = service.getCacheKey('keep-fingerprint', keepParams);
            const alsoKeepKey = service.getCacheKey('other-fingerprint', alsoKeepParams);
            const obsoleteKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
            const corruptKey = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

            await service.writeCache(keepKey, 'keep-fingerprint', keepParams, [{ units: ['A'] }]);
            await service.writeCache(alsoKeepKey, 'other-fingerprint', alsoKeepParams, [{ units: ['B'] }]);

            const storagePaths = getStoragePaths({ userDataPath });
            const obsoletePath = resolveCacheEntryPath(storagePaths, obsoleteKey);
            const corruptPath = resolveCacheEntryPath(storagePaths, corruptKey);
            const alsoKeepPath = resolveCacheEntryPath(storagePaths, alsoKeepKey);
            await fsp.writeFile(obsoletePath, JSON.stringify({
                searchVersion: 3,
                dataFingerprint: 'obsolete',
                params: { boardSize: 7 },
                results: []
            }), 'utf-8');
            await fsp.writeFile(corruptPath, '{not-json', 'utf-8');

            await service.pruneCache('keep-fingerprint');

            const activeListed = await service.listCacheEntries('keep-fingerprint');
            const inactiveListed = await service.listCacheEntries('other-fingerprint');
            const allListed = await service.listCacheEntries();
            assert.equal(activeListed.length, 1);
            assert.equal(activeListed[0].key, keepKey);
            assert.deepEqual(inactiveListed, []);
            assert.deepEqual(new Set(allListed.map((entry) => entry.key)), new Set([keepKey]));
            assert.equal(fs.existsSync(alsoKeepPath), false);
            assert.equal(fs.existsSync(obsoletePath), false);
            assert.equal(fs.existsSync(corruptPath), false);
        } finally {
            fs.rmSync(sandboxRoot, { recursive: true, force: true });
        }
    });

    it('supports list/delete/clear flows', async () => {
        const sandboxRoot = makeTempDir('tft-cache-service-');

        try {
            const userDataPath = path.join(sandboxRoot, 'userData');
            fs.mkdirSync(userDataPath, { recursive: true });
            const service = createService(userDataPath);
            const keepParams = { boardSize: 9, maxResults: 10 };
            const pruneParams = { boardSize: 8, maxResults: 10 };
            const keepKey = service.getCacheKey('keep-fingerprint', keepParams);
            const pruneKey = service.getCacheKey('keep-fingerprint', pruneParams);
            const storagePaths = getStoragePaths({ userDataPath });

            await service.writeCache(keepKey, 'keep-fingerprint', keepParams, [{ units: ['A'] }]);
            await service.writeCache(pruneKey, 'keep-fingerprint', pruneParams, [{ units: ['B'] }]);

            await service.deleteCacheEntry(keepKey);
            const afterDelete = await service.listCacheEntries('keep-fingerprint');
            assert.equal(afterDelete.length, 1);
            assert.equal(afterDelete[0].key, pruneKey);

            await service.writeCache(keepKey, 'keep-fingerprint', keepParams, [{ units: ['A'] }]);
            await service.writeCache(pruneKey, 'keep-fingerprint', pruneParams, [{ units: ['B'] }]);
            await service.writeDataFallback('pbe', { source: 'pbe', units: [] });
            await service.writeDataFallback('latest', { source: 'latest', units: [] });
            const clearSummary = await service.clearAllCache();
            assert.deepEqual(clearSummary, {
                deleted: 4,
                failures: []
            });
            const afterClear = await service.listCacheEntries('keep-fingerprint');
            assert.deepEqual(afterClear, []);
            assert.equal(fs.existsSync(resolveDataFallbackPath(storagePaths, 'pbe')), false);
            assert.equal(fs.existsSync(resolveDataFallbackPath(storagePaths, 'latest')), false);
        } finally {
            fs.rmSync(sandboxRoot, { recursive: true, force: true });
        }
    });

    it('migrates legacy cache entries to canonical params and canonical hash keys', async () => {
        const sandboxRoot = makeTempDir('tft-cache-service-');

        try {
            const userDataPath = path.join(sandboxRoot, 'userData');
            fs.mkdirSync(userDataPath, { recursive: true });
            const service = createService(userDataPath);
            const storagePaths = getStoragePaths({ userDataPath });
            ensureStorageDirs(storagePaths);
            const legacyKey = 'cccccccccccccccccccccccccccccccc';
            const legacyPath = resolveCacheEntryPath(storagePaths, legacyKey);
            await fsp.writeFile(legacyPath, JSON.stringify({
                searchVersion: 4,
                dataFingerprint: 'fp-legacy',
                params: {
                    boardSize: '9',
                    maxResults: '500',
                    mustInclude: [{ id: 'Annie' }, 'Annie', '  Annie  '],
                    variantLocks: {
                        Annie: { value: 'arcane' }
                    },
                    onlyActive: 'yes',
                    tierRank: 'true',
                    includeUnique: 'false'
                },
                results: [{ units: ['Annie'] }],
                timestamp: 100
            }), 'utf-8');

            await service.migrateCanonicalParams({
                canonicalizeByFingerprint: (_fingerprint, params) => normalizeSearchParams(params)
            });

            const canonicalParams = normalizeSearchParams({
                boardSize: '9',
                maxResults: '500',
                mustInclude: [{ id: 'Annie' }, 'Annie', '  Annie  '],
                variantLocks: {
                    Annie: { value: 'arcane' }
                },
                onlyActive: 'yes',
                tierRank: 'true',
                includeUnique: 'false'
            });
            const canonicalKey = service.getCacheKey('fp-legacy', canonicalParams);
            const entries = await service.listCacheEntries('fp-legacy');

            assert.equal(entries.length, 1);
            assert.equal(entries[0].key, canonicalKey);
            assert.deepEqual(entries[0].params, canonicalParams);
            assert.equal(fs.existsSync(legacyPath), canonicalKey === legacyKey);
        } finally {
            fs.rmSync(sandboxRoot, { recursive: true, force: true });
        }
    });

    it('deduplicates rehashed collisions during migration by keeping the newest timestamp', async () => {
        const sandboxRoot = makeTempDir('tft-cache-service-');

        try {
            const userDataPath = path.join(sandboxRoot, 'userData');
            fs.mkdirSync(userDataPath, { recursive: true });
            const service = createService(userDataPath);
            const storagePaths = getStoragePaths({ userDataPath });
            ensureStorageDirs(storagePaths);
            const legacyKeyA = 'dddddddddddddddddddddddddddddddd';
            const legacyKeyB = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

            await fsp.writeFile(resolveCacheEntryPath(storagePaths, legacyKeyA), JSON.stringify({
                searchVersion: 4,
                dataFingerprint: 'fp-collision',
                params: {
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: ['B', 'A']
                },
                results: [{ units: ['old'] }],
                timestamp: 100
            }), 'utf-8');
            await fsp.writeFile(resolveCacheEntryPath(storagePaths, legacyKeyB), JSON.stringify({
                searchVersion: 4,
                dataFingerprint: 'fp-collision',
                params: {
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: ['A', 'B']
                },
                results: [{ units: ['new'] }],
                timestamp: 200
            }), 'utf-8');

            await service.migrateCanonicalParams({
                canonicalizeByFingerprint: (_fingerprint, params) => normalizeSearchParams(params)
            });

            const canonicalParams = normalizeSearchParams({
                boardSize: 9,
                maxResults: 500,
                mustInclude: ['A', 'B']
            });
            const canonicalKey = service.getCacheKey('fp-collision', canonicalParams);
            const migrated = await service.readCache(canonicalKey, 'fp-collision');

            assert.deepEqual(migrated, [{ units: ['new'] }]);
            const entries = await service.listCacheEntries('fp-collision');
            assert.equal(entries.length, 1);
            assert.equal(entries[0].key, canonicalKey);
            assert.equal(entries[0].timestamp, 200);
        } finally {
            fs.rmSync(sandboxRoot, { recursive: true, force: true });
        }
    });

    it('supports strict per-fingerprint normalization during migration', async () => {
        const sandboxRoot = makeTempDir('tft-cache-service-');

        try {
            const userDataPath = path.join(sandboxRoot, 'userData');
            fs.mkdirSync(userDataPath, { recursive: true });
            const service = createService(userDataPath);
            const storagePaths = getStoragePaths({ userDataPath });
            ensureStorageDirs(storagePaths);
            const fp1Key = 'ffffffffffffffffffffffffffffffff';
            const fp2Key = 'abababababababababababababababab';

            await fsp.writeFile(resolveCacheEntryPath(storagePaths, fp1Key), JSON.stringify({
                searchVersion: 4,
                dataFingerprint: 'fp-1',
                params: {
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: ['Known', 'Unknown'],
                    mustIncludeTraits: ['TraitA', 'TraitB'],
                    tankRoles: ['Tank', 'UnknownRole'],
                    variantLocks: {
                        Known: 'variant-a',
                        Unknown: 'variant-z'
                    }
                },
                results: [{ units: ['Known'] }],
                timestamp: 100
            }), 'utf-8');
            await fsp.writeFile(resolveCacheEntryPath(storagePaths, fp2Key), JSON.stringify({
                searchVersion: 4,
                dataFingerprint: 'fp-2',
                params: {
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: ['Known', 'Unknown']
                },
                results: [{ units: ['Known', 'Unknown'] }],
                timestamp: 100
            }), 'utf-8');

            const strictDataCache = {
                units: [
                    {
                        id: 'Known',
                        variants: [{ id: 'variant-a' }]
                    }
                ],
                traits: ['TraitA'],
                roles: ['Tank']
            };

            await service.migrateCanonicalParams({
                canonicalizeByFingerprint: (fingerprint, params) => (
                    fingerprint === 'fp-1'
                        ? normalizeSearchParamsForData(params, strictDataCache)
                        : normalizeSearchParams(params)
                )
            });

            const fp1Entries = await service.listCacheEntries('fp-1');
            const fp2Entries = await service.listCacheEntries('fp-2');
            assert.equal(fp1Entries.length, 1);
            assert.equal(fp2Entries.length, 1);

            assert.deepEqual(fp1Entries[0].params.mustInclude, ['Known']);
            assert.deepEqual(fp1Entries[0].params.mustIncludeTraits, ['TraitA']);
            assert.deepEqual(fp1Entries[0].params.tankRoles, ['Tank']);
            assert.deepEqual(fp1Entries[0].params.variantLocks, { Known: 'variant-a' });

            assert.deepEqual(fp2Entries[0].params.mustInclude, ['Known', 'Unknown']);
        } finally {
            fs.rmSync(sandboxRoot, { recursive: true, force: true });
        }
    });

    it('can limit cache listing to the newest entries', async () => {
        const sandboxRoot = makeTempDir('tft-cache-service-');

        try {
            const userDataPath = path.join(sandboxRoot, 'userData');
            fs.mkdirSync(userDataPath, { recursive: true });
            const service = createService(userDataPath);
            const firstKey = service.getCacheKey('keep-fingerprint', { boardSize: 9, maxResults: 10 });
            const secondKey = service.getCacheKey('keep-fingerprint', { boardSize: 8, maxResults: 10 });

            await service.writeCache(firstKey, 'keep-fingerprint', { boardSize: 9, maxResults: 10 }, [{ units: ['A'] }]);
            await new Promise((resolve) => setTimeout(resolve, 5));
            await service.writeCache(secondKey, 'keep-fingerprint', { boardSize: 8, maxResults: 10 }, [{ units: ['B'] }]);

            const limitedEntries = await service.listCacheEntries('keep-fingerprint', { limit: 1 });

            assert.equal(limitedEntries.length, 1);
            assert.equal(limitedEntries[0].key, secondKey);
        } finally {
            fs.rmSync(sandboxRoot, { recursive: true, force: true });
        }
    });
});
