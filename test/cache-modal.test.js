const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList() {
    const classes = new Set();
    return {
        add: (...tokens) => tokens.forEach((token) => classes.add(token)),
        remove: (...tokens) => tokens.forEach((token) => classes.delete(token)),
        contains: (token) => classes.has(token)
    };
}

function createElement(id) {
    const listeners = new Map();
    return {
        id,
        innerHTML: '',
        dataset: {},
        classList: createClassList(),
        addEventListener(eventName, handler) {
            if (!listeners.has(eventName)) {
                listeners.set(eventName, []);
            }
            listeners.get(eventName).push(handler);
        },
        async dispatch(eventName, payload = {}) {
            const handlers = listeners.get(eventName) || [];
            for (const handler of handlers) {
                await handler({
                    target: payload.target || this,
                    ...payload
                });
            }
        },
        querySelectorAll() {
            return [];
        }
    };
}

function loadCacheModalFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'components', 'cacheModal.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'components/cacheModal.js' });
    return sandbox.window.TFTRenderer.createCacheModal;
}

function createHarness() {
    const modal = createElement('cacheModal');
    const modalBody = createElement('cacheModalBody');
    const closeButton = createElement('cacheModalClose');
    const doneButton = createElement('cacheModalDone');
    const manageButton = createElement('manageCacheBtn');
    const clearAllButton = createElement('clearAllCacheBtn');

    const elements = {
        cacheModal: modal,
        cacheModalBody: modalBody,
        cacheModalClose: closeButton,
        cacheModalDone: doneButton,
        manageCacheBtn: manageButton,
        clearAllCacheBtn: clearAllButton
    };

    const sandbox = {
        console,
        document: {
            getElementById: (id) => elements[id] || null
        },
        window: {
            TFTRenderer: {
                shared: {
                    escapeHtml: (value) => String(value ?? ''),
                    summarizeParams: (params) => JSON.stringify(params || {}),
                    formatTimestamp: (value) => String(value ?? '-')
                }
            }
        }
    };

    return {
        sandbox,
        elements
    };
}

describe('cache modal factory', () => {
    it('uses app.history.updateHistoryList when cache clear succeeds', async () => {
        const { sandbox, elements } = createHarness();
        const createCacheModal = loadCacheModalFactory(sandbox);
        let historyRefreshCalls = 0;
        let legacyGlobalRefreshCalls = 0;
        sandbox.window.updateHistoryList = () => {
            legacyGlobalRefreshCalls += 1;
        };

        const app = {
            shared: sandbox.window.TFTRenderer.shared,
            state: {
                dependencies: {
                    showAlert: async () => true,
                    showConfirm: async () => true
                },
                electronBridge: {
                    listCache: async () => ({ success: true, entries: [] }),
                    clearAllCache: async () => ({ success: true })
                }
            },
            history: {
                updateHistoryList: () => {
                    historyRefreshCalls += 1;
                }
            },
            queryUi: {
                setStatusMessage: () => {}
            }
        };

        const cacheModal = createCacheModal(app);
        assert.equal(cacheModal.start(), true);

        await elements.clearAllCacheBtn.dispatch('click');

        assert.equal(historyRefreshCalls, 1);
        assert.equal(legacyGlobalRefreshCalls, 0);
    });

    it('shows a controlled alert when bridge methods are unavailable', async () => {
        const { sandbox, elements } = createHarness();
        const createCacheModal = loadCacheModalFactory(sandbox);
        const alerts = [];

        const app = {
            shared: sandbox.window.TFTRenderer.shared,
            state: {
                dependencies: {
                    showAlert: async (message) => {
                        alerts.push(message);
                        return true;
                    },
                    showConfirm: async () => true
                },
                electronBridge: {
                    listCache: async () => ({ success: true, entries: [] })
                }
            },
            history: {
                updateHistoryList: () => {}
            },
            queryUi: {
                setStatusMessage: () => {}
            }
        };

        const cacheModal = createCacheModal(app);
        assert.equal(cacheModal.start(), true);

        await elements.clearAllCacheBtn.dispatch('click');

        assert.deepEqual(alerts, ['Electron preload bridge is unavailable.']);
    });
});
