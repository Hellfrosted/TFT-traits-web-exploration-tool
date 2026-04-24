const fs = require('fs');
const path = require('path');
const { DEFAULT_DATA_SOURCE, DATA_SOURCES } = require('./constants.js');

const STORAGE_SUBDIR = 'search-data';
const CACHE_KEY_PATTERN = /^[a-f0-9]{32}$/;
const DATA_SOURCE_VALUES = new Set(Object.values(DATA_SOURCES));

function getStoragePaths({ userDataPath }) {
    const storageRoot = path.join(userDataPath, STORAGE_SUBDIR);

    return {
        storageRoot,
        cacheDir: path.join(storageRoot, 'search_cache'),
        dataFallbackPath: path.join(storageRoot, `data_fallback_${DEFAULT_DATA_SOURCE}.json`)
    };
}

function ensureStorageDirs(paths) {
    if (!fs.existsSync(paths.storageRoot)) {
        fs.mkdirSync(paths.storageRoot, { recursive: true });
    }

    if (!fs.existsSync(paths.cacheDir)) {
        fs.mkdirSync(paths.cacheDir, { recursive: true });
    }
}

function resolveCacheEntryPath(paths, key) {
    if (!CACHE_KEY_PATTERN.test(key)) {
        throw new Error('Invalid cache key.');
    }

    const cacheDir = path.resolve(paths.cacheDir);
    const filePath = path.resolve(cacheDir, `${key}.json`);
    if (!filePath.startsWith(`${cacheDir}${path.sep}`)) {
        throw new Error('Cache entry path escapes cache directory.');
    }

    return filePath;
}

function resolveDataFallbackPath(paths, source = DEFAULT_DATA_SOURCE) {
    if (!DATA_SOURCE_VALUES.has(source)) {
        throw new Error('Invalid data source.');
    }

    return path.join(paths.storageRoot, `data_fallback_${source}.json`);
}

module.exports = {
    CACHE_KEY_PATTERN,
    getStoragePaths,
    ensureStorageDirs,
    resolveCacheEntryPath,
    resolveDataFallbackPath
};
