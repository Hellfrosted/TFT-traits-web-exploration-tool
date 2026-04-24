const { GLOBAL_OVERRIDES } = require('./set-overrides/global.js');
const { SET_17_OVERRIDES } = require('./set-overrides/set17.js');

const SET_OVERRIDES = Object.freeze({
    '17': SET_17_OVERRIDES
});

function mergeUnique(...lists) {
    const merged = [];
    const seen = new Set();

    lists.flat().forEach((value) => {
        const normalized = String(value ?? '').trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        merged.push(normalized);
    });

    return merged;
}

function getSetOverrides({ setNumber = null }: LooseRecord = {}) {
    const setOverrides = setNumber ? (SET_OVERRIDES[String(setNumber)] || {}) : {};
    const unitOverrides = {
        ...GLOBAL_OVERRIDES.unitOverrides,
        ...(setOverrides.unitOverrides || {})
    };
    const unitOverrideNotes = Object.entries(unitOverrides).reduce((notes: LooseRecord, [unitId, override]) => {
        if (override?.note) {
            notes[unitId] = override.note;
        }
        return notes;
    }, {});
    const unitOverrideUnknownRoleUnits = Object.entries(unitOverrides)
        .filter(([, override]) => override?.allowUnknownRole)
        .map(([unitId]) => unitId);

    return {
        excludedUnitPatterns: mergeUnique(
            GLOBAL_OVERRIDES.excludedUnitPatterns,
            setOverrides.excludedUnitPatterns || []
        ),
        excludedUnitSuffixes: mergeUnique(
            GLOBAL_OVERRIDES.excludedUnitSuffixes,
            setOverrides.excludedUnitSuffixes || []
        ),
        excludedUnitExact: mergeUnique(
            GLOBAL_OVERRIDES.excludedUnitExact,
            setOverrides.excludedUnitExact || []
        ),
        excludedTraitNames: mergeUnique(
            GLOBAL_OVERRIDES.excludedTraitNames,
            setOverrides.excludedTraitNames || []
        ),
        roleOverrides: {
            ...GLOBAL_OVERRIDES.roleOverrides,
            ...(setOverrides.roleOverrides || {})
        },
        allowedUnknownRoleUnits: mergeUnique(
            GLOBAL_OVERRIDES.allowedUnknownRoleUnits,
            setOverrides.allowedUnknownRoleUnits || [],
            unitOverrideUnknownRoleUnits
        ),
        specialCaseNotes: {
            ...GLOBAL_OVERRIDES.specialCaseNotes,
            ...(setOverrides.specialCaseNotes || {}),
            ...unitOverrideNotes
        },
        unitOverrides
    };
}

module.exports = {
    getSetOverrides
};
