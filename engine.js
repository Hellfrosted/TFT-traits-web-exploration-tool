const { LIMITS } = require('./constants.js');
const { normalizeSearchParams } = require('./searchParams.js');

/**
 * Core search engine for finding optimal TFT board compositions.
 * Uses depth-first search with backtracking over unit combinations,
 * scoring each valid board by synergy breakpoints.
 */
class Engine {
    static buildTraitContributionEntries(unit, traitIndex, hashMap = {}) {
        const contributionMap = new Map();
        const addContribution = (traitName, count = 1) => {
            const index = traitIndex[traitName];
            const numericCount = Math.trunc(Number(count));
            if (index === undefined || !Number.isFinite(numericCount) || numericCount <= 0) {
                return;
            }

            contributionMap.set(index, (contributionMap.get(index) || 0) + numericCount);
        };

        if (unit.traitContributions && typeof unit.traitContributions === 'object') {
            Object.entries(unit.traitContributions).forEach(([traitName, count]) => {
                addContribution(traitName, count);
            });
        } else {
            const traitNames = new Set();

            if (Array.isArray(unit.traits)) {
                unit.traits.forEach((traitName) => {
                    traitNames.add(traitName);
                });
            }

            if (Array.isArray(unit.traitIds)) {
                unit.traitIds.forEach((traitId) => {
                    traitNames.add(hashMap[traitId] || traitId);
                });
            }

            traitNames.forEach((traitName) => addContribution(traitName, 1));
        }

        return Array.from(contributionMap.entries()).map(([index, count]) => ({ index, count }));
    }

    static getConditionalEffectTraitNames(conditionalEffects) {
        const traitNames = new Set();

        (conditionalEffects || []).forEach((effect) => {
            Object.keys(effect?.traitContributions || {}).forEach((traitName) => {
                if (traitName) {
                    traitNames.add(traitName);
                }
            });
        });

        return [...traitNames];
    }

    static buildConditionalEffectEntries(conditionalEffects, traitIndex, hashMap = {}) {
        return (conditionalEffects || []).map((effect) => {
            const traitContributionEntries = this.buildTraitContributionEntries(
                { traitContributions: effect?.traitContributions || {} },
                traitIndex,
                hashMap
            );

            if (traitContributionEntries.length === 0) {
                return null;
            }

            return {
                conditions: effect?.conditions || null,
                traitContributionEntries
            };
        }).filter(Boolean);
    }

    static buildConditionalProfileEntries(conditionalProfiles, traitIndex, hashMap = {}) {
        return (conditionalProfiles || []).map((profile) => {
            const traitContributionEntries = this.buildTraitContributionEntries(profile, traitIndex, hashMap);
            if (traitContributionEntries.length === 0) {
                return null;
            }

            return {
                conditions: profile?.conditions || null,
                traits: profile?.traits || [],
                traitContributionEntries
            };
        }).filter(Boolean);
    }

    static getAutomaticConditionalTraitNames(unit) {
        const traitNames = new Set(this.getConditionalEffectTraitNames(unit?.conditionalEffects));

        (unit?.conditionalProfiles || []).forEach((profile) => {
            (profile?.traits || []).forEach((traitName) => {
                if (traitName) {
                    traitNames.add(traitName);
                }
            });
            Object.keys(profile?.traitContributions || {}).forEach((traitName) => {
                if (traitName) {
                    traitNames.add(traitName);
                }
            });
        });

        (unit?.variants || []).forEach((variant) => {
            this.getConditionalEffectTraitNames(variant?.conditionalEffects).forEach((traitName) => {
                traitNames.add(traitName);
            });
            (variant?.conditionalProfiles || []).forEach((profile) => {
                (profile?.traits || []).forEach((traitName) => {
                    if (traitName) {
                        traitNames.add(traitName);
                    }
                });
                Object.keys(profile?.traitContributions || {}).forEach((traitName) => {
                    if (traitName) {
                        traitNames.add(traitName);
                    }
                });
            });
        });

        return traitNames;
    }

    static getUnitTraitProfiles(unit, lockedVariantId = null) {
        const unitConditionalTraits = this.getConditionalEffectTraitNames(unit.conditionalEffects);
        const unitConditionalProfileTraits = (unit.conditionalProfiles || []).map((profile) => ([
            ...new Set([
                ...(profile.traits || []),
                ...this.getConditionalEffectTraitNames(unit.conditionalEffects)
            ])
        ]));
        if (Array.isArray(unit.variants) && unit.variants.length > 0) {
            const variants = lockedVariantId
                ? unit.variants.filter((variant) => variant.id === lockedVariantId)
                : unit.variants;
            return variants.flatMap((variant) => {
                const variantConditionalTraits = this.getConditionalEffectTraitNames(variant.conditionalEffects);
                const baseVariantTraits = [...new Set([...(variant.traits || []), ...unitConditionalTraits, ...variantConditionalTraits])];
                const conditionalVariantTraits = (variant.conditionalProfiles || []).map((profile) => ([
                    ...new Set([
                        ...(profile.traits || []),
                        ...unitConditionalTraits,
                        ...variantConditionalTraits
                    ])
                ]));
                return [baseVariantTraits, ...conditionalVariantTraits, ...unitConditionalProfileTraits];
            });
        }

        return [
            [...new Set([...(unit.traits || []), ...unitConditionalTraits])],
            ...unitConditionalProfileTraits
        ];
    }

