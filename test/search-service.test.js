const { afterEach, describe, it } = require('node:test');
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

const TEST_TIMEOUT_MS = 250;

function resetWorkers() {
    FakeWorker.instances.length = 0;
    FakeWorker.waiters.length = 0;
}

afterEach(() => {
    resetWorkers();
});

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function waitForWorker(count = 1) {
    if (FakeWorker.instances.length >= count) {
        return FakeWorker.instances[count - 1];
    }

    let timeoutId;
    await Promise.race([
        new Promise((resolve) => {
            FakeWorker.waiters.push(resolve);
        }),
        new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Timed out waiting for ${count} worker instance(s).`));
            }, TEST_TIMEOUT_MS);
        })
    ]);
    if (timeoutId) {
        clearTimeout(timeoutId);
    }

    if (FakeWorker.instances.length >= count) {
        return FakeWorker.instances[count - 1];
    }

    assert.fail(`Expected ${count} worker instance(s), found ${FakeWorker.instances.length}.`);
}

function createCacheService({ cachedResults = null, readCacheImpl = null } = {}) {
    const writes = [];
    const cacheKeyParams = [];
    const preparedContextParams = [];
    return {
        writes,
        cacheKeyParams,
        preparedContextParams,
        getCacheKey: (_dataFingerprint, params) => {
            cacheKeyParams.push(params);
            return 'cache-key';
        },
        getPreparedSearchContext: (_dataCache, params) => {
            preparedContextParams.push(params);
            return { preparedContext: { prepared: true } };
        },
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
    const getDataCache = options.getDataCache || (() => ({
        dataFingerprint: 'fingerprint-1',
        units: []
    }));
    const normalizeSearchParams = options.normalizeSearchParams || ((params) => ({ ...params }));
    const normalizeSearchParamsForData = options.normalizeSearchParamsForData || ((params) => ({ ...params }));
    const serializeSearchParams = options.serializeSearchParams || ((params) => JSON.stringify(params));
    const engine = options.engine || {
        getCombinationCount: () => ({ count: 25, remainingSlots: 2 })
    };
    const searchService = createSearchService({
        engine,
        normalizeSearchParams,
        normalizeSearchParamsForData,
        serializeSearchParams,
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
        getDataCache
    });

    return {
        searchService,
        cacheService,
        progressMessages
    };
}

describe('main-process search service', () => {
    it('uses dataset-aware canonical params for estimates and worker searches', async () => {
        resetWorkers();
        const canonicalParams = {
            boardSize: 9,
            maxResults: 50,
            mustInclude: ['KnownUnit'],
            mustExclude: [],
            mustIncludeTraits: ['KnownTrait'],
            mustExcludeTraits: [],
            tankRoles: ['Tank'],
            carryRoles: ['Carry'],
            extraEmblems: [],
            variantLocks: { KnownUnit: 'known-mode' },
            onlyActive: true,
            tierRank: true,
            includeUnique: false
        };
        const { searchService, cacheService } = createSearchServiceUnderTest({
            normalizeSearchParamsForData: () => canonicalParams
        });

        const estimate = await searchService.getSearchEstimate({
            mustInclude: ['UnknownUnit']
        });
        assert.deepEqual(estimate, { count: 25, remainingSlots: 2 });
        assert.deepEqual(cacheService.cacheKeyParams[0], canonicalParams);
        assert.deepEqual(cacheService.preparedContextParams[0], canonicalParams);

        const pendingSearch = searchService.searchBoards({
            mustInclude: ['UnknownUnit']
        });
        const worker = await waitForWorker();
        assert.deepEqual(worker.options.workerData.params, canonicalParams);
        worker.emit('message', {
            type: 'done',
            success: true,
            results: [{ units: ['A'] }]
        });
        const searchResponse = await pendingSearch;
        assert.equal(searchResponse.success, true);
    });

    it('returns normalized payload metadata for renderer-side query comparison', () => {
        const canonicalParams = {
            boardSize: 9,
            maxResults: 500
        };
        const { searchService } = createSearchServiceUnderTest({
            normalizeSearchParamsForData: () => canonicalParams,
            serializeSearchParams: () => '{"boardSize":9,"maxResults":500}',
            getDataCache: () => ({
                dataFingerprint: 'fingerprint-9',
                units: []
            })
        });

        const payload = searchService.normalizePayload({
            boardSize: '9',
            maxResults: '500'
        });

        assert.deepEqual(payload, {
            params: canonicalParams,
            comparisonKey: '{"boardSize":9,"maxResults":500}',
            dataFingerprint: 'fingerprint-9'
        });
    });

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

    it('allows a new search immediately after cancelling before the worker starts', async () => {
        resetWorkers();
        const firstCacheRead = createDeferred();
        let cacheReadCount = 0;
        const { searchService } = createSearchServiceUnderTest({
            readCacheImpl: () => {
                cacheReadCount += 1;
                return cacheReadCount === 1 ? firstCacheRead.promise : Promise.resolve(null);
            }
        });

        const firstSearch = searchService.searchBoards({ boardSize: 9 });
        const cancelResponse = await searchService.cancelSearch();
        const secondSearch = searchService.searchBoards({ boardSize: 9 });
        const worker = await waitForWorker();

        assert.equal(cancelResponse.success, true);
        assert.equal(searchService.hasActiveSearch(), true);

        worker.emit('message', {
            type: 'done',
            success: true,
            results: [{ units: ['B'] }]
        });

        firstCacheRead.resolve(null);

        const firstResponse = await firstSearch;
        const secondResponse = await secondSearch;

        assert.equal(firstResponse.cancelled, true);
        assert.equal(typeof firstResponse.searchId, 'number');
        assert.equal(secondResponse.success, true);
        assert.deepEqual(secondResponse.results, [{ units: ['B'] }]);
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

    it('allows a new search immediately after a successful result while cache persistence is still running', async () => {
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

        const firstResponse = await pendingSearch;
        const secondSearch = searchService.searchBoards({ boardSize: 9 });
        const secondWorker = await waitForWorker(2);
        secondWorker.emit('message', {
            type: 'done',
            success: true,
            results: [{ units: ['B'] }]
        });
        const secondResponse = await secondSearch;

        cacheWrite.resolve();

        assert.equal(firstResponse.success, true);
        assert.equal(firstResponse.cancelled, false);
        assert.deepEqual(firstResponse.results, [{ units: ['A'] }]);
        assert.equal(typeof firstResponse.searchId, 'number');
        assert.equal(secondResponse.success, true);
        assert.deepEqual(secondResponse.results, [{ units: ['B'] }]);
    });

    it('releases active search state before worker termination finishes after a completed result', async () => {
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

        const secondSearchPromise = searchService.searchBoards({ boardSize: 9 });
        const secondWorker = await waitForWorker(2);
        secondWorker.emit('message', {
            type: 'done',
            success: true,
            results: [{ units: ['B'] }]
        });
        const secondResponse = await secondSearchPromise;

        assert.equal(secondResponse.success, true);
        assert.deepEqual(secondResponse.results, [{ units: ['B'] }]);

        termination.resolve();
        await Promise.resolve();
    });
});
