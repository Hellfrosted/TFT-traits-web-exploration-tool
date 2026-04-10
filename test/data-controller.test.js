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

function toCanonicalPayload(params = {}) {
    const stable = JSON.parse(JSON.stringify(params || {}));
    return {
        params: stable,
        comparisonKey: JSON.stringify(stable),
        dataFingerprint: 'test-fingerprint'
    };
}

function createShared(overrides = {}) {
    return {
        formatSnapshotAge: () => '',
        resolveShellElements: () => ({
            elements: {},
            missingIds: []
        }),
        setResultsBodyMessage: () => false,
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
                    shared: createShared()
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const app = {
            state: {
                selectors: {},
                dependencies: {
                    setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
                    showAlert: (message) => alerts.push(message)
                },
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
                }),
                normalizeSearchParams: async (params) => toCanonicalPayload(params)
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
                    shared: createShared({
                        formatSnapshotAge: () => 'freshly cached'
                    })
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const app = {
            state: {
                selectors: {},
                dependencies: {
                    setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
                    showAlert: () => {}
                },
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
                }),
                normalizeSearchParams: async (params) => toCanonicalPayload(params)
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

    it('fails gracefully when setupMultiSelect dependency is missing', async () => {
        const statusMessages = [];
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const app = {
            state: {
                selectors: {},
                dependencies: {
                    setupMultiSelect: null,
                    showAlert: () => {}
                },
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
                }),
                normalizeSearchParams: async (params) => toCanonicalPayload(params)
            },
            history: {
                updateHistoryList: () => {}
            }
        };

        const controller = createDataController(app);
        await assert.doesNotReject(controller.fetchData());

        assert.equal(app.state.activeData.unitMap.has('MissFortune'), true);
        assert.equal(Object.keys(app.state.selectors).length, 0);
        assert.equal(statusMessages.at(-1), 'Renderer dependency mismatch: selector controls unavailable.');
    });

    it('derives refresh query restore state through the extracted helper', () => {
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const controller = createDataController({
            state: {
                selectors: {},
                dependencies: {}
            },
            queryUi: {},
            history: {}
        });

        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getRefreshQueryRestoreState({
                hadVisibleResults: true,
                dataChanged: true,
                setLabel: 'PBE Set 17',
                replayedComparisonKey: 'before',
                effectiveComparisonKey: 'after'
            }))),
            {
                shouldClearResults: true,
                summaryMeta: 'Loaded PBE Set 17. Query normalized; re-run.'
            }
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getRefreshQueryRestoreState({
                hadVisibleResults: true,
                dataChanged: true,
                setLabel: 'PBE Set 17',
                replayedComparisonKey: 'same',
                effectiveComparisonKey: 'same'
            }))),
            {
                shouldClearResults: false,
                summaryMeta: 'Loaded PBE Set 17. Query preserved.'
            }
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getRefreshQueryRestoreState({
                hadVisibleResults: false,
                dataChanged: false,
                setLabel: 'PBE Set 17',
                replayedComparisonKey: null,
                effectiveComparisonKey: null
            }))),
            {
                shouldClearResults: false,
                summaryMeta: null
            }
        );
    });

    it('derives fetch failure ui state through the extracted helper', () => {
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const controller = createDataController({
            state: {
                selectors: {},
                dependencies: {}
            },
            queryUi: {},
            history: {}
        });

        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getFetchFailureUiState({
                statusLead: 'Error',
                errorMessage: 'No network',
                retainedDatasetSummary: ' Retaining previously loaded 1-unit PBE dataset.',
                hasActiveData: true,
                alertMessage: 'No network',
                alertTitle: 'Data Fetch Failed'
            }))),
            {
                statusMessage: 'Error: No network. Retaining previously loaded 1-unit PBE dataset.',
                shouldResetStats: false,
                alertMessage: 'No network',
                alertTitle: 'Data Fetch Failed'
            }
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getFetchFailureUiState({
                statusLead: 'Failed to communicate with main process',
                errorMessage: 'bridge down',
                retainedDatasetSummary: '',
                hasActiveData: false
            }))),
            {
                statusMessage: 'Failed to communicate with main process: bridge down.',
                shouldResetStats: true,
                alertMessage: null,
                alertTitle: null
            }
        );
    });

    it('derives loaded data ui state through the extracted helper', () => {
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const controller = createDataController({
            state: {
                selectors: {},
                dependencies: {}
            },
            queryUi: {
                summarizeAssetValidation: (assetValidation) => assetValidation?.summary || '',
                getAssetCoverageLabel: (assetValidation) => assetValidation?.coverage || 'N/A'
            },
            history: {}
        });

        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getLoadedDataUiState({
                count: 61,
                dataFingerprint: 'abc12345ffff',
                units: Array.from({ length: 61 }, (_, index) => ({ id: `U${index}` })),
                traits: Array.from({ length: 28 }, (_, index) => `T${index}`),
                roles: Array.from({ length: 7 }, (_, index) => `R${index}`),
                assetValidation: {
                    summary: '58/61 champion splashes matched',
                    coverage: '58/61'
                }
            }, 'PBE Set 17', ' Using cached snapshot.'))),
            {
                statusMessage: 'Loaded 61 parsed champions from PBE Set 17 (abc12345). 58/61 champion splashes matched Using cached snapshot.',
                dataStats: [61, 28, 7, '58/61'],
                querySummaryMeta: 'Loaded PBE Set 17'
            }
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getLoadedDataUiState({
                count: 10,
                dataFingerprint: null,
                units: Array.from({ length: 10 }, (_, index) => ({ id: `U${index}` })),
                traits: ['A'],
                roles: ['Carry'],
                assetValidation: null
            }, 'Live latest detected set', ''))),
            {
                statusMessage: 'Loaded 10 parsed champions from Live latest detected set (unknown).',
                dataStats: [10, 1, 1, 'N/A'],
                querySummaryMeta: 'Loaded Live latest detected set'
            }
        );
    });

    it('derives selector setup configs through the extracted helper', () => {
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const controller = createDataController({
            state: {
                selectors: {},
                dependencies: {}
            },
            queryUi: {},
            history: {}
        });

        const unitOptions = [{ id: 'Aurora' }];
        const traitOptions = [{ value: 'Invoker', label: 'Invoker' }];
        const roleOptions = ['Carry', 'Tank'];

        assert.deepEqual(
            JSON.parse(JSON.stringify(controller.__test.getSelectorSetupConfigs(
                unitOptions,
                traitOptions,
                roleOptions
            ))),
            [
                { key: 'mustInclude', containerId: 'mustIncludeContainer', options: unitOptions, isUnit: true },
                { key: 'mustExclude', containerId: 'mustExcludeContainer', options: unitOptions, isUnit: true },
                { key: 'mustIncludeTraits', containerId: 'mustIncludeTraitsContainer', options: traitOptions, isUnit: false },
                { key: 'mustExcludeTraits', containerId: 'mustExcludeTraitsContainer', options: traitOptions, isUnit: false },
                { key: 'extraEmblems', containerId: 'extraEmblemsContainer', options: traitOptions, isUnit: false },
                { key: 'tankRoles', containerId: 'tankRolesContainer', options: roleOptions, isUnit: false },
                { key: 'carryRoles', containerId: 'carryRolesContainer', options: roleOptions, isUnit: false }
            ]
        );
    });

    it('derives successful fetch state through the extracted helper', () => {
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: createShared({
                        formatSnapshotAge: () => 'freshly cached'
                    })
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const controller = createDataController({
            state: {
                selectors: {},
                dependencies: {}
            },
            queryUi: {
                getDataSourceLabel: () => 'PBE'
            },
            history: {}
        });

        const successState = controller.__test.getSuccessfulFetchState({
            dataSource: 'pbe',
            setNumber: '17',
            dataFingerprint: 'new-fingerprint',
            snapshotFetchedAt: Date.now(),
            usedCachedSnapshot: true,
            units: [{ id: 'MissFortune', displayName: 'Miss Fortune', variants: [] }],
            traits: ['Conduit'],
            roles: ['Carry'],
            traitBreakpoints: { Conduit: [2] },
            traitIcons: { Conduit: '/icons/conduit.png' },
            assetValidation: null,
            hashMap: { MissFortune: 'Miss Fortune' }
        }, 'pbe', 'old-fingerprint');

        assert.equal(successState.setLabel, 'PBE Set 17');
        assert.equal(successState.cacheSummary, ' Using cached snapshot (freshly cached).');
        assert.equal(successState.dataChanged, true);
        assert.equal(successState.activeData.dataSource, 'pbe');
        assert.equal(successState.activeData.dataFingerprint, 'new-fingerprint');
        assert.equal(successState.activeData.unitMap.has('MissFortune'), true);
        assert.deepEqual(successState.activeData.roles, ['Carry']);
    });

    it('derives fetch request context through the extracted helper', () => {
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: createShared()
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const currentDraftParams = { boardSize: 8, maxResults: 100 };
        const previousSearchParams = { boardSize: 9, maxResults: 50 };
        const controller = createDataController({
            state: {
                selectors: {},
                dependencies: {},
                nextDataFetchRequestId: 4,
                activeData: {
                    dataFingerprint: 'fp-1'
                },
                currentResults: [{ units: ['Board'] }],
                lastSearchParams: previousSearchParams
            },
            queryUi: {
                getSelectedDataSource: () => 'pbe',
                getDataSourceLabel: (source) => source === 'latest' ? 'Live' : 'PBE',
                getCurrentSearchParams: () => currentDraftParams,
                getCurrentVariantLocks: () => ({ MissFortune: 'conduit' })
            },
            history: {}
        });

        const visibleResultsContext = JSON.parse(JSON.stringify(controller.__test.getFetchRequestContext()));
        assert.deepEqual(visibleResultsContext, {
            source: 'pbe',
            sourceLabel: 'PBE',
            preservedVariantLocks: { MissFortune: 'conduit' },
            hadVisibleResults: true,
            preservedDraftParams: currentDraftParams,
            previousEffectiveQuery: previousSearchParams,
            requestId: 5,
            previousFingerprint: 'fp-1'
        });

        const draftOnlyContext = JSON.parse(JSON.stringify(controller.__test.getFetchRequestContext({
            source: 'latest',
            nextDataFetchRequestId: 0,
            activeData: null,
            currentResults: [],
            currentDraftParams,
            currentVariantLocks: {},
            lastSearchParams: previousSearchParams
        })));
        assert.deepEqual(draftOnlyContext, {
            source: 'latest',
            sourceLabel: 'Live',
            preservedVariantLocks: {},
            hadVisibleResults: false,
            preservedDraftParams: currentDraftParams,
            previousEffectiveQuery: currentDraftParams,
            requestId: 1,
            previousFingerprint: null
        });
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
                    shared: createShared({
                        formatSnapshotAge: () => 'freshly cached'
                    })
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const app = {
            state: {
                selectors: {},
                dependencies: {
                    setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
                    showAlert: () => {}
                },
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
                }),
                normalizeSearchParams: async (params) => toCanonicalPayload(params)
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
                    shared: createShared({
                        formatSnapshotAge: () => 'freshly cached'
                    })
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const app = {
            state: {
                selectors: {},
                dependencies: {
                    setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
                    showAlert: () => {}
                },
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
                }),
                normalizeSearchParams: async (params) => toCanonicalPayload(params)
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
                    shared: createShared()
                }
            }
        };

        const createDataController = loadDataControllerFactory(sandbox);
        const app = {
            state: {
                selectors: {},
                dependencies: {
                    setupMultiSelect: (_id, options, isUnit) => createSelector(options, isUnit),
                    showAlert: () => {}
                },
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
                }),
                normalizeSearchParams: async (params) => toCanonicalPayload(params)
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
