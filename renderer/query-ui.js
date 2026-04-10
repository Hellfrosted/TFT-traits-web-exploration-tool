(function initializeQueryUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { escapeHtml } = ns.shared;

    ns.createQueryUi = function createQueryUi(app) {
        const { state } = app;
        const getDefaultMaxResults = () => state.searchLimits.DEFAULT_MAX_RESULTS || 500;
        const getDefaultBoardSize = () => 9;
        let nextDraftEstimateRequestId = 0;

        function resolveQueryElements(ids) {
            const elements = {};
            (Array.isArray(ids) ? ids : []).forEach((id) => {
                elements[id] = document.getElementById(id);
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

        function setDataStats(units = '-', traits = '-', roles = '-', assets = '-') {
            const { dataStats: stats } = resolveSummaryShell();
            if (!stats) return;

            stats.innerHTML = `
                <div class="data-stat">
                    <span class="data-stat-label">Units</span>
                    <strong class="data-stat-value">${units}</strong>
                </div>
                <div class="data-stat">
                    <span class="data-stat-label">Traits</span>
                    <strong class="data-stat-value">${traits}</strong>
                </div>
                <div class="data-stat">
                    <span class="data-stat-label">Roles</span>
                    <strong class="data-stat-value">${roles}</strong>
                </div>
                <div class="data-stat">
                    <span class="data-stat-label">Splashes</span>
                    <strong class="data-stat-value">${assets}</strong>
                </div>
            `;
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

        function applyDefaultRoleFilters(force = false) {
            if (!state.activeData?.roles) return;

            const defaultTankRoles = state.resolveDefaultTankRoles(state.activeData.roles);
            const defaultCarryRoles = state.resolveDefaultCarryRoles(state.activeData.roles);

            if (state.selectors.tankRoles && (force || state.selectors.tankRoles.getValues().length === 0)) {
                state.selectors.tankRoles.setValues(defaultTankRoles);
            }

            if (state.selectors.carryRoles && (force || state.selectors.carryRoles.getValues().length === 0)) {
                state.selectors.carryRoles.setValues(defaultCarryRoles);
            }
        }

        function getVariantCapableUnits() {
            if (!state.activeData?.unitMap) return [];

            return [...state.activeData.unitMap.values()]
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

        function renderVariantLockControls(preservedLocks = null) {
            const {
                variantLocksSection: section,
                variantLocksContainer: container
            } = resolveSummaryShell();
            if (!section || !container) return;

            const variantUnits = getVariantCapableUnits();
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
            const shouldDisable = state.isSearching || state.isFetchingData;
            fetchBtn.disabled = shouldDisable;
            fetchBtn.style.opacity = shouldDisable ? '0.5' : '1';
        }

        function syncSearchButtonState() {
            const { searchBtn } = resolveSummaryShell();
            if (!searchBtn) return;

            const shouldDisable = state.isSearching || state.isFetchingData || !state.activeData;
            searchBtn.disabled = shouldDisable;
            searchBtn.classList.toggle('disabled', shouldDisable);

            if (!state.isSearching) {
                searchBtn.innerText = state.isFetchingData
                    ? 'Loading data...'
                    : 'Compute';
            }
        }

        function getQueryMetaClass(meta) {
            const text = String(meta ?? '').toLowerCase();
            if (text.includes('error') || text.includes('failed')) return 'query-summary-meta query-summary-meta-error';
            if (text.includes('cancel')) return 'query-summary-meta query-summary-meta-warning';
            if (text.includes('searching') || text.includes('cached') || text.includes('loaded') || text.includes('boards in')) {
                return 'query-summary-meta query-summary-meta-active';
            }
            return 'query-summary-meta';
        }

        function renderQuerySummary(params = null, meta = 'Idle') {
            const metaClass = getQueryMetaClass(meta);
            if (!params) {
                setQuerySummary(`
                    <div class="query-summary-heading">
                        <span class="query-summary-label">Query</span>
                        <span class="${metaClass}">${escapeHtml(meta)}</span>
                    </div>
                `);
                return;
            }

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

            setQuerySummary(`
                <div class="query-summary-heading">
                    <span class="query-summary-label">Query</span>
                    <span class="${metaClass}">${escapeHtml(meta)}</span>
                </div>
                <div class="query-chip-list">${chips.map((chip) => `<span class="query-chip">${escapeHtml(chip)}</span>`).join('')}</div>
            `);
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

        function getCurrentSearchParams() {
            const {
                boardSize,
                maxResults,
                onlyActiveToggle,
                tierRankToggle,
                includeUniqueToggle
            } = resolveQueryControls();
            return {
                boardSize: parseInt(boardSize?.value, 10) || getDefaultBoardSize(),
                maxResults: parseInt(maxResults?.value, 10) || getDefaultMaxResults(),
                mustInclude: state.selectors.mustInclude?.getValues() || [],
                mustExclude: state.selectors.mustExclude?.getValues() || [],
                mustIncludeTraits: state.selectors.mustIncludeTraits?.getValues() || [],
                mustExcludeTraits: state.selectors.mustExcludeTraits?.getValues() || [],
                extraEmblems: state.selectors.extraEmblems?.getValues() || [],
                variantLocks: getCurrentVariantLocks(),
                tankRoles: state.selectors.tankRoles?.getValues() || [],
                carryRoles: state.selectors.carryRoles?.getValues() || [],
                onlyActive: !!onlyActiveToggle?.checked,
                tierRank: !!tierRankToggle?.checked,
                includeUnique: !!includeUniqueToggle?.checked
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

        function applySearchParams(params = {}) {
            const defaults = getDefaultSearchParams();
            const nextParams = {
                ...defaults,
                ...params
            };
            const {
                boardSize,
                maxResults,
                onlyActiveToggle,
                tierRankToggle,
                includeUniqueToggle
            } = resolveQueryControls();

            if (boardSize) boardSize.value = nextParams.boardSize || getDefaultBoardSize();
            if (maxResults) maxResults.value = nextParams.maxResults || getDefaultMaxResults();
            if (onlyActiveToggle) onlyActiveToggle.checked = !!nextParams.onlyActive;
            if (tierRankToggle) tierRankToggle.checked = !!nextParams.tierRank;
            if (includeUniqueToggle) includeUniqueToggle.checked = !!nextParams.includeUnique;

            if (state.selectors.mustInclude) state.selectors.mustInclude.setValues(nextParams.mustInclude || []);
            if (state.selectors.mustExclude) state.selectors.mustExclude.setValues(nextParams.mustExclude || []);
            if (state.selectors.mustIncludeTraits) state.selectors.mustIncludeTraits.setValues(nextParams.mustIncludeTraits || []);
            if (state.selectors.mustExcludeTraits) state.selectors.mustExcludeTraits.setValues(nextParams.mustExcludeTraits || []);
            if (state.selectors.extraEmblems) state.selectors.extraEmblems.setValues(nextParams.extraEmblems || []);

            if (state.selectors.tankRoles) {
                if (Array.isArray(nextParams.tankRoles)) {
                    state.selectors.tankRoles.setValues(nextParams.tankRoles);
                } else {
                    applyDefaultRoleFilters(true);
                }
            }

            if (state.selectors.carryRoles) {
                if (Array.isArray(nextParams.carryRoles)) {
                    state.selectors.carryRoles.setValues(nextParams.carryRoles);
                } else {
                    applyDefaultRoleFilters(true);
                }
            }

            applyVariantLocks(nextParams.variantLocks || {});
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

        function refreshDraftQuerySummary() {
            if (!state.activeData || state.isSearching) return;
            const params = getCurrentSearchParams();
            const signalCount = params.mustInclude.length
                + params.mustExclude.length
                + params.mustIncludeTraits.length
                + params.mustExcludeTraits.length
                + params.extraEmblems.length
                + Object.keys(params.variantLocks || {}).length;
            const meta = signalCount > 0
                ? `${signalCount} active constraints`
                : 'Idle';
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
            bindDraftQueryListeners
        };
    };
})();
