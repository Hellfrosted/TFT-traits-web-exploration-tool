const { LIMITS } = require('../constants.js');

function countPreparedSearchSpaceCandidates({
    validUnits = [],
    mustHaveMask = 0n,
    remainingSlots = 0,
    hasAllRequiredUnits = true,
    variantLocks = {},
    getUnitSlotCostRange,
    limits = LIMITS
}: LooseRecord = {}) {
    if (!hasAllRequiredUnits || remainingSlots < 0) {
        return 0;
    }

    const cap = limits.COMBINATION_LIMIT + 1;
    const maxBucket = remainingSlots;
    const overflowMinBucket = remainingSlots + 1;
    const minStateSize = overflowMinBucket + 1;
    const maxStateSize = maxBucket + 1;
    let requiredSlotFlex = 0;
    let dp = Array.from({ length: minStateSize }, () => Array(maxStateSize).fill(0));
    dp[0][0] = 1;

    for (let index = 0; index < validUnits.length; index++) {
        const unit = validUnits[index];
        const slotRange = getUnitSlotCostRange(unit, variantLocks?.[unit.id] || null);
        if ((mustHaveMask & (1n << BigInt(index))) !== 0n) {
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
}

module.exports = {
    countPreparedSearchSpaceCandidates
};
