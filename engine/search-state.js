const { LIMITS } = require('../constants.js');

function buildTraitIndex(allTraitNames = []) {
    const traitIndex = {};
    allTraitNames.forEach((traitName, index) => {
        traitIndex[traitName] = index;
    });
    return traitIndex;
}

function buildMustIncludeTraitTargets(mustIncludeTraitIndices = [], allTraitNames = [], traitBreakpoints = {}) {
    return mustIncludeTraitIndices.map((traitIdx) => {
        const name = allTraitNames[traitIdx];
        const bps = traitBreakpoints[name] || [1];
        return bps[0];
    });
}

function calculateSynergyScore(
    counts,
    {
        allTraitNames = [],
        traitBreakpoints = {},
        onlyActive = true,
        tierRank = true,
        includeUnique = false
    } = {}
) {
    let score = 0;
    for (let index = 0; index < allTraitNames.length; index++) {
        const count = counts[index];
        if (count === 0) continue;

        const name = allTraitNames[index];
        const breakpoints = traitBreakpoints[name] || [1];
        const isUnique = breakpoints.length === 1 && breakpoints[0] === 1;

        if (!includeUnique && isUnique) continue;

        let levelsPassed = 0;
        for (const breakpoint of breakpoints) {
            if (count >= breakpoint) {
                levelsPassed += 1;
            } else {
                break;
            }
        }

        if (onlyActive && levelsPassed === 0) continue;

        if (tierRank) {
            score += levelsPassed;
        } else {
            score += (levelsPassed > 0 ? 1 : (onlyActive ? 0 : 1));
        }
    }

    return score;
}

function scoreBoard(synergyScore, totalCost) {
    return synergyScore * 10000 + totalCost;
}

function resolveSearchSpaceError(totalCombinations, limits = LIMITS) {
    if (Number.isFinite(totalCombinations) && totalCombinations > limits.COMBINATION_LIMIT) {
        return `Search space too large (~${(totalCombinations / 1e9).toFixed(1)}B combinations). Pick more Must-Haves.`;
    }

    return 'Board size too large. Supports up to 7 empty slots.';
}

module.exports = {
    buildTraitIndex,
    buildMustIncludeTraitTargets,
    calculateSynergyScore,
    scoreBoard,
    resolveSearchSpaceError
};
