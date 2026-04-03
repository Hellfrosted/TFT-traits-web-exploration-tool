const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fsp = require('fs').promises;
const crypto = require('crypto');
const DataEngine = require('./data.js');
const Engine = require('./engine.js');
const { normalizeSearchParams } = require('./searchParams.js');
const {
    getStoragePaths,
    ensureStorageDirs,
    resolveCacheEntryPath,
    resolveDataFallbackPath
} = require('./storage.js');
const { Worker } = require('worker_threads');
const { DEFAULT_DATA_SOURCE, IPC_CHANNELS, LIMITS } = require('./constants.js');

let mainWindow;
let activeSearch = null;
const SEARCH_CACHE_VERSION = 3;

app.commandLine.appendSwitch('disable-direct-composition');
const STORAGE_PATHS = getStoragePaths({
    userDataPath: app.getPath('userData')
});

function createSearchResponse({
    success = true,
    cancelled = false,
    fromCache = false,
    results = [],
    error = null
} = {}) {
    return { success, cancelled, fromCache, results, error };
}

// --- Process-level Error Handlers ---
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.MAIN_PROCESS_ERROR, {
            message: `Unexpected error: ${err.message}`
        });
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled promise rejection:', reason);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.MAIN_PROCESS_ERROR, {
            message: `Unhandled error: ${reason}`
        });
    }
});

// --- Persistent Cache ---
const CACHE_DIR = STORAGE_PATHS.cacheDir;

function ensureCacheDir() {
    ensureStorageDirs(STORAGE_PATHS);
}

function getCacheKey(dataFingerprint, params) {
    const normalized = JSON.stringify({
        searchVersion: SEARCH_CACHE_VERSION,
        dataFingerprint,
        boardSize: params.boardSize,
        maxResults: params.maxResults ?? LIMITS.DEFAULT_MAX_RESULTS,
        mustInclude: [...(params.mustInclude || [])].sort(),
        mustExclude: [...(params.mustExclude || [])].sort(),
        mustIncludeTraits: [...(params.mustIncludeTraits || [])].sort(),
        mustExcludeTraits: [...(params.mustExcludeTraits || [])].sort(),
        tankRoles: [...(params.tankRoles || [])].sort(),
        carryRoles: [...(params.carryRoles || [])].sort(),
        extraEmblems: [...(params.extraEmblems || [])].sort(),
        variantLocks: Object.keys(params.variantLocks || {}).sort().map((unitId) => [
            unitId,
            params.variantLocks[unitId]
        ]),
        onlyActive: !!params.onlyActive,
        tierRank: !!params.tierRank,
        includeUnique: !!params.includeUnique
    });
    return crypto.createHash('md5').update(normalized).digest('hex');
}

async function readCache(key, dataFingerprint) {
    try {
        const filePath = resolveCacheEntryPath(STORAGE_PATHS, key);
        const data = await fsp.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(data);
        if (
            parsed &&
            parsed.results &&
            parsed.dataFingerprint === dataFingerprint &&
            (parsed.searchVersion ?? 1) === SEARCH_CACHE_VERSION
        ) {
            return parsed.results;
        }
        return null;
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.warn(`Failed to read cache file ${key}:`, e.message);
        }
        return null;
    }
}

