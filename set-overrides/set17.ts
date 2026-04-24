function createSelectionGroup(id, options) {
    return {
        id,
        options
    };
}

function createMechaFormSelectionGroup() {
    return createSelectionGroup('mechaForm', [
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
    ]);
}

function createMechaOverride() {
    return {
        selectionGroups: [
            createMechaFormSelectionGroup()
        ]
    };
}

const SET_17_OVERRIDES = Object.freeze({
    excludedTraitNames: ['Choose Trait'],
    roleOverrides: {},
    unitOverrides: {
        Galio: createMechaOverride(),
        AurelionSol: createMechaOverride(),
        Urgot: createMechaOverride(),
        MissFortune: {
            allowUnknownRole: true,
            removeTraits: ['Choose Trait'],
            note: 'Mode choice is auto-detected from trait-clone data, and the upstream payload currently omits a stable role.'
        }
    }
});

module.exports = {
    SET_17_OVERRIDES
};
