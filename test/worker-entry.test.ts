const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const { mockDataCache, createBaseSearchParams } = require('./fixtures/engine-fixtures.js');

function waitForWorkerMessage(worker): Promise<LooseRecord> {
    return new Promise((resolve, reject) => {
        const handleMessage = (message) => {
            if (message?.type === 'progress') {
                return;
            }
            worker.off('message', handleMessage);
            resolve(message);
        };
        worker.on('message', handleMessage);
        worker.once('error', reject);
    });
}

describe('worker entrypoint', () => {
    it('executes the actual worker and returns a done payload', async () => {
        const workerPath = path.join(__dirname, '..', 'worker.js');
        const worker = new Worker(workerPath, {
            workerData: {
                dataCache: mockDataCache,
                params: createBaseSearchParams()
            }
        });

        try {
            const message = await waitForWorkerMessage(worker);
            assert.equal(message.type, 'done');
            assert.equal(message.success, true);
            assert.ok(Array.isArray(message.results));
        } finally {
            await worker.terminate();
        }
    });

    it('reports worker-side failures through the done payload', async () => {
        const workerPath = path.join(__dirname, '..', 'worker.js');
        const worker = new Worker(workerPath, {
            workerData: {
                dataCache: null,
                params: {}
            }
        });

        try {
            const message = await waitForWorkerMessage(worker);
            assert.equal(message.type, 'done');
            assert.equal(message.success, false);
            assert.match(String(message.error || ''), /TypeError|Error/);
        } finally {
            await worker.terminate();
        }
    });
});
