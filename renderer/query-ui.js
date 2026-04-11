(function initializeQueryUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { escapeHtml } = ns.shared;

    ns.createQueryUi = function createQueryUi(app) {
        const { state } = app;
        const getDefaultMaxResults = () => state.searchLimits.DEFAULT_MAX_RESULTS || 500;
        const getDefaultBoardSize = () => 9;
        let nextDraftEstimateRequestId = 0;
        const shellElementCache = new Map();

        function resolveQueryElements(ids, { fresh = false } = {}) {
            const elements = {};
            (Array.isArray(ids) ? ids : []).forEach((id) => {
                const cachedElement = shellElementCache.get(id);
                if (!fresh && cachedElement) {
                    elements[id] = cachedElement;
                    return;
                }

                const element = document.getElementById(id);
                shellElementCache.set(id, element);
                elements[id] = element;
            });
            return elements;
        }

        function resolveSummaryShell() {
            return resolveQueryElements([
                'resultsSummary',
                'resultsQuerySummary',
                'dataStats',
                'status',
                'dataSourceSelect',
                'fetchBtn',
                'searchBtn',
                'variantLocksSection',
                'variantLocksContainer'
            ]);
        }

        function resolveQueryControls() {
            return resolveQueryElements([
                'boardSize',
                'maxResults',
                'onlyActiveToggle',
                'tierRankToggle',
                'includeUniqueToggle'
            ]);
        }

        function setResultsSummary(content) {
            const { resultsSummary: summary } = resolveSummaryShell();
            if (summary) {
                summary.innerHTML = content;
            }
        }

        function setQuerySummary(content) {
            const { resultsQuerySummary: summary } = resolveSummaryShell();
            if (summary) {
                summary.innerHTML = content;
            }
        }

        function buildDataStatMarkup(label, value) {
            return `
                <div class="data-stat">
                    <span class="data-stat-label">${escapeHtml(label)}</span>
                    <strong class="data-stat-value">${escapeHtml(value)}</strong>
                </div>
            `;
        }

        function buildDataStatsMarkup({
            units = '-',
            traits = '-',
            roles = '-',
            assets = '-'
        } = {}) {
            return `
                ${buildDataStatMarkup('Units', units)}
                ${buildDataStatMarkup('Traits', traits)}
                ${buildDataStatMarkup('Roles', roles)}
                ${buildDataStatMarkup('Splashes', assets)}
            `;
        }

        function setDataStats(units = '-', traits = '-', roles = '-', assets = '-') {
            const { dataStats: stats } = resolveSummaryShell();
            if (!stats) return;

            stats.innerHTML = buildDataStatsMarkup({
                units,
                traits,
                roles,
                assets
            });
        }

        function setStatusMessage(message) {
            const { status } = resolveSummaryShell();
            if (status) {
                status.innerText = message;
            }
        }

        function getSelectedDataSource() {
            const { dataSourceSelect: sourceSelect } = resolveSummaryShell();
            return sourceSelect?.value || state.defaultDataSource;
        }

        function getDataSourceLabel(source) {
            return source === 'latest' ? 'Live' : 'PBE';
        }

        function getDefaultRoleFilterValues(activeData = state.activeData) {
            if (!activeData?.roles) return null;

            return {
                tankRoles: state.resolveDefaultTankRoles(activeData.roles),
                carryRoles: state.resolveDefaultCarryRoles(activeData.roles)
            };
        }

        function setSelectorValues(selector, values = []) {
            if (selector) {
                selector.setValues(values);
            }
        }

        function applyDefaultRoleSelectorValues(selector, values, force = false) {
            if (!selector) return;
            if (force || selector.getValues().length === 0) {
                selector.setValues(values);
            }
        }

        function applyDefaultRoleFilters(force = false, activeData = state.activeData) {
            const defaultRoleValues = getDefaultRoleFilterValues(activeData);
            if (!defaultRoleValues) return;

            applyDefaultRoleSelectorValues(state.selectors.tankRoles, defaultRoleValues.tankRoles, force);
            applyDefaultRoleSelectorValues(state.selectors.carryRoles, defaultRoleValues.carryRoles, force);
        }

        function getVariantCapableUnits(activeData = state.activeData) {
            if (!activeData?.unitMap) return [];

            return [...activeData.unitMap.values()]
                .filter((unit) => Array.isArray(unit.variants) && unit.variants.length > 0)
                .sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));
        }

        function getCurrentVariantLocks() {
            const variantLocks = {};

            state.variantLockControls.forEach((select, unitId) => {
                const value = String(select.value || '').trim();
                if (!value || value === 'auto') {
                    return;
                }

                variantLocks[unitId] = value;
            });

            return variantLocks;
        }

        function applyVariantLocks(variantLocks = {}) {
            state.variantLockControls.forEach((select, unitId) => {
                const requested = variantLocks?.[unitId] || 'auto';
                const hasRequestedOption = Array.from(select.options).some((option) => option.value === requested);
                select.value = hasRequestedOption ? requested : 'auto';
            });
        }

        function resetVariantLockSection(container) {
            state.variantLockControls.clear();
            container.innerHTML = '';
        }

        function setVariantLockSectionVisibility(section, hasVariantUnits) {
            if (hasVariantUnits) {
                section.classList.remove('hidden');
                return;
            }

            section.classList.add('hidden');
        }

        function createVariantLockOption(value, label) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            return option;
        }

        function createVariantLockRow(unit) {
            const row = document.createElement('div');
            row.className = 'variant-lock-row';

            const label = document.createElement('div');
            label.className = 'variant-lock-name';
            label.textContent = unit.displayName || unit.id;

            const select = document.createElement('select');
            select.className = 'variant-lock-select';
            select.setAttribute('aria-label', `${unit.displayName || unit.id} variant lock`);
            select.appendChild(createVariantLockOption('auto', 'Auto'));

            unit.variants.forEach((variant) => {
                select.appendChild(createVariantLockOption(variant.id, variant.label || variant.id));
            });

            row.appendChild(label);
            row.appendChild(select);
            return { row, select };
        }

        function renderVariantLockControls(preservedLocks = null, activeData = state.activeData) {
            const {
                variantLocksSection: section,
                variantLocksContainer: container
            } = resolveSummaryShell();
            if (!section || !container) return;

            const variantUnits = getVariantCapableUnits(activeData);
            const locks = preservedLocks || getCurrentVariantLocks();
            resetVariantLockSection(container);

            if (variantUnits.length === 0) {
                setVariantLockSectionVisibility(section, false);
                return;
            }

            setVariantLockSectionVisibility(section, true);

            variantUnits.forEach((unit) => {
                const { row, select } = createVariantLockRow(unit);
                container.appendChild(row);
                state.variantLockControls.set(unit.id, select);

                select.addEventListener('change', refreshDraftQuerySummary);
            });

            applyVariantLocks(locks);
        }

        function getAssetCoverageLabel(assetValidation) {
            if (!assetValidation || assetValidation.championAssetCount === 0) {
                return 'N/A';
            }

            return `${assetValidation.matchedChampionCount}/${assetValidation.totalUnits}`;
        }

        function summarizeAssetValidation(assetValidation) {
            if (!assetValidation) {
                return '';
            }

            if (assetValidation.championAssetCount === 0) {
                return 'Splash manifest unavailable.';
            }

            const parts = [
                `${assetValidation.matchedChampionCount}/${assetValidation.totalUnits} champion splashes matched`
            ];
            if (assetValidation.missingChampionIcons.length > 0) {
                const missingPreview = assetValidation.missingChampionIcons.slice(0, 3).join(', ');
                const suffix = assetValidation.missingChampionIcons.length > 3 ? ', ...' : '';
                parts.push(`${assetValidation.missingChampionIcons.length} missing (${missingPreview}${suffix})`);
            }
            return parts.join(', ');
        }

        function syncFetchButtonState() {
            const { fetchBtn } = resolveSummaryShell();
            if (!fetchBtn) return;
            const uiState = getFetchButtonUiState({
                isSearching: state.isSearching,
                isFetchingData: state.isFetchingData
            });
            applyFetchButtonUi(fetchBtn, uiState);
        }

        function syncSearchButtonState() {
            const { searchBtn } = resolveSummaryShell();
            if (!searchBtn) return;

            const uiState = getSearchButtonUiState({
                isSearching: state.isSearching,
                isFetchingData: state.isFetchingData,
                hasActiveData: !!state.activeData
            });
            applySearchButtonUi(searchBtn, uiState);
        }

        function getFetchButtonUiState({
            isSearching = false,
            isFetchingData = false
        } = {}) {
            const disabled = isSearching || isFetchingData;
            return {
                disabled,
                opacity: disabled ? '0.5' : '1'
            };
        }

        function applyFetchButtonUi(button, uiState) {
            button.disabled = !!uiState?.disabled;
            button.style.opacity = uiState?.opacity || '1';
        }

        function getSearchButtonUiState({
            isSearching = false,
            isFetchingData = false,
            hasActiveData = false
        } = {}) {
            const disabled = isSearching || isFetchingData || !hasActiveData;
            return {
                disabled,
                classDisabled: disabled,
                text: isSearching
                    ? null
                    : (isFetchingData ? 'Loading data...' : 'Compute')
            };
        }

        function applySearchButtonUi(button, uiState) {
            button.disabled = !!uiState?.disabled;
            button.classList.toggle('disabled', !!uiState?.classDisabled);

            if (uiState?.text !== null && uiState?.text !== undefined) {
                button.innerText = uiState.text;
            }
        }

        function getQuerySummaryMetaClass(meta) {
            const text = String(meta ?? '').toLowerCase();
            if (text.includes('error') || text.includes('failed')) return 'query-summary-meta query-summary-meta-error';
            if (text.includes('cancel')) return 'query-summary-meta query-summary-meta-warning';
            if (text.includes('searching') || text.includes('cached') || text.includes('loaded') || text.includes('boards in')) {
                return 'query-summary-meta query-summary-meta-active';
            }
            return 'query-summary-meta';
        }

        function buildQuerySummaryChips(params) {
            const chips = [
                `Level ${params.boardSize}`,
                `Max ${params.maxResults}`
            ];

            if (params.mustInclude?.length) chips.push(`Include ${params.mustInclude.length} units`);
            if (params.mustExclude?.length) chips.push(`Exclude ${params.mustExclude.length} units`);
            if (params.mustIncludeTraits?.length) chips.push(`Force ${params.mustIncludeTraits.length} traits`);
            if (params.mustExcludeTraits?.length) chips.push(`Ban ${params.mustExcludeTraits.length} traits`);
            if (params.extraEmblems?.length) chips.push(`${params.extraEmblems.length} emblems`);
            if (Object.keys(params.variantLocks || {}).length) chips.push(`${Object.keys(params.variantLocks).length} locked modes`);
            if (params.includeUnique) chips.push('Unique traits on');
            if (!params.onlyActive) chips.push('Inactive traits counted');
            if (!params.tierRank) chips.push('Flat trait ranking');

            return chips;
        }

        function buildQuerySummaryMarkup({ chips = [], meta = 'Idle', metaClass = 'query-summary-meta' } = {}) {
            const chipMarkup = Array.isArray(chips) && chips.length > 0
                ? `<div class="query-chip-list">${chips.map((chip) => `<span class="query-chip">${escapeHtml(chip)}</span>`).join('')}</div>`
                : '';

            return `
                <div class="query-summary-heading">
                    <span class="query-summary-label">Query</span>
                    <span class="${metaClass}">${escapeHtml(meta)}</span>
                </div>
                ${chipMarkup}
            `;
        }

        function renderQuerySummary(params = null, meta = 'Idle') {
            const metaClass = getQuerySummaryMetaClass(meta);
            const chips = params ? buildQuerySummaryChips(params) : [];
            setQuerySummary(buildQuerySummaryMarkup({
                chips,
                meta,
                metaClass
            }));
        }

        async function refreshDraftEstimate() {
            if (!state.activeData || state.isSearching || state.isFetchingData) {
                return;
            }

            if (!state.electronBridge?.getSearchEstimate) {
                return;
            }

            const requestId = ++nextDraftEstimateRequestId;
            const normalizePayload = await normalizeSearchParams();
            if (requestId !== nextDraftEstimateRequestId) {
                return;
            }
            const params = normalizePayload.params;

            try {
                const estimate = await state.electronBridge.getSearchEstimate(params);
                if (requestId !== nextDraftEstimateRequestId) {
                    return;
                }
                if (!state.activeData || state.isSearching || state.isFetchingData) {
                    return;
                }

                state.activeSearchEstimate = estimate;
                app.results.renderEstimateSummary(estimate);
            } catch (error) {
                if (requestId !== nextDraftEstimateRequestId) {
                    return;
                }

                console.error('[Draft Estimate Failed]', error);
            }
        }

        async function normalizeSearchParams(params = getCurrentSearchParams()) {
            if (state.electronBridge?.normalizeSearchParams) {
                try {
                    const payload = await state.electronBridge.normalizeSearchParams(params);
                    if (payload && payload.params) {
                        return {
                            params: payload.params,
                            comparisonKey: typeof payload.comparisonKey === 'string' ? payload.comparisonKey : null,
                            dataFingerprint: typeof payload.dataFingerprint === 'string' ? payload.dataFingerprint : null
                        };
                    }
                } catch (error) {
                    console.error('[Query Normalization Failed]', error);
                }
            }

            return {
                params,
                comparisonKey: null,
                dataFingerprint: null
            };
        }

        function readQueryControlValues(controls) {
            return {
                boardSize: parseInt(controls.boardSize?.value, 10) || getDefaultBoardSize(),
                maxResults: parseInt(controls.maxResults?.value, 10) || getDefaultMaxResults(),
                onlyActive: !!controls.onlyActiveToggle?.checked,
                tierRank: !!controls.tierRankToggle?.checked,
                includeUnique: !!controls.includeUniqueToggle?.checked
            };
        }

        function getCurrentSearchParams() {
            const controls = resolveQueryControls();
            return {
                ...readQueryControlValues(controls),
                mustInclude: state.selectors.mustInclude?.getValues() || [],
                mustExclude: state.selectors.mustExclude?.getValues() || [],
                mustIncludeTraits: state.selectors.mustIncludeTraits?.getValues() || [],
                mustExcludeTraits: state.selectors.mustExcludeTraits?.getValues() || [],
                extraEmblems: state.selectors.extraEmblems?.getValues() || [],
                variantLocks: getCurrentVariantLocks(),
                tankRoles: state.selectors.tankRoles?.getValues() || [],
                carryRoles: state.selectors.carryRoles?.getValues() || []
            };
        }

        function getDefaultSearchParams() {
            return {
                boardSize: getDefaultBoardSize(),
                maxResults: getDefaultMaxResults(),
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
            };
        }

        function applyQueryControlValues(controls, params) {
            if (controls.boardSize) controls.boardSize.value = params.boardSize || getDefaultBoardSize();
            if (controls.maxResults) controls.maxResults.value = params.maxResults || getDefaultMaxResults();
            if (controls.onlyActiveToggle) controls.onlyActiveToggle.checked = !!params.onlyActive;
            if (controls.tierRankToggle) controls.tierRankToggle.checked = !!params.tierRank;
            if (controls.includeUniqueToggle) controls.includeUniqueToggle.checked = !!params.includeUnique;
        }

        function applyRoleSelectorSearchParams(selector, values, defaultValues = null) {
            if (!selector) return;

            if (Array.isArray(values)) {
                selector.setValues(values);
                return;
            }

            if (defaultValues) {
                selector.setValues(defaultValues);
            }
        }

        function applySelectorSearchParams(params) {
            setSelectorValues(state.selectors.mustInclude, params.mustInclude || []);
            setSelectorValues(state.selectors.mustExclude, params.mustExclude || []);
            setSelectorValues(state.selectors.mustIncludeTraits, params.mustIncludeTraits || []);
            setSelectorValues(state.selectors.mustExcludeTraits, params.mustExcludeTraits || []);
            setSelectorValues(state.selectors.extraEmblems, params.extraEmblems || []);

            const defaultRoleValues = getDefaultRoleFilterValues();
            applyRoleSelectorSearchParams(state.selectors.tankRoles, params.tankRoles, defaultRoleValues?.tankRoles);
            applyRoleSelectorSearchParams(state.selectors.carryRoles, params.carryRoles, defaultRoleValues?.carryRoles);

            applyVariantLocks(params.variantLocks || {});
        }

        function applySearchParams(params = {}) {
            const defaults = getDefaultSearchParams();
            const nextParams = {
                ...defaults,
                ...params
            };
            const controls = resolveQueryControls();
            applyQueryControlValues(controls, nextParams);
            applySelectorSearchParams(nextParams);
        }

        function clampNumericInput(id, min, max, fallback) {
            const input = resolveQueryControls()[id];
            if (!input) {
                return fallback;
            }
            const parsed = parseInt(input.value, 10);

            if (Number.isNaN(parsed)) {
                input.value = fallback;
                return fallback;
            }

            const clamped = Math.min(Math.max(parsed, min), max);
            if (clamped !== parsed) input.value = clamped;
            return clamped;
        }

        function countDraftQuerySignals(params = {}) {
            return (params.mustInclude?.length || 0)
                + (params.mustExclude?.length || 0)
                + (params.mustIncludeTraits?.length || 0)
                + (params.mustExcludeTraits?.length || 0)
                + (params.extraEmblems?.length || 0)
                + Object.keys(params.variantLocks || {}).length;
        }

        function getDraftQueryMeta(params = {}) {
            const signalCount = countDraftQuerySignals(params);
            return signalCount > 0
                ? `${signalCount} active constraints`
                : 'Idle';
        }

        function refreshDraftQuerySummary() {
            if (!state.activeData || state.isSearching) return;
            const params = getCurrentSearchParams();
            const meta = getDraftQueryMeta(params);
            renderQuerySummary(params, meta);
            void refreshDraftEstimate();
        }

        function bindNumericDraftListeners(controls) {
            ['boardSize', 'maxResults'].forEach((id) => {
                const input = controls[id];
                if (!input) return;
                input.addEventListener('change', () => {
                    if (id === 'boardSize') clampNumericInput('boardSize', 1, 20, 9);
                    if (id === 'maxResults') clampNumericInput('maxResults', 1, 10000, getDefaultMaxResults());
                    refreshDraftQuerySummary();
                });
            });
        }

        function bindToggleDraftListeners(controls) {
            ['onlyActiveToggle', 'tierRankToggle', 'includeUniqueToggle'].forEach((id) => {
                controls[id]?.addEventListener('change', refreshDraftQuerySummary);
            });
        }

        function bindMultiselectDraftListener() {
            document.querySelector('.controls-body')?.addEventListener('multiselectchange', refreshDraftQuerySummary);
        }

        function bindDraftQueryListeners() {
            if (state.listeners.draftBound) return;
            state.listeners.draftBound = true;
            const controls = resolveQueryControls();
            bindNumericDraftListeners(controls);
            bindToggleDraftListeners(controls);
            bindMultiselectDraftListener();
        }

        return {
            setResultsSummary,
            setQuerySummary,
            setDataStats,
            setStatusMessage,
            getSelectedDataSource,
            getDataSourceLabel,
            applyDefaultRoleFilters,
            getCurrentVariantLocks,
            applyVariantLocks,
            renderVariantLockControls,
            getAssetCoverageLabel,
            summarizeAssetValidation,
            syncFetchButtonState,
            syncSearchButtonState,
            renderQuerySummary,
            getCurrentSearchParams,
            normalizeSearchParams,
            getDefaultSearchParams,
            applySearchParams,
            clampNumericInput,
            refreshDraftEstimate,
            refreshDraftQuerySummary,
            bindDraftQueryListeners,
            __test: {
                getFetchButtonUiState,
                applyFetchButtonUi,
                getSearchButtonUiState,
                applySearchButtonUi,
                countDraftQuerySignals,
                getDraftQueryMeta
            }
        };
    };
})();
