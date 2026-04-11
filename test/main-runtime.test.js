const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createMainRuntime } = require('../main-process/runtime.js');
const { createMainRuntime: createMainRuntimeFromEntry } = require('../main.js');

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

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
        listCacheOptions: [],
        deleteCacheEntry: 0,
        clearAllCache: 0,
        migrateCanonicalParams: 0,
        rendererErrors: []
    };

    const runtime = createMainRuntime({
        electron: {
            app: fakeApp,
            BrowserWindow: function BrowserWindow() {},
            ipcMain: fakeIpcMain
        },
        fsp: options.fsp || {
            readFile: async () => {
                const error = new Error('missing');
                error.code = 'ENOENT';
                throw error;
            },
            writeFile: async () => {},
            rename: async () => {},
            unlink: async () => {}
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
        setTimeoutFn: options.setTimeoutFn,
        createSearchCacheService: options.createSearchCacheService || (() => ({
            ensureCacheDir: () => {
                ensureCacheDirCalls += 1;
            },
            migrateCanonicalParams: async () => {
                serviceCalls.migrateCanonicalParams += 1;
            },
            listCacheEntries: async (_activeDataFingerprint, requestOptions = {}) => {
                serviceCalls.listCacheEntries += 1;
                serviceCalls.listCacheOptions.push(requestOptions);
                return [];
            },
            deleteCacheEntry: async () => {
                serviceCalls.deleteCacheEntry += 1;
            },
            clearAllCache: async () => {
                serviceCalls.clearAllCache += 1;
                return {
                    deleted: 0,
                    failures: []
                };
            }
        })),
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
            notifyRendererError: (message) => {
                serviceCalls.rendererErrors.push(message);
            },
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

    it('does not block window creation on background cache migration during startup', async () => {
        const migration = createDeferred();
        const { runtime, serviceCalls, getCounts } = createRuntimeUnderTest({
            createSearchCacheService: () => ({
                ensureCacheDir: () => {},
                migrateCanonicalParams: async () => {
                    serviceCalls.migrateCanonicalParams += 1;
                    return await migration.promise;
                },
                listCacheEntries: async () => [],
                deleteCacheEntry: async () => {},
                clearAllCache: async () => 0
            })
        });

        const started = runtime.start();
        const readyState = await Promise.race([
            started.readyPromise.then(() => 'resolved'),
            new Promise((resolve) => setTimeout(() => resolve('pending'), 10))
        ]);
        await Promise.resolve();

        assert.equal(readyState, 'resolved');
        assert.equal(serviceCalls.migrateCanonicalParams, 1);
        assert.deepEqual(getCounts(), {
            ensureCacheDirCalls: 0,
            createWindowCalls: 1,
            scheduleSmokeTimeoutCalls: 1
        });

        migration.resolve();
        await started.readyPromise;
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

    it('passes bounded cache-list options through to the cache service', async () => {
        const { runtime, fakeIpcMain, serviceCalls, createInvokeEvent } = createRuntimeUnderTest();
        runtime.registerIpcHandlers();

        const handler = fakeIpcMain.handlers.get('list-cache');
        const response = await handler(createInvokeEvent(), { limit: 5 });

        assert.deepEqual(response, { success: true, entries: [] });
        assert.equal(serviceCalls.listCacheEntries, 1);
        assert.deepEqual(serviceCalls.listCacheOptions, [{ limit: 5 }]);
    });

    it('exits after reporting fatal process errors', () => {
        const { runtime, fakeApp, fakeProcess, serviceCalls } = createRuntimeUnderTest({
            setTimeoutFn: (callback) => {
                callback();
                return { unref() {} };
            }
        });

        runtime.registerProcessHandlers();
        fakeProcess.emit('uncaughtException', new Error('fatal boom'));

        assert.deepEqual(fakeApp.exitCalls, [1]);
        assert.equal(serviceCalls.rendererErrors.length, 1);
        assert.match(serviceCalls.rendererErrors[0], /fatal boom/i);
        assert.match(serviceCalls.rendererErrors[0], /will now close/i);
    });
});
