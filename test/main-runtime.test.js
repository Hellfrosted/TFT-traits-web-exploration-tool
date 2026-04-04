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

function createRuntimeUnderTest() {
    const fakeApp = new FakeApp();
    const fakeIpcMain = new FakeIpcMain();
    const fakeProcess = new EventEmitter();
    let ensureCacheDirCalls = 0;
    let createWindowCalls = 0;
    let scheduleSmokeTimeoutCalls = 0;

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
                LIST_CACHE: 'list-cache',
                DELETE_CACHE_ENTRY: 'delete-cache-entry',
                CLEAR_ALL_CACHE: 'clear-all-cache',
                SEARCH_PROGRESS: 'search-progress',
                MAIN_PROCESS_ERROR: 'main-process-error'
            },
            LIMITS: {
                DEFAULT_MAX_RESULTS: 500
            },
            SMOKE_TEST_FLAG: '--smoke-test'
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
            listCacheEntries: async () => [],
            deleteCacheEntry: async () => {},
            clearAllCache: async () => 0
        }),
        createDataService: () => ({
            fetchData: async () => ({ success: true }),
            getDataCache: () => null
        }),
        createSearchService: () => ({
            getSearchEstimate: async () => ({ count: 0, remainingSlots: 0 }),
            searchBoards: async () => ({ success: true, results: [] }),
            cancelSearch: async () => ({ success: true })
        }),
        createWindowService: () => ({
            createWindow: () => {
                createWindowCalls += 1;
            },
            scheduleSmokeTimeout: () => {
                scheduleSmokeTimeoutCalls += 1;
            },
            notifyRendererError: () => {},
            getMainWindow: () => null
        }),
        appRoot: 'C:\\Users\\tester\\dev\\repo'
    });

    return {
        runtime,
        fakeApp,
        fakeIpcMain,
        fakeProcess,
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
        assert.equal(fakeIpcMain.handlers.size, 7);
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
});
