(function initializeResultsModelFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { renderIconImage, getBoardMetric } = ns.shared;

    ns.createResultsModel = function createResultsModel(app) {
        const { state } = app;
        const boardTraitSummaryCache = new WeakMap();

        function getVariantAssignment(board, unitId) {
            const assignment = board?.variantAssignments?.[unitId];
            if (!assignment) return null;
            if (typeof assignment === 'string') {
                return { id: assignment, label: assignment };
            }

            return assignment;
        }

        function appendIcon(parent, url, alt, className) {
            if (!url) return;
            const img = document.createElement('img');
            img.className = className;
            img.src = url;
            img.alt = alt;
            img.loading = 'lazy';
            parent.appendChild(img);
        }

        function createUnitPill(name, board = null) {
            const unit = state.activeData?.unitMap?.get(name);
            const label = unit?.displayName || name;
            const variantAssignment = getVariantAssignment(board, name);
            const variantLabel = variantAssignment?.label || '';
            const fullLabel = variantLabel ? `${label} (${variantLabel})` : label;

            const pill = document.createElement('span');
            pill.className = 'unit-pill';
            appendIcon(pill, unit?.iconUrl, label, 'pill-icon unit-icon');
            const text = document.createElement('span');
            text.textContent = fullLabel;
            pill.appendChild(text);
            return pill;
        }

        function createTraitChip(trait, extraClassName = '') {
            const chip = document.createElement('span');
            chip.className = ['trait-chip', extraClassName].filter(Boolean).join(' ');
            appendIcon(chip, trait.iconUrl, trait.trait, 'pill-icon trait-icon');
            if (trait.tooltipData) {
                chip.dataset.traitTooltip = encodeURIComponent(JSON.stringify(trait.tooltipData));
                chip.tabIndex = 0;
            }
            chip.appendChild(document.createTextNode(trait.label));
            return chip;
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
                const variantAssignment = getVariantAssignment(board, unitId);
                const selectedVariant = variantAssignment?.id
                    ? (unit.variants || []).find((variant) => variant.id === variantAssignment.id) || null
                    : null;
                addContributionMap(resolveDirectTraitContributions(selectedVariant || unit));
            });

            for (const emblem of state.lastSearchParams?.extraEmblems || []) {
                counts.set(emblem, (counts.get(emblem) || 0) + 1);
            }

            return counts;
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

                addContributorContribution(
                    contributorMap,
                    contributor,
                    resolveDirectTraitContributions(selectedVariant || unit)
                );
                addConditionalEffects(contributorMap, contributor, unit.conditionalEffects, boardUnitIds, traitCounts);
                addConditionalProfile(contributorMap, contributor, unit.conditionalProfiles, boardUnitIds, traitCounts);

                if (!selectedVariant) {
                    return;
                }

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

                const unitContributionTotal = [...entry.unitCounts.values()].reduce((sum, value) => sum + value.count, 0);
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
            mostTraits: (left, right) => getBoardMetric(right) - getBoardMetric(left) || right.totalCost - left.totalCost,
            lowestCost: (left, right) => left.totalCost - right.totalCost || getBoardMetric(right) - getBoardMetric(left),
            highestCost: (left, right) => right.totalCost - left.totalCost || getBoardMetric(right) - getBoardMetric(left),
            bestValue: (left, right) => (getBoardMetric(right) / right.totalCost) - (getBoardMetric(left) / left.totalCost)
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

        return {
            getBoardMetric,
            getVariantAssignment,
            createUnitPill,
            createTraitChip,
            createTraitCountMap,
            buildBoardTraitSummary,
            getSortedResults,
            getBoardSortLabel,
            renderIconImage
        };
    };
})();
