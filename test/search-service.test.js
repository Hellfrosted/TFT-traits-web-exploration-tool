const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createSearchService } = require('../main-process/search-service.js');

class FakeWorker extends EventEmitter {
    static instances = [];

    constructor(workerPath, options) {
        super();
        this.workerPath = workerPath;
        this.options = options;
        FakeWorker.instances.push(this);
    }

    async terminate() {
        this.emit('exit', 0);
        return 0;
    }
}

function resetWorkers() {
    FakeWorker.instances.length = 0;
}

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function nextTurn() {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

async function waitForWorker(count = 1) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        if (FakeWorker.instances.length >= count) {
            return FakeWorker.instances[count - 1];
        }
        await nextTurn();
    }
    assert.fail(`Expected ${count} worker instance(s), found ${FakeWorker.instances.length}.`);
}

function createCacheService({ cachedResults = null, readCacheImpl = null } = {}) {
    const writes = [];
    return {
        writes,
        getCacheKey: () => 'cache-key',
        getPreparedSearchContext: () => ({ preparedContext: { prepared: true } }),
        readCache: readCacheImpl || (async () => cachedResults),
        writeCache: async (...args) => {
            writes.push(args);
        },
        getCachedEstimate: () => null,
        setCachedEstimate: (_key, estimate) => estimate
    };
}

function createSearchServiceUnderTest(options = {}) {
    const cacheService = createCacheService(options);
    const progressMessages = [];
    const searchService = createSearchService({
        engine: {
            getCombinationCount: () => ({ count: 25, remainingSlots: 2 })
        },
        normalizeSearchParams: (params) => ({ ...params }),
        cacheService,
        Worker: FakeWorker,
        workerPath: 'worker.js',
        ipcChannels: {
            SEARCH_PROGRESS: 'search-progress'
        },
        getMainWindow: () => ({
            isDestroyed: () => false,
            webContents: {
                send: (_channel, payload) => {
                    progressMessages.push(payload);
                }
            }
        }),
        getDataCache: () => ({
            dataFingerprint: 'fingerprint-1',
            units: []
        })
    });

    return {
        searchService,
        cacheService,
        progressMessages
    };
}

describe('main-process search service', () => {
    it('returns cached results without starting a worker', async () => {
        resetWorkers();
        const { searchService, cacheService } = createSearchServiceUnderTest({
            cachedResults: [{ units: ['Cached'] }]
        });

        const response = await searchService.searchBoards({ boardSize: 9 });

        assert.equal(response.success, true);
        assert.equal(response.fromCache, true);
        assert.deepEqual(response.results, [{ units: ['Cached'] }]);
        assert.equal(FakeWorker.instances.length, 0);
        assert.deepEqual(cacheService.writes, []);
    });

    it('rejects a second search while one is already running', async () => {
        resetWorkers();
        const pendingCacheRead = createDeferred();
        const { searchService } = createSearchServiceUnderTest({
            readCacheImpl: () => pendingCacheRead.promise
        });

        const firstPromise = searchService.searchBoards({ boardSize: 9 });
        const secondResponse = await searchService.searchBoards({ boardSize: 9 });

        assert.equal(secondResponse.success, false);
        assert.match(secondResponse.error, /already in progress/i);

        pendingCacheRead.resolve(null);
        const worker = await waitForWorker();
        worker.emit('message', {
            type: 'done',
            success: true,
            results: [{ units: ['A'] }]
        });

        const firstResponse = await firstPromise;
        assert.equal(firstResponse.success, true);
        assert.equal(firstResponse.fromCache, false);
    });

    it('resolves cancellation after terminating the active worker', async () => {
        resetWorkers();
        const { searchService, progressMessages } = createSearchServiceUnderTest();

        const pendingSearch = searchService.searchBoards({ boardSize: 9 });
        const worker = await waitForWorker();
        worker.emit('message', {
            type: 'progress',
            pct: 50,
            checked: 10,
            total: 20
        });

        const cancelResponse = await searchService.cancelSearch();
        const searchResponse = await pendingSearch;

        assert.equal(cancelResponse.success, true);
        assert.equal(searchResponse.cancelled, true);
        assert.equal(progressMessages.length, 1);
    });

    it('cancels a search before the worker starts if cache lookup is still in flight', async () => {
        resetWorkers();
        const pendingCacheRead = createDeferred();
        const { searchService } = createSearchServiceUnderTest({
            readCacheImpl: () => pendingCacheRead.promise
        });

        const pendingSearch = searchService.searchBoards({ boardSize: 9 });
        const cancelResponse = await searchService.cancelSearch();
        pendingCacheRead.resolve(null);
        const searchResponse = await pendingSearch;

        assert.equal(cancelResponse.success, true);
        assert.equal(searchResponse.cancelled, true);
        assert.equal(FakeWorker.instances.length, 0);
    });

    it('fails cleanly if the worker exits without reporting a result', async () => {
        resetWorkers();
        const { searchService } = createSearchServiceUnderTest();

        const pendingSearch = searchService.searchBoards({ boardSize: 9 });
        const worker = await waitForWorker();
        worker.emit('exit', 0);
        const searchResponse = await pendingSearch;

        assert.equal(searchResponse.success, false);
        assert.match(searchResponse.error, /exited before returning a result/i);
    });
});
