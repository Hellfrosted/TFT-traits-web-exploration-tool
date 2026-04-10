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

function createTrackedClassList(initial = []) {
    const values = new Set(initial);
    return {
        add: (value) => values.add(value),
        remove: (value) => values.delete(value),
        toggle: (value, force) => {
            if (force === undefined) {
                if (values.has(value)) {
                    values.delete(value);
                    return false;
                }
                values.add(value);
                return true;
            }

            if (force) {
                values.add(value);
                return true;
            }

            values.delete(value);
            return false;
        },
        contains: (value) => values.has(value)
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

async function waitFor(check, message, attempts = 10) {
    for (let index = 0; index < attempts; index += 1) {
        if (check()) {
            return;
        }
        await Promise.resolve();
    }

    assert.fail(message);
}

function createSandbox(shell, overrides = {}) {
    const consoleApi = overrides.console || console;
    return {
        console: consoleApi,
        showAlert: overrides.showAlert || (() => {}),
        showConfirm: overrides.showConfirm || (async () => true),
        document: {
            getElementById: (id) => shell[id] || null
        },
        window: {
            TFTRenderer: {
                shared: {
                    resolveShellElements: createResolveShellElements(shell),
                    setResultsBodyMessage(app, tbody, message, className = 'results-message-row') {
                        if (!tbody || typeof app?.results?.renderResultsMessageRow !== 'function') {
                            return false;
                        }

                        tbody.innerHTML = app.results.renderResultsMessageRow(message, className);
                        return true;
                    },
                    reportRendererIssue(app, reporterState, issueKey, options = {}) {
                        if (reporterState && issueKey) {
                            if (reporterState[issueKey]) {
                                return false;
                            }
                            reporterState[issueKey] = true;
                        }

                        if (options.consoleDetail !== null && options.consoleDetail !== undefined) {
                            consoleApi.error(options.consoleMessage, options.consoleDetail);
                        } else {
                            consoleApi.error(options.consoleMessage);
                        }
                        app.queryUi?.setStatusMessage?.(options.statusMessage || '');
                        if (options.querySummary) {
                            app.queryUi?.renderQuerySummary?.(options.querySummary.params ?? null, options.querySummary.meta ?? '');
                        }

                        return true;
                    },
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
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
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
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
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

    it('derives percentage progress from checked and total when pct is absent', () => {
        const shell = createShell();
        const sandbox = createSandbox(shell);
        const createSearchController = loadSearchControllerFactory(sandbox);
        const app = {
            state: {
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
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

        app.progressHandler({ searchId: 9, pct: null, checked: 1250000, total: 5000000 });

        assert.equal(app.state.activeSearchId, 9);
        assert.equal(shell.searchBtn.innerText, 'Searching 25%');
    });

    it('falls back to checked-count progress only when the total is unavailable', () => {
        const shell = createShell();
        const sandbox = createSandbox(shell);
        const createSearchController = loadSearchControllerFactory(sandbox);
        const app = {
            state: {
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
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

    it('resolves progress search ids through the extracted stale-progress helper', () => {
        const shell = createShell();
        const sandbox = createSandbox(shell);
        const createSearchController = loadSearchControllerFactory(sandbox);
        const controller = createSearchController({
            state: {
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
                cleanupFns: []
            },
            queryUi: {},
            results: {}
        });

        assert.equal(controller.__test.resolveProgressSearchId(null, null, null), null);
        assert.equal(controller.__test.resolveProgressSearchId({ searchId: 5 }, null, 7), null);
        assert.equal(controller.__test.resolveProgressSearchId({ searchId: 9 }, null, 7), 9);
        assert.equal(controller.__test.resolveProgressSearchId({ searchId: 11 }, 11, 7), 11);
        assert.equal(controller.__test.resolveProgressSearchId({ searchId: 10 }, 11, 7), null);
    });

    it('derives search result UI state through the extracted outcome helper', () => {
        const shell = createShell();
        const sandbox = createSandbox(shell);
        const createSearchController = loadSearchControllerFactory(sandbox);
        const controller = createSearchController({
            state: {
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
                cleanupFns: []
            },
            queryUi: {},
            results: {}
        });

        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getSearchResultsUiState([{ score: 10 }], true, '1.2'))),
            {
                statusMessage: 'Found 1 results (from cache in 1.2s)',
                querySummaryMeta: '1 cached boards in 1.2s',
                shouldUpdateHistory: true
            }
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getSearchResultsUiState([{ error: 'boom' }], false, '0.4'))),
            {
                statusMessage: 'Search Error: boom',
                querySummaryMeta: 'Error: boom',
                shouldUpdateHistory: false
            }
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getSearchResultsUiState([], false, '0.4'))),
            {
                statusMessage: 'No matching boards found.',
                querySummaryMeta: 'No matching boards',
                shouldUpdateHistory: false
            }
        );
    });

    it('derives and applies active search control UI through the extracted helper', () => {
        const shell = {
            searchBtn: {
                disabled: false,
                innerText: 'Compute',
                classList: createTrackedClassList()
            },
            cancelBtn: {
                disabled: true,
                style: {
                    display: 'none'
                }
            }
        };
        const sandbox = createSandbox(createShell());
        const createSearchController = loadSearchControllerFactory(sandbox);
        const controller = createSearchController({
            state: {
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
                isSearching: true,
                cleanupFns: []
            },
            queryUi: {},
            results: {}
        });

        const activeUiState = JSON.parse(JSON.stringify(
            controller.__test.getSearchControlUiState(true, 'Searching 42%')
        ));
        assert.deepEqual(activeUiState, {
            searchDisabled: true,
            searchClassDisabled: true,
            searchText: 'Searching 42%',
            cancelDisplay: 'block',
            cancelDisabled: false
        });

        controller.__test.applySearchControlUi(shell, activeUiState);
        assert.equal(shell.searchBtn.disabled, true);
        assert.equal(shell.searchBtn.classList.contains('disabled'), true);
        assert.equal(shell.searchBtn.innerText, 'Searching 42%');
        assert.equal(shell.cancelBtn.style.display, 'block');
        assert.equal(shell.cancelBtn.disabled, false);

        const idleUiState = JSON.parse(JSON.stringify(controller.__test.getSearchControlUiState(false)));
        assert.deepEqual(idleUiState, {
            cancelDisplay: 'none'
        });

        controller.__test.applySearchControlUi(shell, idleUiState);
        assert.equal(shell.cancelBtn.style.display, 'none');
    });

    it('derives interrupted search UI payloads through the extracted helper', () => {
        const shell = createShell();
        const sandbox = createSandbox(shell);
        const createSearchController = loadSearchControllerFactory(sandbox);
        const controller = createSearchController({
            state: {
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
                cleanupFns: []
            },
            queryUi: {},
            results: {}
        });

        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getInterruptedSearchUiState('missingData'))),
            {
                statusMessage: null,
                emptySummary: 'Data required',
                querySummaryMeta: 'Load data first',
                rowMessage: 'Please fetch data first.',
                rowClassName: 'results-message-row results-message-row-error',
                clearResults: false,
                alertMessage: null,
                alertTitle: null
            }
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getInterruptedSearchUiState('largeBoard', {
                maxRemainingSlots: 5
            }))),
            {
                statusMessage: null,
                emptySummary: 'Board too large',
                querySummaryMeta: 'Too many open slots. The current engine limit is 5 remaining slots.',
                rowMessage: 'Board too large! DFS engine supports up to 5 empty slots.',
                rowClassName: 'results-message-row results-message-row-error',
                clearResults: false,
                alertMessage: null,
                alertTitle: null
            }
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getInterruptedSearchUiState('failed', {
                errorMessage: 'boom'
            }))),
            {
                statusMessage: 'Search Error: boom',
                emptySummary: 'Search error',
                querySummaryMeta: 'Error: boom',
                rowMessage: 'boom',
                rowClassName: 'results-message-row results-message-row-error',
                clearResults: true,
                alertMessage: 'boom',
                alertTitle: 'Search Failed'
            }
        );
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
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
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
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
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

        await waitFor(
            () => typeof resolveSearchBoards === 'function',
            'Expected searchBoards to be invoked before asserting stale progress behavior.'
        );

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
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
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
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
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
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
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
                dependencies: {
                    showAlert: () => {},
                    showConfirm: async () => true
                },
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
