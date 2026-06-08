const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../engine.js');
const {
    digestResults
} = require('../tools/benchmark-search.js');
const {
    buildSearchBenchmarkData,
    searchBenchmarkParams
} = require('../tools/search-benchmark-scenario.js');

describe('search performance golden scenario', () => {
    it('preserves representative large-search results while optimizing', () => {
        const results = Engine.search(buildSearchBenchmarkData(), searchBenchmarkParams);

        assert.equal(results.length, 500);
        assert.equal(
            digestResults(results),
            'fec77ea553e8a3f0e2e083ddce75dfb884128bb881c9e5fe9ff556bd123dbde3'
        );
    });
});
