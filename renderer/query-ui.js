(function initializeQueryUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { escapeHtml } = ns.shared;

    ns.createQueryUi = function createQueryUi(app) {
        const { state } = app;
        const getDefaultMaxResults = () => state.searchLimits.DEFAULT_MAX_RESULTS || 500;

        function setResultsSummary(content) {
            const summary = document.getElementById('resultsSummary');
            if (summary) {
                summary.innerHTML = content;
            }
        }

        function setQuerySummary(content) {
            const summary = document.getElementById('resultsQuerySummary');
            if (summary) {
                summary.innerHTML = content;
            }
        }

        function setDataStats(units = '-', traits = '-', roles = '-', assets = '-') {
            const stats = document.getElementById('dataStats');
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
            const status = document.getElementById('status');
            if (status) {
                status.innerText = message;
            }
        }

        function getSelectedDataSource() {
            const sourceSelect = document.getElementById('dataSourceSelect');
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

        function renderVariantLockControls(preservedLocks = null) {
            const section = document.getElementById('variantLocksSection');
            const container = document.getElementById('variantLocksContainer');
            if (!section || !container) return;

            const variantUnits = getVariantCapableUnits();
            const locks = preservedLocks || getCurrentVariantLocks();
            state.variantLockControls.clear();
            container.innerHTML = '';

            if (variantUnits.length === 0) {
                section.classList.add('hidden');
                return;
            }

            section.classList.remove('hidden');

            variantUnits.forEach((unit) => {
                const row = document.createElement('div');
                row.className = 'variant-lock-row';

                const label = document.createElement('div');
                label.className = 'variant-lock-name';
                label.textContent = unit.displayName || unit.id;

                const select = document.createElement('select');
                select.className = 'variant-lock-select';
                select.setAttribute('aria-label', `${unit.displayName || unit.id} variant lock`);

                const autoOption = document.createElement('option');
                autoOption.value = 'auto';
                autoOption.textContent = 'Auto';
                select.appendChild(autoOption);

                unit.variants.forEach((variant) => {
                    const option = document.createElement('option');
                    option.value = variant.id;
                    option.textContent = variant.label || variant.id;
                    select.appendChild(option);
                });

                row.appendChild(label);
                row.appendChild(select);
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
            const fetchBtn = document.getElementById('fetchBtn');
            if (!fetchBtn) return;
            const shouldDisable = state.isSearching || state.isFetchingData;
            fetchBtn.disabled = shouldDisable;
            fetchBtn.style.opacity = shouldDisable ? '0.5' : '1';
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

        function getCurrentSearchParams() {
            return {
                boardSize: parseInt(document.getElementById('boardSize').value, 10) || 9,
                maxResults: parseInt(document.getElementById('maxResults').value, 10) || getDefaultMaxResults(),
                mustInclude: state.selectors.mustInclude?.getValues() || [],
                mustExclude: state.selectors.mustExclude?.getValues() || [],
                mustIncludeTraits: state.selectors.mustIncludeTraits?.getValues() || [],
                mustExcludeTraits: state.selectors.mustExcludeTraits?.getValues() || [],
                extraEmblems: state.selectors.extraEmblems?.getValues() || [],
                variantLocks: getCurrentVariantLocks(),
                tankRoles: state.selectors.tankRoles?.getValues() || [],
                carryRoles: state.selectors.carryRoles?.getValues() || [],
                onlyActive: document.getElementById('onlyActiveToggle').checked,
                tierRank: document.getElementById('tierRankToggle').checked,
                includeUnique: document.getElementById('includeUniqueToggle').checked
            };
        }

        function clampNumericInput(id, min, max, fallback) {
            const input = document.getElementById(id);
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
        }

        function bindDraftQueryListeners() {
            if (state.listeners.draftBound) return;
            state.listeners.draftBound = true;

            ['boardSize', 'maxResults'].forEach((id) => {
                const input = document.getElementById(id);
                input.addEventListener('change', () => {
                    if (id === 'boardSize') clampNumericInput('boardSize', 1, 20, 9);
                    if (id === 'maxResults') clampNumericInput('maxResults', 1, 10000, getDefaultMaxResults());
                    refreshDraftQuerySummary();
                });
            });

            ['onlyActiveToggle', 'tierRankToggle', 'includeUniqueToggle'].forEach((id) => {
                document.getElementById(id).addEventListener('change', refreshDraftQuerySummary);
            });

            document.querySelector('.controls-body')?.addEventListener('selectionchange', refreshDraftQuerySummary);
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
            renderQuerySummary,
            getCurrentSearchParams,
            clampNumericInput,
            refreshDraftQuerySummary,
            bindDraftQueryListeners
        };
    };
})();
