const { shouldPruneSearchBranch: defaultShouldPruneSearchBranch } = require('./search-dfs-state.js');
const {
    applyUnitSelectionState: defaultApplyUnitSelectionState,
    rollbackUnitSelectionState: defaultRollbackUnitSelectionState,
    evaluateSearchCandidate: defaultEvaluateSearchCandidate
} = require('./search-visit.js');

function createSearchDfsRunner({
    shouldPruneSearchBranch = defaultShouldPruneSearchBranch,
    applyUnitSelectionState = defaultApplyUnitSelectionState,
    rollbackUnitSelectionState = defaultRollbackUnitSelectionState,
    evaluateSearchCandidate = defaultEvaluateSearchCandidate
} = {}) {
    return function runSearchDfs({
        boardSize,
        availableIndices = [],
        unitInfo = [],
        currentTraitCounts,
        activeUnitFlags,
        progressTracker,
        initialState,
        pruneState,
        evaluationContext
    }) {
        const currentIdxList = [];
        const currentVariantUnitIndices = [];

        const dfs = (
            startIdx,
            currentMinSlots,
            tankThreePlusCount,
            tankFourPlusCount,
            carryFourPlusCount,
            currentCost,
            currentComplexUnitCount,
            currentSlotFlex
        ) => {
            if (shouldPruneSearchBranch({
                ...pruneState,
                startIdx,
                currentMinSlots,
                currentSlotFlex,
                boardSize,
                tankThreePlusCount,
                tankFourPlusCount,
                carryFourPlusCount,
                currentTraitCounts
            })) {
                return;
            }

            if (currentMinSlots <= boardSize && (currentMinSlots + currentSlotFlex) >= boardSize) {
                progressTracker.markChecked();

                evaluateSearchCandidate({
                    ...evaluationContext,
                    currentMinSlots,
                    boardSize,
                    tankThreePlusCount,
                    tankFourPlusCount,
                    carryFourPlusCount,
                    currentCost,
                    currentComplexUnitCount,
                    currentIdxList,
                    currentTraitCounts,
                    currentVariantUnitIndices
                });
            }

            if (currentMinSlots === boardSize) {
                return;
            }

            for (let index = startIdx; index < availableIndices.length; index++) {
                const idx = availableIndices[index];
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
                    index + 1,
                    nextMinSlots,
                    tankThreePlusCount + info.qualifyingTankThreePlus,
                    tankFourPlusCount + info.qualifyingTankFourPlus,
                    carryFourPlusCount + info.qualifyingCarryFourPlus,
                    currentCost + info.cost,
                    currentComplexUnitCount + info.hasComplexEvaluation,
                    currentSlotFlex + info.slotFlex
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

        dfs(
            0,
            initialState.currentMinSlots,
            initialState.tankThreePlusCount,
            initialState.tankFourPlusCount,
            initialState.carryFourPlusCount,
            initialState.currentCost,
            initialState.currentComplexUnitCount,
            initialState.currentSlotFlex
        );
    };
}

const runSearchDfs = createSearchDfsRunner();

module.exports = {
    createSearchDfsRunner,
    runSearchDfs
};
