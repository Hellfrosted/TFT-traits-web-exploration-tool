const { LIMITS } = require('../constants.js');
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
    createTopBoardTracker
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
    createSearchScoreCalculator,
    createResolvedBoardSelectionEvaluator,
    buildSearchCandidateEvaluationContext
} = require('./search-evaluation-context.js');

function buildSearchExecutionContext({
    dataCache,
    normalizedParams,
    preparedSearchContext,
    onProgress,
    engine,
    limits = LIMITS
}) {
    const {
        boardSize,
        mustIncludeTraits,
        mustExcludeTraits,
        variantLocks,
        tankRoles,
        carryRoles,
        extraEmblems,
        onlyActive,
        tierRank,
        includeUnique,
        maxResults
    } = normalizedParams;
    const {
        validUnits,
        mustHaveMask,
        remainingSlots,
        hasVariableSlotCosts
    } = preparedSearchContext;
    const allTraitNames = dataCache.traits;
    const traitBreakpoints = dataCache.traitBreakpoints || {};
    const traitIndex = buildTraitIndex(allTraitNames);
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
        traitBreakpoints,
        unitIndexById,
        variantLocks,
        excludedTraitSet,
        tankRoleSet,
        carryRoleSet,
        unitSortRank,
        buildTraitContributionEntries: engine.buildTraitContributionEntries.bind(engine),
        getEntitySlotCost: engine.getEntitySlotCost.bind(engine),
        buildConditionalEffectEntries: engine.buildConditionalEffectEntries.bind(engine),
        buildConditionalProfileEntries: engine.buildConditionalProfileEntries.bind(engine),
        compileConditions: engine.compileConditions.bind(engine),
        summarizeVariantProfiles: engine.summarizeVariantProfiles.bind(engine)
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

    const maxBoards = maxResults || limits.DEFAULT_MAX_RESULTS;
    const {
        hasVariantUnits,
        hasConditionalProfiles,
        hasConditionalEffects
    } = detectSearchFeatures(unitInfo);

    const topBoardTracker = createTopBoardTracker({
        maxBoards,
        findWorstBoardIndex: engine.findWorstBoardIndex.bind(engine),
        createBoardResult: ({ unitIds, evaluation, totalCost }) => createBoardResult({
            unitIds,
            evaluation,
            totalCost,
            scoreBoard
        })
    });

    const totalCombinations = hasVariableSlotCosts
        ? countPreparedSearchSpaceCandidates({
            ...preparedSearchContext,
            variantLocks,
            getUnitSlotCostRange: engine.getUnitSlotCostRange.bind(engine)
        })
        : engine.combinations(availableIndices.length, remainingSlots);
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
        traitBreakpoints
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
        traitBreakpoints,
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
        isCompiledConditionSatisfied: engine.isCompiledConditionSatisfied.bind(engine),
        findFirstSatisfiedProfile: engine.findFirstSatisfiedProfile.bind(engine),
        traitCountsToRecord: engine.traitCountsToRecord.bind(engine)
    });

    const canRunSearch = (
        remainingSlots <= limits.MAX_REMAINING_SLOTS &&
        (!Number.isFinite(totalCombinations) || totalCombinations <= limits.COMBINATION_LIMIT)
    );

    return {
        totalCombinations,
        progressTracker,
        topBoardTracker,
        searchSpaceError: canRunSearch ? null : resolveSearchSpaceError(totalCombinations, limits),
        dfsInput: {
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
                buildSortedBoardUnits: engine.buildSortedBoardUnits.bind(engine),
                unitInfo,
                traitCountsToRecord: engine.traitCountsToRecord.bind(engine),
                allTraitNames,
                mustHaveVariantUnitIndices,
                evaluateBoardSelection: evaluateResolvedBoardSelection
            })
        }
    };
}

module.exports = {
    buildSearchExecutionContext
};
