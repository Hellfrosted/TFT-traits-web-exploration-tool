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

function createEventTarget() {
    const listeners = new Map();
    return {
        addEventListener(eventName, handler) {
            if (!listeners.has(eventName)) {
                listeners.set(eventName, []);
            }
            listeners.get(eventName).push(handler);
        },
        dispatchEvent(event) {
            const handlers = listeners.get(event.type) || [];
            handlers.forEach((handler) => handler(event));
        }
    };
}

function createButtonTarget() {
    const target = createEventTarget();
    return {
        ...target,
        click() {
            target.dispatchEvent({ type: 'click' });
        }
    };
}

function createBootstrapHarness(missingIds = ['searchBtn'], options = {}) {
    const includeAlertDependency = options.includeAlertDependency ?? true;
    const shellElements = options.shellElements || {};
    const statusMessages = [];
    const querySummaryCalls = [];
    const spotlightMessages = [];
    const dispatchedEvents = [];
    const errorLogs = [];
    const documentElement = {
        dataset: {}
    };
    const documentEvents = createEventTarget();
    const sandbox = {
        console: {
            ...console,
            error: (...args) => errorLogs.push(args)
        },
        document: {
            documentElement,
            readyState: 'complete',
            getElementById: (id) => shellElements[id] || null,
            addEventListener: (...args) => documentEvents.addEventListener(...args)
        },
        window: {
            TFTRenderer: {
                shared: {
                    getMissingRequiredShellIds: () => [...missingIds],
                    resolveShellElements: (ids = []) => {
                        const elements = {};
                        ids.forEach((id) => {
                            elements[id] = shellElements[id] || null;
                        });
                        return {
                            elements,
                            missingIds: ids.filter((id) => !shellElements[id])
                        };
                    },
                    setResultsBodyMessage: () => false,
                    reportRendererIssue,
                    createDialogInvoker(app, reporterState, {
                        methodName,
                        issueKey = 'missingDialogDependency',
                        statusMessage = 'Renderer dependency mismatch: dialog controls unavailable.',
                        fallbackValue = false
                    } = {}) {
                        return (...args) => {
                            const dialogFn = app?.state?.dependencies?.[methodName];
                            if (typeof dialogFn === 'function') {
                                return dialogFn(...args);
                            }

                            const [message, title = methodName === 'showConfirm' ? 'Confirmation' : 'Attention'] = args;
                            reportRendererIssue(app, reporterState, issueKey, {
                                consoleMessage: `[Renderer Dependency Missing] ${methodName} is unavailable.`,
                                consoleDetail: { title, message },
                                statusMessage: typeof statusMessage === 'function'
                                    ? statusMessage({ methodName, title, message })
                                    : statusMessage
                            });
                            return Promise.resolve(fallbackValue);
                        };
                    }
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
            renderQuerySummary: (params, meta) => {
                querySummaryCalls.push({ params, meta });
            },
            syncFetchButtonState: () => {},
            syncSearchButtonState: () => {}
        },
        results: {
            renderEmptySpotlight: (message) => {
                spotlightMessages.push(message);
            },
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
        querySummaryCalls,
        spotlightMessages,
        dispatchedEvents,
        documentElement,
        documentEvents,
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

    it('triggers the search button click from the submit shortcut when idle', () => {
        const searchBtn = createButtonTarget();
        let searchClicks = 0;
        const { bootstrap, documentEvents } = createBootstrapHarness([], {
            shellElements: {
                fetchBtn: createButtonTarget(),
                sortMode: createEventTarget(),
                cancelBtn: createButtonTarget(),
                resetFiltersBtn: createButtonTarget(),
                searchBtn
            }
        });

        bootstrap.initializeUiShell();
        searchBtn.addEventListener('click', () => {
            searchClicks += 1;
        });

        let prevented = false;
        documentEvents.dispatchEvent({
            type: 'keydown',
            ctrlKey: true,
            metaKey: false,
            key: 'Enter',
            preventDefault() {
                prevented = true;
            }
        });

        assert.equal(searchClicks, 1);
        assert.equal(prevented, true);
    });

    it('ignores the submit shortcut while a search is already running', () => {
        const searchBtn = createButtonTarget();
        let searchClicks = 0;
        const { bootstrap, app, documentEvents } = createBootstrapHarness([], {
            shellElements: {
                fetchBtn: createButtonTarget(),
                sortMode: createEventTarget(),
                cancelBtn: createButtonTarget(),
                resetFiltersBtn: createButtonTarget(),
                searchBtn
            }
        });

        app.state.isSearching = true;
        bootstrap.initializeUiShell();
        searchBtn.addEventListener('click', () => {
            searchClicks += 1;
        });

        let prevented = false;
        documentEvents.dispatchEvent({
            type: 'keydown',
            ctrlKey: true,
            metaKey: false,
            key: 'Enter',
            preventDefault() {
                prevented = true;
            }
        });

        assert.equal(searchClicks, 0);
        assert.equal(prevented, false);
    });

    it('reports fetch button failures through the shared async click handler', async () => {
        const fetchBtn = createButtonTarget();
        const { bootstrap, statusMessages, app } = createBootstrapHarness([], {
            shellElements: {
                fetchBtn,
                sortMode: createEventTarget(),
                cancelBtn: createButtonTarget(),
                resetFiltersBtn: createButtonTarget(),
                searchBtn: createButtonTarget()
            }
        });
        let resolveFailureStatus;
        const failureStatusPromise = new Promise((resolve) => {
            resolveFailureStatus = resolve;
        });
        const originalSetStatusMessage = app.queryUi.setStatusMessage;
        app.queryUi.setStatusMessage = (message) => {
            originalSetStatusMessage(message);
            if (message === 'Renderer init failed: fetch blew up') {
                resolveFailureStatus();
            }
        };

        app.data.fetchData = async () => {
            throw new Error('fetch blew up');
        };

        bootstrap.initializeUiShell();
        fetchBtn.click();
        await failureStatusPromise;

        assert.equal(statusMessages.at(-1), 'Renderer init failed: fetch blew up');
    });

    it('derives bootstrap shell UI state through the extracted helper', () => {
        const { bootstrap } = createBootstrapHarness([]);
        const toPlainObject = (value) => JSON.parse(JSON.stringify(value));

        assert.deepEqual(toPlainObject(bootstrap.__test.getBootstrapShellUiState(true)), {
            querySummaryMeta: 'Initializing UI...',
            spotlightMessage: 'Loading data...',
            statusMessage: 'Initializing UI...'
        });
        assert.deepEqual(toPlainObject(bootstrap.__test.getBootstrapShellUiState(false)), {
            querySummaryMeta: 'Electron bridge unavailable',
            spotlightMessage: 'Electron preload bridge unavailable.',
            statusMessage: 'Electron preload bridge unavailable.'
        });
    });

    it('renders the preload-unavailable shell state when the Electron bridge is missing', () => {
        const { bootstrap, app, statusMessages, querySummaryCalls, spotlightMessages } = createBootstrapHarness([], {
            shellElements: {
                fetchBtn: createButtonTarget(),
                sortMode: createEventTarget(),
                cancelBtn: createButtonTarget(),
                resetFiltersBtn: createButtonTarget(),
                searchBtn: createButtonTarget()
            }
        });

        app.state.hasElectronAPI = false;
        bootstrap.initializeUiShell();

        assert.equal(querySummaryCalls.at(-1)?.meta, 'Electron bridge unavailable');
        assert.equal(spotlightMessages.at(-1), 'Electron preload bridge unavailable.');
        assert.equal(statusMessages.at(-1), 'Electron preload bridge unavailable.');
    });
});