    static hasAllowedTraitProfile(unit, excludedTraits, lockedVariantId = null) {
        if (!excludedTraits || excludedTraits.size === 0) {
            return this.getUnitTraitProfiles(unit, lockedVariantId).length > 0;
        }

        return this.getUnitTraitProfiles(unit, lockedVariantId)
            .some((traits) => !traits.some((trait) => excludedTraits.has(trait)));
    }

    static contributionEntriesToMap(entries) {
        const contributionMap = new Map();
        (entries || []).forEach(({ index, count }) => {
            contributionMap.set(index, count);
        });
        return contributionMap;
    }

    static summarizeVariantProfiles(variantProfiles) {
        if (!Array.isArray(variantProfiles) || variantProfiles.length === 0) {
            return {
                fixedTraitContributionEntries: [],
                variantProfiles: []
            };
        }

        const entryMaps = variantProfiles.map((profile) => this.contributionEntriesToMap(profile.traitContributionEntries));
        const allIndexes = new Set();
        entryMaps.forEach((entryMap) => {
            entryMap.forEach((_, index) => allIndexes.add(index));
        });

        const fixedTraitContributionEntries = [];
        allIndexes.forEach((index) => {
            const commonCount = Math.min(...entryMaps.map((entryMap) => entryMap.get(index) || 0));
            if (commonCount > 0) {
                fixedTraitContributionEntries.push({ index, count: commonCount });
            }
        });

        const fixedContributionMap = this.contributionEntriesToMap(fixedTraitContributionEntries);
        const normalizedVariants = variantProfiles.map((profile) => {
            const deltaEntries = [];
            profile.traitContributionEntries.forEach(({ index, count }) => {
                const deltaCount = count - (fixedContributionMap.get(index) || 0);
                if (deltaCount > 0) {
                    deltaEntries.push({ index, count: deltaCount });
                }
            });

            return {
                ...profile,
                traitContributionEntries: deltaEntries
            };
        });

        return {
            fixedTraitContributionEntries,
            variantProfiles: normalizedVariants
        };
    }

    static traitCountsToRecord(counts, allTraitNames) {
        const record = {};

        for (let i = 0; i < counts.length; i++) {
            if (counts[i] > 0) {
                record[allTraitNames[i]] = counts[i];
            }
        }

        return record;
    }

    static compileConditions(conditions, traitIndex, unitIndexById, traitBreakpoints = {}) {
        if (!conditions || typeof conditions !== 'object') {
            return null;
        }

        const requiredUnits = Array.isArray(conditions.requiredUnits) ? conditions.requiredUnits : [];
        const forbiddenUnits = Array.isArray(conditions.forbiddenUnits) ? conditions.forbiddenUnits : [];
        const requiredActiveTraits = Array.isArray(conditions.requiredActiveTraits) ? conditions.requiredActiveTraits : [];
        const forbiddenActiveTraits = Array.isArray(conditions.forbiddenActiveTraits) ? conditions.forbiddenActiveTraits : [];
        const minTraitCounts = conditions.minTraitCounts && typeof conditions.minTraitCounts === 'object'
            ? conditions.minTraitCounts
            : {};
        const maxTraitCounts = conditions.maxTraitCounts && typeof conditions.maxTraitCounts === 'object'
            ? conditions.maxTraitCounts
            : {};

        return {
            requiredUnitIndices: requiredUnits.map((unitId) => unitIndexById[unitId] ?? -1),
            forbiddenUnitIndices: forbiddenUnits
                .map((unitId) => unitIndexById[unitId])
                .filter((index) => index !== undefined),
            requiredActiveTraits: requiredActiveTraits.map((traitName) => {
                const breakpoints = traitBreakpoints[traitName] || [1];
                return {
                    index: traitIndex[traitName] ?? -1,
                    threshold: breakpoints[0] ?? 1
                };
            }),
            forbiddenActiveTraits: forbiddenActiveTraits.map((traitName) => {
                const breakpoints = traitBreakpoints[traitName] || [1];
                return {
                    index: traitIndex[traitName] ?? -1,
                    threshold: breakpoints[0] ?? 1
                };
            }),
            minTraitCounts: Object.entries(minTraitCounts).map(([traitName, minCount]) => ({
                index: traitIndex[traitName] ?? -1,
                threshold: Number(minCount || 0)
            })),
            maxTraitCounts: Object.entries(maxTraitCounts).map(([traitName, maxCount]) => ({
                index: traitIndex[traitName] ?? -1,
                threshold: Number(maxCount)
            }))
        };
    }

