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

describe('renderer search controller', () => {
    it('enters cancelling state immediately and ignores late progress updates', async () => {
        const statusMessages = [];
        const querySummaries = [];
        const searchBtn = createSearchButton();
        const cancelBtn = createCancelButton();
        const resBody = { innerHTML: '' };
        const sandbox = {
            console,
            document: {
                getElementById: (id) => ({
                    searchBtn,
                    cancelBtn,
                    resBody
                }[id] || null)
            },
            window: {
                TFTRenderer: {}
            }
        };

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
        assert.equal(cancelBtn.disabled, true);
        assert.deepEqual(statusMessages, ['Cancelling search...']);
        assert.deepEqual(querySummaries, ['Cancelling active search...']);
        assert.equal(searchBtn.innerText, 'Compute');
    });

    it('ignores progress events for non-active search ids', () => {
        const searchBtn = createSearchButton();
        const cancelBtn = createCancelButton();
        const resBody = { innerHTML: '' };
        const sandbox = {
            console,
            document: {
                getElementById: (id) => ({
                    searchBtn,
                    cancelBtn,
                    resBody
                }[id] || null)
            },
            window: {
                TFTRenderer: {}
            }
        };

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

        assert.equal(searchBtn.innerText, 'Compute');
        assert.equal(app.state.activeSearchId, 42);
    });

    it('sets a fresh status message when a search returns no results', async () => {
        const statusMessages = [];
        const querySummaries = [];
        const renderedResults = [];
        const searchBtn = createSearchButton();
        const cancelBtn = createCancelButton();
        const resBody = { innerHTML: '' };
        const sandbox = {
            console,
            showAlert: () => {},
            showConfirm: async () => true,
            document: {
                getElementById: (id) => ({
                    searchBtn,
                    cancelBtn,
                    resBody
                }[id] || null)
            },
            window: {
                TFTRenderer: {}
            }
        };

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
        const searchBtn = createSearchButton();
        const cancelBtn = createCancelButton();
        const resBody = { innerHTML: '' };
        const sandbox = {
            console,
            showAlert: () => {},
            showConfirm: async () => true,
            document: {
                getElementById: (id) => ({
                    searchBtn,
                    cancelBtn,
                    resBody
                }[id] || null)
            },
            window: {
                TFTRenderer: {}
            }
        };

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

        // Yield enough microtasks to let the async flow reach the searchBoards await
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // A stale progress event from search 1 arrives while search 2 is pending
        capturedProgressHandler({ searchId: 1, pct: 99 });

        // Stale event must not establish activeSearchId
        assert.ok(
            app.state.activeSearchId === null || app.state.activeSearchId === undefined,
            'Stale progress from a completed search must not hijack activeSearchId'
        );

        // Resolve search 2 – the response is always authoritative
        resolveSearchBoards({ success: true, cancelled: false, results: [{ units: ['B'] }], searchId: 2 });
        await searchPromise;

        assert.ok(renderedResults.length > 0, 'Results for the active search must be rendered');
        assert.deepEqual(renderedResults.at(-1), [{ units: ['B'] }]);
    });
});
