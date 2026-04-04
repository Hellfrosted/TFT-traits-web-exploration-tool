(function initializeResultsUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { escapeHtml, renderIconImage, getBoardMetric, formatBoardEstimate } = ns.shared;

    ns.createResultsUi = function createResultsUi(app) {
        const { state } = app;
        const boardTraitSummaryCache = new WeakMap();
        let tooltipElement = null;
        let activeTooltipChip = null;
        let tooltipListenersBound = false;

        function getVariantAssignment(board, unitId) {
            const assignment = board?.variantAssignments?.[unitId];
            if (!assignment) return null;
            if (typeof assignment === 'string') {
                return { id: assignment, label: assignment };
            }

            return assignment;
        }

        function renderUnitPill(name, board = null) {
            const unit = state.activeData?.unitMap?.get(name);
            const label = unit?.displayName || name;
            const variantAssignment = getVariantAssignment(board, name);
            const variantLabel = variantAssignment?.label || '';
            const fullLabel = variantLabel ? `${label} (${variantLabel})` : label;
            const iconMarkup = renderIconImage(unit?.iconUrl, label, 'pill-icon unit-icon');

            return `<span class="unit-pill">${iconMarkup}<span>${escapeHtml(fullLabel)}</span></span>`;
        }

        function renderTraitChip(trait, extraClassName = '') {
            const iconMarkup = renderIconImage(trait.iconUrl, trait.trait, 'pill-icon trait-icon');
            const className = ['trait-chip', extraClassName].filter(Boolean).join(' ');
            const tooltipPayload = trait.tooltipData
                ? escapeHtml(encodeURIComponent(JSON.stringify(trait.tooltipData)))
                : '';
            const tooltipAttr = tooltipPayload ? ` data-trait-tooltip="${tooltipPayload}" tabindex="0"` : '';
            return `<span class="${className}"${tooltipAttr}>${iconMarkup}${escapeHtml(trait.label)}</span>`;
        }

        function ensureTooltipElement() {
            if (tooltipElement && document.body.contains(tooltipElement)) {
                return tooltipElement;
            }

            tooltipElement = document.createElement('div');
            tooltipElement.className = 'trait-tooltip hidden';
            tooltipElement.setAttribute('aria-hidden', 'true');
            document.querySelector('.workspace')?.appendChild(tooltipElement);
            return tooltipElement;
        }

        function getTooltipData(chip) {
            const rawPayload = chip?.dataset?.traitTooltip;
            if (!rawPayload) return null;

            try {
                return JSON.parse(decodeURIComponent(rawPayload));
            } catch (error) {
                console.warn('Failed to parse trait tooltip payload.', error);
                return null;
            }
        }

        function getClosestTooltipChip(target) {
            if (!target || target.nodeType !== 1) {
                return null;
            }

            return target.closest('.trait-chip[data-trait-tooltip]');
        }

        function renderTooltipContent(data) {
            const contributorMarkup = Array.isArray(data?.contributors) && data.contributors.length > 0
                ? data.contributors.map((contributor) => {
                    const iconMarkup = renderIconImage(
                        contributor?.iconUrl || '',
                        contributor?.label || '',
                        'pill-icon trait-tooltip-unit-icon'
                    );
                    return `
                        <div class="trait-tooltip-row trait-tooltip-contributor-row">
                            ${iconMarkup}
                            <span>${escapeHtml(contributor?.label || '')}</span>
                        </div>
                    `;
                }
                ).join('')
                : '<div class="trait-tooltip-row trait-tooltip-muted">No direct unit contributors tracked.</div>';
            const extraMarkup = data?.extraCount > 0
                ? `<div class="trait-tooltip-row trait-tooltip-muted">+${escapeHtml(data.extraCount)} from emblems</div>`
                : '';
            const missingMarkup = Number.isFinite(data?.missingCount) && data.missingCount > 0
                ? `<div class="trait-tooltip-row trait-tooltip-muted">${escapeHtml(data.missingCount)} more needed for ${escapeHtml(data.nextBreakpoint)}</div>`
                : '';

            return `
                <div class="trait-tooltip-header">
                    <div class="trait-tooltip-title">${escapeHtml(data.title || '')}</div>
                    <div class="trait-tooltip-subtitle">${escapeHtml(data.label || '')}</div>
                </div>
                <div class="trait-tooltip-section">
                    ${contributorMarkup}
                </div>
                ${extraMarkup}
                ${missingMarkup}
            `;
        }

        function hideTraitTooltip() {
            const element = ensureTooltipElement();
            activeTooltipChip = null;
            element.classList.add('hidden');
            element.setAttribute('aria-hidden', 'true');
            element.innerHTML = '';
        }

        function positionTooltip(chip) {
            const element = ensureTooltipElement();
            const workspace = document.querySelector('.workspace');
            if (!workspace) return;

            const chipRect = chip.getBoundingClientRect();
            const workspaceRect = workspace.getBoundingClientRect();
            const tooltipRect = element.getBoundingClientRect();
            const offset = 12;
            const minLeft = workspaceRect.left + 8;
            const maxLeft = Math.max(minLeft, workspaceRect.right - tooltipRect.width - 8);

            let left = chipRect.left;
            if ((left + tooltipRect.width) > (workspaceRect.right - 8)) {
                left = chipRect.right - tooltipRect.width;
            }
            left = Math.min(Math.max(left, minLeft), maxLeft);

            let top = chipRect.bottom + offset;
            if ((top + tooltipRect.height) > (workspaceRect.bottom - 8)) {
                top = chipRect.top - tooltipRect.height - offset;
            }
            top = Math.max(workspaceRect.top + 8, top);

            element.style.left = `${Math.round(left)}px`;
            element.style.top = `${Math.round(top)}px`;
        }

        function showTraitTooltip(chip) {
            const data = getTooltipData(chip);
            if (!data) {
                hideTraitTooltip();
                return;
            }

            const element = ensureTooltipElement();
            activeTooltipChip = chip;
            element.innerHTML = renderTooltipContent(data);
            element.classList.remove('hidden');
            element.setAttribute('aria-hidden', 'false');
            element.style.visibility = 'hidden';
            positionTooltip(chip);
            element.style.visibility = 'visible';
        }

        function bindTooltipListeners() {
            if (tooltipListenersBound) return;
            tooltipListenersBound = true;

            const workspace = document.querySelector('.workspace');
            const tooltipTargets = '.trait-chip[data-trait-tooltip]';
            if (!workspace) return;

            workspace.addEventListener('mouseover', (event) => {
                const chip = event.target.closest(tooltipTargets);
                if (!chip || !workspace.contains(chip) || chip === activeTooltipChip) {
                    return;
                }

                showTraitTooltip(chip);
            });

            workspace.addEventListener('mouseout', (event) => {
                const chip = event.target.closest(tooltipTargets);
                if (!chip || chip !== activeTooltipChip) {
                    return;
                }

                const nextChip = getClosestTooltipChip(event.relatedTarget);
                if (nextChip === chip) {
                    return;
                }

                hideTraitTooltip();
            });

            workspace.addEventListener('focusin', (event) => {
                const chip = event.target.closest(tooltipTargets);
                if (!chip || !workspace.contains(chip)) {
                    return;
                }

                showTraitTooltip(chip);
            });

            workspace.addEventListener('focusout', (event) => {
                const chip = event.target.closest(tooltipTargets);
                if (!chip || chip !== activeTooltipChip) {
                    return;
                }

                const nextChip = getClosestTooltipChip(event.relatedTarget);
                if (nextChip === chip) {
                    return;
                }

                hideTraitTooltip();
            });

            workspace.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    hideTraitTooltip();
                }
            });

            window.addEventListener('resize', () => {
                if (activeTooltipChip) {
                    positionTooltip(activeTooltipChip);
                }
            });

            document.addEventListener('scroll', () => {
                hideTraitTooltip();
            }, true);
        }

        function renderEmptySummary(message) {
            app.queryUi.setResultsSummary(`
                <div class="summary-card">
                    <span class="summary-label">Status</span>
                    <span class="summary-value">${escapeHtml(message)}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Top Score</span>
                    <span class="summary-value">-</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Lowest Cost</span>
                    <span class="summary-value">-</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Best Value</span>
                    <span class="summary-value">-</span>
                </div>
            `);
        }

        function renderEstimateSummary(estimate = null) {
            const estimateCount = estimate?.count;
            const remainingSlots = estimate?.remainingSlots;
            const estimateLabel = Number.isFinite(Number(estimateCount))
                ? `~${formatBoardEstimate(estimateCount)} boards`
                : 'Variable / estimating';
            const openSlotsLabel = Number.isFinite(Number(remainingSlots))
                ? String(remainingSlots)
                : '-';

            app.queryUi.setResultsSummary(`
                <div class="summary-card">
                    <span class="summary-label">Search Space</span>
                    <span class="summary-value">${escapeHtml(estimateLabel)}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Open Slots</span>
                    <span class="summary-value">${escapeHtml(openSlotsLabel)}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Top Score</span>
                    <span class="summary-value">-</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Lowest Cost</span>
                    <span class="summary-value">-</span>
                </div>
            `);
        }

        function renderEmptySpotlight(message = 'No selection') {
            const spotlight = document.getElementById('boardSpotlight');
            if (!spotlight) return;

            spotlight.className = 'board-spotlight empty';
            spotlight.innerHTML = `
                <div class="board-spotlight-header">
                    <div>
                        <span class="board-spotlight-label">Selected Board</span>
                        <h3 class="board-spotlight-title">No selection</h3>
                    </div>
                    <span class="board-spotlight-rank">Awaiting results</span>
                </div>
                <p class="board-spotlight-empty">${escapeHtml(message)}</p>
            `;
        }

        function renderSearchingSpotlight() {
            renderEmptySpotlight('Results will appear here when the search completes.');
        }

        function renderResultsMessageRow(message, className = 'results-message-row') {
            return `<tr><td colspan="6" class="${className}">${escapeHtml(message)}</td></tr>`;
        }

        function createTraitCountMap(board) {
            const counts = new Map();

            if (board?.traitCounts && typeof board.traitCounts === 'object') {
                Object.entries(board.traitCounts).forEach(([trait, count]) => {
                    const numericCount = Number(count);
                    if (trait && Number.isFinite(numericCount) && numericCount > 0) {
                        counts.set(trait, numericCount);
                    }
                });
                return counts;
            }

            if (!state.activeData?.unitMap) {
                return counts;
            }

            const addContributionMap = (contributionMap) => {
                contributionMap.forEach((count, trait) => {
                    counts.set(trait, (counts.get(trait) || 0) + count);
                });
            };

            board.units.forEach((unitId) => {
                const unit = state.activeData.unitMap.get(unitId);
                if (!unit) return;
                addContributionMap(resolveDirectTraitContributions(unit));
            });

            for (const emblem of state.lastSearchParams?.extraEmblems || []) {
                counts.set(emblem, (counts.get(emblem) || 0) + 1);
            }

            return counts;
        }

        function resolveDirectTraitContributions(entity = {}) {
            const contributions = new Map();

            if (entity.traitContributions && typeof entity.traitContributions === 'object') {
                Object.entries(entity.traitContributions).forEach(([traitName, count]) => {
                    const numericCount = Math.trunc(Number(count));
                    if (!traitName || !Number.isFinite(numericCount) || numericCount <= 0) return;
                    contributions.set(traitName, (contributions.get(traitName) || 0) + numericCount);
                });
                return contributions;
            }

            const traitNames = new Set();
            (entity.traits || []).forEach((traitName) => {
                if (traitName) traitNames.add(traitName);
            });
            (entity.traitIds || []).forEach((traitId) => {
                const resolvedTrait = state.activeData?.hashMap?.[traitId] || traitId;
                if (resolvedTrait) traitNames.add(resolvedTrait);
            });

            traitNames.forEach((traitName) => {
                contributions.set(traitName, (contributions.get(traitName) || 0) + 1);
            });
            return contributions;
        }

        function getTraitActivationThreshold(traitName) {
            const breakpoints = state.activeData?.traitBreakpoints?.[traitName] || [1];
            return breakpoints[0] || 1;
        }

        function isConditionSatisfied(conditions, boardUnitIds, traitCounts) {
            if (!conditions || typeof conditions !== 'object') {
                return true;
            }

            const requiredUnits = Array.isArray(conditions.requiredUnits) ? conditions.requiredUnits : [];
            if (requiredUnits.some((unitId) => !boardUnitIds.has(unitId))) {
                return false;
            }

            const forbiddenUnits = Array.isArray(conditions.forbiddenUnits) ? conditions.forbiddenUnits : [];
            if (forbiddenUnits.some((unitId) => boardUnitIds.has(unitId))) {
                return false;
            }

            const requiredActiveTraits = Array.isArray(conditions.requiredActiveTraits) ? conditions.requiredActiveTraits : [];
            if (requiredActiveTraits.some((traitName) => (traitCounts.get(traitName) || 0) < getTraitActivationThreshold(traitName))) {
                return false;
            }

            const forbiddenActiveTraits = Array.isArray(conditions.forbiddenActiveTraits) ? conditions.forbiddenActiveTraits : [];
            if (forbiddenActiveTraits.some((traitName) => (traitCounts.get(traitName) || 0) >= getTraitActivationThreshold(traitName))) {
                return false;
            }

            const minTraitCounts = conditions.minTraitCounts && typeof conditions.minTraitCounts === 'object'
                ? conditions.minTraitCounts
                : {};
            if (Object.entries(minTraitCounts).some(([traitName, count]) => (traitCounts.get(traitName) || 0) < Number(count || 0))) {
                return false;
            }

            const maxTraitCounts = conditions.maxTraitCounts && typeof conditions.maxTraitCounts === 'object'
                ? conditions.maxTraitCounts
                : {};
            if (Object.entries(maxTraitCounts).some(([traitName, count]) => (traitCounts.get(traitName) || 0) > Number(count))) {
                return false;
            }

            return true;
        }

        function addContributorContribution(contributorMap, contributor, contributionMap) {
            contributionMap.forEach((count, traitName) => {
                if (!traitName || count <= 0) return;

                let entry = contributorMap.get(traitName);
                if (!entry) {
                    entry = {
                        unitCounts: new Map(),
                        extraCount: 0
                    };
                    contributorMap.set(traitName, entry);
                }

                const contributorKey = contributor?.key || contributor?.label || '';
                if (!contributorKey) return;

                const existingContributor = entry.unitCounts.get(contributorKey) || {
                    label: contributor.label || contributorKey,
                    iconUrl: contributor.iconUrl || '',
                    count: 0
                };
                existingContributor.count += count;
                if (!existingContributor.iconUrl && contributor?.iconUrl) {
                    existingContributor.iconUrl = contributor.iconUrl;
                }
                entry.unitCounts.set(contributorKey, existingContributor);
            });
        }

        function addConditionalEffects(contributorMap, contributor, conditionalEffects, boardUnitIds, traitCounts) {
            (conditionalEffects || []).forEach((effect) => {
                if (!isConditionSatisfied(effect?.conditions, boardUnitIds, traitCounts)) {
                    return;
                }

                addContributorContribution(
                    contributorMap,
                    contributor,
                    resolveDirectTraitContributions({ traitContributions: effect?.traitContributions || {} })
                );
            });
        }

        function addConditionalProfile(contributorMap, contributor, conditionalProfiles, boardUnitIds, traitCounts) {
            const matchingProfile = (conditionalProfiles || []).find((profile) =>
                isConditionSatisfied(profile?.conditions, boardUnitIds, traitCounts)
            );
            if (!matchingProfile) {
                return;
            }

            addContributorContribution(
                contributorMap,
                contributor,
                resolveDirectTraitContributions(matchingProfile)
            );
        }

        function buildTraitContributorMap(board, traitCounts) {
            const contributorMap = new Map();
            const boardUnitIds = new Set(board.units || []);

            board.units.forEach((unitId) => {
                const unit = state.activeData?.unitMap?.get(unitId);
                if (!unit) return;

                const variantAssignment = getVariantAssignment(board, unitId);
                const selectedVariant = variantAssignment?.id
                    ? (unit.variants || []).find((variant) => variant.id === variantAssignment.id) || null
                    : null;
                const unitLabelBase = unit.displayName || unitId;
                const contributorLabel = variantAssignment?.label
                    ? `${unitLabelBase} (${variantAssignment.label})`
                    : unitLabelBase;
                const contributor = {
                    key: `${unitId}:${variantAssignment?.id || 'base'}`,
                    label: contributorLabel,
                    iconUrl: unit.iconUrl || ''
                };

                addContributorContribution(contributorMap, contributor, resolveDirectTraitContributions(unit));
                addConditionalEffects(contributorMap, contributor, unit.conditionalEffects, boardUnitIds, traitCounts);
                addConditionalProfile(contributorMap, contributor, unit.conditionalProfiles, boardUnitIds, traitCounts);

                if (!selectedVariant) {
                    return;
                }

                addContributorContribution(contributorMap, contributor, resolveDirectTraitContributions(selectedVariant));
                addConditionalEffects(contributorMap, contributor, selectedVariant.conditionalEffects, boardUnitIds, traitCounts);
                addConditionalProfile(contributorMap, contributor, selectedVariant.conditionalProfiles, boardUnitIds, traitCounts);
            });

            traitCounts.forEach((count, traitName) => {
                let entry = contributorMap.get(traitName);
                if (!entry) {
                    entry = {
                        unitCounts: new Map(),
                        extraCount: 0
                    };
                    contributorMap.set(traitName, entry);
                }

                const unitContributionTotal = [...entry.unitCounts.values()].reduce((sum, value) => sum + value, 0);
                const missingCount = count - unitContributionTotal;
                if (missingCount > 0) {
                    entry.extraCount += missingCount;
                }
            });

            return contributorMap;
        }

        function buildBoardTraitSummary(board, options = {}) {
            if (!state.activeData?.unitMap) return [];

            const includeUnique = options.includeUnique ?? !!state.lastSearchParams?.includeUnique;
            const showInactive = options.showInactive ?? true;
            const cacheKey = `u${includeUnique ? '1' : '0'}:i${showInactive ? '1' : '0'}`;
            const cachedSummary = boardTraitSummaryCache.get(board);
            if (cachedSummary?.cacheKey === cacheKey) {
                return cachedSummary.value;
            }

            const traitCounts = createTraitCountMap(board);
            const traitContributorMap = buildTraitContributorMap(board, traitCounts);
            const traits = [];

            traitCounts.forEach((count, trait) => {
                const breakpoints = state.activeData.traitBreakpoints?.[trait] || [1];
                let levelReached = 0;
                for (const breakpoint of breakpoints) {
                    if (count >= breakpoint) levelReached = breakpoint;
                    else break;
                }

                const isUnique = breakpoints.length === 1 && breakpoints[0] === 1;
                if (!includeUnique && isUnique) return;
                if (!showInactive && levelReached === 0) return;

                const nextBreakpoint = breakpoints.find((breakpoint) => breakpoint > count) || breakpoints[breakpoints.length - 1] || 1;
                const contributorEntry = traitContributorMap.get(trait) || { unitCounts: new Map(), extraCount: 0 };
                const contributors = [...contributorEntry.unitCounts.values()]
                    .sort((left, right) => left.label.localeCompare(right.label))
                    .map((contributor) => ({
                        label: contributor.count > 1 ? `${contributor.label} x${contributor.count}` : contributor.label,
                        iconUrl: contributor.iconUrl || ''
                    }));
                const summary = {
                    trait,
                    count,
                    levelReached,
                    nextBreakpoint,
                    isActive: levelReached > 0,
                    label: levelReached > 0 ? `${trait} ${count}/${levelReached}` : `${trait} ${count}/${nextBreakpoint}`,
                    iconUrl: state.activeData?.traitIcons?.[trait] || null,
                    contributors,
                    extraCount: contributorEntry.extraCount
                };
                summary.tooltipData = {
                    title: summary.trait,
                    label: summary.label,
                    contributors: summary.contributors,
                    extraCount: summary.extraCount,
                    missingCount: !summary.isActive && summary.nextBreakpoint > summary.count
                        ? summary.nextBreakpoint - summary.count
                        : 0,
                    nextBreakpoint: summary.nextBreakpoint
                };
                traits.push(summary);
            });

            const summary = traits.sort((left, right) =>
                Number(right.isActive) - Number(left.isActive)
                || right.levelReached - left.levelReached
                || right.count - left.count
                || left.trait.localeCompare(right.trait)
            );
            boardTraitSummaryCache.set(board, {
                cacheKey,
                value: summary
            });
            return summary;
        }

        const sortFunctions = {
            mostTraits: (a, b) => getBoardMetric(b) - getBoardMetric(a) || b.totalCost - a.totalCost,
            lowestCost: (a, b) => a.totalCost - b.totalCost || getBoardMetric(b) - getBoardMetric(a),
            highestCost: (a, b) => b.totalCost - a.totalCost || getBoardMetric(b) - getBoardMetric(a),
            bestValue: (a, b) => (getBoardMetric(b) / b.totalCost) - (getBoardMetric(a) / a.totalCost)
        };

        function getActiveSortMode() {
            return document.getElementById('sortMode')?.value || 'mostTraits';
        }

        function getSortedResults(results) {
            const sortFn = sortFunctions[getActiveSortMode()] || sortFunctions.mostTraits;
            return [...results].sort(sortFn);
        }

        function getBoardSortLabel() {
            const labels = {
                mostTraits: 'Best Synergy',
                lowestCost: 'Lowest Cost',
                highestCost: 'Highest Cost',
                bestValue: 'Best Value'
            };

            return labels[getActiveSortMode()] || labels.mostTraits;
        }

        function renderBoardSpotlight(board, rankIndex) {
            hideTraitTooltip();
            if (!board) {
                renderEmptySpotlight();
                return;
            }

            const spotlight = document.getElementById('boardSpotlight');
            const traits = buildBoardTraitSummary(board, { showInactive: true });
            const unitsMarkup = board.units.map((name) => renderUnitPill(name, board)).join('');
            const traitMarkup = traits.length > 0
                ? traits.map((trait) => renderTraitChip(trait, trait.isActive ? 'trait-chip-active' : 'trait-chip-inactive')).join('')
                : '<span class="trait-chip trait-chip-empty">No qualifying traits</span>';
            const valueScore = (getBoardMetric(board) / Math.max(board.totalCost, 1)).toFixed(2);
            const occupiedSlots = Number.isFinite(Number(board.occupiedSlots))
                ? Number(board.occupiedSlots)
                : board.units.length;
            const boardTitle = occupiedSlots === board.units.length
                ? `Level ${occupiedSlots} board - ${getBoardMetric(board)} score`
                : `${occupiedSlots}-slot board (${board.units.length} units) - ${getBoardMetric(board)} score`;

            spotlight.className = 'board-spotlight';
            spotlight.innerHTML = `
                <div class="board-spotlight-header">
                    <div>
                        <span class="board-spotlight-label">Selected Board</span>
                        <h3 class="board-spotlight-title">${boardTitle}</h3>
                    </div>
                    <span class="board-spotlight-rank">Rank #${rankIndex + 1} by ${getBoardSortLabel()}</span>
                </div>
                <div class="spotlight-inline">
                    <div class="spotlight-inline-block">
                        <div class="spotlight-metrics">
                            <span class="spotlight-metric">Score ${getBoardMetric(board)}</span>
                            <span class="spotlight-metric">1-Star ${board.totalCost}</span>
                            <span class="spotlight-metric">2-Star ${board.totalCost * 3}</span>
                            <span class="spotlight-metric">Value ${valueScore}</span>
                        </div>
                    </div>
                    <div class="spotlight-inline-block">
                        <div class="spotlight-unit-list">${unitsMarkup}</div>
                    </div>
                    <div class="spotlight-inline-block spotlight-inline-traits">
                        <div class="spotlight-traits">${traitMarkup}</div>
                    </div>
                </div>
            `;
        }

        function renderResults(results) {
            const tbody = document.getElementById('resBody');
            hideTraitTooltip();
            tbody.innerHTML = '';
            state.selectedBoardIndex = results.length > 0 ? 0 : -1;

            if (!results || results.length === 0) {
                renderEmptySummary('No results');
                tbody.innerHTML = renderResultsMessageRow('No results found for these constraints.', 'results-message-row results-message-row-error');
                renderEmptySpotlight('No boards matched the current filters. Relax constraints or widen the search.');
                return;
            }

            if (results[0].error) {
                renderEmptySummary('Search error');
                tbody.innerHTML = renderResultsMessageRow(results[0].error, 'results-message-row results-message-row-error');
                renderEmptySpotlight('Search failed before a board could be inspected.');
                return;
            }

            const bestValue = results.reduce((best, board) => Math.max(best, getBoardMetric(board) / Math.max(board.totalCost, 1)), 0);
            const lowestCost = results.reduce((best, board) => Math.min(best, board.totalCost), Number.POSITIVE_INFINITY);
            const topScore = results.reduce((best, board) => Math.max(best, getBoardMetric(board)), Number.NEGATIVE_INFINITY);
            app.queryUi.setResultsSummary(`
                <div class="summary-card">
                    <span class="summary-label">Status</span>
                    <span class="summary-value">${results.length} boards</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Top Score</span>
                    <span class="summary-value">${topScore}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Lowest Cost</span>
                    <span class="summary-value">${lowestCost}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Best Value</span>
                    <span class="summary-value">${bestValue.toFixed(2)}</span>
                </div>
            `);

            let selectedRow = null;
            const fragment = document.createDocumentFragment();
            results.forEach((board, index) => {
                const tr = document.createElement('tr');
                tr.className = index === state.selectedBoardIndex ? 'result-row-selected' : '';
                if (index === state.selectedBoardIndex) {
                    selectedRow = tr;
                }
                const traits = buildBoardTraitSummary(board, { showInactive: true });
                const traitMarkup = traits.length > 0
                    ? traits.map((trait) =>
                        renderTraitChip(trait, trait.isActive ? 'trait-chip-active' : 'trait-chip-inactive')
                    ).join('')
                    : '<span class="trait-chip trait-chip-empty">No qualifying traits</span>';
                const unitsMarkup = board.units.map((name) => renderUnitPill(name, board)).join('');
                const valueScore = (getBoardMetric(board) / Math.max(board.totalCost, 1)).toFixed(2);

                tr.innerHTML = `
                    <td class="rank-cell">#${index + 1}</td>
                    <td>
                        <div class="score-stack">
                            <strong>${getBoardMetric(board)}</strong>
                            <span>Value ${valueScore}</span>
                        </div>
                    </td>
                    <td><div class="trait-chip-list">${traitMarkup}</div></td>
                    <td>${board.totalCost}</td>
                    <td>${board.totalCost * 3}</td>
                    <td><div class="unit-pill-list">${unitsMarkup}</div></td>
                `;
                tr.addEventListener('click', () => {
                    if (selectedRow) {
                        selectedRow.classList.remove('result-row-selected');
                    }
                    state.selectedBoardIndex = index;
                    selectedRow = tr;
                    selectedRow.classList.add('result-row-selected');
                    renderBoardSpotlight(results[state.selectedBoardIndex], state.selectedBoardIndex);
                });
                fragment.appendChild(tr);
            });
            tbody.appendChild(fragment);

            bindTooltipListeners();
            renderBoardSpotlight(results[state.selectedBoardIndex], state.selectedBoardIndex);
        }

        return {
            renderEmptySummary,
            renderEstimateSummary,
            renderEmptySpotlight,
            renderSearchingSpotlight,
            renderResultsMessageRow,
            getSortedResults,
            renderResults,
            renderBoardSpotlight
        };
    };
})();
