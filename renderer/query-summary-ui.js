(function initializeQuerySummaryUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createQuerySummaryUi = function createQuerySummaryUi() {
        const { escapeHtml } = ns.shared || {};
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

        return {
            buildDataStatsMarkup,
            getAssetCoverageLabel,
            summarizeAssetValidation,
            getQuerySummaryMetaClass,
            buildQuerySummaryChips,
            buildQuerySummaryMarkup,
            countDraftQuerySignals,
            getDraftQueryMeta
        };
    };
})();
