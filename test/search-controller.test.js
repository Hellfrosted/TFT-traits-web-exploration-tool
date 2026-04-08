const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSearchControllerFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'search-controller.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/search-controller.js' });
    return sandbox.window.TFTRenderer.createSearchController;
}

function createSearchButton() {
    return {
        disabled: false,
        innerText: 'Compute',
        classList: {
            add: () => {},
            remove: () => {},
            toggle: () => {}
        }
    };
}

function createCancelButton() {
    return {
        disabled: false,
        style: {
            display: 'none'
        }
    };
}

function createShell(overrides = {}) {
    return {
        searchBtn: createSearchButton(),
        cancelBtn: createCancelButton(),
        resBody: { innerHTML: '' },
        ...overrides
    };
}

function createResolveShellElements(shell) {
    return (ids = []) => {
        const elements = {};
        const missingIds = [];

        ids.forEach((id) => {
            if (shell[id]) {
                elements[id] = shell[id];
                return;
            }

            missingIds.push(id);
        });

        return { elements, missingIds };
    };
}

function createSandbox(shell, overrides = {}) {
    return {
        console: overrides.console || console,
        showAlert: overrides.showAlert || (() => {}),
        showConfirm: overrides.showConfirm || (async () => true),
        document: {
            getElementById: (id) => shell[id] || null
        },
        window: {
            TFTRenderer: {
                shared: {
                    resolveShellElements: createResolveShellElements(shell),
                    formatBoardEstimate: (value) => {
                        const numericValue = Number(value);
                        if (!Number.isFinite(numericValue) || numericValue <= 0) {
                            return '-';
                        }

                        return String(numericValue);
                    }
                }
            }
        }
    };
}

