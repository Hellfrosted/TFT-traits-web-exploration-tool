const { parentPort, workerData } = require('worker_threads');
const Engine = require('./engine.js');

try {
    const onProgress = (pct, checked, total) => {
        parentPort.postMessage({ type: 'progress', pct, checked, total });
    };

    const results = Engine.search(
        workerData.dataCache,
        workerData.params,
        onProgress,
        workerData.preparedSearchContext || null
    );
    parentPort.postMessage({ type: 'done', success: true, results });
} catch (e) {
    parentPort.postMessage({ type: 'done', success: false, error: e.toString() });
}
