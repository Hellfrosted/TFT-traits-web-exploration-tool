const { LIMITS } = require('../constants.js');
const { normalizeSearchParams } = require('../searchParams.js');
const {
    buildTraitIndex,
    buildMustIncludeTraitTargets,
    scoreBoard,
    resolveSearchSpaceError
} = require('./search-state.js');
const { createBoardResult } = require('./search-evaluator.js');
const {
    buildRemainingUnitPotential,
    buildRemainingTraitPotential,
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
    countPreparedSearchSpaceCandidates
} = require('./search-space-counter.js');
const {
    buildAvailableIndices,
    buildUnitIndexById,
    buildMustIncludeTraitIndices,
    detectSearchFeatures,
    createProgressTracker
} = require('./search-runtime-state.js');
const {
    runSearchDfs
} = require('./search-dfs-runner.js');
const {
    createSearchScoreCalculator,
    createResolvedBoardSelectionEvaluator,
    buildSearchCandidateEvaluationContext
} = require('./search-evaluation-context.js');

module.exports = {
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

        const availableIndices = buildAvailableIndices(validUnits, mustHaveMask);
        const unitIndexById = buildUnitIndexById(validUnits);

        const {
            tankRoleSet,
            carryRoleSet,
            requireTank,
            requireCarry,
            meetsTankRequirement,
            meetsCarryRequirement
        } = buildRoleRequirementState(tankRoles, carryRoles);

        const numTraits = allTraitNames.length;
        const mustIncludeTraitIndices = buildMustIncludeTraitIndices(mustIncludeTraits, traitIndex);
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
        const {
            hasVariantUnits,
            hasConditionalProfiles,
            hasConditionalEffects
        } = detectSearchFeatures(unitInfo);

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
        const progressTracker = createProgressTracker({
            onProgress,
            totalCombinations,
            shouldEmitProgress
        });

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
        const calculateBoardSynergyScore = createSearchScoreCalculator({
            allTraitNames,
            traitBreakpoints: traitBPs,
            onlyActive,
            tierRank,
            includeUnique
        });
        const evaluateResolvedBoardSelection = createResolvedBoardSelectionEvaluator({
            boardSize,
            unitInfo,
            activeUnitFlags,
            mustIncludeTraitIndices,
            mustIncludeTraitTargets,
            allTraitNames,
            calculateSynergyScore: calculateBoardSynergyScore,
            isCompiledConditionSatisfied: this.isCompiledConditionSatisfied.bind(this),
            findFirstSatisfiedProfile: this.findFirstSatisfiedProfile.bind(this),
            traitCountsToRecord: this.traitCountsToRecord.bind(this)
        });

        if (
            remainingSlots <= LIMITS.MAX_REMAINING_SLOTS &&
            (!Number.isFinite(totalCombinations) || totalCombinations <= LIMITS.COMBINATION_LIMIT)
        ) {
            runSearchDfs({
                boardSize,
                availableIndices,
                unitInfo,
                currentTraitCounts,
                activeUnitFlags,
                progressTracker,
                initialState: {
                    currentMinSlots: mustHaveInitialMinSlots,
                    tankThreePlusCount: mustHaveInitialTankThreePlusCount,
                    tankFourPlusCount: mustHaveInitialTankFourPlusCount,
                    carryFourPlusCount: mustHaveInitialCarryFourPlusCount,
                    currentCost: 0,
                    currentComplexUnitCount: 0,
                    currentSlotFlex: mustHaveInitialSlotFlex
                },
                pruneState: {
                    requireTank,
                    requireCarry,
                    meetsTankRequirement,
                    meetsCarryRequirement,
                    remainingTankThreePlusFrom,
                    remainingTankFourPlusFrom,
                    remainingCarryFourPlusFrom,
                    remainingMaxSlotsFrom,
                    useMustIncludePruning,
                    mustIncludeTraitIndices,
                    mustIncludeTraitTargets,
                    remainingTraitPotentialFrom
                },
                evaluationContext: buildSearchCandidateEvaluationContext({
                    meetsTankRequirement,
                    meetsCarryRequirement,
                    mustHaveTotalCost,
                    mustHaveUnitIndices,
                    mustHaveComplexUnitCount,
                    mustIncludeTraitIndices,
                    mustIncludeTraitTargets,
                    calculateSynergyScore: calculateBoardSynergyScore,
                    scoreBoard,
                    topBoardTracker,
                    buildSortedBoardUnits: this.buildSortedBoardUnits.bind(this),
                    unitInfo,
                    traitCountsToRecord: this.traitCountsToRecord.bind(this),
                    allTraitNames,
                    mustHaveVariantUnitIndices,
                    evaluateBoardSelection: evaluateResolvedBoardSelection
                })
            });
            progressTracker.complete();
        } else {
            const reason = resolveSearchSpaceError(totalCombinations, LIMITS);
            topBoardTracker.topBoards.push({ error: reason });
            return topBoardTracker.topBoards;
        }

        return finalizeTopBoards(topBoardTracker.topBoards);
    }
};
