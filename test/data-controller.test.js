const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const normalizeParams = require('../renderer/normalize-params.js');

function loadDataControllerFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'data-controller.js'),
        'utf8'
    );

    if (sandbox.window?.TFTRenderer && !sandbox.window.TFTRenderer.normalizeParams) {
        sandbox.window.TFTRenderer.normalizeParams = normalizeParams;
    }

    vm.runInNewContext(source, sandbox, { filename: 'renderer/data-controller.js' });
    return sandbox.window.TFTRenderer.createDataController;
}

function getOptionValue(option, isUnit = true) {
    if (typeof option === 'string') return option;
    if (isUnit) return String(option?.id ?? option?.value ?? '').trim();
    return String(option?.value ?? option?.id ?? option?.label ?? '').trim();
}

function createSelector(options = [], isUnit = true) {
    const allowedValues = new Set(
        options
            .map((option) => getOptionValue(option, isUnit))
            .filter(Boolean)
    );
    let selectedValues = [];

    return {
        resolvePills: (hashMap = {}) => {
            selectedValues = selectedValues
                .map((value) => hashMap[value] || value)
                .filter((value, index, all) => all.indexOf(value) === index)
                .filter((value) => !allowedValues.size || allowedValues.has(value));
        },
        getValues: () => [...selectedValues],
        setValues: (values) => {
            const nextValues = Array.isArray(values) ? values : [];
            selectedValues = nextValues
                .map((value) => String(value ?? '').trim())
                .filter(Boolean)
                .filter((value, index, all) => all.indexOf(value) === index)
                .filter((value) => !allowedValues.size || allowedValues.has(value));
        }
    };
}

