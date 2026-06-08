const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildUnitOverrideComposition
} = require('../data-engine/parse-data-unit-overrides.js');

describe('parse-data unit overrides', () => {
    it('composes manual and auto-detected overrides into output-ready unit override data', () => {
        const calls = [];
        const hooks = {
            getUnitOverride: () => ({
                slotCost: 2,
                traitContributions: { Bonus: 2 },
                conditionalEffects: [{ traitContributions: { Effect: 1 } }],
                conditionalProfiles: [{ addTraits: ['Profile'] }]
            }),
            buildDetectedVariantOverrides: () => ({
                variants: [
                    {
                        id: 'clone',
                        label: 'Clone Mode',
                        addTraits: ['Clone'],
                        role: 'Carry'
                    }
                ]
            }),
            mergeUnitOverrides: (unitOverride, autoDetectedVariantOverride) => ({
                ...autoDetectedVariantOverride,
                ...unitOverride,
                variants: autoDetectedVariantOverride.variants
            }),
            applyUnitTraitOverrides: (traits, unitOverride) => {
                calls.push(['applyUnitTraitOverrides', traits, unitOverride]);
                return [...new Set([...(traits || []), ...(unitOverride?.addTraits || [])])];
            },
            buildTraitContributionMap: (traits, unitOverride) => ({
                ...Object.fromEntries(traits.map((trait) => [trait, 1])),
                ...(unitOverride?.traitContributions || {})
            }),
            buildUnitVariants: (traits, role, unitOverride) => unitOverride.variants.map((variant) => ({
                id: variant.id,
                label: variant.label,
                role: variant.role || role,
                traits: [...traits, ...(variant.addTraits || [])],
                traitContributions: Object.fromEntries([...traits, ...(variant.addTraits || [])].map((trait) => [trait, 1]))
            })),
            normalizeConditionalEffects: (effects) => effects || [],
            buildConditionalProfiles: (traits, profiles) => profiles.map((profile) => ({
                traits: [...traits, ...(profile.addTraits || [])],
                traitContributions: Object.fromEntries([...traits, ...(profile.addTraits || [])].map((trait) => [trait, 1]))
            })),
            deriveStableVariantRole: (_roleName, variants) => variants[0].role
        };
        const linkedTraitState = {
            linkedTraitNames: ['Base'],
            includedLinkedTraits: [
                { traitId: '{Base}', resolvedName: 'Base' },
                { traitId: '{Choice}', resolvedName: 'Choice' }
            ],
            hasExcludedLinkedTraits: true
        };

        const composition = buildUnitOverrideComposition({
            cleanName: 'Switcher',
            rawName: 'TFT17_Switcher',
            roleName: 'Tank',
            linkedTraitState,
            rawChampionRecordMap: new Map(),
            hashDictionary: {},
            traitNamesByAlias: {},
            setOverrides: {},
            hooks
        });

        assert.equal(composition.mergedUnitOverride.slotCost, 2);
        assert.deepEqual(composition.effectiveTraitNames, ['Base', 'Bonus']);
        assert.deepEqual(composition.linkedTraitIds, ['{Base}']);
        assert.deepEqual(composition.traitContributions, {
            Base: 1,
            Bonus: 2
        });
        assert.deepEqual(composition.conditionalEffects, [
            { traitContributions: { Effect: 1 } }
        ]);
        assert.deepEqual(composition.conditionalProfiles, [
            {
                traits: ['Base', 'Bonus', 'Profile'],
                traitContributions: {
                    Base: 1,
                    Bonus: 1,
                    Profile: 1
                }
            }
        ]);
        assert.deepEqual(composition.variants, [
            {
                id: 'clone',
                label: 'Clone Mode',
                role: 'Carry',
                traits: ['Base', 'Bonus', 'Clone'],
                traitContributions: {
                    Base: 1,
                    Bonus: 1,
                    Clone: 1
                }
            }
        ]);
        assert.equal(composition.resolvedRoleName, 'Carry');
        assert.equal(calls.length, 1);
    });
});