describe('renderer search controller', () => {
    it('enters cancelling state immediately and ignores late progress updates', async () => {
        const statusMessages = [];
        const querySummaries = [];
        const shell = createShell();
        const sandbox = createSandbox(shell);
        const createSearchController = loadSearchControllerFactory(sandbox);
        const app = {
            state: {
                isSearching: true,
                isCancellingSearch: false,
                currentResults: [],
                activeSearchEstimate: null,
                lastSearchParams: { boardSize: 9, maxResults: 50 },
                cleanupFns: [],
                electronBridge: {
                    cancelSearch: async () => ({ success: true }),
                    onSearchProgress: (handler) => {
                        app.progressHandler = handler;
                        return () => {};
                    }
                }
            },
            queryUi: {
                renderQuerySummary: (_params, meta) => querySummaries.push(meta),
                setStatusMessage: (message) => statusMessages.push(message),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {}
            },
            results: {
                renderEstimateSummary: () => {},
                renderSearchingSpotlight: () => {},
                renderResultsMessageRow: () => '<tr></tr>'
            }
        };

        const controller = createSearchController(app);
        controller.subscribeProgressUpdates();
        await controller.requestCancelSearch();
        app.progressHandler({ searchId: 10, pct: 73 });

        assert.equal(app.state.isCancellingSearch, true);
        assert.equal(shell.cancelBtn.disabled, true);
        assert.deepEqual(statusMessages, ['Cancelling search...']);
        assert.deepEqual(querySummaries, ['Cancelling active search...']);
        assert.equal(shell.searchBtn.innerText, 'Compute');
    });

    it('ignores progress events for non-active search ids', () => {
        const shell = createShell();
        const sandbox = createSandbox(shell);
        const createSearchController = loadSearchControllerFactory(sandbox);
        const app = {
            state: {
                isSearching: true,
                isCancellingSearch: false,
                activeSearchId: 42,
                currentResults: [],
                activeSearchEstimate: null,
                lastSearchParams: { boardSize: 9, maxResults: 50 },
                cleanupFns: [],
                electronBridge: {
                    onSearchProgress: (handler) => {
                        app.progressHandler = handler;
                        return () => {};
                    }
                }
            },
            queryUi: {
                renderQuerySummary: () => {},
                setStatusMessage: () => {},
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {}
            },
            results: {
                renderEstimateSummary: () => {},
                renderSearchingSpotlight: () => {},
                renderResultsMessageRow: () => '<tr></tr>'
            }
        };

        const controller = createSearchController(app);
        controller.subscribeProgressUpdates();

        app.progressHandler({ searchId: 7, pct: 88 });

        assert.equal(shell.searchBtn.innerText, 'Compute');
        assert.equal(app.state.activeSearchId, 42);
    });

    it('shows checked-count progress when the search space estimate is indeterminate', () => {
        const shell = createShell();
        const sandbox = createSandbox(shell);
        const createSearchController = loadSearchControllerFactory(sandbox);
        const app = {
            state: {
                isSearching: true,
                isCancellingSearch: false,
                currentResults: [],
                activeSearchId: null,
                activeSearchEstimate: { count: null, remainingSlots: 6 },
                lastSearchParams: { boardSize: 9, maxResults: 50 },
                cleanupFns: [],
                electronBridge: {
                    onSearchProgress: (handler) => {
                        app.progressHandler = handler;
                        return () => {};
                    }
                }
            },
            queryUi: {
                renderQuerySummary: () => {},
                setStatusMessage: () => {},
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {}
            },
            results: {
                renderEstimateSummary: () => {},
                renderSearchingSpotlight: () => {},
                renderResultsMessageRow: () => '<tr></tr>'
            }
        };

        const controller = createSearchController(app);
        controller.subscribeProgressUpdates();

        app.progressHandler({ searchId: 9, pct: null, checked: 1250000, total: null });

        assert.equal(app.state.activeSearchId, 9);
        assert.equal(shell.searchBtn.innerText, 'Searching 1250000 checked');
    });

    it('sets a fresh status message when a search returns no results', async () => {
        const statusMessages = [];
        const querySummaries = [];
        const renderedResults = [];
        const shell = createShell();
        const sandbox = createSandbox(shell);
        const createSearchController = loadSearchControllerFactory(sandbox);
        const app = {
            state: {
                isSearching: false,
                isCancellingSearch: false,
                isFetchingData: false,
                currentResults: [{ units: ['stale'] }],
                currentResultsFingerprint: 'stale',
                activeSearchEstimate: null,
                lastSearchParams: null,
                selectors: {
                    mustInclude: {}
                },
                searchLimits: {},
                activeData: {
                    dataFingerprint: 'fresh'
                },
                electronBridge: {
                    getSearchEstimate: async () => ({ count: 10, remainingSlots: 2 }),
                    searchBoards: async () => ({
                        success: true,
                        cancelled: false,
                        results: []
                    })
                }
            },
            queryUi: {
                clampNumericInput: () => {},
                getCurrentSearchParams: () => ({ boardSize: 9, maxResults: 50 }),
                renderQuerySummary: (_params, meta) => querySummaries.push(meta),
                setStatusMessage: (message) => statusMessages.push(message),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {}
            },
            results: {
                renderEstimateSummary: () => {},
                renderSearchingSpotlight: () => {},
                renderResults: (results) => renderedResults.push(results),
                renderResultsMessageRow: () => '<tr></tr>',
                getSortedResults: (results) => results
            },
            history: {
                updateHistoryList: () => {}
            }
        };

        const controller = createSearchController(app);
        await controller.handleSearchClick();

        assert.equal(statusMessages.at(-1), 'No matching boards found.');
        assert.equal(querySummaries.at(-1), 'No matching boards');
        assert.deepEqual(renderedResults.at(-1), []);
    });

    it('stale progress from an earlier search does not hijack the active search id', async () => {
        const renderedResults = [];
        const shell = createShell();
        const sandbox = createSandbox(shell);
        const createSearchController = loadSearchControllerFactory(sandbox);
        let capturedProgressHandler = null;
        let resolveSearchBoards = null;
        const app = {
            state: {
                isSearching: false,
                isCancellingSearch: false,
                isFetchingData: false,
                currentResults: [],
                currentResultsFingerprint: null,
                activeSearchEstimate: null,
                lastSearchParams: null,
                lastCompletedSearchId: 1,
                selectors: { mustInclude: {} },
                searchLimits: {},
                activeData: { dataFingerprint: 'fp1' },
                cleanupFns: [],
                electronBridge: {
                    getSearchEstimate: async () => ({ count: 10, remainingSlots: 2 }),
                    searchBoards: () => new Promise((resolve) => { resolveSearchBoards = resolve; }),
                    onSearchProgress: (handler) => {
                        capturedProgressHandler = handler;
                        return () => {};
                    }
                }
            },
            queryUi: {
                clampNumericInput: () => {},
                getCurrentSearchParams: () => ({ boardSize: 9, maxResults: 50 }),
                renderQuerySummary: () => {},
                setStatusMessage: () => {},
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {}
            },
            results: {
                renderEstimateSummary: () => {},
                renderSearchingSpotlight: () => {},
                renderResults: (results) => renderedResults.push(results),
                renderResultsMessageRow: () => '<tr></tr>',
                getSortedResults: (r) => r,
                renderEmptySummary: () => {}
            },
            history: { updateHistoryList: () => {} }
        };

        const controller = createSearchController(app);
        controller.subscribeProgressUpdates();

        const searchPromise = controller.handleSearchClick();

        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        capturedProgressHandler({ searchId: 1, pct: 99 });

        assert.ok(
            app.state.activeSearchId === null || app.state.activeSearchId === undefined,
            'Stale progress from a completed search must not hijack activeSearchId'
        );

        resolveSearchBoards({ success: true, cancelled: false, results: [{ units: ['B'] }], searchId: 2 });
        await searchPromise;

        assert.ok(renderedResults.length > 0, 'Results for the active search must be rendered');
        assert.deepEqual(renderedResults.at(-1), [{ units: ['B'] }]);
    });

    it('does not throw during cancel flow when cancelBtn is missing', async () => {
        const statusMessages = [];
        const querySummaries = [];
        let cancelCalls = 0;
        const errorLogs = [];
        const shell = createShell({
            cancelBtn: null
        });
        const sandbox = createSandbox(shell, {
            console: {
                ...console,
                error: (...args) => errorLogs.push(args)
            }
        });
        const createSearchController = loadSearchControllerFactory(sandbox);
        const app = {
            state: {
                isSearching: true,
                isCancellingSearch: false,
                currentResults: [],
                activeSearchEstimate: null,
                activeSearchId: 7,
                lastSearchParams: { boardSize: 9, maxResults: 50 },
                cleanupFns: [],
                electronBridge: {
                    cancelSearch: async () => {
                        cancelCalls += 1;
                        return { success: true };
                    }
                }
            },
            queryUi: {
                renderQuerySummary: (_params, meta) => querySummaries.push(meta),
                setStatusMessage: (message) => statusMessages.push(message),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {}
            },
            results: {
                renderEstimateSummary: () => {},
                renderSearchingSpotlight: () => {},
                renderResultsMessageRow: () => '<tr></tr>'
            }
        };

        const controller = createSearchController(app);
        await assert.doesNotReject(controller.requestCancelSearch());

        assert.equal(cancelCalls, 0);
        assert.equal(app.state.isSearching, false);
        assert.equal(app.state.isCancellingSearch, false);
        assert.equal(statusMessages.at(-1), 'Renderer shell mismatch: search controls unavailable.');
        assert.equal(querySummaries.at(-1), 'Shell mismatch');
        assert.equal(errorLogs.length, 1);
    });

    it('does not throw during state transitions when searchBtn is missing', () => {
        const statusMessages = [];
        const querySummaries = [];
        const errorLogs = [];
        const shell = createShell({
            searchBtn: null
        });
        const sandbox = createSandbox(shell, {
            console: {
                ...console,
                error: (...args) => errorLogs.push(args)
            }
        });
        const createSearchController = loadSearchControllerFactory(sandbox);
        const app = {
            state: {
                isSearching: false,
                isCancellingSearch: false,
                activeSearchEstimate: { count: 10 },
                activeSearchId: 11,
                currentResults: [],
                lastSearchParams: { boardSize: 9, maxResults: 50 }
            },
            queryUi: {
                renderQuerySummary: (_params, meta) => querySummaries.push(meta),
                setStatusMessage: (message) => statusMessages.push(message),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {}
            },
            results: {
                renderEstimateSummary: () => {},
                renderSearchingSpotlight: () => {},
                renderResultsMessageRow: () => '<tr></tr>'
            }
        };

        const controller = createSearchController(app);

        assert.doesNotThrow(() => controller.setSearchState(true));
        assert.doesNotThrow(() => controller.setSearchState(false));

        assert.equal(app.state.isSearching, false);
        assert.equal(app.state.activeSearchEstimate, null);
        assert.equal(app.state.activeSearchId, null);
        assert.equal(statusMessages.at(-1), 'Renderer shell mismatch: search controls unavailable.');
        assert.equal(querySummaries.at(-1), 'Shell mismatch');
        assert.equal(errorLogs.length, 1);
    });

    it('does not throw during pending-results rendering when resBody is missing', () => {
        const statusMessages = [];
        const querySummaries = [];
        const errorLogs = [];
        const shell = createShell({
            resBody: null
        });
        const sandbox = createSandbox(shell, {
            console: {
                ...console,
                error: (...args) => errorLogs.push(args)
            }
        });
        const createSearchController = loadSearchControllerFactory(sandbox);
        const app = {
            state: {
                isSearching: true,
                isCancellingSearch: false,
                currentResults: [],
                activeSearchEstimate: null,
                lastSearchParams: { boardSize: 9, maxResults: 50 }
            },
            queryUi: {
                renderQuerySummary: (_params, meta) => querySummaries.push(meta),
                setStatusMessage: (message) => statusMessages.push(message),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {}
            },
            results: {
                renderEstimateSummary: () => {},
                renderSearchingSpotlight: () => {},
                renderResultsMessageRow: () => '<tr></tr>'
            }
        };

        const controller = createSearchController(app);

        assert.doesNotThrow(() => controller.renderActiveSearchUi(50));
        assert.equal(statusMessages.at(-1), 'Renderer shell mismatch: search controls unavailable.');
        assert.equal(querySummaries.at(-1), 'Shell mismatch');
        assert.equal(errorLogs.length, 1);
    });

    it('blocks bridge calls and emits controlled shell-mismatch UI when required search nodes are missing', async () => {
        const statusMessages = [];
        const querySummaries = [];
        let estimateCalls = 0;
        let searchCalls = 0;
        const errorLogs = [];
        const shell = createShell({
            searchBtn: null
        });
        const sandbox = createSandbox(shell, {
            console: {
                ...console,
                error: (...args) => errorLogs.push(args)
            }
        });
        const createSearchController = loadSearchControllerFactory(sandbox);
        const app = {
            state: {
                isSearching: false,
                isCancellingSearch: false,
                isFetchingData: false,
                currentResults: [],
                activeSearchEstimate: null,
                lastSearchParams: { boardSize: 9, maxResults: 50 },
                selectors: {
                    mustInclude: {}
                },
                searchLimits: {},
                activeData: {
                    dataFingerprint: 'fresh'
                },
                electronBridge: {
                    getSearchEstimate: async () => {
                        estimateCalls += 1;
                        return { count: 10, remainingSlots: 2 };
                    },
                    searchBoards: async () => {
                        searchCalls += 1;
                        return { success: true, cancelled: false, results: [] };
                    }
                }
            },
            queryUi: {
                clampNumericInput: () => {},
                getCurrentSearchParams: () => ({ boardSize: 9, maxResults: 50 }),
                renderQuerySummary: (_params, meta) => querySummaries.push(meta),
                setStatusMessage: (message) => statusMessages.push(message),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {}
            },
            results: {
                renderEstimateSummary: () => {},
                renderSearchingSpotlight: () => {},
                renderResults: () => {},
                renderResultsMessageRow: () => '<tr></tr>',
                getSortedResults: (results) => results,
                renderEmptySummary: () => {}
            },
            history: {
                updateHistoryList: () => {}
            }
        };

        const controller = createSearchController(app);
        await controller.handleSearchClick();

        assert.equal(estimateCalls, 0);
        assert.equal(searchCalls, 0);
        assert.equal(app.state.isSearching, false);
        assert.equal(statusMessages.at(-1), 'Renderer shell mismatch: search controls unavailable.');
        assert.equal(querySummaries.at(-1), 'Shell mismatch');
        assert.equal(errorLogs.length, 1);
    });
});
