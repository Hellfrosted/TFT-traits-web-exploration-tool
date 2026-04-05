const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createSearchService } = require('../main-process/search-service.js');

class FakeWorker extends EventEmitter {
    static instances = [];
    static waiters = [];

    constructor(workerPath, options) {
        super();
        this.workerPath = workerPath;
        this.options = options;
        FakeWorker.instances.push(this);
        while (FakeWorker.waiters.length > 0) {
            const resolve = FakeWorker.waiters.shift();
            resolve();
        }
    }

    async terminate() {
        this.emit('exit', 0);
        return 0;
    }
}

function resetWorkers() {
    FakeWorker.instances.length = 0;
    FakeWorker.waiters.length = 0;
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

async function waitForWorker(count = 1, timeoutMs = 2000) {
    if (FakeWorker.instances.length >= count) {
        return FakeWorker.instances[count - 1];
    }

    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(
                `Timed out after ${timeoutMs}ms waiting for worker ${count}. ` +
                `Found ${FakeWorker.instances.length} instance(s).`
            ));
        }, timeoutMs);
        FakeWorker.waiters.push(() => {
            clearTimeout(timer);
            resolve();
        });
    });

    if (FakeWorker.instances.length >= count) {
        return FakeWorker.instances[count - 1];
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
        assert.equal(typeof response.searchId, 'number');
        assert.equal(FakeWorker.instances.length, 0);
        assert.deepEqual(cacheService.writes, []);
    });

    it('rejects a second search while one is already running', async () => {
        resetWorkers();
        const { searchService } = createSearchServiceUnderTest();

        const firstPromise = searchService.searchBoards({ boardSize: 9 });
        const worker = await waitForWorker();
        const secondResponse = await searchService.searchBoards({ boardSize: 9 });

        assert.equal(secondResponse.success, false);
        assert.match(secondResponse.error, /already in progress/i);

        worker.emit('message', {
            type: 'done',
            success: true,
            results: [{ units: ['A'] }]
        });

        const firstResponse = await firstPromise;
        assert.equal(firstResponse.success, true);
        assert.equal(firstResponse.fromCache, false);
        assert.equal(typeof firstResponse.searchId, 'number');
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
        assert.equal(typeof searchResponse.searchId, 'number');
        assert.equal(progressMessages[0].searchId, searchResponse.searchId);
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
        assert.equal(typeof searchResponse.searchId, 'number');
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
        assert.equal(typeof searchResponse.searchId, 'number');
    });

    it('returns successful worker results even if cancellation happens during cache persistence', async () => {
        resetWorkers();
        const cacheWrite = createDeferred();
        const { searchService, cacheService } = createSearchServiceUnderTest();
        cacheService.writeCache = async (...args) => {
            cacheService.writes.push(args);
            await cacheWrite.promise;
        };

        const pendingSearch = searchService.searchBoards({ boardSize: 9 });
        const worker = await waitForWorker();
        worker.emit('message', {
            type: 'done',
            success: true,
            results: [{ units: ['A'] }]
        });

        const searchResponse = await pendingSearch;
        const cancelResponse = await searchService.cancelSearch();
        cacheWrite.resolve();

        assert.equal(searchResponse.success, true);
        assert.equal(searchResponse.cancelled, false);
        assert.deepEqual(searchResponse.results, [{ units: ['A'] }]);
        assert.equal(typeof searchResponse.searchId, 'number');
        assert.equal(cancelResponse.success, true);
    });

    it('keeps active search state until worker termination resolves', async () => {
        resetWorkers();
        const { searchService } = createSearchServiceUnderTest();
        const termination = createDeferred();

        const firstSearchPromise = searchService.searchBoards({ boardSize: 9 });
        const worker = await waitForWorker();
        worker.terminate = async () => {
            await termination.promise;
            worker.emit('exit', 0);
            return 0;
        };

        worker.emit('message', {
            type: 'done',
            success: true,
            results: [{ units: ['A'] }]
        });
        const firstResponse = await firstSearchPromise;
        assert.equal(firstResponse.success, true);

        const blockedSecondResponse = await searchService.searchBoards({ boardSize: 9 });
        assert.equal(blockedSecondResponse.success, false);
        assert.match(blockedSecondResponse.error, /already in progress/i);

        termination.resolve();
        await Promise.resolve();

        const thirdSearchPromise = searchService.searchBoards({ boardSize: 9 });
        const secondWorker = await waitForWorker(2);
        secondWorker.emit('message', {
            type: 'done',
            success: true,
            results: [{ units: ['B'] }]
        });
        const thirdResponse = await thirdSearchPromise;
        assert.equal(thirdResponse.success, true);
        assert.deepEqual(thirdResponse.results, [{ units: ['B'] }]);
    });
});
