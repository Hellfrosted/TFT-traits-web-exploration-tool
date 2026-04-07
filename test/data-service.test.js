const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createDataService } = require('../main-process/data-service.js');

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function createParsedData({ source, fingerprint, unitId }) {
    return {
        dataSource: source,
        units: [{ id: unitId, displayName: unitId }],
        traits: ['TraitA'],
        roles: ['Carry'],
        traitBreakpoints: {},
        traitIcons: {},
        assetValidation: null,
        hashMap: {},
        setNumber: '17',
        dataFingerprint: fingerprint,
        snapshotFetchedAt: null,
        usedCachedSnapshot: false
    };
}

describe('main-process data service', () => {
    it('prevents stale out-of-order fetch completions from overwriting shared dataCache', async () => {
        const pendingFetches = [];
        const pruneCalls = [];
        const dataService = createDataService({
            dataEngine: {
                normalizeDataSource: (source) => source,
                fetchAndParse: async ({ source }) => await new Promise((resolve) => {
                    pendingFetches.push({ source, resolve });
                })
            },
            cacheService: {
                readDataFallback: async () => null,
                writeDataFallback: async () => {},
                pruneCache: async (fingerprint) => {
                    pruneCalls.push(fingerprint);
                }
            },
            defaultDataSource: 'pbe'
        });

        const olderFetchPromise = dataService.fetchData('pbe');
        const newerFetchPromise = dataService.fetchData('latest');

        pendingFetches[1].resolve(createParsedData({
            source: 'latest',
            fingerprint: 'newer-fingerprint',
            unitId: 'NewerUnit'
        }));
        const newerResponse = await newerFetchPromise;

        pendingFetches[0].resolve(createParsedData({
            source: 'pbe',
            fingerprint: 'older-fingerprint',
            unitId: 'OlderUnit'
        }));
        const olderResponse = await olderFetchPromise;

        assert.equal(newerResponse.dataFingerprint, 'newer-fingerprint');
        assert.equal(olderResponse.dataFingerprint, 'older-fingerprint');
        assert.equal(dataService.getDataCache().dataFingerprint, 'newer-fingerprint');
        assert.deepEqual(pruneCalls, ['newer-fingerprint']);
    });

    it('does not allow an older successful fetch to commit when a newer fetch was requested', async () => {
        const pendingFetches = [];
        const pruneCalls = [];
        const dataService = createDataService({
            dataEngine: {
                normalizeDataSource: (source) => source,
                fetchAndParse: async ({ source }) => {
                    const deferred = createDeferred();
                    pendingFetches.push({ source, ...deferred });
                    return await deferred.promise;
                }
            },
            cacheService: {
                readDataFallback: async () => null,
                writeDataFallback: async () => {},
                pruneCache: async (fingerprint) => {
                    pruneCalls.push(fingerprint);
                }
            },
            defaultDataSource: 'pbe'
        });

        dataService.setDataCache(createParsedData({
            source: 'pbe',
            fingerprint: 'baseline-fingerprint',
            unitId: 'BaselineUnit'
        }));

        const olderFetchPromise = dataService.fetchData('pbe');
        const newerFetchPromise = dataService.fetchData('latest');

        pendingFetches[1].reject(new Error('Network timeout'));
        await assert.rejects(newerFetchPromise, /Network timeout/);

        pendingFetches[0].resolve(createParsedData({
            source: 'pbe',
            fingerprint: 'older-fingerprint',
            unitId: 'OlderUnit'
        }));
        const olderResponse = await olderFetchPromise;

        assert.equal(olderResponse.dataFingerprint, 'older-fingerprint');
        assert.equal(dataService.getDataCache().dataFingerprint, 'baseline-fingerprint');
        assert.deepEqual(pruneCalls, []);
    });

    it('prevents an older fetch from overwriting the fallback snapshot for the same source', async () => {
        const pendingFetches = [];
        const writeFallbackCalls = [];

        const dataService = createDataService({
            dataEngine: {
                normalizeDataSource: (source) => source,
                fetchAndParse: async (options) => {
                    const deferred = createDeferred();
                    pendingFetches.push({ source: options.source, writeFallback: options.writeFallback, ...deferred });
                    return await deferred.promise;
                }
            },
            cacheService: {
                readDataFallback: async () => null,
                writeDataFallback: async (source, data) => {
                    writeFallbackCalls.push({ source, fingerprint: data.dataFingerprint });
                },
                pruneCache: async () => {}
            },
            defaultDataSource: 'pbe'
        });

        const olderFetchPromise = dataService.fetchData('pbe');
        const newerFetchPromise = dataService.fetchData('pbe');

        // Newer fetch (index 1) completes first and writes its fallback.
        await pendingFetches[1].writeFallback({ dataFingerprint: 'newer-fingerprint' });
        pendingFetches[1].resolve(createParsedData({ source: 'pbe', fingerprint: 'newer-fingerprint', unitId: 'NewerUnit' }));
        await newerFetchPromise;

        // Older fetch (index 0) finishes late and attempts to write its fallback.
        await pendingFetches[0].writeFallback({ dataFingerprint: 'older-fingerprint' });
        pendingFetches[0].resolve(createParsedData({ source: 'pbe', fingerprint: 'older-fingerprint', unitId: 'OlderUnit' }));
        await olderFetchPromise;

        // Only the newer fetch's fallback write should have reached cacheService.
        assert.deepEqual(writeFallbackCalls, [{ source: 'pbe', fingerprint: 'newer-fingerprint' }]);
    });

    it('allows overlapping fetches for different sources to refresh their own fallback snapshots', async () => {
        const pendingFetches = [];
        const writeFallbackCalls = [];

        const dataService = createDataService({
            dataEngine: {
                normalizeDataSource: (source) => source,
                fetchAndParse: async (options) => {
                    const deferred = createDeferred();
                    pendingFetches.push({ source: options.source, writeFallback: options.writeFallback, ...deferred });
                    return await deferred.promise;
                }
            },
            cacheService: {
                readDataFallback: async () => null,
                writeDataFallback: async (source, data) => {
                    writeFallbackCalls.push({ source, fingerprint: data.dataFingerprint });
                },
                pruneCache: async () => {}
            },
            defaultDataSource: 'pbe'
        });

        const pbeFetchPromise = dataService.fetchData('pbe');
        const latestFetchPromise = dataService.fetchData('latest');

        await pendingFetches[1].writeFallback({ dataFingerprint: 'latest-fingerprint' });
        pendingFetches[1].resolve(createParsedData({ source: 'latest', fingerprint: 'latest-fingerprint', unitId: 'LatestUnit' }));
        await latestFetchPromise;

        await pendingFetches[0].writeFallback({ dataFingerprint: 'pbe-fingerprint' });
        pendingFetches[0].resolve(createParsedData({ source: 'pbe', fingerprint: 'pbe-fingerprint', unitId: 'PbeUnit' }));
        await pbeFetchPromise;

        assert.deepEqual(writeFallbackCalls, [
            { source: 'latest', fingerprint: 'latest-fingerprint' },
            { source: 'pbe', fingerprint: 'pbe-fingerprint' }
        ]);
    });
});
