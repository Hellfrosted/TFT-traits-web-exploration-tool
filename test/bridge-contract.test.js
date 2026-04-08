const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bridgeContract = require('../bridge-contract.js');
const constants = require('../constants.js');

function loadPreloadBridge() {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'preload.js'),
        'utf8'
    );
    let exposedApi = null;
    const invokeCalls = [];
    const sandbox = {
        process: {
            argv: []
        },
        require: (name) => {
            if (name === 'electron') {
                return {
                    contextBridge: {
                        exposeInMainWorld: (_key, api) => {
                            exposedApi = api;
                        }
                    },
                    ipcRenderer: {
                        invoke: (...args) => {
                            invokeCalls.push(args);
                            return Promise.resolve();
                        },
                        on: () => {},
                        removeListener: () => {}
                    }
                };
            }
            if (name === './bridge-contract.js') {
                return bridgeContract;
            }
            throw new Error(`Unexpected preload dependency: ${name}`);
        }
    };

    vm.runInNewContext(source, sandbox, { filename: 'preload.js' });
    return {
        preloadBridge: exposedApi,
        invokeCalls
    };
}

function toPlainData(value) {
    return JSON.parse(JSON.stringify(value));
}

describe('shared bridge contract', () => {
    it('re-exports the preload/main contract through constants.js without drift', () => {
        assert.deepEqual(constants.IPC_CHANNELS, bridgeContract.IPC_CHANNELS);
        assert.deepEqual(constants.DATA_SOURCES, bridgeContract.DATA_SOURCES);
        assert.equal(constants.DEFAULT_DATA_SOURCE, bridgeContract.DEFAULT_DATA_SOURCE);
        assert.deepEqual(constants.LIMITS, bridgeContract.LIMITS);
        assert.equal(constants.SMOKE_TEST_FLAG, bridgeContract.SMOKE_TEST_FLAG);
        assert.deepEqual(constants.RENDERER_CONTRACT, bridgeContract.RENDERER_CONTRACT);
    });

    it('keeps the self-contained preload bridge aligned with the shared contract', () => {
        const { preloadBridge, invokeCalls } = loadPreloadBridge();

        assert.deepEqual(toPlainData(preloadBridge.dataSources), bridgeContract.DATA_SOURCES);
        assert.equal(preloadBridge.defaultDataSource, bridgeContract.DEFAULT_DATA_SOURCE);
        assert.deepEqual(toPlainData(preloadBridge.limits), bridgeContract.LIMITS);
        assert.deepEqual(toPlainData(preloadBridge.rendererContract), bridgeContract.RENDERER_CONTRACT);
        assert.equal(typeof preloadBridge.normalizeSearchParams, 'function');
        assert.equal(
            bridgeContract.RENDERER_CONTRACT.requiredBridgeMethods.includes('normalizeSearchParams'),
            true
        );

        preloadBridge.normalizeSearchParams({ boardSize: 9 });
        assert.equal(invokeCalls.length, 1);
        assert.deepEqual(invokeCalls[0], [bridgeContract.IPC_CHANNELS.NORMALIZE_SEARCH_PARAMS, { boardSize: 9 }]);
    });
});
