const { Bench } = require('tinybench');
const { withCodSpeed } = require('@codspeed/tinybench-plugin');

const Engine = require('../engine.js');
const { buildSearchBenchmarkData, searchBenchmarkParams } = require('../tools/search-benchmark-scenario.js');

// Pre-build the data caches once so the benchmark measures the search engine
// itself rather than the synthetic scenario setup.
const smallDataCache = buildSearchBenchmarkData(12);
const mediumDataCache = buildSearchBenchmarkData(14);
const largeDataCache = buildSearchBenchmarkData(16);

async function main() {
    const bench = withCodSpeed(new Bench({ time: 100 }));

    bench
        .add('search - 12 units, board 7, top 500', () => {
            Engine.search(smallDataCache, searchBenchmarkParams);
        })
        .add('search - 14 units, board 7, top 500', () => {
            Engine.search(mediumDataCache, searchBenchmarkParams);
        })
        .add('search - 16 units, board 7, top 500', () => {
            Engine.search(largeDataCache, searchBenchmarkParams);
        })
        .add('countSearchSpaceCandidates - 16 units', () => {
            Engine.countSearchSpaceCandidates(largeDataCache, searchBenchmarkParams);
        });

    await bench.run();

    console.table(bench.table());
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
