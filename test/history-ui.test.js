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
    return {
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
        },
        ...overrides
    };
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

        assert.deepEqual(appliedParams, [{
            boardSize: 9,
            mustInclude: ['Unit0']
        }]);
        assert.equal(searchClicks, 1);
    });

    it('normalizes replayed params before applying and launching a replay search', async () => {
        let searchClicks = 0;
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
        assert.equal(searchClicks, 1);
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
});