    static isCompiledConditionSatisfied(compiledConditions, traitCounts, activeUnitFlags) {
        if (!compiledConditions) {
            return true;
        }

        for (const unitIndex of compiledConditions.requiredUnitIndices) {
            if (unitIndex < 0 || !activeUnitFlags[unitIndex]) {
                return false;
            }
        }

        for (const unitIndex of compiledConditions.forbiddenUnitIndices) {
            if (activeUnitFlags[unitIndex]) {
                return false;
            }
        }

        for (const { index, threshold } of compiledConditions.requiredActiveTraits) {
            if (index < 0 || (traitCounts[index] || 0) < threshold) {
                return false;
            }
        }

        for (const { index, threshold } of compiledConditions.forbiddenActiveTraits) {
            if (index >= 0 && (traitCounts[index] || 0) >= threshold) {
                return false;
            }
        }

        for (const { index, threshold } of compiledConditions.minTraitCounts) {
            if (index < 0) {
                if (threshold > 0) {
                    return false;
                }
                continue;
            }
            if ((traitCounts[index] || 0) < threshold) {
                return false;
            }
        }

        for (const { index, threshold } of compiledConditions.maxTraitCounts) {
            if (index < 0) {
                if (0 > threshold) {
                    return false;
                }
                continue;
            }
            if ((traitCounts[index] || 0) > threshold) {
                return false;
            }
        }

        return true;
    }

    static findFirstSatisfiedProfile(entries, traitCounts, activeUnitFlags) {
        for (const entry of entries || []) {
            if (this.isCompiledConditionSatisfied(entry.compiledConditions, traitCounts, activeUnitFlags)) {
                return entry;
            }
        }

        return null;
    }

    static buildSortedBoardUnits(selectedUnitIndices, unitInfo) {
        return [...selectedUnitIndices]
            .sort((leftIndex, rightIndex) => unitInfo[leftIndex].sortRank - unitInfo[rightIndex].sortRank)
            .map((unitIndex) => unitInfo[unitIndex].id);
    }

    static isConditionSatisfied(conditions, context) {
        if (!conditions || typeof conditions !== 'object') {
            return true;
        }

        const traitCounts = context?.traitCounts || {};
        const activeUnits = context?.activeUnits || new Set();
        const traitBreakpoints = context?.traitBreakpoints || {};

        const requiredUnits = Array.isArray(conditions.requiredUnits) ? conditions.requiredUnits : [];
        if (requiredUnits.some((unitId) => !activeUnits.has(unitId))) {
            return false;
        }

        const forbiddenUnits = Array.isArray(conditions.forbiddenUnits) ? conditions.forbiddenUnits : [];
        if (forbiddenUnits.some((unitId) => activeUnits.has(unitId))) {
            return false;
        }

        const requiredActiveTraits = Array.isArray(conditions.requiredActiveTraits) ? conditions.requiredActiveTraits : [];
        if (requiredActiveTraits.some((traitName) => {
            const breakpoints = traitBreakpoints[traitName] || [1];
            return (traitCounts[traitName] || 0) < breakpoints[0];
        })) {
            return false;
        }

        const forbiddenActiveTraits = Array.isArray(conditions.forbiddenActiveTraits) ? conditions.forbiddenActiveTraits : [];
        if (forbiddenActiveTraits.some((traitName) => {
            const breakpoints = traitBreakpoints[traitName] || [1];
            return (traitCounts[traitName] || 0) >= breakpoints[0];
        })) {
            return false;
        }

        const minTraitCounts = conditions.minTraitCounts && typeof conditions.minTraitCounts === 'object'
            ? conditions.minTraitCounts
            : {};
        if (Object.entries(minTraitCounts).some(([traitName, minCount]) => (traitCounts[traitName] || 0) < Number(minCount || 0))) {
            return false;
        }

        const maxTraitCounts = conditions.maxTraitCounts && typeof conditions.maxTraitCounts === 'object'
            ? conditions.maxTraitCounts
            : {};
        if (Object.entries(maxTraitCounts).some(([traitName, maxCount]) => (traitCounts[traitName] || 0) > Number(maxCount))) {
            return false;
        }

        return true;
    }

    /**
     * Update the cached index of the worst board in the current result set.
     * @param {Array<{_score: number}>} topBoards
     * @returns {number}
     */
    static findWorstBoardIndex(topBoards) {
        let worstIndex = 0;
        for (let i = 1; i < topBoards.length; i++) {
            if (topBoards[i]._score < topBoards[worstIndex]._score) {
                worstIndex = i;
            }
        }
        return worstIndex;
    }


    /**
     * Filter out units excluded by id or trait.
     * @param {import('./data.js').ParsedData} dataCache
     * @param {string[]} mustExclude
     * @param {string[]} [mustExcludeTraits]
     * @returns {import('./data.js').UnitData[]}
     */
    static getValidUnits(dataCache, mustExclude, mustExcludeTraits = [], variantLocks = {}) {
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
    }

    /**
     * Build a bitmask for the required units within the filtered unit list.
     * @param {import('./data.js').UnitData[]} units
     * @param {string[]} mustInclude
     * @returns {bigint}
     */
    static buildRequiredUnitMask(units, mustInclude) {
        const requiredUnits = new Set(mustInclude);
        return units.reduce((mask, unit, index) => {
            return requiredUnits.has(unit.id) ? (mask | (1n << BigInt(index))) : mask;
        }, 0n);
    }

