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

    it('prunes obsolete/corrupt cache entries while preserving valid fingerprints', async () => {
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
            assert.equal(inactiveListed.length, 1);
            assert.equal(inactiveListed[0].key, alsoKeepKey);
            assert.deepEqual(new Set(allListed.map((entry) => entry.key)), new Set([keepKey, alsoKeepKey]));
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

            await service.writeCache(keepKey, 'keep-fingerprint', keepParams, [{ units: ['A'] }]);
            await service.writeCache(pruneKey, 'keep-fingerprint', pruneParams, [{ units: ['B'] }]);

            await service.deleteCacheEntry(keepKey);
            const afterDelete = await service.listCacheEntries('keep-fingerprint');
            assert.equal(afterDelete.length, 1);
            assert.equal(afterDelete[0].key, pruneKey);

            await service.writeCache(keepKey, 'keep-fingerprint', keepParams, [{ units: ['A'] }]);
            await service.writeCache(pruneKey, 'keep-fingerprint', pruneParams, [{ units: ['B'] }]);
            const deletedCount = await service.clearAllCache();
            assert.equal(deletedCount, 2);
            const afterClear = await service.listCacheEntries('keep-fingerprint');
            assert.deepEqual(afterClear, []);
        } finally {
            fs.rmSync(sandboxRoot, { recursive: true, force: true });
        }
    });
});
