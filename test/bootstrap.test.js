const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBootstrapFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'bootstrap.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/bootstrap.js' });
    return sandbox.window.TFTRenderer.createBootstrap;
}

function reportRendererIssue(app, reporterState, issueKey, options = {}) {
    if (reporterState && issueKey) {
        if (reporterState[issueKey]) {
            return false;
        }
        reporterState[issueKey] = true;
    }

    const consoleMethod = app.__testConsoleError || (() => {});
    if (options.consoleDetail !== null && options.consoleDetail !== undefined) {
        consoleMethod(options.consoleMessage, options.consoleDetail);
    } else {
        consoleMethod(options.consoleMessage);
    }
    app.queryUi?.setStatusMessage?.(options.statusMessage || '');
    if (options.querySummary) {
        app.queryUi?.renderQuerySummary?.(options.querySummary.params ?? null, options.querySummary.meta ?? '');
    }

    return true;
}

function createBootstrapHarness(missingIds = ['searchBtn'], options = {}) {
    const includeAlertDependency = options.includeAlertDependency ?? true;
    const statusMessages = [];
    const dispatchedEvents = [];
    const errorLogs = [];
    const documentElement = {
        dataset: {}
    };
    const sandbox = {
        console: {
            ...console,
            error: (...args) => errorLogs.push(args)
        },
        document: {
            documentElement,
            readyState: 'complete',
            getElementById: () => null,
            addEventListener: () => {}
        },
        window: {
            TFTRenderer: {
                shared: {
                    getMissingRequiredShellIds: () => [...missingIds],
                    reportRendererIssue
                }
            },
            addEventListener: () => {},
            dispatchEvent: (event) => dispatchedEvents.push(event)
        },
        CustomEvent: function CustomEvent(type, init) {
            this.type = type;
            this.detail = init?.detail;
        },
        setTimeout: () => 0
    };

    const createBootstrap = loadBootstrapFactory(sandbox);
    let subscribeCalls = 0;
    let fetchCalls = 0;
    const app = {
        __testConsoleError: (...args) => errorLogs.push(args),
        state: {
            listeners: {
                staticBound: false,
                draftBound: false,
                bootScheduled: false,
                uiInitialized: false,
                bootStarted: false
            },
            dependencies: {
                showAlert: includeAlertDependency ? () => {} : null,
                showConfirm: async () => true
            },
            flags: {
                smokeTest: false
            },
            hasElectronAPI: true,
            cleanupFns: []
        },
        queryUi: {
            setStatusMessage: (message) => statusMessages.push(message),
            setDataStats: () => {},
            renderQuerySummary: () => {},
            syncFetchButtonState: () => {},
            syncSearchButtonState: () => {}
        },
        results: {
            renderEmptySpotlight: () => {},
            renderEmptySummary: () => {}
        },
        search: {
            subscribeProgressUpdates: () => {
                subscribeCalls += 1;
            },
            handleSearchClick: () => {},
            requestCancelSearch: async () => {}
        },
        data: {
            fetchData: async () => {
                fetchCalls += 1;
            }
        }
    };

    return {
        bootstrap: createBootstrap(app),
        app,
        statusMessages,
        dispatchedEvents,
        documentElement,
        errorLogs,
        getCounts: () => ({
            subscribeCalls,
            fetchCalls
        })
    };
}

describe('renderer bootstrap', () => {
    it('returns false when required shell nodes are missing', () => {
        const { bootstrap } = createBootstrapHarness(['searchBtn', 'resBody']);

        assert.equal(bootstrap.initializeUiShell(), false);
    });

    it('sets a visible failure status when the shell is incomplete', () => {
        const { bootstrap, statusMessages, errorLogs } = createBootstrapHarness(['searchBtn', 'resBody']);

        bootstrap.initializeUiShell();

        assert.equal(
            statusMessages.at(-1),
            'Renderer shell mismatch: missing required shell nodes (searchBtn, resBody).'
        );
        assert.equal(errorLogs.length, 1);
    });

    it('keeps the renderer in a non-ready state and skips bootstrap work when the shell is incomplete', () => {
        const { bootstrap, app, dispatchedEvents, documentElement, getCounts } = createBootstrapHarness(['searchBtn']);

        bootstrap.start();

        assert.equal(documentElement.dataset.tftReady, '0');
        assert.deepEqual(dispatchedEvents.map((event) => event.detail?.ready), [false, false]);
        assert.equal(app.state.listeners.staticBound, false);
        assert.equal(app.state.listeners.bootStarted, false);
        assert.deepEqual(getCounts(), {
            subscribeCalls: 1,
            fetchCalls: 0
        });
    });

    it('blocks initialization when required dialog dependencies are missing', () => {
        const { bootstrap, statusMessages, errorLogs } = createBootstrapHarness([], {
            includeAlertDependency: false
        });

        assert.equal(bootstrap.initializeUiShell(), false);
        assert.equal(
            statusMessages.at(-1),
            'Renderer dependency mismatch: missing required dialog helper (showAlert).'
        );
        assert.equal(errorLogs.length, 1);
    });
});
