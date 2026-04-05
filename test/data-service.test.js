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
});
