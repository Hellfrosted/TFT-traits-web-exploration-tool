const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    resolveChampionLinkedTraits,
    collectResolvedUnitTaxonomy,
    resolvePreferredChampionIcon
} = require('../data-engine/parse-data-units.js');

describe('parse-data unit helpers', () => {
    it('resolves linked trait aliases while filtering excluded traits', () => {
        const linkedTraits = resolveChampionLinkedTraits({
            linkedTraits: [
                { TraitData: '{TraitA}' },
                { TraitData: '{TraitB}' },
                { TraitData: null }
            ],
            hashDictionary: {
                '{TraitA}': 'TraitAliasA',
                '{TraitB}': 'TraitAliasB'
            },
            traitNamesByAlias: {
                TraitAliasA: 'Trait A',
                TraitAliasB: 'Trait B'
            },
            isExcludedTraitName: (traitName) => traitName === 'Trait B',
            setOverrides: {}
        });

        assert.deepEqual(linkedTraits, {
            allLinkedTraits: [
                { traitId: '{TraitA}', resolvedName: 'Trait A' },
                { traitId: '{TraitB}', resolvedName: 'Trait B' }
            ],
            includedLinkedTraits: [
                { traitId: '{TraitA}', resolvedName: 'Trait A' }
            ],
            linkedTraitNames: ['Trait A'],
            hasExcludedLinkedTraits: true
        });
    });

    it('collects traits and roles from base units, profiles, and variants', () => {
        const traits = new Set();
        const roles = new Set();

        collectResolvedUnitTaxonomy({
            traits,
            roles,
            effectiveTraitNames: ['BaseTrait'],
            conditionalEffects: [
                { traitContributions: { ConditionalTrait: 1 } }
            ],
            conditionalProfiles: [
                {
                    traits: ['ProfileTrait'],
                    traitContributions: { ProfileContribution: 2 }
                }
            ],
            variants: [
                {
                    role: 'Carry',
                    traits: ['VariantTrait'],
                    conditionalEffects: [{ traitContributions: { VariantEffect: 1 } }],
                    conditionalProfiles: [
                        {
                            traits: ['VariantProfileTrait'],
                            traitContributions: { VariantProfileContribution: 1 }
                        }
                    ]
                },
                {
                    role: 'Unknown',
                    traits: ['SecondVariantTrait']
                }
            ],
            resolvedRoleName: 'Tank'
        });

        assert.deepEqual([...traits].sort(), [
            'BaseTrait',
            'ConditionalTrait',
            'ProfileContribution',
            'ProfileTrait',
            'SecondVariantTrait',
            'VariantEffect',
            'VariantProfileContribution',
            'VariantProfileTrait',
            'VariantTrait'
        ]);
        assert.deepEqual([...roles].sort(), ['Carry', 'Tank']);
    });

    it('prefers same-set raw shop icons over weaker metadata assets', () => {
        const resolvedIconUrl = resolvePreferredChampionIcon({
            rawShopIcon: {
                url: 'https://assets.example/TFT17_Foo_Square.png',
                rank: 4
            },
            championIcon: {
                url: 'https://assets.example/TFT17_Foo_teamplanner_splash.png',
                rank: 3
            },
            championReferenceIconUrl: null,
            latestSet: 17,
            shouldPreferRawAsset: () => false,
            assetMatchesSet: (assetPathOrUrl, setNumber) => String(assetPathOrUrl || '').includes(`TFT${setNumber}`),
            rankChampionIconAsset: () => -1
        });

        assert.equal(resolvedIconUrl, 'https://assets.example/TFT17_Foo_Square.png');
    });

    it('falls back to metadata or raw icons when one side is missing', () => {
        assert.equal(resolvePreferredChampionIcon({
            rawShopIcon: null,
            championIcon: null,
            championReferenceIconUrl: 'https://assets.example/TFT17_Foo_Metadata.png',
            latestSet: 17,
            shouldPreferRawAsset: () => false,
            assetMatchesSet: () => false,
            rankChampionIconAsset: () => 3
        }), 'https://assets.example/TFT17_Foo_Metadata.png');

        assert.equal(resolvePreferredChampionIcon({
            rawShopIcon: {
                url: 'https://assets.example/TFT17_Foo_Square.png',
                rank: 4
            },
            championIcon: null,
            championReferenceIconUrl: null,
            latestSet: 17,
            shouldPreferRawAsset: () => false,
            assetMatchesSet: () => false,
            rankChampionIconAsset: () => -1
        }), 'https://assets.example/TFT17_Foo_Square.png');
    });
});
