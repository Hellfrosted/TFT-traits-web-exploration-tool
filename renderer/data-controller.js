(function initializeDataControllerFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { formatSnapshotAge } = ns.shared;

    ns.createDataController = function createDataController(app) {
        const { state } = app;

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
            state.isFetchingData = true;
            app.queryUi.syncFetchButtonState();
            app.queryUi.setStatusMessage(`Connecting to ${sourceLabel} Data Engine...`);

            try {
                if (!state.hasElectronAPI) {
                    throw new Error('Electron preload bridge is unavailable.');
                }

                const res = await state.electronBridge.fetchData(source);
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
                    app.queryUi.bindDraftQueryListeners();
                    app.queryUi.refreshDraftQuerySummary();
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
                const retained = state.activeData?.unitMap?.size
                    ? ` Retaining previously loaded ${state.activeData.unitMap.size}-unit ${app.queryUi.getDataSourceLabel(state.activeData.dataSource)} dataset.`
                    : '';
                app.queryUi.setStatusMessage(`Failed to communicate with main process: ${err.message || err}.${retained}`);
                if (!state.activeData) {
                    app.queryUi.setDataStats();
                }
                console.error(err);
            } finally {
                state.isFetchingData = false;
                app.queryUi.syncFetchButtonState();
            }
        }

        return {
            fetchData
        };
    };
})();
