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
            if ([...this.getAutomaticConditionalTraitNames(unit)].some((trait) => excludedTraits.has(trait))) {
                return false;
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
    static getCombinationCount(dataCache, params) {
        const normalizedParams = normalizeSearchParams(params);
        const {
            remainingToPick,
            availableCount,
            hasAllRequiredUnits
        } = this.prepareSearchContext(dataCache, normalizedParams);

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
    static search(dataCache, params, onProgress) {
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
        } = this.prepareSearchContext(dataCache, normalizedParams);

        if (!hasAllRequiredUnits || remainingToPick < 0) {
            return [];
        }

        const availableIndices = [];
        for (let i = 0; i < validUnits.length; i++) {
            if ((mustHaveMask & (1n << BigInt(i))) === 0n) {
                availableIndices.push(i);
            }
        }

        const tankRoleSet = new Set(tankRoles || []);
        const carryRoleSet = new Set(carryRoles || []);
        const requireTank = tankRoleSet.size > 0;
        const requireCarry = carryRoleSet.size > 0;

        const numTraits = allTraitNames.length;
        const mustIncludeTraitIndices = (mustIncludeTraits || [])
            .map((traitName) => traitIndex[traitName])
            .filter((index) => index !== undefined);
        const excludedTraitSet = new Set(mustExcludeTraits || []);

        // Pre-process unit info for fast access in DFS inner loop
        const unitInfo = validUnits.map((unit) => {
            const baseTraitContributionEntries = this.buildTraitContributionEntries(unit, traitIndex, dataCache.hashMap);
            let fixedTraitContributionEntries = baseTraitContributionEntries;
            let variantProfiles = [];
            const conditionalEffectEntries = this.buildConditionalEffectEntries(
                unit.conditionalEffects,
                traitIndex,
                dataCache.hashMap
            );
            const conditionalProfileEntries = this.buildConditionalProfileEntries(
                unit.conditionalProfiles,
                traitIndex,
                dataCache.hashMap
            );

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
                        conditions: variant.conditions || null,
                        conditionalProfileEntries: this.buildConditionalProfileEntries(
                            variant.conditionalProfiles,
                            traitIndex,
                            dataCache.hashMap
                        ),
                        conditionalEffectEntries: this.buildConditionalEffectEntries(
                            variant.conditionalEffects,
                            traitIndex,
                            dataCache.hashMap
                        )
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
                id: unit.id
            };
        });

        // Build initial state from must-have units
        let mustHaveInitialTank = !requireTank;
        let mustHaveInitialCarry = !requireCarry;
        let mustHaveTotalCost = 0;
        const initialTraitCounts = new Uint8Array(numTraits);
        const mustHaveIds = [];
        const mustHaveUnitIndices = [];
        const mustHaveVariantUnitIndices = [];

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
                if (info.isTank) mustHaveInitialTank = true;
                if (info.isCarry) mustHaveInitialCarry = true;
                mustHaveTotalCost += info.cost;
                info.fixedTraitContributionEntries.forEach(({ index, count }) => {
                    initialTraitCounts[index] += count;
                });
                if (info.variantProfiles.length > 0) {
                    mustHaveVariantUnitIndices.push(i);
                }
                mustHaveUnitIndices.push(i);
                mustHaveIds.push(info.id);
            }
        }

        const topBoards = [];
        const MAX_BOARDS = maxResults || LIMITS.DEFAULT_MAX_RESULTS;
        let worstScore = -Infinity;
        let worstIndex = -1;
        const hasVariantUnits = unitInfo.some((info) => info.variantProfiles.length > 0);
        const hasConditionalProfiles = unitInfo.some((info) =>
            info.conditionalProfileEntries.length > 0 ||
            info.variantProfiles.some((variant) => variant.conditionalProfileEntries?.length > 0)
        );
        const hasConditionalEffects = unitInfo.some((info) =>
            info.conditionalEffectEntries.length > 0 ||
            info.variantProfiles.some((variant) => variant.conditionalEffectEntries?.length > 0)
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
            return synergyScore * 10000 - totalCost;
        };

        const evaluateBoardSelection = (selectedUnitIndices, selectedVariantIndices, baseTraitCounts, activeUnitIds) => {
            const activeUnits = new Set(activeUnitIds || []);
            const workingCounts = new Uint8Array(baseTraitCounts);
            const currentAssignments = {};
            let bestEvaluation = null;

            const finalizeVariantSelection = () => {
                const preEffectTraitCounts = this.traitCountsToRecord(workingCounts, allTraitNames);
                const conditionContext = {
                    traitCounts: preEffectTraitCounts,
                    activeUnits,
                    traitBreakpoints: traitBPs
                };

                if (Object.keys(currentAssignments).length > 0) {
                    for (const unitIndex of selectedVariantIndices) {
                        const info = unitInfo[unitIndex];
                        const assignment = currentAssignments[info.id];
                        const variant = info.variantProfiles.find((candidate) => candidate.id === assignment?.id);
                        if (!this.isConditionSatisfied(variant?.conditions, conditionContext)) {
                            return;
                        }
                    }
                }

                const resolvedCounts = new Uint8Array(workingCounts);
                selectedUnitIndices.forEach((unitIndex) => {
                    const info = unitInfo[unitIndex];
                    const assignment = currentAssignments[info.id];
                    const selectedVariant = assignment
                        ? info.variantProfiles.find((candidate) => candidate.id === assignment.id)
                        : null;
                    const activeConditionalProfile = (
                        selectedVariant?.conditionalProfileEntries ||
                        (!selectedVariant ? info.conditionalProfileEntries : [])
                    ).find((profile) => this.isConditionSatisfied(profile.conditions, conditionContext));

                    if (!activeConditionalProfile) {
                        return;
                    }

                    const currentContributionEntries = selectedVariant?.fullTraitContributionEntries || info.baseTraitContributionEntries;
                    currentContributionEntries.forEach(({ index, count }) => {
                        resolvedCounts[index] -= count;
                    });
                    activeConditionalProfile.traitContributionEntries.forEach(({ index, count }) => {
                        resolvedCounts[index] += count;
                    });
                });

                const effectConditionContext = {
                    traitCounts: this.traitCountsToRecord(resolvedCounts, allTraitNames),
                    activeUnits,
                    traitBreakpoints: traitBPs
                };
                selectedUnitIndices.forEach((unitIndex) => {
                    const info = unitInfo[unitIndex];
                    (info.conditionalEffectEntries || []).forEach((effect) => {
                        if (!this.isConditionSatisfied(effect.conditions, effectConditionContext)) {
                            return;
                        }

                        effect.traitContributionEntries.forEach(({ index, count }) => {
                            resolvedCounts[index] += count;
                        });
                    });
                });
                selectedVariantIndices.forEach((unitIndex) => {
                    const info = unitInfo[unitIndex];
                    const assignment = currentAssignments[info.id];
                    const variant = info.variantProfiles.find((candidate) => candidate.id === assignment?.id);
                    (variant?.conditionalEffectEntries || []).forEach((effect) => {
                        if (!this.isConditionSatisfied(effect.conditions, effectConditionContext)) {
                            return;
                        }

                        effect.traitContributionEntries.forEach(({ index, count }) => {
                            resolvedCounts[index] += count;
                        });
                    });
                });

                const traitCounts = this.traitCountsToRecord(resolvedCounts, allTraitNames);
                for (const tIdx of mustIncludeTraitIndices) {
                    const count = resolvedCounts[tIdx];
                    const name = allTraitNames[tIdx];
                    const bps = traitBPs[name] || [1];
                    if (count < bps[0]) return;
                }

                const synergyScore = calculateSynergyScore(resolvedCounts);
                if (bestEvaluation && synergyScore <= bestEvaluation.synergyScore) {
                    return;
                }

                bestEvaluation = {
                    synergyScore,
                    traitCounts,
                    variantAssignments: { ...currentAssignments }
                };
            };

            const searchVariants = (variantPos) => {
                if (variantPos >= selectedVariantIndices.length) {
                    finalizeVariantSelection();
                    return;
                }

                const info = unitInfo[selectedVariantIndices[variantPos]];
                for (const variant of info.variantProfiles) {
                    variant.traitContributionEntries.forEach(({ index, count }) => {
                        workingCounts[index] += count;
                    });
                    currentAssignments[info.id] = {
                        id: variant.id,
                        label: variant.label || variant.id
                    };

                    searchVariants(variantPos + 1);

                    delete currentAssignments[info.id];
                    variant.traitContributionEntries.forEach(({ index, count }) => {
                        workingCounts[index] -= count;
                    });
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
        const dfs = (startIdx, currentCount, hasTank, hasCarry, currentCost, currentIdxList) => {
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
                const activeUnits = [...mustHaveIds];
                for (const idx of currentIdxList) activeUnits.push(unitInfo[idx].id);
                activeUnits.sort((a, b) => a.localeCompare(b));
                const selectedVariantIndices = mustHaveVariantUnitIndices.concat(currentVariantUnitIndices);
                const selectedUnitIndices = mustHaveUnitIndices.concat(currentIdxList);
                const evaluation = evaluateBoardSelection(selectedUnitIndices, selectedVariantIndices, currentTraitCounts, activeUnits);
                if (!evaluation) return;
                const totalScore = scoreBoard(evaluation.synergyScore, totalCost);

                if (topBoards.length >= MAX_BOARDS && totalScore <= worstScore) return;
                
                addResult(activeUnits, evaluation, totalCost);
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
                    currentIdxList
                );
                if (info.variantProfiles.length > 0) {
                    currentVariantUnitIndices.pop();
                }
                currentIdxList.pop();
                
                // Backtrack: undo trait count changes
                for (const { index, count } of info.fixedTraitContributionEntries) {
                    currentTraitCounts[index] -= count;
                }
            }
        };
        
        if (remainingToPick <= LIMITS.MAX_REMAINING_SLOTS && totalCombinations <= LIMITS.COMBINATION_LIMIT) {
            dfs(0, 0, mustHaveInitialTank, mustHaveInitialCarry, 0, []);
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
            a.totalCost - b.totalCost ||
            a.units.join(',').localeCompare(b.units.join(','))
        );
        return topBoards;
    }
}

module.exports = Engine;