    /**
     * Prepare filtered units and search bookkeeping shared by estimation and DFS.
     * @param {import('./data.js').ParsedData} dataCache
     * @param {Object} params
     * @param {number} params.boardSize
     * @param {string[]} params.mustInclude
     * @param {string[]} params.mustExclude
     * @param {string[]} [params.mustExcludeTraits]
     * @returns {{
     *   validUnits: import('./data.js').UnitData[],
     *   mustHaveMask: bigint,
     *   mustHaveCount: number,
     *   remainingToPick: number,
     *   availableCount: number,
     *   hasAllRequiredUnits: boolean
     * }}
     */
    static prepareSearchContext(dataCache, params) {
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
        const remainingToPick = boardSize - mustHaveCount;

        return {
            validUnits,
            mustHaveMask,
            mustHaveCount,
            remainingToPick,
            availableCount: validUnits.length - mustHaveCount,
            hasAllRequiredUnits: mustHaveCount === mustInclude.length
        };
    }

    /**
     * Count the number of set bits in a BigInt (Hamming weight).
     * Used for counting required units in bitmask representation.
     * @param {bigint} n - BigInt value to count bits of
     * @returns {number} Number of 1-bits
     */
    static popcount(n) {
        let count = 0;
        while (n > 0n) {
            count++;
            n &= n - 1n;
        }
        return count;
    }

    /**
     * Count the number of set bits in a regular integer.
     * @param {number} n - Integer value
     * @returns {number} Number of 1-bits
     */
    static popcountInt(n) {
        let count = 0;
        while (n > 0) {
            count++;
            n &= n - 1;
        }
        return count;
    }

    /**
     * Calculate the binomial coefficient C(n, k) = n! / (k! * (n-k)!).
     * Used to estimate the total search space before running DFS.
     * @param {number} n - Total items
     * @param {number} k - Items to choose
     * @returns {number} Number of combinations
     */
    static combinations(n, k) {
        if (k > n) return 0;
        if (k === 0 || k === n) return 1;
        let result = 1;
        for (let i = 0; i < k; i++) {
            result = result * (n - i) / (i + 1);
        }
        return Math.round(result);
    }

    /**
     * Estimate the number of combinations for a given search configuration.
     * Called before search to warn the user about expensive queries.
     * @param {import('./data.js').ParsedData} dataCache - Parsed game data
     * @param {Object} params - Search parameters
     * @param {number} params.boardSize - Total board size
     * @param {string[]} params.mustInclude - Unit IDs that must be on the board
     * @param {string[]} params.mustExclude - Unit IDs to exclude
     * @param {string[]} [params.mustExcludeTraits] - Trait names to exclude
     * @returns {{count: number, remainingToPick: number}} Estimated combinations and empty slots
     */
    static getCombinationCount(dataCache, params, preparedSearchContext = null) {
        const normalizedParams = normalizeSearchParams(params);
        const {
            remainingToPick,
            availableCount,
            hasAllRequiredUnits
        } = preparedSearchContext || this.prepareSearchContext(dataCache, normalizedParams);

        if (!hasAllRequiredUnits || remainingToPick < 0) {
            return { count: 0, remainingToPick };
        }
        
        return {
            count: this.combinations(availableCount, remainingToPick),
            remainingToPick
        };
    }

