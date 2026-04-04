const GLOBAL_OVERRIDES = Object.freeze({
    excludedUnitPatterns: ['PVE_', '_FakeUnit', 'Dummy', 'Tracker', 'Golem', 'TFT_Item_', 'God_', 'Enemy_', '_TraitClone'],
    excludedUnitSuffixes: ['Wolf', 'Lantern', 'Follower', 'Minion', 'Shrine', 'Prop', 'Core'],
    excludedUnitExact: ['Summon'],
    excludedTraitNames: [],
    roleOverrides: {},
    allowedUnknownRoleUnits: [],
    specialCaseNotes: {},
    unitOverrides: {}
});

const SET_OVERRIDES = Object.freeze({
    '17': {
        excludedTraitNames: ['Choose Trait'],
        roleOverrides: {},
        unitOverrides: {
            Galio: {
                selectionGroups: [
                    {
                        id: 'mechaForm',
                        options: [
                            {
                                id: 'standard',
                                label: 'Standard',
                                slotCost: 1
                            },
                            {
                                id: 'two-slot',
                                label: '2-Slot Mecha',
                                slotCost: 2,
                                traitContributions: {
                                    Mecha: 2
                                }
                            }
                        ]
                    }
                ]
            },
            AurelionSol: {
                selectionGroups: [
                    {
                        id: 'mechaForm',
                        options: [
                            {
                                id: 'standard',
                                label: 'Standard',
                                slotCost: 1
                            },
                            {
                                id: 'two-slot',
                                label: '2-Slot Mecha',
                                slotCost: 2,
                                traitContributions: {
                                    Mecha: 2
                                }
                            }
                        ]
                    }
                ]
            },
            Urgot: {
                selectionGroups: [
                    {
                        id: 'mechaForm',
                        options: [
                            {
                                id: 'standard',
                                label: 'Standard',
                                slotCost: 1
                            },
                            {
                                id: 'two-slot',
                                label: '2-Slot Mecha',
                                slotCost: 2,
                                traitContributions: {
                                    Mecha: 2
                                }
                            }
                        ]
                    }
                ]
            },
            MissFortune: {
                allowUnknownRole: true,
                removeTraits: ['Choose Trait'],
                note: 'Mode choice is auto-detected from trait-clone data, and the upstream payload currently omits a stable role.'
            }
        }
    }
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

function getSetOverrides({ setNumber = null } = {}) {
    const setOverrides = setNumber ? (SET_OVERRIDES[String(setNumber)] || {}) : {};
    const unitOverrides = {
        ...GLOBAL_OVERRIDES.unitOverrides,
        ...(setOverrides.unitOverrides || {})
    };
    const unitOverrideNotes = Object.entries(unitOverrides).reduce((notes, [unitId, override]) => {
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