async function writeCache(key, dataFingerprint, params, results) {
    ensureCacheDir();
    try {
        const filePath = resolveCacheEntryPath(STORAGE_PATHS, key);
        await fsp.writeFile(filePath, JSON.stringify({
            searchVersion: SEARCH_CACHE_VERSION,
            dataFingerprint,
            params,
            results,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.error('Failed to write cache:', e.message);
    }
}

// --- Offline Data Fallback ---
async function writeDataFallback(source, rawData) {
    ensureCacheDir();
    try {
        const filePath = resolveDataFallbackPath(STORAGE_PATHS, source);
        await fsp.writeFile(filePath, JSON.stringify(rawData));
    } catch (e) {
        console.warn('Failed to write data fallback:', e.message);
    }
}

async function readDataFallback(source) {
    try {
        const filePath = resolveDataFallbackPath(STORAGE_PATHS, source);
        const data = await fsp.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.warn('Failed to read data fallback:', e.message);
        }
    }
    return null;
}

async function pruneCache(dataFingerprint) {
    ensureCacheDir();
    try {
        const files = (await fsp.readdir(CACHE_DIR)).filter((file) => file.endsWith('.json'));
        await Promise.all(files.map(async (file) => {
            const filePath = path.join(CACHE_DIR, file);
            try {
                const raw = await fsp.readFile(filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (
                    parsed?.dataFingerprint !== dataFingerprint ||
                    (parsed?.searchVersion ?? 1) !== SEARCH_CACHE_VERSION
                ) {
                    await fsp.unlink(filePath);
                }
            } catch {
                await fsp.unlink(filePath).catch(() => {});
            }
        }));
    } catch (e) {
        console.warn('Failed to prune cache:', e.message);
    }
}

// --- Window ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[Main] Renderer finished loading index.html');
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        console.error('[Main] Renderer failed to load', {
            errorCode,
            errorDescription,
            validatedURL,
            isMainFrame
        });
    });
    mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
        console.error('[Main] Preload script failed', {
            preloadPath,
            message: error?.message || String(error)
        });
    });
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        console.log(`[Renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(async () => {
    try {
        ensureCacheDir();
    } catch (err) {
        console.error('Failed to initialize local app storage:', err.message);
    }
    createWindow();
});

app.on('window-all-closed', () => {
    app.quit();
});

// --- Backend State ---
let dataCache = null;

ipcMain.handle(IPC_CHANNELS.FETCH_DATA, async (_event, requestedSource = DEFAULT_DATA_SOURCE) => {
    const source = DataEngine.normalizeDataSource(requestedSource);
    try {
        dataCache = await DataEngine.fetchAndParse({
            source,
            readFallback: async () => await readDataFallback(source),
            writeFallback: async (data) => await writeDataFallback(source, data)
        });
        await pruneCache(dataCache.dataFingerprint);
        return { 
            success: true, 
            dataSource: dataCache.dataSource,
            count: dataCache.units.length, 
            units: dataCache.units, 
            traits: dataCache.traits,
            roles: dataCache.roles,
            traitBreakpoints: dataCache.traitBreakpoints,
            traitIcons: dataCache.traitIcons,
            assetValidation: dataCache.assetValidation,
            hashMap: dataCache.hashMap,
            setNumber: dataCache.setNumber,
            dataFingerprint: dataCache.dataFingerprint
        };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
});

ipcMain.handle(IPC_CHANNELS.GET_SEARCH_ESTIMATE, async (event, params) => {
    if (!dataCache) return { count: 0, remainingToPick: 0 };
    return Engine.getCombinationCount(dataCache, normalizeSearchParams(params));
});

ipcMain.handle(IPC_CHANNELS.SEARCH_BOARDS, async (event, params) => {
    if (!dataCache) {
        return createSearchResponse({
            success: false,
            error: 'No TFT data loaded yet. Fetch data first.'
        });
    }

    // Check if a search is already running
    if (activeSearch) {
        return createSearchResponse({
            success: false,
            error: 'A search is already in progress. Please cancel it first.'
        });
    }

    const normalizedParams = normalizeSearchParams(params);

    // Check cache first
    const searchDataCache = dataCache;
    const searchFingerprint = searchDataCache.dataFingerprint;
    const cacheKey = getCacheKey(searchFingerprint, normalizedParams);
    const cached = await readCache(cacheKey, searchFingerprint);
    if (cached) {
        return createSearchResponse({
            success: true,
            fromCache: true,
            results: cached
        });
    }

    return new Promise((resolve) => {
        let resolved = false;
        const searchContext = {
            cancelled: false,
            worker: null
        };

        const safeResolve = (value) => {
            if (resolved) return;
            resolved = true;
            resolve(value);
        };

        searchContext.worker = new Worker(path.join(__dirname, 'worker.js'), {
            workerData: { dataCache: searchDataCache, params: normalizedParams }
        });
        activeSearch = searchContext;
        
        const cleanup = () => {
            if (activeSearch === searchContext) {
                activeSearch = null;
            }
        };

        searchContext.worker.on('message', (msg) => {
            if (msg.type === 'progress') {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send(IPC_CHANNELS.SEARCH_PROGRESS, {
                        pct: msg.pct,
                        checked: msg.checked,
                        total: msg.total
                    });
                }
            } else if (msg.type === 'done') {
                cleanup();
                if (searchContext.cancelled) {
                    safeResolve(createSearchResponse({ cancelled: true }));
                    return;
                }
                if (msg.success) {
                    if (msg.results.length > 0 && !msg.results[0].error) {
                        writeCache(cacheKey, searchFingerprint, normalizedParams, msg.results);
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
            }
        });
        
        searchContext.worker.on('error', (err) => {
            cleanup();
            if (searchContext.cancelled) {
                safeResolve(createSearchResponse({ cancelled: true }));
                return;
            }
            safeResolve(createSearchResponse({
                success: false,
                error: err.toString()
            }));
        });
        
        searchContext.worker.on('exit', (code) => {
            cleanup();
            if (searchContext.cancelled) {
                safeResolve(createSearchResponse({ cancelled: true }));
                return;
            }
            if (code !== 0) {
                safeResolve(createSearchResponse({
                    success: false,
                    error: `Worker exited with code ${code}`
                }));
            }
        });
    });
});

ipcMain.handle(IPC_CHANNELS.CANCEL_SEARCH, async () => {
    if (activeSearch && activeSearch.worker) {
        activeSearch.cancelled = true;
        await activeSearch.worker.terminate();
        return { success: true };
    }
    return { success: false, error: 'No active search to cancel.' };
});

// --- Cache Management ---
ipcMain.handle(IPC_CHANNELS.LIST_CACHE, async () => {
    ensureCacheDir();
    try {
        const files = (await fsp.readdir(CACHE_DIR)).filter(f => f.endsWith('.json'));
        const entries = [];
        for (const file of files) {
            try {
                const raw = await fsp.readFile(path.join(CACHE_DIR, file), 'utf-8');
                const parsed = JSON.parse(raw);
                const key = file.replace('.json', '');
                if ((parsed?.searchVersion ?? 1) !== SEARCH_CACHE_VERSION) {
                    continue;
                }
                if (dataCache?.dataFingerprint && parsed?.dataFingerprint !== dataCache.dataFingerprint) {
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
            } catch (e) {
                console.warn(`Skipping corrupt cache file ${file}:`, e.message);
            }
        }
        entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return { success: true, entries };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
});

ipcMain.handle(IPC_CHANNELS.DELETE_CACHE_ENTRY, async (event, key) => {
    try {
        const filePath = resolveCacheEntryPath(STORAGE_PATHS, key);
        await fsp.unlink(filePath).catch(e => { if (e.code !== 'ENOENT') throw e; });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
});

ipcMain.handle(IPC_CHANNELS.CLEAR_ALL_CACHE, async () => {
    try {
        ensureCacheDir();
        const files = (await fsp.readdir(CACHE_DIR)).filter(f => f.endsWith('.json'));
        for (const file of files) {
            await fsp.unlink(path.join(CACHE_DIR, file));
        }
        return { success: true, deleted: files.length };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
});
