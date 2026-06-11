const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const Engine = require('../engine.js');
const { buildSearchBenchmarkData, searchBenchmarkParams } = require('./search-benchmark-scenario.js');

function summarizeTimes(times) {
    const sorted = [...times].sort((left, right) => left - right);
    const total = sorted.reduce((sum, duration) => sum + duration, 0);
    return {
        minMs: sorted[0],
        medianMs: sorted[Math.floor(sorted.length / 2)],
        avgMs: total / sorted.length,
        maxMs: sorted[sorted.length - 1]
    };
}

function digestResults(results) {
    return crypto.createHash('sha256').update(JSON.stringify(results)).digest('hex');
}

function runSearchBenchmark({ warmups = 2, runs = 5 } = {}) {
    const dataCache = buildSearchBenchmarkData();

    for (let index = 0; index < warmups; index++) {
        Engine.search(dataCache, searchBenchmarkParams);
    }

    const times = [];
    let digest = '';
    let resultCount = 0;
    for (let index = 0; index < runs; index++) {
        const startedAt = performance.now();
        const results = Engine.search(dataCache, searchBenchmarkParams);
        times.push(performance.now() - startedAt);
        digest = digestResults(results);
        resultCount = results.length;
    }

    return {
        scenario: 'generated-30-units-board-7-top-500',
        runs,
        resultCount,
        digest,
        ...summarizeTimes(times),
        timesMs: times
    };
}

if (require.main === module) {
    console.log(JSON.stringify(runSearchBenchmark(), null, 2));
}

module.exports = {
    digestResults,
    runSearchBenchmark
};
