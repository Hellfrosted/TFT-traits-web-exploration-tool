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

describe('renderer history UI', () => {
    it('normalizes replayed params before applying and launching a replay search', async () => {
        let searchClicks = 0;
        const appliedParams = [];
        const renderedSummaries = [];
        const resolvedHashMaps = [];
        const sandbox = {
            console,
            showAlert: () => {},
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
                    shared: {
                        escapeHtml: (value) => String(value ?? ''),
                        summarizeParams: () => '',
                        formatTimestamp: () => ''
                    }
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                isSearching: false,
                isFetchingData: false,
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
            showAlert: () => {},
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
                    shared: {
                        escapeHtml: (value) => String(value ?? ''),
                        summarizeParams: () => '',
                        formatTimestamp: () => ''
                    }
                }
            }
        };

        const createHistoryUi = loadHistoryUiFactory(sandbox);
        const app = {
            state: {
                isSearching: false,
                isFetchingData: false,
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
