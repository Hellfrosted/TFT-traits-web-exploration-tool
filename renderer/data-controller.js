(function initializeDataControllerFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { formatSnapshotAge, resolveShellElements, reportRendererIssue, createDialogInvoker, setResultsBodyMessage } = ns.shared;

    ns.createDataController = function createDataController(app) {
        const { state } = app;
        const reporterState = {
            missingSetupDependency: false
        };

        function reportMissingSetupDependency() {
            reportRendererIssue(app, reporterState, 'missingSetupDependency', {
                consoleMessage: '[Renderer Dependency Missing] setupMultiSelect is unavailable.',
                statusMessage: 'Renderer dependency mismatch: selector controls unavailable.'
            });
        }

        function getSetupMultiSelect() {
            const setupMultiSelect = state.dependencies?.setupMultiSelect;
            if (typeof setupMultiSelect === 'function') {
                return setupMultiSelect;
            }

            reportMissingSetupDependency();
            return null;
        }

        const showAlert = typeof createDialogInvoker === 'function'
            ? createDialogInvoker(app, null, {
                methodName: 'showAlert',
                statusMessage: ({ title }) => `Renderer dependency mismatch: unable to show "${title}".`
            })
            : function fallbackShowAlert(message, title = 'Attention') {
                const alertFn = state.dependencies?.showAlert;
                if (typeof alertFn === 'function') {
                    return alertFn(message, title);
                }

                reportRendererIssue(app, null, null, {
                    consoleMessage: '[Renderer Dependency Missing] showAlert is unavailable.',
                    consoleDetail: { title, message },
                    statusMessage: `Renderer dependency mismatch: unable to show "${title}".`
                });
                return Promise.resolve(false);
            };

        function collectUnitTraitLabels(unit) {
            const traitNames = new Set();

            const addTraitNames = (entity) => {
                if (!entity || typeof entity !== 'object') return;

                if (entity.traitContributions && typeof entity.traitContributions === 'object') {
                    Object.keys(entity.traitContributions).forEach((traitName) => {
                        if (traitName) traitNames.add(traitName);
                    });
                } else {
                    (entity.traits || []).forEach((traitName) => {
                        if (traitName) traitNames.add(traitName);
                    });
                }
            };

            addTraitNames(unit);
            (unit?.variants || []).forEach((variant) => addTraitNames(variant));

            return [...traitNames].sort((left, right) => left.localeCompare(right));
        }

        function syncFetchUi(sourceLabel = null) {
            app.queryUi.syncFetchButtonState();
            app.queryUi.syncSearchButtonState();
            if (sourceLabel) {
                app.queryUi.setStatusMessage(`Connecting to ${sourceLabel} Data Engine...`);
            }
        }

        function getRetainedDatasetSummary() {
            if (!state.activeData?.unitMap?.size) {
                return '';
            }

            return ` Retaining previously loaded ${state.activeData.unitMap.size}-unit ${app.queryUi.getDataSourceLabel(state.activeData.dataSource)} dataset.`;
        }

        function getSetLabel(res, fallbackSource) {
            const activeSource = res.dataSource || fallbackSource;
            const activeSourceLabel = app.queryUi.getDataSourceLabel(activeSource);
            return res.setNumber
                ? `${activeSourceLabel} Set ${res.setNumber}`
                : `${activeSourceLabel} latest detected set`;
        }

        function getCacheSummary(res) {
            const snapshotAgeLabel = formatSnapshotAge(res.snapshotFetchedAt);
            return res.usedCachedSnapshot
                ? ` Using cached snapshot${snapshotAgeLabel ? ` (${snapshotAgeLabel})` : ''}.`
                : '';
        }

        function buildActiveData(res, fallbackSource) {
            return {
                unitMap: new Map(res.units.map((unit) => [unit.id, unit])),
                traits: res.traits || [],
                roles: res.roles || [],
                traitBreakpoints: res.traitBreakpoints || {},
                traitIcons: res.traitIcons || {},
                assetValidation: res.assetValidation || null,
                setNumber: res.setNumber,
                dataSource: res.dataSource || fallbackSource,
                dataFingerprint: res.dataFingerprint,
                hashMap: res.hashMap || {},
                snapshotFetchedAt: res.snapshotFetchedAt || null,
                usedCachedSnapshot: !!res.usedCachedSnapshot
            };
        }

        function renderLoadedDataStatus(res, setLabel, cacheSummary) {
            const uiState = getLoadedDataUiState(res, setLabel, cacheSummary);
            app.queryUi.setStatusMessage(uiState.statusMessage);
            app.queryUi.setDataStats(...uiState.dataStats);
            app.queryUi.renderQuerySummary(null, uiState.querySummaryMeta);
        }

        function getLoadedDataUiState(res, setLabel, cacheSummary = '') {
            const fingerprintShort = res.dataFingerprint ? res.dataFingerprint.slice(0, 8) : 'unknown';
            const assetSummary = app.queryUi.summarizeAssetValidation(res.assetValidation);
            return {
                statusMessage: assetSummary
                    ? `Loaded ${res.count} parsed champions from ${setLabel} (${fingerprintShort}). ${assetSummary}${cacheSummary}`
                    : `Loaded ${res.count} parsed champions from ${setLabel} (${fingerprintShort}).${cacheSummary}`,
                dataStats: [
                    res.units.length,
                    res.traits.length,
                    res.roles.length,
                    app.queryUi.getAssetCoverageLabel(res.assetValidation)
                ],
                querySummaryMeta: `Loaded ${setLabel}`
            };
        }

        function createUnitOptions(units) {
            return units.map((unit) => ({
                ...unit,
                pillLabel: unit.displayName || unit.id,
                dropdownMeta: collectUnitTraitLabels(unit).join(' • ')
            }));
        }

        function createTraitOptions(res) {
            return res.traits.map((trait) => ({
                value: trait,
                label: trait,
                iconUrl: res.traitIcons?.[trait] || null
            }));
        }

        function initializeSelectors(res, preservedVariantLocks) {
            const setupMultiSelect = getSetupMultiSelect();
            if (!setupMultiSelect) {
                return false;
            }

            const unitOptions = createUnitOptions(res.units);
            const traitOptions = createTraitOptions(res);

            state.selectors.mustInclude = setupMultiSelect('mustIncludeContainer', unitOptions, true);
            state.selectors.mustExclude = setupMultiSelect('mustExcludeContainer', unitOptions, true);
            state.selectors.mustIncludeTraits = setupMultiSelect('mustIncludeTraitsContainer', traitOptions, false);
            state.selectors.mustExcludeTraits = setupMultiSelect('mustExcludeTraitsContainer', traitOptions, false);
            state.selectors.extraEmblems = setupMultiSelect('extraEmblemsContainer', traitOptions, false);
            state.selectors.tankRoles = setupMultiSelect('tankRolesContainer', res.roles, false);
            state.selectors.carryRoles = setupMultiSelect('carryRolesContainer', res.roles, false);

            app.queryUi.renderVariantLockControls(state.lastSearchParams?.variantLocks || preservedVariantLocks);
            Object.values(state.selectors).forEach((selector) => selector.resolvePills(res.hashMap));
            app.queryUi.applyDefaultRoleFilters();
            return true;
        }

        async function normalizeQuery(params) {
            const rawParams = params ?? app.queryUi.getCurrentSearchParams();
            if (typeof app.queryUi.normalizeSearchParams !== 'function') {
                return {
                    params: rawParams,
                    comparisonKey: null
                };
            }

            const payload = await app.queryUi.normalizeSearchParams(rawParams);
            return {
                params: payload?.params || rawParams,
                comparisonKey: payload?.comparisonKey || null
            };
        }

        function clearNormalizedResults(effectiveQuery, setLabel) {
            state.currentResults = [];
            state.currentResultsFingerprint = null;
            state.selectedBoardIndex = -1;
            app.results.renderEmptySummary('Data refreshed');
            app.results.renderEmptySpotlight('Query controls changed after refresh. Re-run the query to compute aligned results.');
            const { elements } = resolveShellElements(['resBody']);
            setResultsBodyMessage(
                app,
                elements.resBody,
                'Data refresh normalized the active query. Re-run the query to compute aligned results.',
                'results-message-row results-message-row-muted'
            );
            app.queryUi.renderQuerySummary(effectiveQuery, `Loaded ${setLabel}. Query normalized; re-run.`);
        }

        function applyPreservedRefreshState(effectiveQuery, setLabel, dataChanged, hadVisibleResults) {
            app.queryUi.refreshDraftQuerySummary();
            if (hadVisibleResults) {
                app.queryUi.renderQuerySummary(
                    effectiveQuery,
                    dataChanged ? `Loaded ${setLabel}. Query preserved.` : `Loaded ${setLabel}.`
                );
            }
        }

        function getRefreshQueryRestoreState({
            hadVisibleResults = false,
            dataChanged = false,
            setLabel = '',
            replayedComparisonKey = null,
            effectiveComparisonKey = null
        } = {}) {
            const queryChanged = typeof replayedComparisonKey === 'string'
                && typeof effectiveComparisonKey === 'string'
                ? replayedComparisonKey !== effectiveComparisonKey
                : true;

            if (hadVisibleResults && queryChanged) {
                return {
                    shouldClearResults: true,
                    summaryMeta: `Loaded ${setLabel}. Query normalized; re-run.`
                };
            }

            if (hadVisibleResults) {
                return {
                    shouldClearResults: false,
                    summaryMeta: dataChanged ? `Loaded ${setLabel}. Query preserved.` : `Loaded ${setLabel}.`
                };
            }

            return {
                shouldClearResults: false,
                summaryMeta: null
            };
        }

        function getFetchFailureUiState({
            statusLead = 'Error',
            errorMessage = 'Unknown error',
            retainedDatasetSummary = '',
            hasActiveData = false,
            alertMessage = null,
            alertTitle = null
        } = {}) {
            return {
                statusMessage: `${statusLead}: ${errorMessage}.${retainedDatasetSummary}`,
                shouldResetStats: !hasActiveData,
                alertMessage,
                alertTitle
            };
        }

        function applyFetchFailureUiState(uiState = {}) {
            app.queryUi.setStatusMessage(uiState.statusMessage || 'Error: Unknown error.');
            if (uiState.shouldResetStats) {
                app.queryUi.setDataStats();
            }
            if (uiState.alertMessage) {
                void showAlert(uiState.alertMessage, uiState.alertTitle || 'Attention');
            }
        }

        async function restoreQueryState(previousEffectiveQuery, {
            hadVisibleResults,
            dataChanged,
            setLabel
        }) {
            const replayedPayload = await normalizeQuery(previousEffectiveQuery);
            const replayedQuery = replayedPayload.params;
            app.queryUi.applySearchParams(replayedQuery);

            const effectivePayload = await normalizeQuery(app.queryUi.getCurrentSearchParams());
            const effectiveQuery = effectivePayload.params;
            const restoreState = getRefreshQueryRestoreState({
                hadVisibleResults,
                dataChanged,
                setLabel,
                replayedComparisonKey: replayedPayload.comparisonKey,
                effectiveComparisonKey: effectivePayload.comparisonKey
            });

            app.queryUi.bindDraftQueryListeners();
            if (state.lastSearchParams) {
                state.lastSearchParams = effectiveQuery;
            }

            if (restoreState.shouldClearResults) {
                clearNormalizedResults(effectiveQuery, setLabel);
            } else {
                applyPreservedRefreshState(effectiveQuery, setLabel, dataChanged, hadVisibleResults);
            }
        }

        async function fetchData() {
            const source = app.queryUi.getSelectedDataSource();
            const sourceLabel = app.queryUi.getDataSourceLabel(source);
            const preservedVariantLocks = app.queryUi.getCurrentVariantLocks();
            const hadVisibleResults = Array.isArray(state.currentResults) && state.currentResults.length > 0;
            const preservedDraftParams = app.queryUi.getCurrentSearchParams();
            const previousEffectiveQuery = hadVisibleResults && state.lastSearchParams
                ? state.lastSearchParams
                : preservedDraftParams;
            const requestId = (Number.isFinite(state.nextDataFetchRequestId) ? state.nextDataFetchRequestId : 0) + 1;
            state.nextDataFetchRequestId = requestId;
            state.activeDataFetchRequestId = requestId;
            const previousFingerprint = state.activeData?.dataFingerprint || null;
            state.isFetchingData = true;
            syncFetchUi(sourceLabel);

            try {
                if (!state.hasElectronAPI) {
                    throw new Error('Electron preload bridge is unavailable.');
                }

                const res = await state.electronBridge.fetchData(source);
                if (requestId !== state.activeDataFetchRequestId) {
                    return;
                }
                if (res.success) {
                    const setLabel = getSetLabel(res, source);
                    const cacheSummary = getCacheSummary(res);
                    state.activeData = buildActiveData(res, source);
                    const dataChanged = previousFingerprint && previousFingerprint !== state.activeData.dataFingerprint;

                    renderLoadedDataStatus(res, setLabel, cacheSummary);
                    if (!initializeSelectors(res, preservedVariantLocks)) {
                        return;
                    }
                    await restoreQueryState(previousEffectiveQuery, {
                        hadVisibleResults,
                        dataChanged,
                        setLabel
                    });
                    app.history.updateHistoryList();
                } else {
                    applyFetchFailureUiState(getFetchFailureUiState({
                        statusLead: 'Error',
                        errorMessage: res.error,
                        retainedDatasetSummary: getRetainedDatasetSummary(),
                        hasActiveData: !!state.activeData,
                        alertMessage: res.error,
                        alertTitle: 'Data Fetch Failed'
                    }));
                }
            } catch (err) {
                if (requestId !== state.activeDataFetchRequestId) {
                    return;
                }
                applyFetchFailureUiState(getFetchFailureUiState({
                    statusLead: 'Failed to communicate with main process',
                    errorMessage: err.message || err,
                    retainedDatasetSummary: getRetainedDatasetSummary(),
                    hasActiveData: !!state.activeData
                }));
                console.error(err);
            } finally {
                if (requestId === state.activeDataFetchRequestId) {
                    state.isFetchingData = false;
                    syncFetchUi();
                }
            }
        }

        return {
            fetchData,
            __test: {
                getRefreshQueryRestoreState,
                getFetchFailureUiState,
                getLoadedDataUiState
            }
        };
    };
})();
