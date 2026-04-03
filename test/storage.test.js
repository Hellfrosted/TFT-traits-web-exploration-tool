const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    CACHE_KEY_PATTERN,
    getStoragePaths,
    ensureStorageDirs,
    resolveCacheEntryPath,
    resolveDataFallbackPath
} = require('../storage.js');

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('storage helpers', () => {
    it('stores explicit app data under the OS userData path, not the app root', () => {
        const userDataPath = 'C:\\Users\\tester\\AppData\\Roaming\\TFT Tool';
        const paths = getStoragePaths({ userDataPath });

        assert.equal(paths.storageRoot, path.join(userDataPath, 'search-data'));
        assert.equal(paths.cacheDir, path.join(userDataPath, 'search-data', 'search_cache'));
        assert.equal(paths.dataFallbackPath, path.join(userDataPath, 'search-data', 'data_fallback_pbe.json'));
    });

    it('accepts only md5-shaped cache keys and resolves them within the cache directory', () => {
        const paths = getStoragePaths({
            userDataPath: 'C:\\Users\\tester\\AppData\\Roaming\\TFT Tool'
        });

        const validKey = '0123456789abcdef0123456789abcdef';
        assert.match(validKey, CACHE_KEY_PATTERN);
        assert.equal(
            resolveCacheEntryPath(paths, validKey),
            path.resolve(paths.cacheDir, `${validKey}.json`)
        );

        assert.throws(() => resolveCacheEntryPath(paths, '..\\escape'), /Invalid cache key/);
        assert.throws(() => resolveCacheEntryPath(paths, 'not-a-real-key'), /Invalid cache key/);
    });

    it('creates storage directories for cache and fallback data', () => {
        const sandboxRoot = makeTempDir('tft-storage-');

        try {
            const userDataPath = path.join(sandboxRoot, 'userData');
            fs.mkdirSync(userDataPath, { recursive: true });

            const paths = getStoragePaths({ userDataPath });
            ensureStorageDirs(paths);

            assert.equal(fs.existsSync(paths.storageRoot), true);
            assert.equal(fs.existsSync(paths.cacheDir), true);
        } finally {
            fs.rmSync(sandboxRoot, { recursive: true, force: true });
        }
    });

    it('resolves source-specific fallback files and rejects invalid sources', () => {
        const paths = getStoragePaths({
            userDataPath: 'C:\\Users\\tester\\AppData\\Roaming\\TFT Tool'
        });

        assert.equal(
            resolveDataFallbackPath(paths, 'pbe'),
            path.join(paths.storageRoot, 'data_fallback_pbe.json')
        );
        assert.equal(
            resolveDataFallbackPath(paths, 'latest'),
            path.join(paths.storageRoot, 'data_fallback_latest.json')
        );
        assert.throws(() => resolveDataFallbackPath(paths, 'staging'), /Invalid data source/);
    });
});
