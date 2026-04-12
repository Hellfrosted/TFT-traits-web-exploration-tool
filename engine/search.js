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
    buildSearchExecutionContext
} = require('./search-execution-context.js');

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
            engine: this
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
