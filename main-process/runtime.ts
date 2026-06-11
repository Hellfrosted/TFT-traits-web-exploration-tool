const path = require('path');
const { createCacheMigrationService } = require('./cache-migration-service.js');
const { createIpcRouter } = require('./ipc-router.js');

const SEARCH_CACHE_VERSION = 4;

function createMainRuntime(options: LooseRecord = {}) {
    const electron = options.electron || require('electron');
    const fsp = options.fsp || require('fs').promises;
    const crypto = options.crypto || require('crypto');
    const Worker = options.Worker || require('worker_threads').Worker;
    const dataEngine = options.dataEngine || require('../data.js');
    const engine = options.engine || require('../engine.js');
    const searchParamUtils = options.searchParamUtils || require('../searchParams.js');
    const normalizeSearchParams = options.normalizeSearchParams || searchParamUtils.normalizeSearchParams;
    const normalizeSearchParamsForData =
        options.normalizeSearchParamsForData || searchParamUtils.normalizeSearchParamsForData || normalizeSearchParams;
    const serializeSearchParams =
        options.serializeSearchParams ||
        searchParamUtils.serializeSearchParams ||
        ((params) => JSON.stringify(normalizeSearchParams(params)));
    const storage = options.storage || require('../storage.js');
    const constants = options.constants || require('../constants.js');
    const createSearchCacheService =
        options.createSearchCacheService || require('./search-cache-service.js').createSearchCacheService;
    const createDataService = options.createDataService || require('./data-service.js').createDataService;
    const createSearchService = options.createSearchService || require('./search-service.js').createSearchService;
    const createWindowService = options.createWindowService || require('./window-service.js').createWindowService;
    const createCacheMigrationServiceFactory = options.createCacheMigrationService || createCacheMigrationService;
    const processRef = options.processRef || process;
    const argv = options.argv || processRef.argv || [];
    const appRoot = options.appRoot || path.join(__dirname, '..');
    const rendererDevServerUrl = options.rendererDevServerUrl || processRef.env?.TFT_RENDERER_DEV_SERVER_URL || '';
    const appIconPath = options.appIconPath || path.join(appRoot, 'assets', 'app-icon.ico');
    const setTimeoutFn = options.setTimeoutFn || setTimeout;
    const fatalExitDelayMs = Number.isFinite(options.fatalExitDelayMs) ? options.fatalExitDelayMs : 150;
    const { app, BrowserWindow, ipcMain } = electron;
    const { DEFAULT_DATA_SOURCE, IPC_CHANNELS, LIMITS, SMOKE_TEST_FLAG, RENDERER_CONTRACT } = constants;
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
        isSmokeTest,
        appRoot,
        rendererDevServerUrl
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
    const cacheMigrationService = createCacheMigrationServiceFactory({
        cacheService,
        dataService,
        fsp,
        processRef,
        storagePaths,
        normalizeSearchParams,
        normalizeSearchParamsForData,
        searchCacheVersion: SEARCH_CACHE_VERSION
    });
    const ipcRouter = createIpcRouter({
        ipcMain,
        ipcChannels: IPC_CHANNELS,
        defaultDataSource: DEFAULT_DATA_SOURCE,
        rendererDevServerUrl,
        getMainWindow: windowService.getMainWindow,
        dataService,
        searchService,
        cacheService,
        normalizeSearchParams,
        serializeSearchParams,
        onDataFingerprintLoaded: (dataFingerprint) => {
            void cacheMigrationService.migrateFingerprintWithStrictNormalization(dataFingerprint);
        }
    });
    let fatalExitScheduled = false;

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
            void cacheMigrationService.migrateAllCachedParamsWithBaseNormalization();
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

    function handleTrustedIpc(channel, handler) {
        ipcRouter.handleTrusted(channel, handler);
    }

    function registerIpcHandlers() {
        return ipcRouter.registerHandlers();
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
        cacheMigrationService,
        ipcRouter,
        assertTrustedIpcSender: ipcRouter.assertTrustedSender,
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