describe('renderer data controller', () => {
    it('retains the previously loaded dataset when a fetch fails', async () => {
        const statusMessages = [];
        const alerts = [];
        const sandbox = {
            console,
            showAlert: (message) => alerts.push(message),
            setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
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
                refreshDraftQuerySummary: () => {},
                getCurrentSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: [],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    tankRoles: [],
                    carryRoles: [],
                    variantLocks: {},
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                })
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
            setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
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
                refreshDraftQuerySummary: () => {},
                getDefaultSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: [],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    variantLocks: {},
                    tankRoles: null,
                    carryRoles: null,
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                }),
                applySearchParams: (params) => {
                    app.state.selectors.mustInclude?.setValues(params.mustInclude || []);
                    app.state.selectors.mustExclude?.setValues(params.mustExclude || []);
                    app.state.selectors.mustIncludeTraits?.setValues(params.mustIncludeTraits || []);
                    app.state.selectors.mustExcludeTraits?.setValues(params.mustExcludeTraits || []);
                    app.state.selectors.extraEmblems?.setValues(params.extraEmblems || []);
                    app.state.selectors.tankRoles?.setValues(params.tankRoles || []);
                    app.state.selectors.carryRoles?.setValues(params.carryRoles || []);
                },
                getCurrentSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: app.state.selectors.mustInclude?.getValues() || [],
                    mustExclude: app.state.selectors.mustExclude?.getValues() || [],
                    mustIncludeTraits: app.state.selectors.mustIncludeTraits?.getValues() || [],
                    mustExcludeTraits: app.state.selectors.mustExcludeTraits?.getValues() || [],
                    extraEmblems: app.state.selectors.extraEmblems?.getValues() || [],
                    tankRoles: app.state.selectors.tankRoles?.getValues() || [],
                    carryRoles: app.state.selectors.carryRoles?.getValues() || [],
                    variantLocks: {},
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                })
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

    it('keeps results when the effective query is preserved after refresh', async () => {
        const renderedMessages = [];
        const sandbox = {
            console,
            document: {
                getElementById: () => ({ innerHTML: '' })
            },
            showAlert: () => {},
            setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
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
                    unitMap: new Map([['MissFortune', { id: 'MissFortune' }]]),
                    traits: ['Conduit'],
                    roles: ['Carry'],
                    dataSource: 'pbe',
                    dataFingerprint: 'old-fingerprint'
                },
                lastSearchParams: {
                    boardSize: 9,
                    maxResults: 50,
                    mustInclude: ['MissFortune'],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    tankRoles: [],
                    carryRoles: ['Carry'],
                    variantLocks: {},
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                }
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
                refreshDraftQuerySummary: () => {},
                getDefaultSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: [],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    variantLocks: {},
                    tankRoles: null,
                    carryRoles: null,
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                }),
                applySearchParams: (params) => {
                    app.state.selectors.mustInclude?.setValues(params.mustInclude || []);
                    app.state.selectors.mustExclude?.setValues(params.mustExclude || []);
                    app.state.selectors.mustIncludeTraits?.setValues(params.mustIncludeTraits || []);
                    app.state.selectors.mustExcludeTraits?.setValues(params.mustExcludeTraits || []);
                    app.state.selectors.extraEmblems?.setValues(params.extraEmblems || []);
                    app.state.selectors.tankRoles?.setValues(params.tankRoles || []);
                    app.state.selectors.carryRoles?.setValues(params.carryRoles || []);
                },
                getCurrentSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 50,
                    mustInclude: app.state.selectors.mustInclude?.getValues() || [],
                    mustExclude: app.state.selectors.mustExclude?.getValues() || [],
                    mustIncludeTraits: app.state.selectors.mustIncludeTraits?.getValues() || [],
                    mustExcludeTraits: app.state.selectors.mustExcludeTraits?.getValues() || [],
                    extraEmblems: app.state.selectors.extraEmblems?.getValues() || [],
                    tankRoles: app.state.selectors.tankRoles?.getValues() || [],
                    carryRoles: app.state.selectors.carryRoles?.getValues() || [],
                    variantLocks: {},
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                })
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

        assert.equal(app.state.currentResults.length, 1);
        assert.equal(app.state.currentResultsFingerprint, 'old-fingerprint');
        assert.equal(app.state.selectedBoardIndex, 0);
        assert.ok(renderedMessages.some((message) => /Query preserved/i.test(message)));
    });

    it('clears visible results when refresh normalizes the effective query', async () => {
        const renderedMessages = [];
        const sandbox = {
            console,
            document: {
                getElementById: () => ({ innerHTML: '' })
            },
            showAlert: () => {},
            setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
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
                    traits: ['LegacyTrait'],
                    roles: ['Carry'],
                    dataSource: 'pbe',
                    dataFingerprint: 'old-fingerprint'
                },
                lastSearchParams: {
                    boardSize: 9,
                    maxResults: 50,
                    mustInclude: ['Legacy'],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    tankRoles: [],
                    carryRoles: ['Carry'],
                    variantLocks: {},
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                }
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
                refreshDraftQuerySummary: () => {},
                getDefaultSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: [],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    variantLocks: {},
                    tankRoles: null,
                    carryRoles: null,
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                }),
                applySearchParams: (params) => {
                    app.state.selectors.mustInclude?.setValues(params.mustInclude || []);
                    app.state.selectors.mustExclude?.setValues(params.mustExclude || []);
                    app.state.selectors.mustIncludeTraits?.setValues(params.mustIncludeTraits || []);
                    app.state.selectors.mustExcludeTraits?.setValues(params.mustExcludeTraits || []);
                    app.state.selectors.extraEmblems?.setValues(params.extraEmblems || []);
                    app.state.selectors.tankRoles?.setValues(params.tankRoles || []);
                    app.state.selectors.carryRoles?.setValues(params.carryRoles || []);
                },
                getCurrentSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 50,
                    mustInclude: app.state.selectors.mustInclude?.getValues() || [],
                    mustExclude: app.state.selectors.mustExclude?.getValues() || [],
                    mustIncludeTraits: app.state.selectors.mustIncludeTraits?.getValues() || [],
                    mustExcludeTraits: app.state.selectors.mustExcludeTraits?.getValues() || [],
                    extraEmblems: app.state.selectors.extraEmblems?.getValues() || [],
                    tankRoles: app.state.selectors.tankRoles?.getValues() || [],
                    carryRoles: app.state.selectors.carryRoles?.getValues() || [],
                    variantLocks: {},
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                })
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
        assert.ok(renderedMessages.some((message) => /Query normalized/i.test(message)));
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
            setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
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
                refreshDraftQuerySummary: () => {},
                getDefaultSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: [],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    variantLocks: {},
                    tankRoles: null,
                    carryRoles: null,
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                }),
                applySearchParams: (params) => {
                    app.state.selectors.mustInclude?.setValues(params.mustInclude || []);
                    app.state.selectors.mustExclude?.setValues(params.mustExclude || []);
                    app.state.selectors.mustIncludeTraits?.setValues(params.mustIncludeTraits || []);
                    app.state.selectors.mustExcludeTraits?.setValues(params.mustExcludeTraits || []);
                    app.state.selectors.extraEmblems?.setValues(params.extraEmblems || []);
                    app.state.selectors.tankRoles?.setValues(params.tankRoles || []);
                    app.state.selectors.carryRoles?.setValues(params.carryRoles || []);
                },
                getCurrentSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: app.state.selectors.mustInclude?.getValues() || [],
                    mustExclude: app.state.selectors.mustExclude?.getValues() || [],
                    mustIncludeTraits: app.state.selectors.mustIncludeTraits?.getValues() || [],
                    mustExcludeTraits: app.state.selectors.mustExcludeTraits?.getValues() || [],
                    extraEmblems: app.state.selectors.extraEmblems?.getValues() || [],
                    tankRoles: app.state.selectors.tankRoles?.getValues() || [],
                    carryRoles: app.state.selectors.carryRoles?.getValues() || [],
                    variantLocks: {},
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                })
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

