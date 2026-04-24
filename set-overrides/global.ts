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

module.exports = {
    GLOBAL_OVERRIDES
};
