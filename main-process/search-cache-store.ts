const path = require('path');

function createSearchCacheStore({
    storagePaths,
    ensureStorageDirs,
    resolveCacheEntryPath,
    resolveDataFallbackPath,
    fsp
}) {
    const cacheDir = storagePaths.cacheDir;
    const cacheIndexPath = path.join(storagePaths.storageRoot, 'search_cache_index.json');

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

    async function deleteFileIfPresent(filePath) {
        try {
            await fsp.unlink(filePath);
            return { deleted: true, error: null };
        } catch (error) {
            if (error?.code === 'ENOENT') {
                return { deleted: false, error: null };
            }

            return { deleted: false, error };
        }
    }

    async function clearFilePaths(filePaths = []) {
        const failures = [];
        let deleted = 0;

        for (const filePath of filePaths) {
            const result = await deleteFileIfPresent(filePath);
            if (result.deleted) {
                deleted += 1;
                continue;
            }

            if (result.error) {
                failures.push({
                    filePath,
                    message: result.error.message || String(result.error)
                });
            }
        }

        return {
            deleted,
            failures
        };
    }

    async function readJsonFile(filePath) {
        const data = await fsp.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    }

    async function writeCacheIndex(entries = []) {
        ensureCacheDir();
        await writeCachePayload(cacheIndexPath, JSON.stringify(entries));
    }

    async function readCacheIndex() {
        return await readJsonFile(cacheIndexPath);
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
        return await clearFilePaths(files.map((file) => file.filePath));
    }

    async function clearDataFallbackFiles() {
        ensureCacheDir();
        const files = (await fsp.readdir(storagePaths.storageRoot))
            .filter((file) => /^data_fallback_.+\.json$/.test(file))
            .map((file) => path.join(storagePaths.storageRoot, file));

        return await clearFilePaths(files);
    }

    async function writeDataFallback(source, rawData) {
        ensureCacheDir();
        const filePath = resolveDataFallbackPath(storagePaths, source);
        await writeCachePayload(filePath, JSON.stringify(rawData));
    }

    async function readDataFallback(source) {
        const filePath = resolveDataFallbackPath(storagePaths, source);
        return await readJsonFile(filePath);
    }

    async function quarantineDataFallback(source, suffix = 'corrupt') {
        ensureCacheDir();
        const filePath = resolveDataFallbackPath(storagePaths, source);
        const quarantinedPath = `${filePath}.${suffix}.${Date.now()}`;
        try {
            await fsp.rename(filePath, quarantinedPath);
            return quarantinedPath;
        } catch (error) {
            if (error?.code === 'ENOENT') {
                return null;
            }

            throw error;
        }
    }

    return {
        cacheDir,
        cacheIndexPath,
        ensureCacheDir,
        writeCacheEntry,
        readCacheEntry,
        writeCacheIndex,
        readCacheIndex,
        listCacheFiles,
        deleteCacheEntryFile,
        clearCacheFiles,
        clearDataFallbackFiles,
        writeDataFallback,
        readDataFallback,
        quarantineDataFallback,
        readJsonFile
    };
}

module.exports = {
    createSearchCacheStore
};
