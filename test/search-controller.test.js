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

    it('does not throw when searchBtn and cancelBtn are absent from the DOM', () => {
        const sandbox = {
            console,
            document: {
                getElementById: () => null
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
                activeSearchId: null,
                currentResults: [],
                activeSearchEstimate: null,
                lastSearchParams: null,
                cleanupFns: []
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

        assert.doesNotThrow(() => controller.setSearchState(true));
        assert.equal(app.state.isSearching, true, 'state.isSearching should be true after setSearchState(true)');
        assert.doesNotThrow(() => controller.setSearchState(false));
        assert.equal(app.state.isSearching, false, 'state.isSearching should be false after setSearchState(false)');
    });

    it('does not throw when resBody is absent from the DOM during a search with no data', async () => {
        const statusMessages = [];
        const sandbox = {
            console,
            showAlert: () => {},
            showConfirm: async () => true,
            document: {
                getElementById: (id) => {
                    if (id === 'searchBtn') return createSearchButton();
                    if (id === 'cancelBtn') return createCancelButton();
                    return null;
                }
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
                currentResults: [],
                activeSearchEstimate: null,
                lastSearchParams: null,
                selectors: {},
                searchLimits: {},
                activeData: null,
                cleanupFns: [],
                electronBridge: {}
            },
            queryUi: {
                clampNumericInput: () => {},
                getCurrentSearchParams: () => ({ boardSize: 9, maxResults: 50 }),
                renderQuerySummary: () => {},
                setStatusMessage: (msg) => statusMessages.push(msg),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {}
            },
            results: {
                renderEmptySummary: () => {},
                renderEstimateSummary: () => {},
                renderSearchingSpotlight: () => {},
                renderResultsMessageRow: () => '<tr></tr>'
            }
        };

        const controller = createSearchController(app);
        await assert.doesNotReject(() => controller.handleSearchClick());
        assert.equal(app.state.isSearching, false, 'search should have exited cleanly');
    });
});
