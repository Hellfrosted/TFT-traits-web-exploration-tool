const { LIMITS } = require('../constants.js');

function buildAvailableIndices(validUnits = [], mustHaveMask = 0n) {
    const availableIndices = [];
    for (let index = 0; index < validUnits.length; index++) {
        if ((mustHaveMask & (1n << BigInt(index))) === 0n) {
            availableIndices.push(index);
        }
    }
    return availableIndices;
}

function buildUnitIndexById(validUnits = []) {
    const unitIndexById = Object.create(null);
    validUnits.forEach((unit, index) => {
        unitIndexById[unit.id] = index;
    });
    return unitIndexById;
}

function buildMustIncludeTraitIndices(mustIncludeTraits = [], traitIndex = {}) {
    return mustIncludeTraits
        .map((traitName) => traitIndex[traitName])
        .filter((index) => index !== undefined);
}

function detectSearchFeatures(unitInfo = []) {
    return {
        hasVariantUnits: unitInfo.some((info) => info.variantProfiles.length > 0),
        hasConditionalProfiles: unitInfo.some((info) =>
            info.conditionalProfileEntries.length > 0
            || info.variantProfiles.some((variant) => variant.conditionalProfileEntries.length > 0)
        ),
        hasConditionalEffects: unitInfo.some((info) =>
            info.conditionalEffectEntries.length > 0
            || info.variantProfiles.some((variant) => variant.conditionalEffectEntries.length > 0)
        )
    };
}

function createProgressTracker({
    onProgress,
    totalCombinations,
    shouldEmitProgress,
    progressInterval = LIMITS.PROGRESS_INTERVAL
} = {}) {
    let combinationsChecked = 0;
    let lastProgressReport = 0;

    return {
        markChecked() {
            combinationsChecked += 1;
            if (!onProgress || !shouldEmitProgress(combinationsChecked, lastProgressReport, progressInterval)) {
                return;
            }

            lastProgressReport = combinationsChecked;
            if (Number.isFinite(totalCombinations) && totalCombinations > 0) {
                const pct = Math.min(99, Math.round((combinationsChecked / totalCombinations) * 100));
                onProgress(pct, combinationsChecked, totalCombinations);
                return;
            }

            onProgress(null, combinationsChecked, totalCombinations);
        },

        complete() {
            if (!onProgress) {
                return;
            }

            if (Number.isFinite(totalCombinations)) {
                onProgress(100, totalCombinations, totalCombinations);
                return;
            }

            onProgress(100, combinationsChecked, totalCombinations);
        }
    };
}

module.exports = {
    buildAvailableIndices,
    buildUnitIndexById,
    buildMustIncludeTraitIndices,
    detectSearchFeatures,
    createProgressTracker
};
