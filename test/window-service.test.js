const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createWindowService } = require('../main-process/window-service.js');
const { RENDERER_CONTRACT } = require('../bridge-contract.js');

function createWindowServiceUnderTest({
    executeJavaScriptImpl,
    smokeTimeoutMs = 20000
} = {}) {
    const EXIT_TIMEOUT_MS = 500;
    const app = {
        exitCalls: [],
        exitResolvers: [],
        exit(code) {
            this.exitCalls.push(code);
            while (this.exitResolvers.length > 0) {
                this.exitResolvers.shift()(code);
            }
        },
        waitForExit(timeoutMs = EXIT_TIMEOUT_MS) {
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error(`Timed out waiting for app.exit() after ${timeoutMs}ms.`));
                }, timeoutMs);

                this.exitResolvers.push((code) => {
                    clearTimeout(timeoutId);
                    resolve(code);
                });
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
    let browserWindowOptions = null;

    function BrowserWindow(options) {
        browserWindowOptions = options;
        return window;
    }

    const service = createWindowService({
        app,
        BrowserWindow,
        preloadPath: 'preload.js',
        iconPath: 'assets/app-icon.ico',
        ipcChannels: {
            MAIN_PROCESS_ERROR: 'main-process-error'
        },
        rendererContract: RENDERER_CONTRACT,
        isSmokeTest: true,
        smokeTimeoutMs
    });

    return {
        service,
        app,
        listeners,
        getWindowOpenHandler: () => windowOpenHandler,
        getBrowserWindowOptions: () => browserWindowOptions
    };
}

describe('window service smoke test', () => {
    it('uses explicit renderer readiness signals instead of tight polling loops', async () => {
        let inspectionScript = '';
        const { service, app, listeners } = createWindowServiceUnderTest({
            executeJavaScriptImpl: async (script) => {
                inspectionScript = script;
                return {
                    hasElectronAPI: true,
                    missingMethods: [],
                    missingIds: [],
                    preloadFailureText: false
                };
            }
        });

        service.createWindow();
        listeners['did-finish-load']();
        await app.waitForExit();

        assert.match(inspectionScript, /tft-renderer-ready/);
        assert.match(inspectionScript, /MutationObserver/);
        assert.doesNotMatch(inspectionScript, /setTimeout\(inspect, 50\)/);
    });

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
        const { service, listeners, getWindowOpenHandler, getBrowserWindowOptions } = createWindowServiceUnderTest();

        service.createWindow();

        assert.equal(getBrowserWindowOptions().icon, 'assets/app-icon.ico');
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
