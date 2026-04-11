const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildSetTraitIndexes,
    mergeRawTraitMetadata,
    shouldIncludeChampionRecord
} = require('../data-engine/parse-data-state.js');

describe('parse-data state helpers', () => {
    it('indexes set trait aliases and breakpoints', () => {
        const indexes = buildSetTraitIndexes({
            traits: [
                {
                    apiName: 'TraitApi',
                    name: 'TraitName',
                    displayName: 'Trait Display',
                    traitId: 'trait-id',
                    effects: [{ minUnits: 2 }, { minUnits: 4 }]
                }
            ]
        }, (effects) => effects.map((effect) => effect.minUnits));

        assert.deepEqual(indexes, {
            traitNamesByAlias: {
                TraitApi: 'Trait Display',
                TraitName: 'Trait Display',
                'Trait Display': 'Trait Display',
                'trait-id': 'Trait Display'
            },
            traitBreakpoints: {
                TraitApi: [2, 4],
                TraitName: [2, 4],
                'Trait Display': [2, 4],
                'trait-id': [2, 4]
            }
        });
    });

    it('merges raw trait metadata onto alias and resolved names', () => {
        const traitBreakpoints = {};
        const traitIcons = {};

        mergeRawTraitMetadata({
            rawTraitMetadata: {
                traitBreakpoints: {
                    TraitApi: [2, 4]
                },
                traitIcons: {
                    TraitApi: 'raw-icon.png'
                }
            },
            traitNamesByAlias: {
                TraitApi: 'Trait Display'
            },
            traitBreakpoints,
            traitIcons,
            setOverrides: {},
            latestSet: 17,
            isExcludedTraitName: () => false,
            shouldPreferRawAsset: () => true
        });

        assert.deepEqual(traitBreakpoints, {
            TraitApi: [2, 4],
            'Trait Display': [2, 4]
        });
        assert.deepEqual(traitIcons, {
            TraitApi: 'raw-icon.png',
            'Trait Display': 'raw-icon.png'
        });
    });

    it('filters champion records by set identity and latest-set fallback', () => {
        const sharedArgs = {
            rawJSON: {},
            rawShopDataLookup: {},
            setOverrides: {},
            isChampionRecord: () => true,
            isExcludedUnit: () => false,
            normalizeChampionIdentity: (value) => value.replace(/^TFT\d+_/, ''),
            detectRawUnitSetNumber: (value) => value.detectedSet
        };

        assert.equal(shouldIncludeChampionRecord({
            ...sharedArgs,
            key: 'A',
            value: { mCharacterName: 'TFT17_Foo', tier: 2 },
            latestSet: 17,
            setChampionIdentitySet: new Set(['Foo'])
        }), true);

        assert.equal(shouldIncludeChampionRecord({
            ...sharedArgs,
            key: 'B',
            value: { mCharacterName: 'TFT16_Bar', tier: 2, detectedSet: 16 },
            latestSet: 17,
            setChampionIdentitySet: new Set()
        }), false);

        assert.equal(shouldIncludeChampionRecord({
            ...sharedArgs,
            key: 'C',
            value: { mCharacterName: 'TFT17_Baz', tier: 2, detectedSet: null },
            latestSet: 17,
            setChampionIdentitySet: new Set()
        }), true);
    });
});
