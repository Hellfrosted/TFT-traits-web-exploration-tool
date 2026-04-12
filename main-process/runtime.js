const path = require('path');

const SEARCH_CACHE_VERSION = 4;

function createMainRuntime(options = {}) {
    const electron = options.electron || require('electron');
    const fsp = options.fsp || require('fs').promises;
    const crypto = options.crypto || require('crypto');
    const Worker = options.Worker || require('worker_threads').Worker;
    const dataEngine = options.dataEngine || require('../data.js');
    const engine = options.engine || require('../engine.js');
    const searchParamUtils = options.searchParamUtils || require('../searchParams.js');
    const normalizeSearchParams = options.normalizeSearchParams || searchParamUtils.normalizeSearchParams;
    const normalizeSearchParamsForData = options.normalizeSearchParamsForData
        || searchParamUtils.normalizeSearchParamsForData
        || normalizeSearchParams;
    const serializeSearchParams = options.serializeSearchParams
        || searchParamUtils.serializeSearchParams
        || ((params) => JSON.stringify(normalizeSearchParams(params)));
    const storage = options.storage || require('../storage.js');
    const constants = options.constants || require('../constants.js');
    const createSearchCacheService = options.createSearchCacheService || require('./search-cache-service.js').createSearchCacheService;
    const createDataService = options.createDataService || require('./data-service.js').createDataService;
    const createSearchService = options.createSearchService || require('./search-service.js').createSearchService;
    const createWindowService = options.createWindowService || require('./window-service.js').createWindowService;
    const processRef = options.processRef || process;
    const argv = options.argv || processRef.argv || [];
    const appRoot = options.appRoot || path.join(__dirname, '..');
    const appIconPath = options.appIconPath || path.join(appRoot, 'assets', 'app-icon.ico');
    const setTimeoutFn = options.setTimeoutFn || setTimeout;
    const fatalExitDelayMs = Number.isFinite(options.fatalExitDelayMs) ? options.fatalExitDelayMs : 150;
    const {
        app,
        BrowserWindow,
        ipcMain
    } = electron;
    const {
        DEFAULT_DATA_SOURCE,
        IPC_CHANNELS,
        LIMITS,
        SMOKE_TEST_FLAG,
        RENDERER_CONTRACT
    } = constants;
    const isSmokeTest = argv.includes(SMOKE_TEST_FLAG);

    const storagePaths = storage.getStoragePaths({
        userDataPath: app.getPath('userData')
    });

    const cacheService = createSearchCacheService({
        storagePaths,
        ensureStorageDirs: storage.ensureStorageDirs,
        resolveCacheEntryPath: storage.resolveCacheEntryPath,
        resolveDataFallbackPath: storage.resolveDataFallbackPath,
        engine,
        fsp,
        crypto,
        limits: LIMITS,
        searchCacheVersion: SEARCH_CACHE_VERSION,
        serializeSearchParams
    });

    const dataService = createDataService({
        dataEngine,
        cacheService,
        defaultDataSource: DEFAULT_DATA_SOURCE
    });

    const windowService = createWindowService({
        app,
        BrowserWindow,
        preloadPath: path.join(appRoot, 'preload.js'),
        iconPath: appIconPath,
        ipcChannels: IPC_CHANNELS,
        rendererContract: RENDERER_CONTRACT,
        isSmokeTest
    });

    const searchService = createSearchService({
        engine,
        normalizeSearchParams,
        normalizeSearchParamsForData,
        serializeSearchParams,
        cacheService,
        Worker,
        workerPath: path.join(appRoot, 'worker.js'),
        ipcChannels: IPC_CHANNELS,
        getMainWindow: windowService.getMainWindow,
        getDataCache: dataService.getDataCache
    });
    const cacheMigrationStatePath = path.join(storagePaths.storageRoot, 'cache-migration-state.json');
    const strictlyMigratedFingerprints = new Set();
    let fatalExitScheduled = false;
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
            if (migrationState.version === SEARCH_CACHE_VERSION) {
                return;
            }
            await cacheService.migrateCanonicalParams({
                canonicalizeByFingerprint: (_dataFingerprint, params) => normalizeSearchParams(params)
            });
            await saveCacheMigrationState({
                ...migrationState,
                version: SEARCH_CACHE_VERSION
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
                version: migrationState.version ?? SEARCH_CACHE_VERSION,
                strictFingerprints: [...strictlyMigratedFingerprints].sort()
            });
        } catch (error) {
            console.warn(`Failed to migrate cached params for fingerprint ${dataFingerprint}:`, error.message || String(error));
        }
    }

    function scheduleFatalExit() {
        if (fatalExitScheduled) {
            return;
        }
        fatalExitScheduled = true;
        const timer = setTimeoutFn(() => {
            app.exit(1);
        }, fatalExitDelayMs);
        if (typeof timer?.unref === 'function') {
            timer.unref();
        }
    }

    function handleFatalProcessError(prefix, detail) {
        console.error(prefix, detail);
        const detailText = detail?.message || detail?.toString?.() || String(detail);
        windowService.notifyRendererError(`${detailText} The app will now close to avoid a corrupted state.`);
        scheduleFatalExit();
    }

    function handleUncaughtException(error) {
        handleFatalProcessError('[FATAL] Uncaught exception:', error);
    }

    function handleUnhandledRejection(reason) {
        handleFatalProcessError('[FATAL] Unhandled promise rejection:', reason);
    }

    function registerProcessHandlers() {
        processRef.on('uncaughtException', handleUncaughtException);
        processRef.on('unhandledRejection', handleUnhandledRejection);
        return () => {
            processRef.removeListener('uncaughtException', handleUncaughtException);
            processRef.removeListener('unhandledRejection', handleUnhandledRejection);
        };
    }

    async function handleAppReady() {
        let storageReady = false;
        try {
            cacheService.ensureCacheDir();
            storageReady = true;
        } catch (error) {
            console.error('Failed to initialize local app storage:', error.message);
        }
        windowService.createWindow();
        windowService.scheduleSmokeTimeout();
        if (storageReady) {
            void migrateAllCachedParamsWithBaseNormalization();
        }
    }

    function handleAllWindowsClosed() {
        app.quit();
    }

    function registerAppLifecycle() {
        app.commandLine.appendSwitch('disable-direct-composition');
        const readyPromise = app.whenReady().then(handleAppReady);
        app.on('window-all-closed', handleAllWindowsClosed);
        return {
            readyPromise,
            dispose: () => {
                app.removeListener('window-all-closed', handleAllWindowsClosed);
            }
        };
    }

    function assertTrustedIpcSender(event, channel) {
        const mainWindow = windowService.getMainWindow();
        const hasLiveMainWindow = !!mainWindow
            && (typeof mainWindow.isDestroyed !== 'function' || !mainWindow.isDestroyed());
        const sender = event?.sender;
        const senderFrame = event?.senderFrame || sender?.mainFrame || null;
        const expectedWebContents = mainWindow?.webContents;
        const senderMatchesMainWindow = !!sender
            && !!expectedWebContents
            && (
                sender === expectedWebContents
                || (
                    Number.isInteger(sender.id)
                    && Number.isInteger(expectedWebContents.id)
                    && sender.id === expectedWebContents.id
                )
            );
        const isMainFrame = senderFrame?.isMainFrame !== false;
        const senderUrl = typeof senderFrame?.url === 'string' && senderFrame.url
            ? senderFrame.url
            : sender?.getURL?.();

        if (
            !hasLiveMainWindow
            || !senderMatchesMainWindow
            || !isMainFrame
            || typeof senderUrl !== 'string'
            || !senderUrl.startsWith('file://')
        ) {
            console.warn(`Rejected unauthorized IPC sender for ${channel}.`);
            throw new Error('Unauthorized IPC sender.');
        }
    }

    function handleTrustedIpc(channel, handler) {
        ipcMain.handle(channel, async (event, ...args) => {
            assertTrustedIpcSender(event, channel);
            return await handler(event, ...args);
        });
    }

    function registerIpcHandlers() {
        handleTrustedIpc(IPC_CHANNELS.FETCH_DATA, async (_event, requestedSource = DEFAULT_DATA_SOURCE) => {
            try {
                const response = await dataService.fetchData(requestedSource);
                if (response?.success && response.dataFingerprint) {
                    void migrateFingerprintWithStrictNormalization(response.dataFingerprint);
                }
                return response;
            } catch (error) {
                return { success: false, error: error.toString() };
            }
        });

        handleTrustedIpc(IPC_CHANNELS.GET_SEARCH_ESTIMATE, async (_event, params) => {
            return await searchService.getSearchEstimate(params);
        });

        handleTrustedIpc(IPC_CHANNELS.NORMALIZE_SEARCH_PARAMS, async (_event, params) => {
            if (typeof searchService.normalizePayload === 'function') {
                return searchService.normalizePayload(params);
            }

            const fallbackParams = normalizeSearchParams(params);
            return {
                params: fallbackParams,
                comparisonKey: serializeSearchParams(fallbackParams),
                dataFingerprint: dataService.getDataCache()?.dataFingerprint || null
            };
        });

        handleTrustedIpc(IPC_CHANNELS.SEARCH_BOARDS, async (_event, params) => {
            return await searchService.searchBoards(params);
        });

        handleTrustedIpc(IPC_CHANNELS.CANCEL_SEARCH, async () => {
            return await searchService.cancelSearch();
        });

        handleTrustedIpc(IPC_CHANNELS.LIST_CACHE, async (_event, options = null) => {
            try {
                const activeDataFingerprint = dataService.getDataCache()?.dataFingerprint || null;
                const entries = await cacheService.listCacheEntries(activeDataFingerprint, options || {});
                return { success: true, entries };
            } catch (error) {
                return { success: false, error: error.toString() };
            }
        });

        handleTrustedIpc(IPC_CHANNELS.DELETE_CACHE_ENTRY, async (_event, key) => {
            try {
                await cacheService.deleteCacheEntry(key);
                return { success: true };
            } catch (error) {
                return { success: false, error: error.toString() };
            }
        });

        handleTrustedIpc(IPC_CHANNELS.CLEAR_ALL_CACHE, async () => {
            try {
                const summary = await cacheService.clearAllCache();
                return {
                    success: true,
                    deleted: summary.deleted,
                    failures: summary.failures || []
                };
            } catch (error) {
                return { success: false, error: error.toString() };
            }
        });

        return () => {
            ipcMain.removeHandler(IPC_CHANNELS.FETCH_DATA);
            ipcMain.removeHandler(IPC_CHANNELS.GET_SEARCH_ESTIMATE);
            ipcMain.removeHandler(IPC_CHANNELS.NORMALIZE_SEARCH_PARAMS);
            ipcMain.removeHandler(IPC_CHANNELS.SEARCH_BOARDS);
            ipcMain.removeHandler(IPC_CHANNELS.CANCEL_SEARCH);
            ipcMain.removeHandler(IPC_CHANNELS.LIST_CACHE);
            ipcMain.removeHandler(IPC_CHANNELS.DELETE_CACHE_ENTRY);
            ipcMain.removeHandler(IPC_CHANNELS.CLEAR_ALL_CACHE);
        };
    }

    function start() {
        const unregisterProcessHandlers = registerProcessHandlers();
        const appLifecycle = registerAppLifecycle();
        const unregisterIpcHandlers = registerIpcHandlers();

        return {
            readyPromise: appLifecycle.readyPromise,
            dispose: () => {
                unregisterIpcHandlers();
                appLifecycle.dispose();
                unregisterProcessHandlers();
            }
        };
    }

    return {
        isSmokeTest,
        cacheService,
        dataService,
        searchService,
        windowService,
        assertTrustedIpcSender,
        handleTrustedIpc,
        registerProcessHandlers,
        registerAppLifecycle,
        registerIpcHandlers,
        start
    };
}

module.exports = {
    SEARCH_CACHE_VERSION,
    createMainRuntime
};
