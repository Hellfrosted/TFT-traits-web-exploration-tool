const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createWindowService } = require('../main-process/window-service.js');

function createWindowServiceUnderTest({
    executeJavaScriptImpl,
    smokeTimeoutMs = 20000
} = {}) {
    const app = {
        exitCalls: [],
        exitResolvers: [],
        exit(code) {
            this.exitCalls.push(code);
            while (this.exitResolvers.length > 0) {
                this.exitResolvers.shift()(code);
            }
        },
        waitForExit() {
            return new Promise((resolve) => {
                this.exitResolvers.push(resolve);
            });
        }
    };
    const listeners = {};
    let windowOpenHandler = null;
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
        setWindowOpenHandler(handler) {
            windowOpenHandler = handler;
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
        listeners,
        getWindowOpenHandler: () => windowOpenHandler
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

        await app.waitForExit();
        assert.deepEqual(app.exitCalls, [0]);
    });

    it('denies popup creation and blocks window navigation', () => {
        const { service, listeners, getWindowOpenHandler } = createWindowServiceUnderTest();

        service.createWindow();

        assert.equal(getWindowOpenHandler()().action, 'deny');

        let prevented = false;
        listeners['will-navigate']({
            preventDefault() {
                prevented = true;
            }
        });

        assert.equal(prevented, true);
    });
});
