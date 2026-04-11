const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildHashDictionary,
    buildParseDataContext,
    buildParsedDataResult
} = require('../data-engine/parse-data-context.js');

describe('parse-data context helpers', () => {
    it('builds a hash dictionary from raw object names and trait ids', () => {
        const hashDictionary = buildHashDictionary({
            '{TraitA}': { mName: 'Bruiser' },
            '{RoleTank}': { mDisplayName: 'Tank' },
            SomeRecord: { mCharacterName: 'TFT17_Aurora' }
        });

        assert.deepEqual(hashDictionary, {
            '{TraitA}': 'Bruiser',
            '{RoleTank}': 'Tank'
        });
    });

    it('builds parse context and merges set/raw trait metadata', () => {
        const context = buildParseDataContext({
            '{TraitRaw}': { mName: 'Bruiser' }
        }, {
            sets: {
                '17': {
                    traits: [
                        {
                            apiName: 'BruiserApi',
                            displayName: 'Bruiser',
                            effects: [{ minUnits: 2 }]
                        }
                    ]
                }
            }
        }, {
            rawChampionSplashesHtml: '<html></html>',
            rawTraitIconsHtml: '<html></html>'
        }, {}, {
            normalizeDataSource: () => 'pbe',
            buildRawTraitMetadata: () => ({
                traitBreakpoints: { Bruiser: [2, 4] },
                traitIcons: { Bruiser: 'raw-bruiser.png' }
            }),
            buildRawChampionRecordMap: () => new Map(),
            buildRawShopDataLookup: () => new Map(),
            detectLatestSet: () => '17',
            detectLatestSetFromRaw: () => null,
            getLatestSetData: (cdragonJSON) => cdragonJSON.sets['17'],
            buildSetChampionRecords: () => [{ displayName: 'Aurora' }],
            buildChampionIdentitySet: () => new Set(['aurora']),
            buildChampionReferenceMap: () => new Map(),
            buildChampionAssetMap: () => new Map(),
            buildTraitIconMap: () => ({ BruiserApi: 'cdragon-bruiser.png' }),
            normalizeBreakpoints: (effects) => effects.map((effect) => effect.minUnits),
            isExcludedTraitName: () => false,
            shouldPreferRawAsset: () => true
        });

        assert.equal(context.source, 'pbe');
        assert.equal(context.latestSet, '17');
        assert.deepEqual(context.traitNamesByAlias, {
            BruiserApi: 'Bruiser',
            Bruiser: 'Bruiser'
        });
        assert.deepEqual(context.traitBreakpoints, {
            BruiserApi: [2],
            Bruiser: [2]
        });
        assert.deepEqual(context.traitIcons, {
            BruiserApi: 'cdragon-bruiser.png',
            Bruiser: 'raw-bruiser.png'
        });
    });

    it('builds the final parsed data payload and asset validation summary', () => {
        const result = buildParsedDataResult({
            units: [
                { displayName: 'Aurora', iconUrl: 'aurora.png' },
                { displayName: 'Morgana' }
            ],
            traits: new Set(['Bruiser', 'Invoker']),
            roles: new Set(['Carry', 'Tank']),
            traitBreakpoints: { Bruiser: [2] },
            traitIcons: { Bruiser: 'bruiser.png' },
            hashDictionary: { '{TraitA}': 'Bruiser' },
            latestSet: '17',
            source: 'pbe',
            setOverrides: { id: 'override' },
            setChampionRecords: [{}, {}, {}],
            matchedChampionReferenceNames: new Set(['Aurora']),
            createDataFingerprint: () => 'fingerprint-1'
        });

        assert.deepEqual(result, {
            units: [
                { displayName: 'Aurora', iconUrl: 'aurora.png' },
                { displayName: 'Morgana' }
            ],
            traits: ['Bruiser', 'Invoker'],
            roles: ['Carry', 'Tank'],
            traitBreakpoints: { Bruiser: [2] },
            traitIcons: { Bruiser: 'bruiser.png' },
            hashMap: { '{TraitA}': 'Bruiser' },
            setNumber: '17',
            dataSource: 'pbe',
            setOverrides: { id: 'override' },
            assetValidation: {
                championAssetCount: 3,
                matchedChampionCount: 1,
                totalUnits: 2,
                missingChampionIcons: ['Morgana'],
                unmatchedChampionAssets: 2,
                traitIconCount: 1,
                totalTraits: 2
            },
            dataFingerprint: 'fingerprint-1'
        });
    });
});
