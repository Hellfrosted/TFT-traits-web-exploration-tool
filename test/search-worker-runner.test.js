const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createSearchContext } = require('../main-process/search-service-state.js');
const { createSearchWorkerRunner } = require('../main-process/search-worker-runner.js');

class FakeWorker extends EventEmitter {
    constructor(workerPath, options) {
        super();
        this.workerPath = workerPath;
        this.options = options;
    }

    async terminate() {
        this.emit('exit', 0);
        return 0;
    }
}

describe('search worker runner', () => {
    it('forwards worker progress and resolves successful done messages', async () => {
        const progressPayloads = [];
        const cacheWrites = [];
        const runWorkerSearch = createSearchWorkerRunner({
            Worker: FakeWorker,
            workerPath: 'worker.js',
            ipcChannels: {
                SEARCH_PROGRESS: 'search-progress'
            },
            getMainWindow: () => ({
                isDestroyed: () => false,
                webContents: {
                    send: (_channel, payload) => {
                        progressPayloads.push(payload);
                    }
                }
            })
        });
        const searchContext = createSearchContext(7);

        const pendingResult = runWorkerSearch({
            searchContext,
            workerData: { params: { boardSize: 9 } },
            cacheService: {
                writeCache: async (...args) => {
                    cacheWrites.push(args);
                }
            },
            cacheKey: 'cache-key',
            searchFingerprint: 'fp1',
            normalizedParams: { boardSize: 9 },
            cleanup: () => {}
        });

        searchContext.worker.emit('message', {
            type: 'progress',
            pct: 25,
            checked: 5,
            total: 20
        });
        searchContext.worker.emit('message', {
            type: 'done',
            success: true,
            results: [{ units: ['A'] }]
        });

        const response = await pendingResult;

        assert.deepEqual(progressPayloads, [{
            searchId: 7,
            pct: 25,
            checked: 5,
            total: 20
        }]);
        assert.equal(response.success, true);
        assert.equal(response.searchId, 7);
        assert.deepEqual(response.results, [{ units: ['A'] }]);
        assert.equal(cacheWrites.length, 1);
    });

    it('returns a cancelled response when the search is cancelled before the worker starts', async () => {
        const runWorkerSearch = createSearchWorkerRunner({
            Worker: FakeWorker,
            workerPath: 'worker.js',
            ipcChannels: {
                SEARCH_PROGRESS: 'search-progress'
            },
            getMainWindow: () => null
        });
        const searchContext = createSearchContext(3);
        searchContext.cancelled = true;

        const response = await runWorkerSearch({
            searchContext,
            workerData: { params: { boardSize: 9 } },
            cacheService: {
                writeCache: async () => {}
            },
            cacheKey: 'cache-key',
            searchFingerprint: 'fp1',
            normalizedParams: { boardSize: 9 },
            cleanup: () => {}
        });

        assert.equal(response.cancelled, true);
        assert.equal(response.searchId, 3);
    });

    it('fails cleanly when the worker exits without posting a done message', async () => {
        const runWorkerSearch = createSearchWorkerRunner({
            Worker: FakeWorker,
            workerPath: 'worker.js',
            ipcChannels: {
                SEARCH_PROGRESS: 'search-progress'
            },
            getMainWindow: () => null
        });
        const searchContext = createSearchContext(11);

        const pendingResult = runWorkerSearch({
            searchContext,
            workerData: { params: { boardSize: 9 } },
            cacheService: {
                writeCache: async () => {}
            },
            cacheKey: 'cache-key',
            searchFingerprint: 'fp1',
            normalizedParams: { boardSize: 9 },
            cleanup: () => {}
        });

        searchContext.worker.emit('exit', 0);
        const response = await pendingResult;

        assert.equal(response.success, false);
        assert.match(response.error, /exited before returning a result/i);
    });
});
