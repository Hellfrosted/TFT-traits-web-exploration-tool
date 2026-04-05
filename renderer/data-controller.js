(function initializeDataControllerFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { formatSnapshotAge } = ns.shared;

    ns.createDataController = function createDataController(app) {
        const { state } = app;
        const MIN_BOARD_SIZE = 1;
        const MAX_BOARD_SIZE = 20;
        const MIN_RESULTS = 1;
        const MAX_RESULTS = 10000;

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

        function normalizeList(values, allowedValues = null) {
            if (!Array.isArray(values)) return [];
            const seen = new Set();
            const normalized = [];
            values.forEach((value) => {
                const candidate = String(value ?? '').trim();
                if (!candidate || seen.has(candidate)) return;
                if (allowedValues && !allowedValues.has(candidate)) return;
                seen.add(candidate);
                normalized.push(candidate);
            });
            return normalized;
        }

        function normalizeVariantLocks(variantLocks = {}, variantByUnit = new Map()) {
            if (!variantLocks || typeof variantLocks !== 'object' || Array.isArray(variantLocks)) {
                return {};
            }

            const normalized = {};
            Object.keys(variantLocks).sort((left, right) => left.localeCompare(right)).forEach((unitId) => {
                const lockValue = String(variantLocks[unitId] ?? '').trim();
                if (!lockValue) return;
                const allowedVariants = variantByUnit.get(unitId);
                if (!allowedVariants || !allowedVariants.has(lockValue)) {
                    return;
                }
                normalized[unitId] = lockValue;
            });
            return normalized;
        }

        function clampInteger(value, fallback, min, max) {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed)) {
                return fallback;
            }
            return Math.min(Math.max(parsed, min), max);
        }

        function normalizeSearchParamsForActiveData(params = {}) {
            const defaults = app.queryUi.getDefaultSearchParams();
            const activeUnits = new Set(state.activeData?.unitMap ? [...state.activeData.unitMap.keys()] : []);
            const activeTraits = new Set(state.activeData?.traits || []);
            const activeRoles = new Set(state.activeData?.roles || []);
            const variantByUnit = new Map();
            if (state.activeData?.unitMap) {
                state.activeData.unitMap.forEach((unit) => {
                    if (!Array.isArray(unit?.variants) || unit.variants.length === 0) return;
                    variantByUnit.set(
                        unit.id,
                        new Set(unit.variants.map((variant) => String(variant?.id ?? '').trim()).filter(Boolean))
                    );
                });
            }

            return {
                boardSize: clampInteger(params.boardSize, defaults.boardSize, MIN_BOARD_SIZE, MAX_BOARD_SIZE),
                maxResults: clampInteger(params.maxResults, defaults.maxResults, MIN_RESULTS, MAX_RESULTS),
                mustInclude: normalizeList(params.mustInclude, activeUnits),
                mustExclude: normalizeList(params.mustExclude, activeUnits),
                mustIncludeTraits: normalizeList(params.mustIncludeTraits, activeTraits),
                mustExcludeTraits: normalizeList(params.mustExcludeTraits, activeTraits),
                tankRoles: normalizeList(params.tankRoles, activeRoles),
                carryRoles: normalizeList(params.carryRoles, activeRoles),
                extraEmblems: normalizeList(params.extraEmblems, activeTraits),
                variantLocks: normalizeVariantLocks(params.variantLocks, variantByUnit),
                onlyActive: !!params.onlyActive,
                tierRank: !!params.tierRank,
                includeUnique: !!params.includeUnique
            };
        }

        function serializeQueryForComparison(params = {}) {
            const normalized = {
                boardSize: Number.parseInt(params.boardSize, 10) || 0,
                maxResults: Number.parseInt(params.maxResults, 10) || 0,
                mustInclude: normalizeList(params.mustInclude).sort(),
                mustExclude: normalizeList(params.mustExclude).sort(),
                mustIncludeTraits: normalizeList(params.mustIncludeTraits).sort(),
                mustExcludeTraits: normalizeList(params.mustExcludeTraits).sort(),
                tankRoles: normalizeList(params.tankRoles).sort(),
                carryRoles: normalizeList(params.carryRoles).sort(),
                extraEmblems: normalizeList(params.extraEmblems).sort(),
                variantLocks: {}
            };
            Object.keys(params.variantLocks || {}).sort((left, right) => left.localeCompare(right)).forEach((unitId) => {
                const value = String(params.variantLocks[unitId] ?? '').trim();
                if (value) {
                    normalized.variantLocks[unitId] = value;
                }
            });
            normalized.onlyActive = !!params.onlyActive;
            normalized.tierRank = !!params.tierRank;
            normalized.includeUnique = !!params.includeUnique;
            return JSON.stringify(normalized);
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
                    const replayedQuery = normalizeSearchParamsForActiveData(previousEffectiveQuery);
                    app.queryUi.applySearchParams(replayedQuery);
                    const effectiveQuery = normalizeSearchParamsForActiveData(app.queryUi.getCurrentSearchParams());
                    const queryChanged = serializeQueryForComparison(previousEffectiveQuery) !== serializeQueryForComparison(effectiveQuery);

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
                        const resBody = document.getElementById('resBody');
                        if (resBody) resBody.innerHTML = app.results.renderResultsMessageRow(
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
                    showAlert(res.error, 'Data Fetch Failed');
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
