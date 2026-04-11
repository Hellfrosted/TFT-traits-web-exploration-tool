const { LIMITS } = require('../constants.js');
const { normalizeSearchParams } = require('../searchParams.js');
const {
    buildTraitIndex,
    buildMustIncludeTraitTargets,
    calculateSynergyScore,
    scoreBoard,
    resolveSearchSpaceError
} = require('./search-state.js');
const {
    evaluateBoardSelection,
    createBoardResult
} = require('./search-evaluator.js');
const {
    buildRemainingUnitPotential,
    buildRemainingTraitPotential,
    shouldPruneSearchBranch,
    shouldEmitProgress
} = require('./search-dfs-state.js');
const {
    buildRoleRequirementState,
    buildUnitSortRank,
    buildUnitSearchInfo,
    buildInitialSearchState
} = require('./search-setup.js');
const {
    createTopBoardTracker,
    finalizeTopBoards
} = require('./search-results.js');
const {
    applyUnitSelectionState,
    rollbackUnitSelectionState,
    evaluateSearchCandidate
} = require('./search-visit.js');

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

        const {
            tankRoleSet,
            carryRoleSet,
            requireTank,
            requireCarry,
            meetsTankRequirement,
            meetsCarryRequirement
        } = buildRoleRequirementState(tankRoles, carryRoles);

        const numTraits = allTraitNames.length;
        const mustIncludeTraitIndices = (mustIncludeTraits || [])
            .map((traitName) => traitIndex[traitName])
            .filter((index) => index !== undefined);
        const excludedTraitSet = new Set(mustExcludeTraits || []);
        const unitSortRank = buildUnitSortRank(validUnits);
        const unitInfo = buildUnitSearchInfo({
            validUnits,
            traitIndex,
            hashMap: dataCache.hashMap,
            traitBreakpoints: traitBPs,
            unitIndexById,
            variantLocks,
            excludedTraitSet,
            tankRoleSet,
            carryRoleSet,
            unitSortRank,
            buildTraitContributionEntries: this.buildTraitContributionEntries.bind(this),
            getEntitySlotCost: this.getEntitySlotCost.bind(this),
            buildConditionalEffectEntries: this.buildConditionalEffectEntries.bind(this),
            buildConditionalProfileEntries: this.buildConditionalProfileEntries.bind(this),
            compileConditions: this.compileConditions.bind(this),
            summarizeVariantProfiles: this.summarizeVariantProfiles.bind(this)
        });

        const {
            mustHaveInitialTankThreePlusCount,
            mustHaveInitialTankFourPlusCount,
            mustHaveInitialCarryFourPlusCount,
            mustHaveInitialMinSlots,
            mustHaveInitialSlotFlex,
            mustHaveTotalCost,
            initialTraitCounts,
            activeUnitFlags,
            mustHaveUnitIndices,
            mustHaveVariantUnitIndices,
            mustHaveComplexUnitCount
        } = buildInitialSearchState({
            validUnits,
            unitInfo,
            mustHaveMask,
            extraEmblems,
            traitIndex,
            numTraits
        });

        const MAX_BOARDS = maxResults || LIMITS.DEFAULT_MAX_RESULTS;
        const hasVariantUnits = unitInfo.some((info) => info.variantProfiles.length > 0);
        const hasConditionalProfiles = unitInfo.some((info) =>
            info.conditionalProfileEntries.length > 0 ||
            info.variantProfiles.some((variant) => variant.conditionalProfileEntries.length > 0)
        );
        const hasConditionalEffects = unitInfo.some((info) =>
            info.conditionalEffectEntries.length > 0 ||
            info.variantProfiles.some((variant) => variant.conditionalEffectEntries.length > 0)
        );

        const topBoardTracker = createTopBoardTracker({
            maxBoards: MAX_BOARDS,
            findWorstBoardIndex: this.findWorstBoardIndex.bind(this),
            createBoardResult: ({ unitIds, evaluation, totalCost }) => createBoardResult({
                unitIds,
                evaluation,
                totalCost,
                scoreBoard
            })
        });

        const totalCombinations = hasVariableSlotCosts
            ? this.countSearchSpaceCandidates(dataCache, normalizedParams, preparedSearchContext)
            : this.combinations(availableIndices.length, remainingSlots);
        let combinationsChecked = 0;
        let lastProgressReport = 0;

        const currentTraitCounts = new Uint8Array(initialTraitCounts);
        const {
            remainingTankThreePlusFrom,
            remainingTankFourPlusFrom,
            remainingCarryFourPlusFrom,
            remainingMaxSlotsFrom
        } = buildRemainingUnitPotential(availableIndices, unitInfo);

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
        const remainingTraitPotentialFrom = buildRemainingTraitPotential({
            useMustIncludePruning,
            mustIncludeTraitIndices,
            availableIndices,
            unitInfo
        });
        const currentVariantUnitIndices = [];
        const evaluateResolvedBoardSelection = ({
            selectedUnitIndices,
            selectedVariantIndices,
            baseTraitCounts,
            minOccupiedSlots
        }) => evaluateBoardSelection({
            selectedUnitIndices,
            selectedVariantIndices,
            baseTraitCounts,
            minOccupiedSlots,
            boardSize,
            unitInfo,
            activeUnitFlags,
            mustIncludeTraitIndices,
            mustIncludeTraitTargets,
            allTraitNames,
            calculateSynergyScore: (resolvedCounts) => calculateSynergyScore(resolvedCounts, {
                allTraitNames,
                traitBreakpoints: traitBPs,
                onlyActive,
                tierRank,
                includeUnique
            }),
            isCompiledConditionSatisfied: this.isCompiledConditionSatisfied.bind(this),
            findFirstSatisfiedProfile: this.findFirstSatisfiedProfile.bind(this),
            traitCountsToRecord: this.traitCountsToRecord.bind(this)
        });
        const reportProgress = () => {
            if (!onProgress || !shouldEmitProgress(combinationsChecked, lastProgressReport, LIMITS.PROGRESS_INTERVAL)) {
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
            if (shouldPruneSearchBranch({
                startIdx,
                currentMinSlots,
                currentSlotFlex,
                boardSize,
                requireTank,
                requireCarry,
                tankThreePlusCount,
                tankFourPlusCount,
                carryFourPlusCount,
                meetsTankRequirement,
                meetsCarryRequirement,
                remainingTankThreePlusFrom,
                remainingTankFourPlusFrom,
                remainingCarryFourPlusFrom,
                remainingMaxSlotsFrom,
                useMustIncludePruning,
                mustIncludeTraitIndices,
                mustIncludeTraitTargets,
                currentTraitCounts,
                remainingTraitPotentialFrom
            })) {
                return;
            }

            if (currentMinSlots <= boardSize && (currentMinSlots + currentSlotFlex) >= boardSize) {
                combinationsChecked++;
                reportProgress();

                evaluateSearchCandidate({
                    currentMinSlots,
                    boardSize,
                    tankThreePlusCount,
                    tankFourPlusCount,
                    carryFourPlusCount,
                    meetsTankRequirement,
                    meetsCarryRequirement,
                    mustHaveTotalCost,
                    currentCost,
                    mustHaveUnitIndices,
                    currentIdxList,
                    mustHaveComplexUnitCount,
                    currentComplexUnitCount,
                    mustIncludeTraitIndices,
                    mustIncludeTraitTargets,
                    currentTraitCounts,
                    calculateSynergyScore: (counts) => calculateSynergyScore(counts, {
                        allTraitNames,
                        traitBreakpoints: traitBPs,
                        onlyActive,
                        tierRank,
                        includeUnique
                    }),
                    scoreBoard,
                    topBoardTracker,
                    buildSortedBoardUnits: this.buildSortedBoardUnits.bind(this),
                    unitInfo,
                    traitCountsToRecord: this.traitCountsToRecord.bind(this),
                    allTraitNames,
                    mustHaveVariantUnitIndices,
                    currentVariantUnitIndices,
                    evaluateBoardSelection: evaluateResolvedBoardSelection
                });
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

                applyUnitSelectionState({
                    idx,
                    info,
                    currentTraitCounts,
                    activeUnitFlags,
                    currentIdxList,
                    currentVariantUnitIndices
                });
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
                rollbackUnitSelectionState({
                    idx,
                    info,
                    currentTraitCounts,
                    activeUnitFlags,
                    currentIdxList,
                    currentVariantUnitIndices
                });
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
            topBoardTracker.topBoards.push({ error: reason });
            return topBoardTracker.topBoards;
        }

        return finalizeTopBoards(topBoardTracker.topBoards);
    }
};
