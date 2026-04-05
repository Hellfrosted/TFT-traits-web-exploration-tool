const {
    normalizeBoolean,
    normalizeStringList,
    normalizeStringMap,
    clampInteger,
    UI_LIMITS
} = require('./renderer/normalize-params.js');

const { LIMITS } = require('./constants.js');

function normalizeSearchParams(params = {}) {
    return {
        boardSize: clampInteger(params.boardSize, 9, UI_LIMITS.MIN_BOARD_SIZE, UI_LIMITS.MAX_BOARD_SIZE),
        maxResults: clampInteger(
            params.maxResults,
            LIMITS.DEFAULT_MAX_RESULTS,
            UI_LIMITS.MIN_RESULTS,
            UI_LIMITS.MAX_RESULTS
        ),
        mustInclude: normalizeStringList(params.mustInclude),
        mustExclude: normalizeStringList(params.mustExclude),
        mustIncludeTraits: normalizeStringList(params.mustIncludeTraits),
        mustExcludeTraits: normalizeStringList(params.mustExcludeTraits),
        tankRoles: normalizeStringList(params.tankRoles),
        carryRoles: normalizeStringList(params.carryRoles),
        extraEmblems: normalizeStringList(params.extraEmblems),
        variantLocks: normalizeStringMap(params.variantLocks),
        onlyActive: normalizeBoolean(params.onlyActive),
        tierRank: normalizeBoolean(params.tierRank),
        includeUnique: normalizeBoolean(params.includeUnique)
    };
}

module.exports = {
    normalizeBoolean,
    normalizeSearchParams,
    normalizeStringList,
    normalizeStringMap
};
