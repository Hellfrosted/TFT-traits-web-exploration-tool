const { LIMITS } = require('../constants.js');
const { normalizeSearchParams } = require('../searchParams.js');
const {
    buildTraitIndex,
    buildMustIncludeTraitTargets,
    calculateSynergyScore,
    scoreBoard,
    resolveSearchSpaceError
} = require('./search-state.js');

module.exports = {
    countSearchSpaceCandidates(dataCache, params, preparedSearchContext = null) {
        const normalizedParams = normalizeSearchParams(params);
        const {
            variantLocks,
        } = normalizedParams;
        const {
            remainingSlots,
            validUnits,
            mustHaveMask,
            hasAllRequiredUnits
        } = preparedSearchContext || this.prepareSearchContext(dataCache, normalizedParams);

        if (!hasAllRequiredUnits || remainingSlots < 0) {
            return 0;
        }

        const cap = LIMITS.COMBINATION_LIMIT + 1;
        const maxBucket = remainingSlots;
        const overflowMinBucket = remainingSlots + 1;
        const minStateSize = overflowMinBucket + 1;
        const maxStateSize = maxBucket + 1;
        let requiredSlotFlex = 0;
        let dp = Array.from({ length: minStateSize }, () => Array(maxStateSize).fill(0));
        dp[0][0] = 1;

        for (let i = 0; i < validUnits.length; i++) {
            const unit = validUnits[i];
            const slotRange = this.getUnitSlotCostRange(unit, variantLocks?.[unit.id] || null);
            if ((mustHaveMask & (1n << BigInt(i))) !== 0n) {
                requiredSlotFlex += slotRange.max - slotRange.min;
                continue;
            }
            const next = dp.map((row) => row.slice());

            for (let minSlots = 0; minSlots <= overflowMinBucket; minSlots++) {
                for (let maxSlots = 0; maxSlots <= maxBucket; maxSlots++) {
                    const count = dp[minSlots][maxSlots];
                    if (count === 0) {
                        continue;
                    }

                    const nextMinSlots = Math.min(overflowMinBucket, minSlots + slotRange.min);
                    const nextMaxSlots = Math.min(maxBucket, maxSlots + slotRange.max);
                    next[nextMinSlots][nextMaxSlots] = Math.min(
                        cap,
                        next[nextMinSlots][nextMaxSlots] + count
                    );
                }
            }

            dp = next;
        }

        let total = 0;
        const requiredMaxFloor = Math.max(0, remainingSlots - requiredSlotFlex);
        for (let minSlots = 0; minSlots <= remainingSlots; minSlots++) {
            for (let maxSlots = requiredMaxFloor; maxSlots <= maxBucket; maxSlots++) {
                total = Math.min(cap, total + dp[minSlots][maxSlots]);
            }
        }

        return total;
    },

    search(dataCache, params, onProgress, preparedSearchContext = null) {
        const normalizedParams = normalizeSearchParams(params);
        const {
            boardSize,
            mustIncludeTraits,
            mustExcludeTraits,
            variantLocks,
            tankRoles, carryRoles, extraEmblems,
            onlyActive, tierRank, includeUnique, maxResults
        } = normalizedParams;

        const allTraitNames = dataCache.traits;
        const traitIndex = buildTraitIndex(allTraitNames);
        const traitBPs = dataCache.traitBreakpoints || {};

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
        const meetsTankRequirement = (tankThreePlusCount, tankFourPlusCount) => (
            !requireTank ||
            tankFourPlusCount >= 1 ||
            tankThreePlusCount >= 2
        );
        const meetsCarryRequirement = (carryFourPlusCount) => (
            !requireCarry ||
            carryFourPlusCount >= 1
        );

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

        const unitInfo = validUnits.map((unit) => {
            const baseTraitContributionEntries = this.buildTraitContributionEntries(unit, traitIndex, dataCache.hashMap);
            let fixedTraitContributionEntries = baseTraitContributionEntries;
            let variantProfiles = [];
            const baseSlotCost = this.getEntitySlotCost(unit);
            let minSlotCost = baseSlotCost;
            let maxSlotCost = baseSlotCost;
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
                        slotCost: this.getEntitySlotCost(variant),
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
                minSlotCost = Math.min(...allowedVariantProfiles.map((variant) => variant.slotCost));
                maxSlotCost = Math.max(...allowedVariantProfiles.map((variant) => variant.slotCost));
                variantProfiles = variantSummary.variantProfiles.map((variant, variantIndex) => ({
                    ...variant,
                    slotCost: allowedVariantProfiles[variantIndex].slotCost,
                    slotDelta: allowedVariantProfiles[variantIndex].slotCost - minSlotCost
                }));
            }

            const traitContributionByIndex = Object.create(null);
            fixedTraitContributionEntries.forEach(({ index, count }) => {
                traitContributionByIndex[index] = count;
            });

            const isTank = tankRoleSet.has(unit.role);
            const isCarry = carryRoleSet.has(unit.role);
            return {
                cost: unit.cost,
                isTank,
                isCarry,
                minSlotCost,
                maxSlotCost,
                slotFlex: maxSlotCost - minSlotCost,
                qualifyingTankThreePlus: isTank && unit.cost >= 3 ? 1 : 0,
                qualifyingTankFourPlus: isTank && unit.cost >= 4 ? 1 : 0,
                qualifyingCarryFourPlus: isCarry && unit.cost >= 4 ? 1 : 0,
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

        let mustHaveInitialTankThreePlusCount = 0;
        let mustHaveInitialTankFourPlusCount = 0;
        let mustHaveInitialCarryFourPlusCount = 0;
        let mustHaveInitialMinSlots = 0;
        let mustHaveInitialSlotFlex = 0;
        let mustHaveTotalCost = 0;
        const initialTraitCounts = new Uint8Array(numTraits);
        const activeUnitFlags = new Uint8Array(validUnits.length);
        const mustHaveUnitIndices = [];
        const mustHaveVariantUnitIndices = [];
        let mustHaveComplexUnitCount = 0;

        if (extraEmblems) {
            extraEmblems.forEach((emblem) => {
                const idx = traitIndex[emblem];
                if (idx !== undefined) initialTraitCounts[idx]++;
            });
        }

        for (let i = 0; i < validUnits.length; i++) {
            if ((mustHaveMask & (1n << BigInt(i))) !== 0n) {
                const info = unitInfo[i];
                activeUnitFlags[i] = 1;
                mustHaveInitialTankThreePlusCount += info.qualifyingTankThreePlus;
                mustHaveInitialTankFourPlusCount += info.qualifyingTankFourPlus;
                mustHaveInitialCarryFourPlusCount += info.qualifyingCarryFourPlus;
                mustHaveInitialMinSlots += info.minSlotCost;
                mustHaveInitialSlotFlex += info.slotFlex;
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

        const evaluateBoardSelection = (selectedUnitIndices, selectedVariantIndices, baseTraitCounts, minOccupiedSlots) => {
            const workingCounts = new Uint8Array(baseTraitCounts);
            const selectedVariantByUnitIndex = [];
            let bestEvaluation = null;

            const finalizeVariantSelection = () => {
                let occupiedSlots = minOccupiedSlots;
                for (const unitIndex of selectedVariantIndices) {
                    const variant = selectedVariantByUnitIndex[unitIndex];
                    if (!this.isCompiledConditionSatisfied(variant?.compiledConditions, workingCounts, activeUnitFlags)) {
                        return;
                    }
                    occupiedSlots += variant?.slotDelta || 0;
                }

                if (occupiedSlots !== boardSize) {
                    return;
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

                const synergyScore = calculateSynergyScore(resolvedCounts, {
                    allTraitNames,
                    traitBreakpoints: traitBPs,
                    onlyActive,
                    tierRank,
                    includeUnique
                });
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
                    occupiedSlots,
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

        const addResult = (unitIds, evaluation, totalCost) => {
            const totalScore = scoreBoard(evaluation.synergyScore, totalCost);
            const board = {
                units: unitIds,
                synergyScore: evaluation.synergyScore,
                occupiedSlots: evaluation.occupiedSlots,
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
            } else if (totalScore > worstScore) {
                topBoards[worstIndex] = board;
                worstIndex = this.findWorstBoardIndex(topBoards);
                worstScore = topBoards[worstIndex]._score;
            }
        };

        const totalCombinations = hasVariableSlotCosts
            ? this.countSearchSpaceCandidates(dataCache, normalizedParams, preparedSearchContext)
            : this.combinations(availableIndices.length, remainingSlots);
        let combinationsChecked = 0;
        let lastProgressReport = 0;

        const currentTraitCounts = new Uint8Array(initialTraitCounts);
        const remainingTankThreePlusFrom = new Uint8Array(availableIndices.length + 1);
        const remainingTankFourPlusFrom = new Uint8Array(availableIndices.length + 1);
        const remainingCarryFourPlusFrom = new Uint8Array(availableIndices.length + 1);
        const remainingMaxSlotsFrom = new Uint8Array(availableIndices.length + 1);
        for (let i = availableIndices.length - 1; i >= 0; i--) {
            const info = unitInfo[availableIndices[i]];
            remainingTankThreePlusFrom[i] = remainingTankThreePlusFrom[i + 1] + info.qualifyingTankThreePlus;
            remainingTankFourPlusFrom[i] = remainingTankFourPlusFrom[i + 1] + info.qualifyingTankFourPlus;
            remainingCarryFourPlusFrom[i] = remainingCarryFourPlusFrom[i + 1] + info.qualifyingCarryFourPlus;
            remainingMaxSlotsFrom[i] = remainingMaxSlotsFrom[i + 1] + info.maxSlotCost;
        }

        const mustIncludeTraitTargets = buildMustIncludeTraitTargets(
            mustIncludeTraitIndices,
            allTraitNames,
            traitBPs
        );
        const useMustIncludePruning = mustIncludeTraitIndices.length > 0
            && !hasVariantUnits
            && !hasConditionalProfiles
            && !hasConditionalEffects
            && !hasVariableSlotCosts;
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
        const reportProgress = () => {
            if (!onProgress || (combinationsChecked - lastProgressReport) < LIMITS.PROGRESS_INTERVAL) {
                return;
            }

            lastProgressReport = combinationsChecked;
            if (Number.isFinite(totalCombinations) && totalCombinations > 0) {
                const pct = Math.min(99, Math.round((combinationsChecked / totalCombinations) * 100));
                onProgress(pct, combinationsChecked, totalCombinations);
                return;
            }

            onProgress(null, combinationsChecked, totalCombinations);
        };

        const dfs = (
            startIdx,
            currentMinSlots,
            tankThreePlusCount,
            tankFourPlusCount,
            carryFourPlusCount,
            currentCost,
            currentComplexUnitCount,
            currentSlotFlex,
            currentIdxList
        ) => {
            if (currentMinSlots > boardSize) {
                return;
            }
            if (
                requireTank &&
                !meetsTankRequirement(tankThreePlusCount, tankFourPlusCount) &&
                !(
                    tankFourPlusCount + remainingTankFourPlusFrom[startIdx] >= 1 ||
                    tankThreePlusCount + remainingTankThreePlusFrom[startIdx] >= 2
                )
            ) return;
            if (
                requireCarry &&
                !meetsCarryRequirement(carryFourPlusCount) &&
                (carryFourPlusCount + remainingCarryFourPlusFrom[startIdx] < 1)
            ) return;
            if ((currentMinSlots + currentSlotFlex + remainingMaxSlotsFrom[startIdx]) < boardSize) {
                return;
            }

            if (useMustIncludePruning) {
                for (let traitPos = 0; traitPos < mustIncludeTraitIndices.length; traitPos++) {
                    const traitIndexValue = mustIncludeTraitIndices[traitPos];
                    const target = mustIncludeTraitTargets[traitPos];
                    if ((currentTraitCounts[traitIndexValue] + remainingTraitPotentialFrom[traitPos][startIdx]) < target) {
                        return;
                    }
                }
            }

            if (currentMinSlots <= boardSize && (currentMinSlots + currentSlotFlex) >= boardSize) {
                combinationsChecked++;
                reportProgress();

                if (!meetsTankRequirement(tankThreePlusCount, tankFourPlusCount)) return;
                if (!meetsCarryRequirement(carryFourPlusCount)) return;

                const totalCost = mustHaveTotalCost + currentCost;
                const selectedUnitIndices = mustHaveUnitIndices.concat(currentIdxList);
                const totalComplexUnitCount = mustHaveComplexUnitCount + currentComplexUnitCount;

                if (totalComplexUnitCount === 0) {
                    if (currentMinSlots !== boardSize) {
                        return;
                    }
                    for (let traitPos = 0; traitPos < mustIncludeTraitIndices.length; traitPos++) {
                        const traitIndexValue = mustIncludeTraitIndices[traitPos];
                        const requiredThreshold = mustIncludeTraitTargets[traitPos];
                        if ((currentTraitCounts[traitIndexValue] || 0) < requiredThreshold) {
                            return;
                        }
                    }

                    const synergyScore = calculateSynergyScore(currentTraitCounts, {
                        allTraitNames,
                        traitBreakpoints: traitBPs,
                        onlyActive,
                        tierRank,
                        includeUnique
                    });
                    const totalScore = scoreBoard(synergyScore, totalCost);
                    if (topBoards.length >= MAX_BOARDS && totalScore <= worstScore) return;

                    addResult(
                        this.buildSortedBoardUnits(selectedUnitIndices, unitInfo),
                        {
                            synergyScore,
                            occupiedSlots: currentMinSlots,
                            traitCounts: this.traitCountsToRecord(currentTraitCounts, allTraitNames)
                        },
                        totalCost
                    );
                    return;
                }

                const selectedVariantIndices = mustHaveVariantUnitIndices.concat(currentVariantUnitIndices);
                const evaluation = evaluateBoardSelection(
                    selectedUnitIndices,
                    selectedVariantIndices,
                    currentTraitCounts,
                    currentMinSlots
                );
                if (evaluation) {
                    const totalScore = scoreBoard(evaluation.synergyScore, totalCost);

                    if (!(topBoards.length >= MAX_BOARDS && totalScore <= worstScore)) {
                        addResult(this.buildSortedBoardUnits(selectedUnitIndices, unitInfo), evaluation, totalCost);
                    }
                }
            }

            if (currentMinSlots === boardSize) {
                return;
            }

            for (let i = startIdx; i < availableIndices.length; i++) {
                const idx = availableIndices[i];
                const info = unitInfo[idx];
                const nextMinSlots = currentMinSlots + info.minSlotCost;
                if (nextMinSlots > boardSize) {
                    continue;
                }

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
                    nextMinSlots,
                    tankThreePlusCount + info.qualifyingTankThreePlus,
                    tankFourPlusCount + info.qualifyingTankFourPlus,
                    carryFourPlusCount + info.qualifyingCarryFourPlus,
                    currentCost + info.cost,
                    currentComplexUnitCount + info.hasComplexEvaluation,
                    currentSlotFlex + info.slotFlex,
                    currentIdxList
                );
                if (info.variantProfiles.length > 0) {
                    currentVariantUnitIndices.pop();
                }
                currentIdxList.pop();
                activeUnitFlags[idx] = 0;

                for (const { index, count } of info.fixedTraitContributionEntries) {
                    currentTraitCounts[index] -= count;
                }
            }
        };

        if (
            remainingSlots <= LIMITS.MAX_REMAINING_SLOTS &&
            (!Number.isFinite(totalCombinations) || totalCombinations <= LIMITS.COMBINATION_LIMIT)
        ) {
            dfs(
                0,
                mustHaveInitialMinSlots,
                mustHaveInitialTankThreePlusCount,
                mustHaveInitialTankFourPlusCount,
                mustHaveInitialCarryFourPlusCount,
                0,
                0,
                mustHaveInitialSlotFlex,
                []
            );
            if (onProgress) {
                if (Number.isFinite(totalCombinations)) {
                    onProgress(100, totalCombinations, totalCombinations);
                } else {
                    onProgress(100, combinationsChecked, totalCombinations);
                }
            }
        } else {
            const reason = resolveSearchSpaceError(totalCombinations, LIMITS);
            topBoards.push({ error: reason });
            return topBoards;
        }

        for (const board of topBoards) delete board._score;
        topBoards.sort((left, right) =>
            right.synergyScore - left.synergyScore ||
            right.totalCost - left.totalCost ||
            left.units.join(',').localeCompare(right.units.join(','))
        );
        return topBoards;
    }
};
