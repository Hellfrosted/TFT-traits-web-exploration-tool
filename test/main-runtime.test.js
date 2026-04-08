const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createMainRuntime } = require('../main-process/runtime.js');
const { createMainRuntime: createMainRuntimeFromEntry } = require('../main.js');

class FakeApp extends EventEmitter {
    constructor() {
        super();
        this.appendedSwitches = [];
        this.quitCalls = 0;
        this.exitCalls = [];
        this.commandLine = {
            appendSwitch: (value) => {
                this.appendedSwitches.push(value);
            }
        };
    }

    getPath() {
        return 'C:\\Users\\tester\\AppData\\Roaming\\TFT Tool';
    }

    whenReady() {
        return Promise.resolve();
    }

    quit() {
        this.quitCalls += 1;
    }

    exit(code) {
        this.exitCalls.push(code);
    }
}

class FakeIpcMain {
    constructor() {
        this.handlers = new Map();
    }

    handle(channel, handler) {
        this.handlers.set(channel, handler);
    }

    removeHandler(channel) {
        this.handlers.delete(channel);
    }
}

function createMainWindowStub({ url = 'file:///index.html', destroyed = false } = {}) {
    const webContents = {
        id: 101,
        getURL: () => url
    };

    return {
        webContents,
        isDestroyed: () => destroyed
    };
}

function createRuntimeUnderTest(options = {}) {
    const fakeApp = new FakeApp();
    const fakeIpcMain = new FakeIpcMain();
    const fakeProcess = new EventEmitter();
    const mainWindow = options.mainWindow || createMainWindowStub();
    let ensureCacheDirCalls = 0;
    let createWindowCalls = 0;
    let scheduleSmokeTimeoutCalls = 0;
    const serviceCalls = {
        fetchData: 0,
        getSearchEstimate: 0,
        normalizeSearchParams: 0,
        searchBoards: 0,
        cancelSearch: 0,
        listCacheEntries: 0,
        deleteCacheEntry: 0,
        clearAllCache: 0,
        migrateCanonicalParams: 0
    };

    const runtime = createMainRuntime({
        electron: {
            app: fakeApp,
            BrowserWindow: function BrowserWindow() {},
            ipcMain: fakeIpcMain
        },
        processRef: fakeProcess,
        constants: {
            DEFAULT_DATA_SOURCE: 'pbe',
            IPC_CHANNELS: {
                FETCH_DATA: 'fetch-data',
                SEARCH_BOARDS: 'search-boards',
                CANCEL_SEARCH: 'cancel-search',
                GET_SEARCH_ESTIMATE: 'get-search-estimate',
                NORMALIZE_SEARCH_PARAMS: 'normalize-search-params',
                LIST_CACHE: 'list-cache',
                DELETE_CACHE_ENTRY: 'delete-cache-entry',
                CLEAR_ALL_CACHE: 'clear-all-cache',
                SEARCH_PROGRESS: 'search-progress',
                MAIN_PROCESS_ERROR: 'main-process-error'
            },
            LIMITS: {
                DEFAULT_MAX_RESULTS: 500
            },
            SMOKE_TEST_FLAG: '--smoke-test',
            RENDERER_CONTRACT: {
                requiredBridgeMethods: [],
                requiredShellIds: []
            }
        },
        storage: {
            getStoragePaths: () => ({
                storageRoot: 'storage-root',
                cacheDir: 'storage-root\\cache'
            }),
            ensureStorageDirs: () => {},
            resolveCacheEntryPath: () => 'storage-root\\cache\\entry.json',
            resolveDataFallbackPath: () => 'storage-root\\data.json'
        },
        createSearchCacheService: () => ({
            ensureCacheDir: () => {
                ensureCacheDirCalls += 1;
            },
            migrateCanonicalParams: async () => {
                serviceCalls.migrateCanonicalParams += 1;
            },
            listCacheEntries: async () => {
                serviceCalls.listCacheEntries += 1;
                return [];
            },
            deleteCacheEntry: async () => {
                serviceCalls.deleteCacheEntry += 1;
            },
            clearAllCache: async () => {
                serviceCalls.clearAllCache += 1;
                return 0;
            }
        }),
        createDataService: () => ({
            fetchData: async () => {
                serviceCalls.fetchData += 1;
                return { success: true };
            },
            getDataCache: () => null
        }),
        createSearchService: () => ({
            getSearchEstimate: async () => {
                serviceCalls.getSearchEstimate += 1;
                return { count: 0, remainingSlots: 0 };
            },
            normalizePayload: () => {
                serviceCalls.normalizeSearchParams += 1;
                return {
                    params: { boardSize: 9, maxResults: 500 },
                    comparisonKey: '{"boardSize":9,"maxResults":500}',
                    dataFingerprint: 'fingerprint-1'
                };
            },
            searchBoards: async () => {
                serviceCalls.searchBoards += 1;
                return { success: true, results: [] };
            },
            cancelSearch: async () => {
                serviceCalls.cancelSearch += 1;
                return { success: true };
            }
        }),
        createWindowService: () => ({
            createWindow: () => {
                createWindowCalls += 1;
            },
            scheduleSmokeTimeout: () => {
                scheduleSmokeTimeoutCalls += 1;
            },
            notifyRendererError: () => {},
            getMainWindow: () => mainWindow
        }),
        appRoot: 'C:\\Users\\tester\\dev\\repo'
    });

    function createInvokeEvent(overrides = {}) {
        const sender = overrides.sender || mainWindow.webContents;
        const senderUrl = overrides.senderUrl || sender.getURL?.() || mainWindow.webContents.getURL();
        if (typeof sender.getURL !== 'function') {
            sender.getURL = () => senderUrl;
        }

        return {
            sender,
            senderFrame: Object.prototype.hasOwnProperty.call(overrides, 'senderFrame')
                ? overrides.senderFrame
                : {
                    isMainFrame: true,
                    url: senderUrl
                }
        };
    }

    return {
        runtime,
        fakeApp,
        fakeIpcMain,
        fakeProcess,
        mainWindow,
        serviceCalls,
        createInvokeEvent,
        getCounts: () => ({
            ensureCacheDirCalls,
            createWindowCalls,
            scheduleSmokeTimeoutCalls
        })
    };
}

