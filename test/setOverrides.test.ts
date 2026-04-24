const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getSetOverrides } = require('../setOverrides.js');

describe('set overrides', () => {
    it('merges global defaults into the unconfigured-set view', () => {
        const overrides = getSetOverrides({ setNumber: 16 });

        assert.deepEqual(
            overrides.excludedUnitPatterns,
            ['PVE_', '_FakeUnit', 'Dummy', 'Tracker', 'Golem', 'TFT_Item_', 'God_', 'Enemy_', '_TraitClone']
        );
        assert.deepEqual(
            overrides.excludedUnitSuffixes,
            ['Wolf', 'Lantern', 'Follower', 'Minion', 'Shrine', 'Prop', 'Core']
        );
        assert.deepEqual(overrides.excludedUnitExact, ['Summon']);
        assert.deepEqual(overrides.excludedTraitNames, []);
        assert.deepEqual(overrides.allowedUnknownRoleUnits, []);
        assert.deepEqual(overrides.specialCaseNotes, {});
    });

    it('applies the current Set 17 trait exclusion on top of the global defaults', () => {
        const overrides = getSetOverrides({ setNumber: 17 });

        assert.equal(overrides.excludedTraitNames.includes('Choose Trait'), true);
        assert.equal(overrides.excludedUnitPatterns.includes('PVE_'), true);
        assert.equal(overrides.excludedUnitSuffixes.includes('Minion'), true);
        assert.equal(overrides.excludedUnitExact.includes('Summon'), true);
    });

    it('tracks MissFortune as the allowed unknown-role unit for Set 17', () => {
        const overrides = getSetOverrides({ setNumber: 17 });

        assert.deepEqual(overrides.allowedUnknownRoleUnits, ['MissFortune']);
        assert.equal(overrides.specialCaseNotes.MissFortune, 'Mode choice is auto-detected from trait-clone data, and the upstream payload currently omits a stable role.');
        assert.equal(overrides.unitOverrides.MissFortune.allowUnknownRole, true);
        assert.deepEqual(overrides.unitOverrides.MissFortune.removeTraits, ['Choose Trait']);
        assert.equal(overrides.unitOverrides.MissFortune.selectionGroups, undefined);
    });

    it('reuses the same Set 17 Mecha selection-group payload shape for all Mecha overrides', () => {
        const overrides = getSetOverrides({ setNumber: 17 });
        const galio = overrides.unitOverrides.Galio;
        const aurelionSol = overrides.unitOverrides.AurelionSol;
        const urgot = overrides.unitOverrides.Urgot;

        assert.deepEqual(galio, aurelionSol);
        assert.deepEqual(galio, urgot);
        assert.equal(galio.selectionGroups[0].id, 'mechaForm');
        assert.deepEqual(galio.selectionGroups[0].options.map((option) => option.id), ['standard', 'two-slot']);
    });
});