    /**
     * Run the full board search using DFS with backtracking.
     * Evaluates all valid unit combinations and returns the top boards by synergy score.
     *
     * @param {import('./data.js').ParsedData} dataCache - Parsed game data
     * @param {Object} params - Search configuration
     * @param {number} params.boardSize - Total units on board
     * @param {string[]} params.mustInclude - Required unit IDs
     * @param {string[]} params.mustExclude - Excluded unit IDs
     * @param {string[]} [params.mustIncludeTraits] - Required active trait names
     * @param {string[]} [params.mustExcludeTraits] - Excluded trait names (units with these traits are filtered out)
     * @param {string[]} [params.tankRoles] - Role names considered "tank" for front-line requirement
     * @param {string[]} [params.carryRoles] - Role names considered "carry" for back-line requirement
     * @param {string[]} [params.extraEmblems] - Additional trait emblems to add to synergy count
     * @param {boolean} [params.onlyActive] - Only count traits that hit at least the first breakpoint
     * @param {boolean} [params.tierRank] - Score by number of breakpoints passed (not just active/inactive)
     * @param {boolean} [params.includeUnique] - Include 1-unit unique traits in scoring
     * @param {number} [params.maxResults] - Maximum results to return
     * @param {Function} [onProgress] - Progress callback: (pct, checked, total) => void
     * @returns {Array<{units: string[], synergyScore: number, totalCost: number} | {error: string}>}
     */
    static search(dataCache, params, onProgress, preparedSearchContext = null) {
        const normalizedParams = normalizeSearchParams(params);
        const {
            mustIncludeTraits,
            mustExcludeTraits,
            variantLocks,
            tankRoles, carryRoles, extraEmblems,
            onlyActive, tierRank, includeUnique, maxResults 
        } = normalizedParams;
        
        const allTraitNames = dataCache.traits;
        const traitIndex = {};
        allTraitNames.forEach((traitName, index) => {
            traitIndex[traitName] = index;
        });
        const traitBPs = dataCache.traitBreakpoints || {};

        const {
            validUnits,
            mustHaveMask,
            remainingToPick,
            hasAllRequiredUnits
        } = preparedSearchContext || this.prepareSearchContext(dataCache, normalizedParams);

        if (!hasAllRequiredUnits || remainingToPick < 0) {
            return [];
        }

        const availableIndices = [];
        for (let i = 0; i < validUnits.length; i++) {
            if ((mustHaveMask & (1n << BigInt(i))) === 0n) {
                availableIndices.push(i);
            }
        }

        const unitIndexById = Object.create(null);
        validUnits.forEach((unit, index) => {
            unitIndexById[unit.id] = index;
        });

        const tankRoleSet = new Set(tankRoles || []);
        const carryRoleSet = new Set(carryRoles || []);
        const requireTank = tankRoleSet.size > 0;
        const requireCarry = carryRoleSet.size > 0;

        const numTraits = allTraitNames.length;
        const mustIncludeTraitIndices = (mustIncludeTraits || [])
            .map((traitName) => traitIndex[traitName])
            .filter((index) => index !== undefined);
        const excludedTraitSet = new Set(mustExcludeTraits || []);
        const unitSortRank = Object.create(null);
        validUnits
            .map((unit) => unit.id)
            .sort((leftId, rightId) => leftId.localeCompare(rightId))
            .forEach((unitId, sortRank) => {
                unitSortRank[unitId] = sortRank;
            });

        // Pre-process unit info for fast access in DFS inner loop
        const unitInfo = validUnits.map((unit) => {
            const baseTraitContributionEntries = this.buildTraitContributionEntries(unit, traitIndex, dataCache.hashMap);
            let fixedTraitContributionEntries = baseTraitContributionEntries;
            let variantProfiles = [];
            const conditionalEffectEntries = this.buildConditionalEffectEntries(
                unit.conditionalEffects,
                traitIndex,
                dataCache.hashMap
            ).map((effect) => ({
                ...effect,
                compiledConditions: this.compileConditions(effect.conditions, traitIndex, unitIndexById, traitBPs)
            }));
            const conditionalProfileEntries = this.buildConditionalProfileEntries(
                unit.conditionalProfiles,
                traitIndex,
                dataCache.hashMap
            ).map((profile) => ({
                ...profile,
                compiledConditions: this.compileConditions(profile.conditions, traitIndex, unitIndexById, traitBPs)
            }));

            if (Array.isArray(unit.variants) && unit.variants.length > 0) {
                const lockedVariantId = variantLocks?.[unit.id] || null;
                const allowedVariantProfiles = unit.variants
                    .filter((variant) => !lockedVariantId || variant.id === lockedVariantId)
                    .filter((variant) => !variant.traits?.some((trait) => excludedTraitSet.has(trait)))
                    .map((variant) => ({
                        id: variant.id,
                        label: variant.label || variant.id,
                        role: variant.role || unit.role,
                        traits: variant.traits || [],
                        fullTraitContributionEntries: this.buildTraitContributionEntries(variant, traitIndex, dataCache.hashMap),
                        traitContributionEntries: this.buildTraitContributionEntries(variant, traitIndex, dataCache.hashMap),
                        compiledConditions: this.compileConditions(variant.conditions, traitIndex, unitIndexById, traitBPs),
                        conditionalProfileEntries: this.buildConditionalProfileEntries(
                            variant.conditionalProfiles,
                            traitIndex,
                            dataCache.hashMap
                        ).map((profile) => ({
                            ...profile,
                            compiledConditions: this.compileConditions(profile.conditions, traitIndex, unitIndexById, traitBPs)
                        })),
                        conditionalEffectEntries: this.buildConditionalEffectEntries(
                            variant.conditionalEffects,
                            traitIndex,
                            dataCache.hashMap
                        ).map((effect) => ({
                            ...effect,
                            compiledConditions: this.compileConditions(effect.conditions, traitIndex, unitIndexById, traitBPs)
                        }))
                    }));

                const variantSummary = this.summarizeVariantProfiles(allowedVariantProfiles);
                fixedTraitContributionEntries = variantSummary.fixedTraitContributionEntries;
                variantProfiles = variantSummary.variantProfiles;
            }

            const traitContributionByIndex = Object.create(null);
            fixedTraitContributionEntries.forEach(({ index, count }) => {
                traitContributionByIndex[index] = count;
            });

            return {
                cost: unit.cost,
                isTank: tankRoleSet.has(unit.role),
                isCarry: carryRoleSet.has(unit.role),
                baseTraitContributionEntries,
                fixedTraitContributionEntries,
                traitContributionByIndex,
                conditionalProfileEntries,
                conditionalEffectEntries,
                variantProfiles,
                hasComplexEvaluation: (
                    conditionalProfileEntries.length > 0 ||
                    conditionalEffectEntries.length > 0 ||
                    variantProfiles.length > 0
                ) ? 1 : 0,
                sortRank: unitSortRank[unit.id] ?? 0,
                id: unit.id
            };
        });

        // Build initial state from must-have units
        let mustHaveInitialTank = !requireTank;
        let mustHaveInitialCarry = !requireCarry;
        let mustHaveTotalCost = 0;
        const initialTraitCounts = new Uint8Array(numTraits);
        const activeUnitFlags = new Uint8Array(validUnits.length);
        const mustHaveUnitIndices = [];
        const mustHaveVariantUnitIndices = [];
        let mustHaveComplexUnitCount = 0;

        // Add emblem traits to initial counts
        if (extraEmblems) {
            extraEmblems.forEach(e => {
                const idx = traitIndex[e];
                if (idx !== undefined) initialTraitCounts[idx]++;
            });
        }

        for (let i = 0; i < validUnits.length; i++) {
            if ((mustHaveMask & (1n << BigInt(i))) !== 0n) {
                const info = unitInfo[i];
                activeUnitFlags[i] = 1;
                if (info.isTank) mustHaveInitialTank = true;
                if (info.isCarry) mustHaveInitialCarry = true;
                mustHaveTotalCost += info.cost;
                mustHaveComplexUnitCount += info.hasComplexEvaluation;
                info.fixedTraitContributionEntries.forEach(({ index, count }) => {
                    initialTraitCounts[index] += count;
                });
                if (info.variantProfiles.length > 0) {
                    mustHaveVariantUnitIndices.push(i);
                }
                mustHaveUnitIndices.push(i);
            }
        }

        const topBoards = [];
        const MAX_BOARDS = maxResults || LIMITS.DEFAULT_MAX_RESULTS;
        let worstScore = -Infinity;
        let worstIndex = -1;
        const hasVariantUnits = unitInfo.some((info) => info.variantProfiles.length > 0);
        const hasConditionalProfiles = unitInfo.some((info) =>
            info.conditionalProfileEntries.length > 0 ||
            info.variantProfiles.some((variant) => variant.conditionalProfileEntries.length > 0)
        );
        const hasConditionalEffects = unitInfo.some((info) =>
            info.conditionalEffectEntries.length > 0 ||
            info.variantProfiles.some((variant) => variant.conditionalEffectEntries.length > 0)
        );

        /** Calculate synergy score from trait counts based on breakpoint thresholds */
        const calculateSynergyScore = (counts) => {
            let score = 0;
            for (let i = 0; i < numTraits; i++) {
                const count = counts[i];
                if (count === 0) continue;

                const name = allTraitNames[i];
                const bps = traitBPs[name] || [1];
                const isUnique = bps.length === 1 && bps[0] === 1;

                if (!includeUnique && isUnique) continue;
                
                let levelsPassed = 0;
                for (const bp of bps) {
                    if (count >= bp) levelsPassed++;
                    else break;
                }

                if (onlyActive && levelsPassed === 0) continue;

                if (tierRank) {
                    score += levelsPassed;
                } else {
                    score += (levelsPassed > 0 ? 1 : (onlyActive ? 0 : 1));
                }
            }
            return score;
        };

        /** Combine synergy score and cost into a single comparable value */
        const scoreBoard = (synergyScore, totalCost) => {
            // This search is intended to surface capped endgame boards, not budget boards.
            // Prefer higher-cost boards as the secondary tie-break once synergy is matched.
            return synergyScore * 10000 + totalCost;
        };

        const evaluateBoardSelection = (selectedUnitIndices, selectedVariantIndices, baseTraitCounts) => {
            const workingCounts = new Uint8Array(baseTraitCounts);
            const selectedVariantByUnitIndex = [];
            let bestEvaluation = null;

            const finalizeVariantSelection = () => {
                for (const unitIndex of selectedVariantIndices) {
                    const variant = selectedVariantByUnitIndex[unitIndex];
                    if (!this.isCompiledConditionSatisfied(variant?.compiledConditions, workingCounts, activeUnitFlags)) {
                        return;
                    }
                }

                const resolvedCounts = new Uint8Array(workingCounts);
                for (const unitIndex of selectedUnitIndices) {
                    const info = unitInfo[unitIndex];
                    const selectedVariant = selectedVariantByUnitIndex[unitIndex] || null;
                    const activeConditionalProfile = this.findFirstSatisfiedProfile(
                        selectedVariant?.conditionalProfileEntries || info.conditionalProfileEntries,
                        workingCounts,
                        activeUnitFlags
                    );

                    if (!activeConditionalProfile) {
                        continue;
                    }

                    const currentContributionEntries = selectedVariant?.fullTraitContributionEntries || info.baseTraitContributionEntries;
                    for (const { index, count } of currentContributionEntries) {
                        resolvedCounts[index] -= count;
                    }
                    for (const { index, count } of activeConditionalProfile.traitContributionEntries) {
                        resolvedCounts[index] += count;
                    }
                }

                const effectConditionCounts = new Uint8Array(resolvedCounts);
                for (const unitIndex of selectedUnitIndices) {
                    const info = unitInfo[unitIndex];
                    for (const effect of info.conditionalEffectEntries || []) {
                        if (!this.isCompiledConditionSatisfied(effect.compiledConditions, effectConditionCounts, activeUnitFlags)) {
                            continue;
                        }

                        for (const { index, count } of effect.traitContributionEntries) {
                            resolvedCounts[index] += count;
                        }
                    }
                }
                for (const unitIndex of selectedVariantIndices) {
                    const variant = selectedVariantByUnitIndex[unitIndex];
                    for (const effect of variant?.conditionalEffectEntries || []) {
                        if (!this.isCompiledConditionSatisfied(effect.compiledConditions, effectConditionCounts, activeUnitFlags)) {
                            continue;
                        }

                        for (const { index, count } of effect.traitContributionEntries) {
                            resolvedCounts[index] += count;
                        }
                    }
                }

                for (let traitPos = 0; traitPos < mustIncludeTraitIndices.length; traitPos++) {
                    const traitIndexValue = mustIncludeTraitIndices[traitPos];
                    const requiredThreshold = mustIncludeTraitTargets[traitPos];
                    if ((resolvedCounts[traitIndexValue] || 0) < requiredThreshold) {
                        return;
                    }
                }

                const synergyScore = calculateSynergyScore(resolvedCounts);
                if (bestEvaluation && synergyScore <= bestEvaluation.synergyScore) {
                    return;
                }

                let variantAssignments = null;
                if (selectedVariantIndices.length > 0) {
                    variantAssignments = {};
                    for (const unitIndex of selectedVariantIndices) {
                        const variant = selectedVariantByUnitIndex[unitIndex];
                        if (!variant) {
                            continue;
                        }
                        const info = unitInfo[unitIndex];
                        variantAssignments[info.id] = {
                            id: variant.id,
                            label: variant.label || variant.id
                        };
                    }
                }

                bestEvaluation = {
                    synergyScore,
                    traitCounts: this.traitCountsToRecord(resolvedCounts, allTraitNames),
                    ...(variantAssignments && Object.keys(variantAssignments).length > 0
                        ? { variantAssignments }
                        : {})
                };
            };

            const searchVariants = (variantPos) => {
                if (variantPos >= selectedVariantIndices.length) {
                    finalizeVariantSelection();
                    return;
                }

                const info = unitInfo[selectedVariantIndices[variantPos]];
                for (const variant of info.variantProfiles) {
                    for (const { index, count } of variant.traitContributionEntries) {
                        workingCounts[index] += count;
                    }
                    selectedVariantByUnitIndex[selectedVariantIndices[variantPos]] = variant;

                    searchVariants(variantPos + 1);

                    selectedVariantByUnitIndex[selectedVariantIndices[variantPos]] = null;
                    for (const { index, count } of variant.traitContributionEntries) {
                        workingCounts[index] -= count;
                    }
                }
            };

            searchVariants(0);
            return bestEvaluation;
        };

        /** Insert a board into the top results, maintaining a fixed-size sorted list */
        const addResult = (unitIds, evaluation, totalCost) => {
            const totalScore = scoreBoard(evaluation.synergyScore, totalCost);
            const board = {
                units: unitIds,
                synergyScore: evaluation.synergyScore,
                totalCost,
                traitCounts: evaluation.traitCounts,
                ...(evaluation.variantAssignments && Object.keys(evaluation.variantAssignments).length > 0
                    ? { variantAssignments: evaluation.variantAssignments }
                    : {}),
                _score: totalScore
            };

            if (topBoards.length < MAX_BOARDS) {
                topBoards.push(board);
                if (topBoards.length === MAX_BOARDS) {
                    worstIndex = this.findWorstBoardIndex(topBoards);
                    worstScore = topBoards[worstIndex]._score;
                }
            } else {
                if (totalScore > worstScore) {
                    topBoards[worstIndex] = board;
                    worstIndex = this.findWorstBoardIndex(topBoards);
                    worstScore = topBoards[worstIndex]._score;
                }
            }
        };

        const totalCombinations = this.combinations(availableIndices.length, remainingToPick);
        let combinationsChecked = 0;
        let lastProgressReport = 0;
        
        const currentTraitCounts = new Uint8Array(initialTraitCounts);
        const remainingTankFrom = new Uint8Array(availableIndices.length + 1);
        const remainingCarryFrom = new Uint8Array(availableIndices.length + 1);
        for (let i = availableIndices.length - 1; i >= 0; i--) {
            const info = unitInfo[availableIndices[i]];
            remainingTankFrom[i] = remainingTankFrom[i + 1] || info.isTank ? 1 : 0;
            remainingCarryFrom[i] = remainingCarryFrom[i + 1] || info.isCarry ? 1 : 0;
        }

        const mustIncludeTraitTargets = mustIncludeTraitIndices.map((tIdx) => {
            const name = allTraitNames[tIdx];
            const bps = traitBPs[name] || [1];
            return bps[0];
        });
        const useMustIncludePruning = mustIncludeTraitIndices.length > 0 && !hasVariantUnits && !hasConditionalProfiles && !hasConditionalEffects;
        const remainingTraitPotentialFrom = useMustIncludePruning
            ? mustIncludeTraitIndices.map(() => new Uint8Array(availableIndices.length + 1))
            : [];
        if (useMustIncludePruning) {
            for (let traitPos = 0; traitPos < mustIncludeTraitIndices.length; traitPos++) {
                const requiredTraitIndex = mustIncludeTraitIndices[traitPos];
                const potential = remainingTraitPotentialFrom[traitPos];
                for (let i = availableIndices.length - 1; i >= 0; i--) {
                    const info = unitInfo[availableIndices[i]];
                    potential[i] = potential[i + 1] + (info.traitContributionByIndex[requiredTraitIndex] || 0);
                }
            }
        }
        const currentVariantUnitIndices = [];

        /**
         * Depth-first search with backtracking.
         * Mutates currentTraitCounts in place for performance (avoids array copies).
         */
        const dfs = (startIdx, currentCount, hasTank, hasCarry, currentCost, currentComplexUnitCount, currentIdxList) => {
            if (requireTank && !hasTank && !remainingTankFrom[startIdx]) return;
            if (requireCarry && !hasCarry && !remainingCarryFrom[startIdx]) return;

            if (useMustIncludePruning) {
                for (let traitPos = 0; traitPos < mustIncludeTraitIndices.length; traitPos++) {
                    const traitIndexValue = mustIncludeTraitIndices[traitPos];
                    const target = mustIncludeTraitTargets[traitPos];
                    if ((currentTraitCounts[traitIndexValue] + remainingTraitPotentialFrom[traitPos][startIdx]) < target) {
                        return;
                    }
                }
            }

            if (currentCount === remainingToPick) {
                combinationsChecked++;

                if (onProgress && (combinationsChecked - lastProgressReport) >= LIMITS.PROGRESS_INTERVAL) {
                    lastProgressReport = combinationsChecked;
                    const pct = Math.min(99, Math.round((combinationsChecked / totalCombinations) * 100));
                    onProgress(pct, combinationsChecked, totalCombinations);
                }

                if (!hasTank || !hasCarry) return;

                const totalCost = mustHaveTotalCost + currentCost;
                const selectedUnitIndices = mustHaveUnitIndices.concat(currentIdxList);
                const totalComplexUnitCount = mustHaveComplexUnitCount + currentComplexUnitCount;

                if (totalComplexUnitCount === 0) {
                    for (let traitPos = 0; traitPos < mustIncludeTraitIndices.length; traitPos++) {
                        const traitIndexValue = mustIncludeTraitIndices[traitPos];
                        const requiredThreshold = mustIncludeTraitTargets[traitPos];
                        if ((currentTraitCounts[traitIndexValue] || 0) < requiredThreshold) {
                            return;
                        }
                    }

                    const synergyScore = calculateSynergyScore(currentTraitCounts);
                    const totalScore = scoreBoard(synergyScore, totalCost);
                    if (topBoards.length >= MAX_BOARDS && totalScore <= worstScore) return;

                    addResult(
                        this.buildSortedBoardUnits(selectedUnitIndices, unitInfo),
                        {
                            synergyScore,
                            traitCounts: this.traitCountsToRecord(currentTraitCounts, allTraitNames)
                        },
                        totalCost
                    );
                    return;
                }

                const selectedVariantIndices = mustHaveVariantUnitIndices.concat(currentVariantUnitIndices);
                const evaluation = evaluateBoardSelection(selectedUnitIndices, selectedVariantIndices, currentTraitCounts);
                if (!evaluation) return;
                const totalScore = scoreBoard(evaluation.synergyScore, totalCost);

                if (topBoards.length >= MAX_BOARDS && totalScore <= worstScore) return;
                
                addResult(this.buildSortedBoardUnits(selectedUnitIndices, unitInfo), evaluation, totalCost);
                return;
            }
            
            const remainingToFill = remainingToPick - currentCount;
            for (let i = startIdx; i <= availableIndices.length - remainingToFill; i++) {
                const idx = availableIndices[i];
                const info = unitInfo[idx];
                
                // Add this unit's traits (mutate in place)
                for (const { index, count } of info.fixedTraitContributionEntries) {
                    currentTraitCounts[index] += count;
                }
                
                activeUnitFlags[idx] = 1;
                currentIdxList.push(idx);
                if (info.variantProfiles.length > 0) {
                    currentVariantUnitIndices.push(idx);
                }
                dfs(
                    i + 1, 
                    currentCount + 1, 
                    hasTank || info.isTank, 
                    hasCarry || info.isCarry,
                    currentCost + info.cost,
                    currentComplexUnitCount + info.hasComplexEvaluation,
                    currentIdxList
                );
                if (info.variantProfiles.length > 0) {
                    currentVariantUnitIndices.pop();
                }
                currentIdxList.pop();
                activeUnitFlags[idx] = 0;
                
                // Backtrack: undo trait count changes
                for (const { index, count } of info.fixedTraitContributionEntries) {
                    currentTraitCounts[index] -= count;
                }
            }
        };
        
        if (remainingToPick <= LIMITS.MAX_REMAINING_SLOTS && totalCombinations <= LIMITS.COMBINATION_LIMIT) {
            dfs(0, 0, mustHaveInitialTank, mustHaveInitialCarry, 0, 0, []);
            if (onProgress) onProgress(100, totalCombinations, totalCombinations);
        } else {
             const reason = totalCombinations > LIMITS.COMBINATION_LIMIT 
                ? `Search space too large (~${(totalCombinations / 1e9).toFixed(1)}B combinations). Pick more Must-Haves.` 
                : "Board size too large. Supports up to 7 empty slots.";
             topBoards.push({error: reason});
             return topBoards;
        }

        for (const b of topBoards) delete b._score;
        topBoards.sort((a,b) =>
            b.synergyScore - a.synergyScore ||
            b.totalCost - a.totalCost ||
            a.units.join(',').localeCompare(b.units.join(','))
        );
        return topBoards;
    }
}

module.exports = Engine;
