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
    const strictlyMigratedFingerprints = new Set();

    async function migrateAllCachedParamsWithBaseNormalization() {
        if (typeof cacheService.migrateCanonicalParams !== 'function') {
            return;
        }

        try {
            await cacheService.migrateCanonicalParams({
                canonicalizeByFingerprint: (_dataFingerprint, params) => normalizeSearchParams(params)
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
        } catch (error) {
            console.warn(`Failed to migrate cached params for fingerprint ${dataFingerprint}:`, error.message || String(error));
        }
    }

    function handleUncaughtException(error) {
        console.error('[FATAL] Uncaught exception:', error);
        windowService.notifyRendererError(`Unexpected error: ${error.message}`);
    }

    function handleUnhandledRejection(reason) {
        console.error('[FATAL] Unhandled promise rejection:', reason);
        windowService.notifyRendererError(`Unhandled error: ${reason}`);
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
        try {
            cacheService.ensureCacheDir();
            await migrateAllCachedParamsWithBaseNormalization();
        } catch (error) {
            console.error('Failed to initialize local app storage:', error.message);
        }
        windowService.createWindow();
        windowService.scheduleSmokeTimeout();
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
        const handlerMap = {
            [IPC_CHANNELS.FETCH_DATA]: async (_event, requestedSource = DEFAULT_DATA_SOURCE) => {
                try {
                    const response = await dataService.fetchData(requestedSource);
                    if (response?.success && response.dataFingerprint) {
                        void migrateFingerprintWithStrictNormalization(response.dataFingerprint);
                    }
                    return response;
                } catch (error) {
                    return { success: false, error: error.toString() };
                }
            },
            [IPC_CHANNELS.GET_SEARCH_ESTIMATE]: async (_event, params) => {
                return await searchService.getSearchEstimate(params);
            },
            [IPC_CHANNELS.NORMALIZE_SEARCH_PARAMS]: async (_event, params) => {
                if (typeof searchService.normalizePayload === 'function') {
                    return searchService.normalizePayload(params);
                }

                const fallbackParams = normalizeSearchParams(params);
                return {
                    params: fallbackParams,
                    comparisonKey: serializeSearchParams(fallbackParams),
                    dataFingerprint: dataService.getDataCache()?.dataFingerprint || null
                };
            },
            [IPC_CHANNELS.SEARCH_BOARDS]: async (_event, params) => {
                return await searchService.searchBoards(params);
            },
            [IPC_CHANNELS.CANCEL_SEARCH]: async () => {
                return await searchService.cancelSearch();
            },
            [IPC_CHANNELS.LIST_CACHE]: async () => {
                try {
                    const activeDataFingerprint = dataService.getDataCache()?.dataFingerprint || null;
                    const entries = await cacheService.listCacheEntries(activeDataFingerprint);
                    return { success: true, entries };
                } catch (error) {
                    return { success: false, error: error.toString() };
                }
            },
            [IPC_CHANNELS.DELETE_CACHE_ENTRY]: async (_event, key) => {
                try {
                    await cacheService.deleteCacheEntry(key);
                    return { success: true };
                } catch (error) {
                    return { success: false, error: error.toString() };
                }
            },
            [IPC_CHANNELS.CLEAR_ALL_CACHE]: async () => {
                try {
                    const deleted = await cacheService.clearAllCache();
                    return { success: true, deleted };
                } catch (error) {
                    return { success: false, error: error.toString() };
                }
            }
        };

        Object.entries(handlerMap).forEach(([channel, handler]) => {
            handleTrustedIpc(channel, handler);
        });

        return () => {
            Object.keys(handlerMap).forEach((channel) => {
                ipcMain.removeHandler(channel);
            });
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