describe('main runtime', () => {
    it('keeps the entrypoint import side-effect free until start is called', () => {
        assert.equal(typeof createMainRuntimeFromEntry, 'function');

        const { fakeIpcMain, fakeProcess } = createRuntimeUnderTest();
        assert.equal(fakeIpcMain.handlers.size, 0);
        assert.equal(fakeProcess.listenerCount('uncaughtException'), 0);
        assert.equal(fakeProcess.listenerCount('unhandledRejection'), 0);
    });

    it('registers and tears down process, app, and IPC handlers explicitly', async () => {
        const {
            runtime,
            fakeApp,
            fakeIpcMain,
            fakeProcess,
            getCounts
        } = createRuntimeUnderTest();

        const started = runtime.start();
        await started.readyPromise;

        assert.deepEqual(fakeApp.appendedSwitches, ['disable-direct-composition']);
        assert.equal(fakeIpcMain.handlers.size, 8);
        assert.equal(fakeProcess.listenerCount('uncaughtException'), 1);
        assert.equal(fakeProcess.listenerCount('unhandledRejection'), 1);
        assert.equal(fakeApp.listenerCount('window-all-closed'), 1);
        assert.deepEqual(getCounts(), {
            ensureCacheDirCalls: 1,
            createWindowCalls: 1,
            scheduleSmokeTimeoutCalls: 1
        });

        started.dispose();

        assert.equal(fakeIpcMain.handlers.size, 0);
        assert.equal(fakeProcess.listenerCount('uncaughtException'), 0);
        assert.equal(fakeProcess.listenerCount('unhandledRejection'), 0);
        assert.equal(fakeApp.listenerCount('window-all-closed'), 0);
    });

    it('allows a trusted main-frame file:// sender to reach the handler', async () => {
        const { runtime, fakeIpcMain, serviceCalls, createInvokeEvent } = createRuntimeUnderTest();
        runtime.registerIpcHandlers();

        const handler = fakeIpcMain.handlers.get('get-search-estimate');
        const result = await handler(createInvokeEvent(), { boardSize: 9 });

        assert.deepEqual(result, { count: 0, remainingSlots: 0 });
        assert.equal(serviceCalls.getSearchEstimate, 1);
    });

    it('allows trusted sender normalization requests to reach the shared normalizer handler', async () => {
        const { runtime, fakeIpcMain, serviceCalls, createInvokeEvent } = createRuntimeUnderTest();
        runtime.registerIpcHandlers();

        const handler = fakeIpcMain.handlers.get('normalize-search-params');
        const payload = await handler(createInvokeEvent(), { boardSize: '9', maxResults: '500' });

        assert.deepEqual(payload, {
            params: { boardSize: 9, maxResults: 500 },
            comparisonKey: '{"boardSize":9,"maxResults":500}',
            dataFingerprint: 'fingerprint-1'
        });
        assert.equal(serviceCalls.normalizeSearchParams, 1);
    });

    it('accepts a sender wrapper with the same webContents id when the frame metadata falls back to mainFrame', async () => {
        const { runtime, fakeIpcMain, serviceCalls } = createRuntimeUnderTest();
        runtime.registerIpcHandlers();

        const handler = fakeIpcMain.handlers.get('get-search-estimate');
        const sender = {
            id: 101,
            getURL: () => 'file:///index.html',
            mainFrame: {
                isMainFrame: true,
                url: 'file:///index.html'
            }
        };

        const result = await handler({
            sender,
            senderFrame: undefined
        }, { boardSize: 9 });

        assert.deepEqual(result, { count: 0, remainingSlots: 0 });
        assert.equal(serviceCalls.getSearchEstimate, 1);
    });

    it('rejects mismatched webContents senders before they reach the data service', async () => {
        const { runtime, fakeIpcMain, serviceCalls, createInvokeEvent } = createRuntimeUnderTest();
        runtime.registerIpcHandlers();

        const handler = fakeIpcMain.handlers.get('fetch-data');
        const foreignSender = {
            getURL: () => 'file:///index.html'
        };

        await assert.rejects(
            handler(createInvokeEvent({ sender: foreignSender }), 'pbe'),
            /Unauthorized IPC sender\./
        );

        assert.equal(serviceCalls.fetchData, 0);
    });

    it('rejects non-main-frame requests before they reach the search service', async () => {
        const { runtime, fakeIpcMain, serviceCalls, createInvokeEvent } = createRuntimeUnderTest();
        runtime.registerIpcHandlers();

        const handler = fakeIpcMain.handlers.get('search-boards');

        await assert.rejects(
            handler(createInvokeEvent({
                senderFrame: {
                    isMainFrame: false,
                    url: 'file:///index.html'
                }
            }), { boardSize: 9 }),
            /Unauthorized IPC sender\./
        );

        assert.equal(serviceCalls.searchBoards, 0);
    });

    it('rejects non-file senders before they reach the cache service', async () => {
        const { runtime, fakeIpcMain, serviceCalls, createInvokeEvent } = createRuntimeUnderTest();
        runtime.registerIpcHandlers();

        const handler = fakeIpcMain.handlers.get('list-cache');

        await assert.rejects(
            handler(createInvokeEvent({
                senderFrame: {
                    isMainFrame: true,
                    url: 'https://example.com'
                }
            })),
            /Unauthorized IPC sender\./
        );

        assert.equal(serviceCalls.listCacheEntries, 0);
    });

    it('rejects non-main-frame normalize requests before they reach search normalization', async () => {
        const { runtime, fakeIpcMain, serviceCalls, createInvokeEvent } = createRuntimeUnderTest();
        runtime.registerIpcHandlers();

        const handler = fakeIpcMain.handlers.get('normalize-search-params');

        await assert.rejects(
            handler(createInvokeEvent({
                senderFrame: {
                    isMainFrame: false,
                    url: 'file:///index.html'
                }
            }), { boardSize: 9 }),
            /Unauthorized IPC sender\./
        );

        assert.equal(serviceCalls.normalizeSearchParams, 0);
    });
});
