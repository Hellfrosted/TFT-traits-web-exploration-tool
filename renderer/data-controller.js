(function initializeDataControllerFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { formatSnapshotAge } = ns.shared;

    ns.createDataController = function createDataController(app) {
        const { state } = app;
        let hasReportedMissingSetupDependency = false;

        function reportMissingSetupDependency() {
            if (hasReportedMissingSetupDependency) {
                return;
            }

            hasReportedMissingSetupDependency = true;
            console.error('[Renderer Dependency Missing] setupMultiSelect is unavailable.');
            app.queryUi.setStatusMessage('Renderer dependency mismatch: selector controls unavailable.');
        }

        function getSetupMultiSelect() {
            const setupMultiSelect = state.dependencies?.setupMultiSelect;
            if (typeof setupMultiSelect === 'function') {
                return setupMultiSelect;
            }

            reportMissingSetupDependency();
            return null;
        }

        function showAlert(message, title = 'Attention') {
            const alertFn = state.dependencies?.showAlert;
            if (typeof alertFn === 'function') {
                return alertFn(message, title);
            }

            console.error('[Renderer Dependency Missing] showAlert is unavailable.', { title, message });
            app.queryUi.setStatusMessage(`Renderer dependency mismatch: unable to show "${title}".`);
            return Promise.resolve(false);
        }

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
            app.queryUi.syncFetchButtonState();
            app.queryUi.syncSearchButtonState();
            app.queryUi.setStatusMessage(`Connecting to ${sourceLabel} Data Engine...`);

            try {
                if (!state.hasElectronAPI) {
                    throw new Error('Electron preload bridge is unavailable.');
                }

                const res = await state.electronBridge.fetchData(source);
                if (requestId !== state.activeDataFetchRequestId) {
                    return;
                }
                if (res.success) {
                    const activeSource = res.dataSource || source;
                    const activeSourceLabel = app.queryUi.getDataSourceLabel(activeSource);
                    const setLabel = res.setNumber ? `${activeSourceLabel} Set ${res.setNumber}` : `${activeSourceLabel} latest detected set`;
                    const fingerprintShort = res.dataFingerprint ? res.dataFingerprint.slice(0, 8) : 'unknown';
                    const snapshotAgeLabel = formatSnapshotAge(res.snapshotFetchedAt);
                    const cacheSummary = res.usedCachedSnapshot
                        ? ` Using cached snapshot${snapshotAgeLabel ? ` (${snapshotAgeLabel})` : ''}.`
                        : '';

                    state.activeData = {
                        unitMap: new Map(res.units.map((unit) => [unit.id, unit])),
                        traits: res.traits || [],
                        roles: res.roles || [],
                        traitBreakpoints: res.traitBreakpoints || {},
                        traitIcons: res.traitIcons || {},
                        assetValidation: res.assetValidation || null,
                        setNumber: res.setNumber,
                        dataSource: activeSource,
                        dataFingerprint: res.dataFingerprint,
                        hashMap: res.hashMap || {},
                        snapshotFetchedAt: res.snapshotFetchedAt || null,
                        usedCachedSnapshot: !!res.usedCachedSnapshot
                    };

                    const dataChanged = previousFingerprint && previousFingerprint !== state.activeData.dataFingerprint;

                    const assetSummary = app.queryUi.summarizeAssetValidation(res.assetValidation);
                    app.queryUi.setStatusMessage(assetSummary
                        ? `Loaded ${res.count} parsed champions from ${setLabel} (${fingerprintShort}). ${assetSummary}${cacheSummary}`
                        : `Loaded ${res.count} parsed champions from ${setLabel} (${fingerprintShort}).${cacheSummary}`);
                    app.queryUi.setDataStats(
                        res.units.length,
                        res.traits.length,
                        res.roles.length,
                        app.queryUi.getAssetCoverageLabel(res.assetValidation)
                    );
                    app.queryUi.renderQuerySummary(null, `Loaded ${setLabel}`);

                    const unitOptions = res.units.map((unit) => ({
                        ...unit,
                        pillLabel: unit.displayName || unit.id,
                        dropdownMeta: collectUnitTraitLabels(unit).join(' • ')
                    }));
                    const setupMultiSelect = getSetupMultiSelect();
                    if (!setupMultiSelect) {
                        return;
                    }

                    state.selectors.mustInclude = setupMultiSelect('mustIncludeContainer', unitOptions, true);
                    state.selectors.mustExclude = setupMultiSelect('mustExcludeContainer', unitOptions, true);

                    const traitOptions = res.traits.map((trait) => ({
                        value: trait,
                        label: trait,
                        iconUrl: res.traitIcons?.[trait] || null
                    }));
                    state.selectors.mustIncludeTraits = setupMultiSelect('mustIncludeTraitsContainer', traitOptions, false);
                    state.selectors.mustExcludeTraits = setupMultiSelect('mustExcludeTraitsContainer', traitOptions, false);
                    state.selectors.extraEmblems = setupMultiSelect('extraEmblemsContainer', traitOptions, false);
                    state.selectors.tankRoles = setupMultiSelect('tankRolesContainer', res.roles, false);
                    state.selectors.carryRoles = setupMultiSelect('carryRolesContainer', res.roles, false);

                    app.queryUi.renderVariantLockControls(state.lastSearchParams?.variantLocks || preservedVariantLocks);

                    Object.values(state.selectors).forEach((selector) => selector.resolvePills(res.hashMap));
                    app.queryUi.applyDefaultRoleFilters();
                    const replayedPayload = typeof app.queryUi.normalizeSearchParams === 'function'
                        ? await app.queryUi.normalizeSearchParams(previousEffectiveQuery)
                        : { params: previousEffectiveQuery, comparisonKey: null };
                    const replayedQuery = replayedPayload?.params || previousEffectiveQuery;
                    app.queryUi.applySearchParams(replayedQuery);
                    const effectivePayload = typeof app.queryUi.normalizeSearchParams === 'function'
                        ? await app.queryUi.normalizeSearchParams(app.queryUi.getCurrentSearchParams())
                        : { params: app.queryUi.getCurrentSearchParams(), comparisonKey: null };
                    const effectiveQuery = effectivePayload?.params || app.queryUi.getCurrentSearchParams();
                    const queryChanged = typeof replayedPayload?.comparisonKey === 'string' && typeof effectivePayload?.comparisonKey === 'string'
                        ? replayedPayload.comparisonKey !== effectivePayload.comparisonKey
                        : true;

                    app.queryUi.bindDraftQueryListeners();
                    if (state.lastSearchParams) {
                        state.lastSearchParams = effectiveQuery;
                    }
                    if (hadVisibleResults && queryChanged) {
                        state.currentResults = [];
                        state.currentResultsFingerprint = null;
                        state.selectedBoardIndex = -1;
                        app.results.renderEmptySummary('Data refreshed');
                        app.results.renderEmptySpotlight('Query controls changed after refresh. Re-run the query to compute aligned results.');
                        document.getElementById('resBody').innerHTML = app.results.renderResultsMessageRow(
                            'Data refresh normalized the active query. Re-run the query to compute aligned results.',
                            'results-message-row results-message-row-muted'
                        );
                        app.queryUi.renderQuerySummary(effectiveQuery, `Loaded ${setLabel}. Query normalized; re-run.`);
                    } else {
                        app.queryUi.refreshDraftQuerySummary();
                        if (hadVisibleResults) {
                            app.queryUi.renderQuerySummary(effectiveQuery, dataChanged
                                ? `Loaded ${setLabel}. Query preserved.`
                                : `Loaded ${setLabel}.`);
                        }
                    }
                    app.history.updateHistoryList();
                } else {
                    const retained = state.activeData?.unitMap?.size
                        ? ` Retaining previously loaded ${state.activeData.unitMap.size}-unit ${app.queryUi.getDataSourceLabel(state.activeData.dataSource)} dataset.`
                        : '';
                    app.queryUi.setStatusMessage(`Error: ${res.error}.${retained}`);
                    if (!state.activeData) {
                        app.queryUi.setDataStats();
                    }
                    void showAlert(res.error, 'Data Fetch Failed');
                }
            } catch (err) {
                if (requestId !== state.activeDataFetchRequestId) {
                    return;
                }
                const retained = state.activeData?.unitMap?.size
                    ? ` Retaining previously loaded ${state.activeData.unitMap.size}-unit ${app.queryUi.getDataSourceLabel(state.activeData.dataSource)} dataset.`
                    : '';
                app.queryUi.setStatusMessage(`Failed to communicate with main process: ${err.message || err}.${retained}`);
                if (!state.activeData) {
                    app.queryUi.setDataStats();
                }
                console.error(err);
            } finally {
                if (requestId === state.activeDataFetchRequestId) {
                    state.isFetchingData = false;
                    app.queryUi.syncFetchButtonState();
                    app.queryUi.syncSearchButtonState();
                }
            }
        }

        return {
            fetchData
        };
    };
})();
