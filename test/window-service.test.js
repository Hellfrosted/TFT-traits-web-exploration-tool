const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createWindowService } = require('../main-process/window-service.js');

function createWindowServiceUnderTest({
    executeJavaScriptImpl,
    smokeTimeoutMs = 20000
} = {}) {
    const app = {
        exitCalls: [],
        exit(code) {
            this.exitCalls.push(code);
        }
    };
    const listeners = {};
    const webContents = {
        executeJavaScript: executeJavaScriptImpl || (async () => ({
            hasElectronAPI: true,
            missingMethods: [],
            missingIds: [],
            preloadFailureText: false
        })),
        on(eventName, handler) {
            listeners[eventName] = handler;
        },
        send: () => {}
    };
    const window = {
        webContents,
        isDestroyed: () => false,
        setMenuBarVisibility: () => {},
        loadFile: () => {}
    };

    function BrowserWindow() {
        return window;
    }

    const service = createWindowService({
        app,
        BrowserWindow,
        preloadPath: 'preload.js',
        ipcChannels: {
            MAIN_PROCESS_ERROR: 'main-process-error'
        },
        isSmokeTest: true,
        smokeTimeoutMs
    });

    return {
        service,
        app,
        listeners
    };
}

describe('window service smoke test', () => {
    it('waits for the renderer inspection promise before finishing the smoke test', async () => {
        let resolveInspection;
        const inspectionPromise = new Promise((resolve) => {
            resolveInspection = resolve;
        });
        const { service, app, listeners } = createWindowServiceUnderTest({
            executeJavaScriptImpl: async () => await inspectionPromise
        });

        service.createWindow();
        listeners['did-finish-load']();

        await Promise.resolve();
        assert.deepEqual(app.exitCalls, []);

        resolveInspection({
            hasElectronAPI: true,
            missingMethods: [],
            missingIds: [],
            preloadFailureText: false
        });

        await new Promise((resolve) => setTimeout(resolve, 75));
        assert.deepEqual(app.exitCalls, [0]);
    });
});
