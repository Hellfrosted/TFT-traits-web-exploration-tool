const { normalizeSearchParams } = require('../searchParams.js');
const {
    finalizeTopBoards
} = require('./search-results.js');
const {
    countPreparedSearchSpaceCandidates
} = require('./search-space-counter.js');
const {
    runSearchDfs
} = require('./search-dfs-runner.js');
const {
    createSearchExecutionDependencies
} = require('./search-execution-dependencies.js');
const {
    buildSearchExecutionContext
} = require('./search-execution-context.js');

module.exports = {
    buildSortedBoardUnits(selectedUnitIndices, unitInfo) {
        return [...selectedUnitIndices]
            .sort((leftIndex, rightIndex) => unitInfo[leftIndex].sortRank - unitInfo[rightIndex].sortRank)
            .map((unitIndex) => unitInfo[unitIndex].id);
    },

    getValidUnits(dataCache, mustExclude, mustExcludeTraits = [], variantLocks = {}) {
        const excludedUnits = new Set(mustExclude);
        const excludedTraits = new Set(mustExcludeTraits);
        return dataCache.units.filter((unit) => {
            if (excludedUnits.has(unit.id)) return false;
            for (const trait of this.getAutomaticConditionalTraitNames(unit)) {
                if (excludedTraits.has(trait)) {
                    return false;
                }
            }
            return this.hasAllowedTraitProfile(unit, excludedTraits, variantLocks[unit.id] || null);
        });
    },

    buildRequiredUnitMask(units, mustInclude) {
        const requiredUnits = new Set(mustInclude);
        return units.reduce((mask, unit, index) => {
            return requiredUnits.has(unit.id) ? (mask | (1n << BigInt(index))) : mask;
        }, 0n);
    },

    getEntitySlotCost(entity) {
        const numericSlotCost = Math.trunc(Number(entity?.slotCost));
        return Number.isFinite(numericSlotCost) && numericSlotCost > 0 ? numericSlotCost : 1;
    },

    getUnitSlotCostRange(unit, lockedVariantId = null) {
        const baseSlotCost = this.getEntitySlotCost(unit);
        if (!Array.isArray(unit?.variants) || unit.variants.length === 0) {
            return {
                min: baseSlotCost,
                max: baseSlotCost
            };
        }

        const relevantVariants = lockedVariantId
            ? unit.variants.filter((variant) => variant.id === lockedVariantId)
            : unit.variants;
        if (relevantVariants.length === 0) {
            return {
                min: baseSlotCost,
                max: baseSlotCost
            };
        }

        const slotCosts = relevantVariants.map((variant) => this.getEntitySlotCost(variant));
        return {
            min: Math.min(...slotCosts),
            max: Math.max(...slotCosts)
        };
    },

    prepareSearchContext(dataCache, params) {
        const {
            boardSize,
            mustInclude = [],
            mustExclude = [],
            mustExcludeTraits = [],
            variantLocks = {}
        } = params;

        const validUnits = this.getValidUnits(dataCache, mustExclude, mustExcludeTraits, variantLocks);
        const mustHaveMask = this.buildRequiredUnitMask(validUnits, mustInclude);
        const mustHaveCount = this.popcount(mustHaveMask);
        let mustHaveMinSlots = 0;
        let hasVariableSlotCosts = false;

        validUnits.forEach((unit, index) => {
            const slotCostRange = this.getUnitSlotCostRange(unit, variantLocks[unit.id] || null);
            if (slotCostRange.min !== 1 || slotCostRange.max !== 1) {
                hasVariableSlotCosts = true;
            }
            if ((mustHaveMask & (1n << BigInt(index))) !== 0n) {
                mustHaveMinSlots += slotCostRange.min;
            }
        });
        const remainingSlots = boardSize - mustHaveMinSlots;

        return {
            validUnits,
            mustHaveMask,
            mustHaveCount,
            remainingSlots,
            availableCount: validUnits.length - mustHaveCount,
            hasAllRequiredUnits: mustHaveCount === mustInclude.length,
            hasVariableSlotCosts
        };
    },

    popcount(n) {
        let count = 0;
        while (n > 0n) {
            count++;
            n &= n - 1n;
        }
        return count;
    },

    popcountInt(n) {
        let count = 0;
        while (n > 0) {
            count++;
            n &= n - 1;
        }
        return count;
    },

    combinations(n, k) {
        if (k > n) return 0;
        if (k === 0 || k === n) return 1;
        let result = 1;
        for (let i = 0; i < k; i++) {
            result = result * (n - i) / (i + 1);
        }
        return Math.round(result);
    },

    countSearchSpaceCandidates(dataCache, params, preparedSearchContext = null) {
        const normalizedParams = normalizeSearchParams(params);
        return countPreparedSearchSpaceCandidates({
            ...(
                preparedSearchContext
                || this.prepareSearchContext(dataCache, normalizedParams)
            ),
            variantLocks: normalizedParams.variantLocks,
            getUnitSlotCostRange: this.getUnitSlotCostRange.bind(this)
        });
    },

    getCombinationCount(dataCache, params, preparedSearchContext = null) {
        const normalizedParams = normalizeSearchParams(params);
        const {
            remainingSlots,
            availableCount,
            hasAllRequiredUnits,
            hasVariableSlotCosts
        } = preparedSearchContext || this.prepareSearchContext(dataCache, normalizedParams);

        if (!hasAllRequiredUnits || remainingSlots < 0) {
            return { count: 0, remainingSlots };
        }

        if (hasVariableSlotCosts) {
            return {
                count: this.countSearchSpaceCandidates(dataCache, normalizedParams, preparedSearchContext),
                remainingSlots
            };
        }

        return {
            count: this.combinations(availableCount, remainingSlots),
            remainingSlots
        };
    },

    search(dataCache, params, onProgress, preparedSearchContext = null) {
        const normalizedParams = normalizeSearchParams(params);

        const {
            validUnits,
            mustHaveMask,
            remainingSlots,
            hasAllRequiredUnits,
            hasVariableSlotCosts
        } = preparedSearchContext || this.prepareSearchContext(dataCache, normalizedParams);

        if (!hasAllRequiredUnits || remainingSlots < 0) {
            return [];
        }

        const {
            progressTracker,
            topBoardTracker,
            searchSpaceError,
            dfsInput
        } = buildSearchExecutionContext({
            dataCache,
            normalizedParams,
            preparedSearchContext: {
                validUnits,
                mustHaveMask,
                remainingSlots,
                hasVariableSlotCosts
            },
            onProgress,
            dependencies: createSearchExecutionDependencies(this)
        });

        if (searchSpaceError) {
            topBoardTracker.topBoards.push({ error: searchSpaceError });
            return topBoardTracker.topBoards;
        }

        runSearchDfs(dfsInput);
        progressTracker.complete();
        return finalizeTopBoards(topBoardTracker.topBoards);
    }
};
