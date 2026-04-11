const path = require('path');

function createSearchCacheStore({
    storagePaths,
    ensureStorageDirs,
    resolveCacheEntryPath,
    resolveDataFallbackPath,
    fsp
}) {
    const cacheDir = storagePaths.cacheDir;

    function ensureCacheDir() {
        ensureStorageDirs(storagePaths);
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

    async function readJsonFile(filePath) {
        const data = await fsp.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    }

    async function writeCacheEntry(key, payload) {
        ensureCacheDir();
        const filePath = resolveCacheEntryPath(storagePaths, key);
        await writeCachePayload(filePath, JSON.stringify(payload));
    }

    async function readCacheEntry(key) {
        const filePath = resolveCacheEntryPath(storagePaths, key);
        return await readJsonFile(filePath);
    }

    async function listCacheFiles() {
        ensureCacheDir();
        const files = (await fsp.readdir(cacheDir)).filter((file) => file.endsWith('.json'));
        return files.map((file) => ({
            file,
            key: file.replace('.json', ''),
            filePath: path.join(cacheDir, file)
        }));
    }

    async function deleteCacheEntryFile(key) {
        const filePath = resolveCacheEntryPath(storagePaths, key);
        await fsp.unlink(filePath).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
        });
    }

    async function clearCacheFiles() {
        const files = await listCacheFiles();
        for (const file of files) {
            await fsp.unlink(file.filePath);
        }
        return files.length;
    }

    async function clearDataFallbackFiles() {
        ensureCacheDir();
        const files = (await fsp.readdir(storagePaths.storageRoot))
            .filter((file) => /^data_fallback_.+\.json$/.test(file))
            .map((file) => path.join(storagePaths.storageRoot, file));

        for (const filePath of files) {
            await fsp.unlink(filePath);
        }

        return files.length;
    }

    async function writeDataFallback(source, rawData) {
        ensureCacheDir();
        const filePath = resolveDataFallbackPath(storagePaths, source);
        await fsp.writeFile(filePath, JSON.stringify(rawData));
    }

    async function readDataFallback(source) {
        const filePath = resolveDataFallbackPath(storagePaths, source);
        return await readJsonFile(filePath);
    }

    return {
        cacheDir,
        ensureCacheDir,
        writeCacheEntry,
        readCacheEntry,
        listCacheFiles,
        deleteCacheEntryFile,
        clearCacheFiles,
        clearDataFallbackFiles,
        writeDataFallback,
        readDataFallback,
        readJsonFile
    };
}

module.exports = {
    createSearchCacheStore
};
