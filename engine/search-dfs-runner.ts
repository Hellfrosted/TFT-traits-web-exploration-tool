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
        const prunePayload = {
            ...pruneState,
            startIdx: 0,
            currentMinSlots: 0,
            currentSlotFlex: 0,
            boardSize,
            tankThreePlusCount: 0,
            tankFourPlusCount: 0,
            carryFourPlusCount: 0,
            currentTraitCounts
        };
        const selectionPayload = {
            idx: 0,
            info: null,
            currentTraitCounts,
            activeUnitFlags,
            currentIdxList,
            currentVariantUnitIndices
        };
        const evaluationPayload = {
            ...evaluationContext,
            currentMinSlots: 0,
            boardSize,
            tankThreePlusCount: 0,
            tankFourPlusCount: 0,
            carryFourPlusCount: 0,
            currentCost: 0,
            currentComplexUnitCount: 0,
            currentIdxList,
            currentTraitCounts,
            currentVariantUnitIndices
        };

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
            prunePayload.startIdx = startIdx;
            prunePayload.currentMinSlots = currentMinSlots;
            prunePayload.currentSlotFlex = currentSlotFlex;
            prunePayload.tankThreePlusCount = tankThreePlusCount;
            prunePayload.tankFourPlusCount = tankFourPlusCount;
            prunePayload.carryFourPlusCount = carryFourPlusCount;
            if (shouldPruneSearchBranch(prunePayload)) {
                return;
            }

            if (currentMinSlots <= boardSize && currentMinSlots + currentSlotFlex >= boardSize) {
                progressTracker.markChecked();

                evaluationPayload.currentMinSlots = currentMinSlots;
                evaluationPayload.tankThreePlusCount = tankThreePlusCount;
                evaluationPayload.tankFourPlusCount = tankFourPlusCount;
                evaluationPayload.carryFourPlusCount = carryFourPlusCount;
                evaluationPayload.currentCost = currentCost;
                evaluationPayload.currentComplexUnitCount = currentComplexUnitCount;
                evaluateSearchCandidate(evaluationPayload);
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

                selectionPayload.idx = idx;
                selectionPayload.info = info;
                applyUnitSelectionState(selectionPayload);
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
                selectionPayload.idx = idx;
                selectionPayload.info = info;
                rollbackUnitSelectionState(selectionPayload);
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
