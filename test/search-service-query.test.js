const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createSearchServiceQuery } = require('../main-process/search-service-query.js');

describe('search service query helpers', () => {
    it('normalizes payloads against active data and includes comparison metadata', () => {
        const query = createSearchServiceQuery({
            normalizeSearchParams: (params) => ({ ...params, normalized: 'fallback' }),
            normalizeForData: (params, dataCache) => ({ ...params, normalized: dataCache.dataFingerprint }),
            serializeForComparison: (params) => JSON.stringify(params),
            cacheService: {},
            engine: {},
            getDataCache: () => ({
                dataFingerprint: 'fingerprint-1'
            })
        });

        assert.deepEqual(query.normalizeForActiveData({ boardSize: 9 }), {
            boardSize: 9,
            normalized: 'fingerprint-1'
        });
        assert.deepEqual(query.normalizePayload({ boardSize: 9 }), {
            params: {
                boardSize: 9,
                normalized: 'fingerprint-1'
            },
            comparisonKey: '{"boardSize":9,"normalized":"fingerprint-1"}',
            dataFingerprint: 'fingerprint-1'
        });
    });

    it('reuses cached estimates and computes new ones when needed', async () => {
        const cacheKeyCalls = [];
        const preparedCalls = [];
        const setEstimateCalls = [];
        const query = createSearchServiceQuery({
            normalizeSearchParams: (params) => params,
            normalizeForData: (params) => ({ ...params, canonical: true }),
            serializeForComparison: JSON.stringify,
            cacheService: {
                getPreparedSearchContextKey(dataFingerprint, params) {
                    cacheKeyCalls.push({ dataFingerprint, params });
                    return 'estimate-key';
                },
                getCachedEstimate() {
                    return null;
                },
                getPreparedSearchContext(dataCache, params) {
                    preparedCalls.push({ dataCache, params });
                    return { preparedContext: { prepared: true } };
                },
                setCachedEstimate(key, estimate) {
                    setEstimateCalls.push({ key, estimate });
                    return estimate;
                }
            },
            engine: {
                getCombinationCount(dataCache, params, preparedContext) {
                    return {
                        count: dataCache.units.length + (preparedContext.prepared ? 1 : 0),
                        remainingSlots: params.boardSize
                    };
                }
            },
            getDataCache: () => ({
                dataFingerprint: 'fp-1',
                units: ['A', 'B']
            })
        });

        const estimate = await query.getSearchEstimate({ boardSize: 7 });

        assert.deepEqual(estimate, { count: 3, remainingSlots: 7 });
        assert.deepEqual(cacheKeyCalls, [{
            dataFingerprint: 'fp-1',
            params: { boardSize: 7, canonical: true }
        }]);
        assert.deepEqual(preparedCalls, [{
            dataCache: { dataFingerprint: 'fp-1', units: ['A', 'B'] },
            params: { boardSize: 7, canonical: true }
        }]);
        assert.deepEqual(setEstimateCalls, [{
            key: 'estimate-key',
            estimate: { count: 3, remainingSlots: 7 }
        }]);
    });

    it('reuses cached estimates when only result-limiting params change', async () => {
        const cachedEstimates = new Map();
        let combinationCountCalls = 0;
        let preparedCalls = 0;
        const query = createSearchServiceQuery({
            normalizeSearchParams: (params) => params,
            normalizeForData: (params) => ({ ...params, canonical: true }),
            serializeForComparison: JSON.stringify,
            cacheService: {
                getPreparedSearchContextKey(_dataFingerprint, params) {
                    return JSON.stringify({
                        boardSize: params.boardSize,
                        mustInclude: params.mustInclude || [],
                        canonical: params.canonical
                    });
                },
                getCachedEstimate(key) {
                    return cachedEstimates.get(key) || null;
                },
                getPreparedSearchContext() {
                    preparedCalls += 1;
                    return { preparedContext: { prepared: true } };
                },
                setCachedEstimate(key, estimate) {
                    cachedEstimates.set(key, estimate);
                    return estimate;
                }
            },
            engine: {
                getCombinationCount() {
                    combinationCountCalls += 1;
                    return { count: 42, remainingSlots: 3 };
                }
            },
            getDataCache: () => ({
                dataFingerprint: 'fp-1',
                units: ['A', 'B']
            })
        });

        const firstEstimate = await query.getSearchEstimate({
            boardSize: 7,
            maxResults: 10,
            mustInclude: ['A']
        });
        const secondEstimate = await query.getSearchEstimate({
            boardSize: 7,
            maxResults: 500,
            mustInclude: ['A']
        });

        assert.deepEqual(firstEstimate, { count: 42, remainingSlots: 3 });
        assert.deepEqual(secondEstimate, { count: 42, remainingSlots: 3 });
        assert.equal(preparedCalls, 1);
        assert.equal(combinationCountCalls, 1);
    });
});
