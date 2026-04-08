const path = require('path');

const SEARCH_CACHE_VERSION = 4;

function createMainRuntime(options = {}) {
    const electron = options.electron || require('electron');
    const fsp = options.fsp || require('fs').promises;
    const crypto = options.crypto || require('crypto');
    const Worker = options.Worker || require('worker_threads').Worker;
    const dataEngine = options.dataEngine || require('../data.js');
    const engine = options.engine || require('../engine.js');
    const normalizeSearchParams = options.normalizeSearchParams || require('../searchParams.js').normalizeSearchParams;
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
        searchCacheVersion: SEARCH_CACHE_VERSION
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
        cacheService,
        Worker,
        workerPath: path.join(appRoot, 'worker.js'),
        ipcChannels: IPC_CHANNELS,
        getMainWindow: windowService.getMainWindow,
        getDataCache: dataService.getDataCache
    });

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
        const senderFrame = event?.senderFrame;
        const senderUrl = typeof senderFrame?.url === 'string' && senderFrame.url
            ? senderFrame.url
            : sender?.getURL?.();

        if (
            !hasLiveMainWindow
            || sender !== mainWindow.webContents
            || senderFrame?.isMainFrame !== true
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
                return await dataService.fetchData(requestedSource);
            } catch (error) {
                return { success: false, error: error.toString() };
            }
        });

        handleTrustedIpc(IPC_CHANNELS.GET_SEARCH_ESTIMATE, async (_event, params) => {
            return await searchService.getSearchEstimate(params);
        });

        handleTrustedIpc(IPC_CHANNELS.SEARCH_BOARDS, async (_event, params) => {
            return await searchService.searchBoards(params);
        });

        handleTrustedIpc(IPC_CHANNELS.CANCEL_SEARCH, async () => {
            return await searchService.cancelSearch();
        });

        handleTrustedIpc(IPC_CHANNELS.LIST_CACHE, async () => {
            try {
                const activeDataFingerprint = dataService.getDataCache()?.dataFingerprint || null;
                const entries = await cacheService.listCacheEntries(activeDataFingerprint);
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
                const deleted = await cacheService.clearAllCache();
                return { success: true, deleted };
            } catch (error) {
                return { success: false, error: error.toString() };
            }
        });

        return () => {
            ipcMain.removeHandler(IPC_CHANNELS.FETCH_DATA);
            ipcMain.removeHandler(IPC_CHANNELS.GET_SEARCH_ESTIMATE);
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