describe('normalize-params shared contract', () => {
    it('normalizeStringList deduplicates and trims values identically to searchParams', () => {
        const { normalizeStringList: fromShared } = require('../renderer/normalize-params.js');
        const { normalizeStringList: fromBackend } = require('../searchParams.js');

        const input = ['Lux', '  Lux  ', '', null, 'Mage', { value: 'Mage' }, { id: 'Riven' }];
        assert.deepEqual(fromShared(input), fromBackend(input));
    });

    it('normalizeStringMap produces the same output from shared and backend', () => {
        const { normalizeStringMap: fromShared } = require('../renderer/normalize-params.js');
        const { normalizeStringMap: fromBackend } = require('../searchParams.js');

        const input = {
            MissFortune: { value: 'conduit' },
            Vex: '  shadow  ',
            ' ': 'ignored',
            Annie: ''
        };
        assert.deepEqual(fromShared(input), fromBackend(input));
    });

    it('normalizeBoolean resolves falsy strings the same way in shared and backend paths', () => {
        const { normalizeBoolean: fromShared } = require('../renderer/normalize-params.js');
        const { normalizeBoolean: fromBackend } = require('../searchParams.js');

        const falsyCases = ['false', '0', 'off', 'no'];
        const truthyCases = ['true', '1', 'on', 'yes'];

        falsyCases.forEach((v) => {
            assert.equal(fromShared(v), false, `shared: '${v}' should be false`);
            assert.equal(fromBackend(v), false, `backend: '${v}' should be false`);
        });
        truthyCases.forEach((v) => {
            assert.equal(fromShared(v), true, `shared: '${v}' should be true`);
            assert.equal(fromBackend(v), true, `backend: '${v}' should be true`);
        });
    });

    it('normalizes boolean flags consistently with backend (string false is false, not truthy)', async () => {
        const sandbox = {
            console,
            showAlert: () => {},
            setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
            window: {
                TFTRenderer: {
                    shared: { formatSnapshotAge: () => '' }
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
                        dataFingerprint: 'abc123',
                        snapshotFetchedAt: null,
                        usedCachedSnapshot: false,
                        count: 1,
                        units: [{ id: 'Lux', displayName: 'Lux', variants: [] }],
                        traits: ['Mage'],
                        roles: ['Carry'],
                        traitBreakpoints: {},
                        traitIcons: {},
                        assetValidation: null,
                        hashMap: {}
                    })
                },
                activeData: null,
                lastSearchParams: {
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: [],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    variantLocks: {},
                    tankRoles: [],
                    carryRoles: [],
                    onlyActive: 'false',
                    tierRank: 0,
                    includeUnique: 'yes'
                }
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
                refreshDraftQuerySummary: () => {},
                getDefaultSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: [],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    variantLocks: {},
                    tankRoles: [],
                    carryRoles: [],
                    onlyActive: true,
                    tierRank: false,
                    includeUnique: false
                }),
                applySearchParams: () => {},
                getCurrentSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 500,
                    mustInclude: [],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    tankRoles: [],
                    carryRoles: [],
                    variantLocks: {},
                    onlyActive: 'false',
                    tierRank: 0,
                    includeUnique: 'yes'
                })
            },
            history: { updateHistoryList: () => {} }
        };

        const controller = createDataController(app);
        await controller.fetchData();

        const { normalizeSearchParams } = require('../searchParams.js');
        const backend = normalizeSearchParams({
            boardSize: 9,
            maxResults: 500,
            mustInclude: [],
            mustExclude: [],
            mustIncludeTraits: [],
            mustExcludeTraits: [],
            extraEmblems: [],
            tankRoles: [],
            carryRoles: [],
            variantLocks: {},
            onlyActive: 'false',
            tierRank: 0,
            includeUnique: 'yes'
        });

        assert.equal(backend.onlyActive, false, "backend: 'false' → false");
        assert.equal(backend.tierRank, false, 'backend: 0 → false');
        assert.equal(backend.includeUnique, true, "backend: 'yes' → true");

        // The renderer replay path must produce the same booleans (state.lastSearchParams
        // is updated to effectiveQuery when it was already set before the refresh).
        assert.equal(app.state.lastSearchParams.onlyActive, false, "renderer replay: 'false' → false, same as backend");
        assert.equal(app.state.lastSearchParams.tierRank, false, 'renderer replay: 0 → false, same as backend');
        assert.equal(app.state.lastSearchParams.includeUnique, true, "renderer replay: 'yes' → true, same as backend");
    });

    it('clampInteger behaviour is identical between shared and backend', () => {
        const { clampInteger: fromShared } = require('../renderer/normalize-params.js');

        assert.equal(fromShared('0', 9, 1, 20), 1);
        assert.equal(fromShared('25', 9, 1, 20), 20);
        assert.equal(fromShared('abc', 9, 1, 20), 9);
        assert.equal(fromShared(null, 9, 1, 20), 9);
        assert.equal(fromShared(7, 9, 1, 20), 7);
    });
});
