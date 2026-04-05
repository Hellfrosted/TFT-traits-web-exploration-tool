const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDataControllerFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'data-controller.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/data-controller.js' });
    return sandbox.window.TFTRenderer.createDataController;
}

function createSelector() {
    return {
        resolvePills: () => {},
        getValues: () => [],
        setValues: () => {}
    };
}

describe('renderer data controller', () => {
    it('retains the previously loaded dataset when a fetch fails', async () => {
        const statusMessages = [];
        const alerts = [];
        const sandbox = {
            console,
            showAlert: (message) => alerts.push(message),
            setupMultiSelect: () => createSelector(),
            window: {
                TFTRenderer: {
                    shared: {
                        formatSnapshotAge: () => ''
                    }
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const app = {
            state: {
                selectors: {},
                hasElectronAPI: true,
                electronBridge: {
                    fetchData: async () => ({ success: false, error: 'No network' })
                },
                activeData: {
                    unitMap: new Map([['A', { id: 'A' }]]),
                    dataSource: 'pbe'
                }
            },
            queryUi: {
                getSelectedDataSource: () => 'pbe',
                getDataSourceLabel: () => 'PBE',
                getCurrentVariantLocks: () => ({}),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {},
                setStatusMessage: (message) => statusMessages.push(message),
                summarizeAssetValidation: () => '',
                setDataStats: () => {},
                renderQuerySummary: () => {},
                getAssetCoverageLabel: () => 'N/A',
                renderVariantLockControls: () => {},
                applyDefaultRoleFilters: () => {},
                bindDraftQueryListeners: () => {},
                refreshDraftQuerySummary: () => {}
            },
            history: {
                updateHistoryList: () => {}
            }
        };

        const controller = createDataController(app);
        await controller.fetchData();

        assert.equal(app.state.activeData.unitMap.size, 1);
        assert.match(statusMessages[statusMessages.length - 1], /Retaining previously loaded 1-unit PBE dataset/i);
        assert.deepEqual(alerts, ['No network']);
    });

    it('preserves current variant locks when data reload succeeds', async () => {
        const renderedVariantLocks = [];
        const sandbox = {
            console,
            showAlert: () => {},
            setupMultiSelect: () => createSelector(),
            window: {
                TFTRenderer: {
                    shared: {
                        formatSnapshotAge: () => 'freshly cached'
                    }
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const app = {
            state: {
                selectors: {},
                hasElectronAPI: true,
                electronBridge: {
                    fetchData: async () => ({
                        success: true,
                        dataSource: 'pbe',
                        setNumber: '17',
                        dataFingerprint: 'abc12345',
                        snapshotFetchedAt: Date.now(),
                        usedCachedSnapshot: true,
                        count: 1,
                        units: [
                            {
                                id: 'MissFortune',
                                displayName: 'Miss Fortune',
                                variants: [{ id: 'conduit', label: 'Conduit' }]
                            }
                        ],
                        traits: ['Conduit'],
                        roles: ['Carry'],
                        traitBreakpoints: { Conduit: [2] },
                        traitIcons: {},
                        assetValidation: null,
                        hashMap: {}
                    })
                },
                activeData: null,
                lastSearchParams: null
            },
            queryUi: {
                getSelectedDataSource: () => 'pbe',
                getDataSourceLabel: () => 'PBE',
                getCurrentVariantLocks: () => ({ MissFortune: 'conduit' }),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {},
                setStatusMessage: () => {},
                summarizeAssetValidation: () => '',
                setDataStats: () => {},
                renderQuerySummary: () => {},
                getAssetCoverageLabel: () => 'N/A',
                renderVariantLockControls: (locks) => renderedVariantLocks.push(locks),
                applyDefaultRoleFilters: () => {},
                bindDraftQueryListeners: () => {},
                refreshDraftQuerySummary: () => {}
            },
            history: {
                updateHistoryList: () => {}
            }
        };

        const controller = createDataController(app);
        await controller.fetchData();

        assert.deepEqual(renderedVariantLocks, [{ MissFortune: 'conduit' }]);
        assert.equal(app.state.activeData.unitMap.has('MissFortune'), true);
    });

    it('invalidates stale results when a different dataset fingerprint is loaded', async () => {
        const renderedMessages = [];
        const sandbox = {
            console,
            document: {
                getElementById: () => ({ innerHTML: '' })
            },
            showAlert: () => {},
            setupMultiSelect: () => createSelector(),
            window: {
                TFTRenderer: {
                    shared: {
                        formatSnapshotAge: () => 'freshly cached'
                    }
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const app = {
            state: {
                selectors: {},
                hasElectronAPI: true,
                currentResults: [{ units: ['OldBoard'] }],
                currentResultsFingerprint: 'old-fingerprint',
                selectedBoardIndex: 0,
                electronBridge: {
                    fetchData: async () => ({
                        success: true,
                        dataSource: 'pbe',
                        setNumber: '17',
                        dataFingerprint: 'new-fingerprint',
                        snapshotFetchedAt: Date.now(),
                        usedCachedSnapshot: false,
                        count: 1,
                        units: [
                            {
                                id: 'MissFortune',
                                displayName: 'Miss Fortune',
                                variants: [{ id: 'conduit', label: 'Conduit' }]
                            }
                        ],
                        traits: ['Conduit'],
                        roles: ['Carry'],
                        traitBreakpoints: { Conduit: [2] },
                        traitIcons: {},
                        assetValidation: null,
                        hashMap: {}
                    })
                },
                activeData: {
                    unitMap: new Map([['Legacy', { id: 'Legacy' }]]),
                    dataSource: 'pbe',
                    dataFingerprint: 'old-fingerprint'
                },
                lastSearchParams: { boardSize: 9, maxResults: 50, variantLocks: {} }
            },
            queryUi: {
                getSelectedDataSource: () => 'pbe',
                getDataSourceLabel: () => 'PBE',
                getCurrentVariantLocks: () => ({}),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {},
                setStatusMessage: () => {},
                summarizeAssetValidation: () => '',
                setDataStats: () => {},
                renderQuerySummary: (_params, meta) => renderedMessages.push(meta),
                getAssetCoverageLabel: () => 'N/A',
                renderVariantLockControls: () => {},
                applyDefaultRoleFilters: () => {},
                bindDraftQueryListeners: () => {},
                refreshDraftQuerySummary: () => {}
            },
            results: {
                renderEmptySummary: (message) => renderedMessages.push(message),
                renderEmptySpotlight: (message) => renderedMessages.push(message),
                renderResultsMessageRow: (message) => message
            },
            history: {
                updateHistoryList: () => {}
            }
        };

        const controller = createDataController(app);
        await controller.fetchData();

        assert.equal(app.state.currentResults.length, 0);
        assert.equal(app.state.currentResultsFingerprint, null);
        assert.equal(app.state.selectedBoardIndex, -1);
        assert.ok(renderedMessages.some((message) => /Data refreshed/i.test(message)));
        assert.ok(renderedMessages.some((message) => /Re-run query/i.test(message)));
    });

    it('keeps the newest fetch result when overlapping refreshes resolve out of order', async () => {
        const pendingResponses = [];
        const bridgeCalls = [];
        const sandbox = {
            console,
            document: {
                getElementById: () => ({ innerHTML: '' })
            },
            showAlert: () => {},
            setupMultiSelect: () => createSelector(),
            window: {
                TFTRenderer: {
                    shared: {
                        formatSnapshotAge: () => ''
                    }
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const app = {
            state: {
                selectors: {},
                hasElectronAPI: true,
                nextDataFetchRequestId: 0,
                activeDataFetchRequestId: 0,
                electronBridge: {
                    fetchData: async (source) => {
                        bridgeCalls.push(source);
                        return await new Promise((resolve) => {
                            pendingResponses.push(resolve);
                        });
                    }
                },
                activeData: null,
                lastSearchParams: null
            },
            queryUi: {
                getSelectedDataSource: () => 'pbe',
                getDataSourceLabel: () => 'PBE',
                getCurrentVariantLocks: () => ({}),
                syncFetchButtonState: () => {},
                syncSearchButtonState: () => {},
                setStatusMessage: () => {},
                summarizeAssetValidation: () => '',
                setDataStats: () => {},
                renderQuerySummary: () => {},
                getAssetCoverageLabel: () => 'N/A',
                renderVariantLockControls: () => {},
                applyDefaultRoleFilters: () => {},
                bindDraftQueryListeners: () => {},
                refreshDraftQuerySummary: () => {}
            },
            results: {
                renderEmptySummary: () => {},
                renderEmptySpotlight: () => {},
                renderResultsMessageRow: (message) => message
            },
            history: {
                updateHistoryList: () => {}
            }
        };

        const controller = createDataController(app);
        const firstFetch = controller.fetchData();
        const secondFetch = controller.fetchData();

        pendingResponses[0]({
            success: true,
            dataSource: 'pbe',
            setNumber: '17',
            dataFingerprint: 'older',
            snapshotFetchedAt: null,
            usedCachedSnapshot: false,
            count: 1,
            units: [{ id: 'A', displayName: 'A', variants: [] }],
            traits: ['TraitA'],
            roles: ['Carry'],
            traitBreakpoints: {},
            traitIcons: {},
            assetValidation: null,
            hashMap: {}
        });

        await firstFetch;
        assert.equal(app.state.activeData, null);
        assert.equal(app.state.isFetchingData, true);

        pendingResponses[1]({
            success: true,
            dataSource: 'pbe',
            setNumber: '17',
            dataFingerprint: 'newer',
            snapshotFetchedAt: null,
            usedCachedSnapshot: false,
            count: 1,
            units: [{ id: 'B', displayName: 'B', variants: [] }],
            traits: ['TraitB'],
            roles: ['Tank'],
            traitBreakpoints: {},
            traitIcons: {},
            assetValidation: null,
            hashMap: {}
        });

        await secondFetch;

        assert.deepEqual(bridgeCalls, ['pbe', 'pbe']);
        assert.equal(app.state.activeData.dataFingerprint, 'newer');
        assert.equal(app.state.activeData.unitMap.has('B'), true);
        assert.equal(app.state.isFetchingData, false);
    });
});
