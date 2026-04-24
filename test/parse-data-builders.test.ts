const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildParsedUnits
} = require('../data-engine/parse-data-builders.js');

describe('parse-data builders', () => {
    it('builds parsed units, taxonomy, and matched references from champion records', () => {
        const rawJSON = {
            champion: {
                mCharacterName: 'TFT17_Aurora',
                tier: 4,
                CharacterRole: 'TankRole',
                mLinkedTraits: [
                    { TraitData: '{TraitA}' }
                ]
            },
            ignored: {
                mCharacterName: 'NotAChampion'
            }
        };
        const parseContext = {
            source: 'pbe',
            hashDictionary: {
                '{TraitA}': 'InvokerAlias'
            },
            rawChampionRecordMap: new Map(),
            rawShopDataLookup: new Map(),
            latestSet: '17',
            setOverrides: {},
            setChampionIdentitySet: new Set(['aurora']),
            championReferenceMap: new Map(),
            championAssets: new Map(),
            traitNamesByAlias: {
                InvokerAlias: 'Invoker'
            }
        };
        const hooks = {
            isChampionRecord: (key) => key === 'champion',
            isExcludedUnit: () => false,
            normalizeChampionIdentity: (rawName) => rawName.replace(/^TFT\d+_/, '').toLowerCase(),
            detectRawUnitSetNumber: () => '17',
            toDisplayName: (name) => name,
            findChampionReference: () => ({
                record: {
                    displayName: 'Aurora Ref',
                    iconUrl: 'https://assets.example/ref.png'
                }
            }),
            getUnitOverride: () => ({
                slotCost: 2,
                traitContributions: { BonusTrait: 1 },
                conditionalEffects: [
                    { traitContributions: { EffectTrait: 1 } }
                ],
                conditionalProfiles: [
                    {
                        traits: ['ProfileTrait'],
                        traitContributions: { ProfileContribution: 1 }
                    }
                ],
                variants: [
                    {
                        id: 'alt',
                        role: 'Carry',
                        traits: ['VariantTrait']
                    }
                ]
            }),
            resolveRoleName: () => 'Tank',
            isExcludedTraitName: () => false,
            buildDetectedVariantOverrides: () => {
                throw new Error('should not auto-detect variants when overrides already define them');
            },
            mergeUnitOverrides: (unitOverride, autoDetectedVariantOverride) => unitOverride || autoDetectedVariantOverride,
            applyUnitTraitOverrides: (traitNames) => [...new Set(traitNames)],
            buildTraitContributionMap: (traitNames, unitOverride) => {
                const traitContributions = {};
                traitNames.forEach((traitName) => {
                    traitContributions[traitName] = 1;
                });
                Object.entries(unitOverride?.traitContributions || {}).forEach(([traitName, count]) => {
                    traitContributions[traitName] = Number(count);
                });
                return traitContributions;
            },
            buildUnitVariants: (_effectiveTraitNames, _roleName, unitOverride) => unitOverride?.variants || [],
            normalizeConditionalEffects: (effects) => effects || [],
            buildConditionalProfiles: (_effectiveTraitNames, profiles) => profiles || [],
            deriveStableVariantRole: (roleName) => roleName,
            resolveRawChampionIcon: () => ({
                url: 'https://assets.example/raw.png',
                rank: 4
            }),
            findChampionIcon: () => ({
                url: 'https://assets.example/metadata.png',
                rank: 2
            }),
            shouldPreferRawAsset: () => true,
            assetMatchesSet: () => true,
            rankChampionIconAsset: () => 0
        };

        const parsed = buildParsedUnits({
            rawJSON,
            parseContext,
            hooks
        });

        assert.equal(parsed.units.length, 1);
        assert.deepEqual(parsed.units[0], {
            id: 'Aurora',
            displayName: 'Aurora',
            cost: 4,
            role: 'Tank',
            slotCost: 2,
            traits: ['Invoker', 'BonusTrait'],
            traitContributions: {
                Invoker: 1,
                BonusTrait: 1
            },
            conditionalEffects: [
                { traitContributions: { EffectTrait: 1 } }
            ],
            conditionalProfiles: [
                {
                    traits: ['ProfileTrait'],
                    traitContributions: { ProfileContribution: 1 }
                }
            ],
            traitIds: ['{TraitA}'],
            variants: [
                {
                    id: 'alt',
                    role: 'Carry',
                    traits: ['VariantTrait']
                }
            ],
            iconUrl: 'https://assets.example/raw.png'
        });
        assert.deepEqual([...parsed.traits].sort(), [
            'BonusTrait',
            'EffectTrait',
            'Invoker',
            'ProfileContribution',
            'ProfileTrait',
            'VariantTrait'
        ]);
        assert.deepEqual([...parsed.roles].sort(), ['Carry', 'Tank']);
        assert.deepEqual([...parsed.matchedChampionReferenceNames], ['Aurora Ref']);
    });
});
