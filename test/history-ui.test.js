const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadHistoryUiFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'history-ui.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/history-ui.js' });
    return sandbox.window.TFTRenderer.createHistoryUi;
}

function createShared(overrides = {}) {
    const shared = {
        escapeHtml: (value) => String(value ?? ''),
        summarizeParams: () => '',
        formatTimestamp: () => '',
        reportRendererIssue(app, reporterState, issueKey, options = {}) {
            if (reporterState && issueKey) {
                if (reporterState[issueKey]) {
                    return false;
                }
                reporterState[issueKey] = true;
            }

            app.queryUi?.setStatusMessage?.(options.statusMessage || '');
            if (options.querySummary) {
                app.queryUi?.renderQuerySummary?.(options.querySummary.params ?? null, options.querySummary.meta ?? '');
            }

            return true;
        }
    };

    return {
        ...shared,
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
                shared.reportRendererIssue(app, reporterState, issueKey, {
                    consoleMessage: `[Renderer Dependency Missing] ${methodName} is unavailable.`,
                    consoleDetail: { title, message },
                    statusMessage: typeof statusMessage === 'function'
                        ? statusMessage({ methodName, title, message })
                        : statusMessage
                });
                return Promise.resolve(fallbackValue);
            };
        },
        ...overrides
    };
}

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function createDomElement(tagName) {
    const listeners = new Map();
    const element = {
        tagName,
        children: [],
        className: '',
        textContent: '',
        title: '',
        appendChild(child) {
            this.children.push(child);
            return child;
        },
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

    let innerHtmlValue = '';
    Object.defineProperty(element, 'innerHTML', {
        get() {
            return innerHtmlValue;
        },
        set(value) {
            innerHtmlValue = value;
            this.children = [];
        }
    });

    return element;
}

describe('renderer history UI', () => {
    it('renders an unavailable state when cache history is not accessible', async () => {
        const historyList = createDomElement('div');
        const sandbox = {
            console,
            document: {
                getElementById: (id) => id === 'historyList' ? historyList : null,
                createElement: (tagName) => createDomElement(tagName)
            },
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                electronBridge: {},
                dependencies: {
                    showAlert: () => {}
                }
            },
            queryUi: {}
        };

        const historyUi = createHistoryUi(app);
        await historyUi.updateHistoryList();

        assert.match(historyList.innerHTML, /History unavailable/);
    });

    it('renders a no-history state when cache listing succeeds without entries', async () => {
        const historyList = createDomElement('div');
        const sandbox = {
            console,
            document: {
                getElementById: (id) => id === 'historyList' ? historyList : null,
                createElement: (tagName) => createDomElement(tagName)
            },
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                dependencies: {
                    showAlert: () => {}
                },
                electronBridge: {
                    listCache: async () => ({
                        success: true,
                        entries: []
                    })
                }
            },
            queryUi: {}
        };

        const historyUi = createHistoryUi(app);
        await historyUi.updateHistoryList();

        assert.match(historyList.innerHTML, /No history/);
    });

    it('renders backend cache-list errors as a visible history state', async () => {
        const historyList = createDomElement('div');
        const sandbox = {
            console,
            document: {
                getElementById: (id) => id === 'historyList' ? historyList : null,
                createElement: (tagName) => createDomElement(tagName)
            },
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                dependencies: {
                    showAlert: () => {}
                },
                electronBridge: {
                    listCache: async () => ({
                        success: false,
                        error: 'Bridge unavailable'
                    })
                }
            },
            queryUi: {}
        };

        const historyUi = createHistoryUi(app);
        await historyUi.updateHistoryList();

        assert.match(historyList.innerHTML, /History unavailable: Bridge unavailable/);
    });

    it('derives history item display text through the extracted helper', () => {
        const sandbox = {
            console,
            document: {
                getElementById: () => null,
                createElement: (tagName) => createDomElement(tagName)
            },
            window: {
                TFTRenderer: {
                    shared: createShared({
                        summarizeParams: (params) => params?.mustInclude?.join(', ') || '',
                        formatTimestamp: (timestamp) => `at ${timestamp}`
                    })
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const historyUi = createHistoryUi({
            state: {
                dependencies: {
                    showAlert: () => {}
                }
            },
            queryUi: {}
        });

        assert.deepEqual(
            JSON.parse(JSON.stringify(historyUi.__test.getHistoryItemDisplayState({
                params: {
                    boardSize: 9,
                    mustInclude: ['Aurora']
                },
                resultCount: 7,
                timestamp: 123
            }))),
            {
                title: 'Level 9',
                paramsText: 'Aurora',
                resultCountText: '7 results',
                timestampText: 'at 123'
            }
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(historyUi.__test.getHistoryItemDisplayState({
                params: null,
                resultCount: 0,
                timestamp: 456
            }))),
            {
                title: 'Saved Search',
                paramsText: '',
                resultCountText: '0 results',
                timestampText: 'at 456'
            }
        );
    });

    it('renders recent history entries and replays the selected search', async () => {
        const historyList = createDomElement('div');
        let searchClicks = 0;
        const appliedParams = [];
        const sandbox = {
            console,
            document: {
                getElementById: (id) => {
                    if (id === 'historyList') return historyList;
                    if (id === 'searchBtn') {
                        return {
                            click: () => {
                                searchClicks += 1;
                            }
                        };
                    }
                    return null;
                },
                createElement: (tagName) => createDomElement(tagName)
            },
            window: {
                TFTRenderer: {
                    shared: createShared({
                        summarizeParams: (params) => `Inc: ${params.mustInclude.join(', ')}`,
                        formatTimestamp: () => '12:00'
                    })
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                isSearching: false,
                isFetchingData: false,
                dependencies: {
                    showAlert: () => {}
                },
                electronBridge: {
                    listCache: async () => ({
                        success: true,
                        entries: Array.from({ length: 6 }, (_, index) => ({
                            params: {
                                boardSize: 9 - index,
                                mustInclude: [`Unit${index}`]
                            },
                            resultCount: index + 1,
                            timestamp: 1000 + index
                        }))
                    })
                },
                activeData: null,
                selectors: {}
            },
            queryUi: {
                applySearchParams: (params) => appliedParams.push(params),
                renderQuerySummary: () => {}
            }
        };

        const historyUi = createHistoryUi(app);
        await historyUi.updateHistoryList();

        assert.equal(historyList.children.length, 5);
        assert.equal(historyList.children[0].children[0].textContent, 'Level 9');
        assert.equal(historyList.children[0].children[1].textContent, 'Inc: Unit0');

        historyList.children[0].dispatchEvent({ type: 'click' });
        await Promise.resolve();

        assert.deepEqual(appliedParams, [{
            boardSize: 9,
            mustInclude: ['Unit0']
        }]);
        assert.equal(searchClicks, 1);
    });

    it('ignores stale history refresh responses that resolve out of order', async () => {
        const historyList = createDomElement('div');
        const firstList = createDeferred();
        const secondList = createDeferred();
        let listCacheCalls = 0;
        const sandbox = {
            console,
            document: {
                getElementById: (id) => id === 'historyList' ? historyList : null,
                createElement: (tagName) => createDomElement(tagName)
            },
            window: {
                TFTRenderer: {
                    shared: createShared({
                        summarizeParams: (params) => `Inc: ${params.mustInclude.join(', ')}`,
                        formatTimestamp: () => '12:00'
                    })
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                isSearching: false,
                isFetchingData: false,
                dependencies: {
                    showAlert: () => {}
                },
                electronBridge: {
                    listCache: async () => {
                        listCacheCalls += 1;
                        return await (listCacheCalls === 1 ? firstList.promise : secondList.promise);
                    }
                },
                activeData: null,
                selectors: {}
            },
            queryUi: {}
        };

        const historyUi = createHistoryUi(app);
        const firstRefresh = historyUi.updateHistoryList();
        const secondRefresh = historyUi.updateHistoryList();

        secondList.resolve({
            success: true,
            entries: [{
                params: { boardSize: 9, mustInclude: ['Newest'] },
                resultCount: 2,
                timestamp: 1234
            }]
        });
        await secondRefresh;

        firstList.resolve({
            success: true,
            entries: [{
                params: { boardSize: 9, mustInclude: ['Stale'] },
                resultCount: 1,
                timestamp: 1233
            }]
        });
        await firstRefresh;

        assert.equal(historyList.children.length, 1);
        assert.equal(historyList.children[0].children[1].textContent, 'Inc: Newest');
    });

    it('normalizes replayed params before applying and launching a replay search', async () => {
        let searchClicks = 0;
        let submitSearchCalls = 0;
        const appliedParams = [];
        const renderedSummaries = [];
        const resolvedHashMaps = [];
        const sandbox = {
            console,
            document: {
                getElementById: (id) => {
                    if (id === 'searchBtn') {
                        return {
                            click: () => {
                                searchClicks += 1;
                            }
                        };
                    }
                    return null;
                }
            },
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                isSearching: false,
                isFetchingData: false,
                dependencies: {
                    showAlert: () => {}
                },
                activeData: {
                    hashMap: { Carry: 'Carry' }
                },
                selectors: {
                    tankRoles: {
                        resolvePills: (hashMap) => resolvedHashMaps.push(hashMap)
                    },
                    carryRoles: {
                        resolvePills: (hashMap) => resolvedHashMaps.push(hashMap)
                    }
                }
            },
            queryUi: {
                applySearchParams: (params) => appliedParams.push(params),
                normalizeSearchParams: async () => ({
                    params: {
                        boardSize: 9,
                        maxResults: 500,
                        mustInclude: ['Canonical']
                    },
                    comparisonKey: 'canonical',
                    dataFingerprint: 'fp'
                }),
                renderQuerySummary: (params, meta) => renderedSummaries.push({ params, meta })
            },
            search: {
                submitSearch: async () => {
                    submitSearchCalls += 1;
                }
            }
        };

        const historyUi = createHistoryUi(app);
        await historyUi.loadSearchFromHistory({
            params: {
                boardSize: 8,
                maxResults: 100,
                mustInclude: ['Raw']
            }
        });

        assert.deepEqual(appliedParams, [{
            boardSize: 9,
            maxResults: 500,
            mustInclude: ['Canonical']
        }]);
        assert.equal(searchClicks, 0);
        assert.equal(submitSearchCalls, 1);
        assert.equal(resolvedHashMaps.length, 2);
        assert.deepEqual(renderedSummaries, [{
            params: {
                boardSize: 9,
                maxResults: 500,
                mustInclude: ['Canonical']
            },
            meta: 'Loaded a recent search. Replaying canonical query now.'
        }]);
    });

    it('falls back to raw params when canonical normalization is unavailable', async () => {
        let searchClicks = 0;
        const appliedParams = [];
        const sandbox = {
            console,
            document: {
                getElementById: (id) => {
                    if (id === 'searchBtn') {
                        return {
                            click: () => {
                                searchClicks += 1;
                            }
                        };
                    }
                    return null;
                }
            },
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                isSearching: false,
                isFetchingData: false,
                dependencies: {
                    showAlert: () => {}
                },
                activeData: null,
                selectors: {}
            },
            queryUi: {
                applySearchParams: (params) => appliedParams.push(params),
                renderQuerySummary: () => {}
            }
        };

        const historyUi = createHistoryUi(app);
        await assert.doesNotReject(historyUi.loadSearchFromHistory({
            params: {
                boardSize: 7
            }
        }));
        assert.deepEqual(appliedParams, [{ boardSize: 7 }]);
        assert.equal(searchClicks, 1);
    });

    it('derives replay busy and failure messages through extracted helpers', () => {
        const sandbox = {
            console,
            document: {
                getElementById: () => null,
                createElement: (tagName) => createDomElement(tagName)
            },
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const historyUi = createHistoryUi({
            state: {
                isSearching: false,
                isFetchingData: false,
                dependencies: {
                    showAlert: () => {}
                }
            },
            queryUi: {}
        });

        assert.equal(historyUi.__test.getHistoryReplayBusyMessage(), null);

        const busyHistoryUi = createHistoryUi({
            state: {
                isSearching: true,
                isFetchingData: false,
                dependencies: {
                    showAlert: () => {}
                }
            },
            queryUi: {}
        });

        assert.equal(
            busyHistoryUi.__test.getHistoryReplayBusyMessage(),
            'Wait for current search to finish or cancel it.'
        );
        assert.equal(
            historyUi.__test.getHistoryReplayFailureMessage(new Error('normalize blew up')),
            'Failed to replay cached query: normalize blew up'
        );
    });

    it('shows a busy-state alert instead of replaying while search work is active', async () => {
        let searchClicks = 0;
        const appliedParams = [];
        const alerts = [];
        const sandbox = {
            console,
            document: {
                getElementById: (id) => {
                    if (id === 'searchBtn') {
                        return {
                            click: () => {
                                searchClicks += 1;
                            }
                        };
                    }
                    return null;
                }
            },
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                isSearching: true,
                isFetchingData: false,
                dependencies: {
                    showAlert: (message, title) => {
                        alerts.push({ message, title });
                    }
                },
                activeData: null,
                selectors: {}
            },
            queryUi: {
                applySearchParams: (params) => appliedParams.push(params),
                renderQuerySummary: () => {}
            }
        };

        const historyUi = createHistoryUi(app);
        await historyUi.loadSearchFromHistory({
            params: {
                boardSize: 7
            }
        });

        assert.deepEqual(alerts, [{
            message: 'Wait for current search to finish or cancel it.',
            title: 'Attention'
        }]);
        assert.deepEqual(appliedParams, []);
        assert.equal(searchClicks, 0);
    });

    it('surfaces replay normalization failures through the status message without launching a search', async () => {
        let searchClicks = 0;
        const appliedParams = [];
        const statusMessages = [];
        const sandbox = {
            console,
            document: {
                getElementById: (id) => {
                    if (id === 'searchBtn') {
                        return {
                            click: () => {
                                searchClicks += 1;
                            }
                        };
                    }
                    return null;
                },
                createElement: (tagName) => createDomElement(tagName)
            },
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                isSearching: false,
                isFetchingData: false,
                dependencies: {
                    showAlert: () => {}
                }
            },
            queryUi: {
                applySearchParams: (params) => appliedParams.push(params),
                normalizeSearchParams: async () => {
                    throw new Error('normalize blew up');
                },
                renderQuerySummary: () => {},
                setStatusMessage: (message) => statusMessages.push(message)
            }
        };

        const historyUi = createHistoryUi(app);
        await historyUi.loadSearchFromHistory({
            params: {
                boardSize: 7
            }
        });

        assert.equal(searchClicks, 0);
        assert.deepEqual(appliedParams, []);
        assert.equal(statusMessages.at(-1), 'Failed to replay cached query: normalize blew up');
    });
});
