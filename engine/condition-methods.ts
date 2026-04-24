module.exports = {
    compileConditions(conditions, traitIndex, unitIndexById, traitBreakpoints = {}) {
        if (!conditions || typeof conditions !== 'object') {
            return null;
        }

        const requiredUnits = Array.isArray(conditions.requiredUnits) ? conditions.requiredUnits : [];
        const forbiddenUnits = Array.isArray(conditions.forbiddenUnits) ? conditions.forbiddenUnits : [];
        const requiredActiveTraits = Array.isArray(conditions.requiredActiveTraits) ? conditions.requiredActiveTraits : [];
        const forbiddenActiveTraits = Array.isArray(conditions.forbiddenActiveTraits) ? conditions.forbiddenActiveTraits : [];
        const minTraitCounts = conditions.minTraitCounts && typeof conditions.minTraitCounts === 'object'
            ? conditions.minTraitCounts
            : {};
        const maxTraitCounts = conditions.maxTraitCounts && typeof conditions.maxTraitCounts === 'object'
            ? conditions.maxTraitCounts
            : {};

        return {
            requiredUnitIndices: requiredUnits.map((unitId) => unitIndexById[unitId] ?? -1),
            forbiddenUnitIndices: forbiddenUnits
                .map((unitId) => unitIndexById[unitId])
                .filter((index) => index !== undefined),
            requiredActiveTraits: requiredActiveTraits.map((traitName) => {
                const breakpoints = traitBreakpoints[traitName] || [1];
                return {
                    index: traitIndex[traitName] ?? -1,
                    threshold: breakpoints[0] ?? 1
                };
            }),
            forbiddenActiveTraits: forbiddenActiveTraits.map((traitName) => {
                const breakpoints = traitBreakpoints[traitName] || [1];
                return {
                    index: traitIndex[traitName] ?? -1,
                    threshold: breakpoints[0] ?? 1
                };
            }),
            minTraitCounts: Object.entries(minTraitCounts).map(([traitName, minCount]) => ({
                index: traitIndex[traitName] ?? -1,
                threshold: Number(minCount || 0)
            })),
            maxTraitCounts: Object.entries(maxTraitCounts).map(([traitName, maxCount]) => ({
                index: traitIndex[traitName] ?? -1,
                threshold: Number(maxCount)
            }))
        };
    },

    isCompiledConditionSatisfied(compiledConditions, traitCounts, activeUnitFlags) {
        if (!compiledConditions) {
            return true;
        }

        for (const unitIndex of compiledConditions.requiredUnitIndices) {
            if (unitIndex < 0 || !activeUnitFlags[unitIndex]) {
                return false;
            }
        }

        for (const unitIndex of compiledConditions.forbiddenUnitIndices) {
            if (activeUnitFlags[unitIndex]) {
                return false;
            }
        }

        for (const { index, threshold } of compiledConditions.requiredActiveTraits) {
            if (index < 0 || (traitCounts[index] || 0) < threshold) {
                return false;
            }
        }

        for (const { index, threshold } of compiledConditions.forbiddenActiveTraits) {
            if (index >= 0 && (traitCounts[index] || 0) >= threshold) {
                return false;
            }
        }

        for (const { index, threshold } of compiledConditions.minTraitCounts) {
            if (index < 0) {
                if (threshold > 0) {
                    return false;
                }
                continue;
            }
            if ((traitCounts[index] || 0) < threshold) {
                return false;
            }
        }

        for (const { index, threshold } of compiledConditions.maxTraitCounts) {
            if (index < 0) {
                if (0 > threshold) {
                    return false;
                }
                continue;
            }
            if ((traitCounts[index] || 0) > threshold) {
                return false;
            }
        }

        return true;
    },

    findFirstSatisfiedProfile(entries, traitCounts, activeUnitFlags) {
        for (const entry of entries || []) {
            if (this.isCompiledConditionSatisfied(entry.compiledConditions, traitCounts, activeUnitFlags)) {
                return entry;
            }
        }

        return null;
    },

    isConditionSatisfied(conditions, context) {
        if (!conditions || typeof conditions !== 'object') {
            return true;
        }

        const traitCounts = context?.traitCounts || {};
        const activeUnits = context?.activeUnits || new Set();
        const traitBreakpoints = context?.traitBreakpoints || {};

        const requiredUnits = Array.isArray(conditions.requiredUnits) ? conditions.requiredUnits : [];
        if (requiredUnits.some((unitId) => !activeUnits.has(unitId))) {
            return false;
        }

        const forbiddenUnits = Array.isArray(conditions.forbiddenUnits) ? conditions.forbiddenUnits : [];
        if (forbiddenUnits.some((unitId) => activeUnits.has(unitId))) {
            return false;
        }

        const requiredActiveTraits = Array.isArray(conditions.requiredActiveTraits) ? conditions.requiredActiveTraits : [];
        if (requiredActiveTraits.some((traitName) => {
            const breakpoints = traitBreakpoints[traitName] || [1];
            return (traitCounts[traitName] || 0) < breakpoints[0];
        })) {
            return false;
        }

        const forbiddenActiveTraits = Array.isArray(conditions.forbiddenActiveTraits) ? conditions.forbiddenActiveTraits : [];
        if (forbiddenActiveTraits.some((traitName) => {
            const breakpoints = traitBreakpoints[traitName] || [1];
            return (traitCounts[traitName] || 0) >= breakpoints[0];
        })) {
            return false;
        }

        const minTraitCounts = conditions.minTraitCounts && typeof conditions.minTraitCounts === 'object'
            ? conditions.minTraitCounts
            : {};
        if (Object.entries(minTraitCounts).some(([traitName, minCount]) => (traitCounts[traitName] || 0) < Number(minCount || 0))) {
            return false;
        }

        const maxTraitCounts = conditions.maxTraitCounts && typeof conditions.maxTraitCounts === 'object'
            ? conditions.maxTraitCounts
            : {};
        if (Object.entries(maxTraitCounts).some(([traitName, maxCount]) => (traitCounts[traitName] || 0) > Number(maxCount))) {
            return false;
        }

        return true;
    }
};
