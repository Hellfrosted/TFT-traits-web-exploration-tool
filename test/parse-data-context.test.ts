const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildRawMetadataIndex,
    buildHashDictionary,
    prepareAssetLookupContext,
    buildParseDataContext,
    buildParsedDataResult,
    resolveSetParseContext
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

    it('indexes raw parser metadata before set resolution', () => {
        const rawChampionRecordMap = new Map([['TFT17_Aurora', { displayName: 'Aurora' }]]);
        const rawShopDataLookup = new Map([['{ShopAurora}', { mName: 'Aurora' }]]);
        const rawTraitMetadata = {
            traitBreakpoints: { Bruiser: [2, 4] },
            traitIcons: { Bruiser: 'raw-bruiser.png' }
        };

        const rawMetadataIndex = buildRawMetadataIndex({
            '{TraitRaw}': { mName: 'Bruiser' },
            '{RoleTank}': { mDisplayName: 'Tank' },
            'Characters/Set17Aurora': { mCharacterName: 'TFT17_Aurora' }
        }, 'pbe', {
            buildRawTraitMetadata: (rawJSON, source) => {
                assert.equal(rawJSON['{TraitRaw}'].mName, 'Bruiser');
                assert.equal(source, 'pbe');
                return rawTraitMetadata;
            },
            buildRawChampionRecordMap: () => rawChampionRecordMap,
            buildRawShopDataLookup: () => rawShopDataLookup
        });

        assert.deepEqual(rawMetadataIndex.hashDictionary, {
            '{TraitRaw}': 'Bruiser',
            '{RoleTank}': 'Tank'
        });
        assert.equal(rawMetadataIndex.rawTraitMetadata, rawTraitMetadata);
        assert.equal(rawMetadataIndex.rawChampionRecordMap, rawChampionRecordMap);
        assert.equal(rawMetadataIndex.rawShopDataLookup, rawShopDataLookup);
    });

    it('resolves set overrides and champion references after raw metadata indexing', () => {
        const rawShopDataLookup = new Map();
        const setOverrides = { id: 'override' };
        const setData = { champions: [{ name: 'Aurora' }] };
        const setChampionRecords = [{ displayName: 'Aurora' }];
        const setChampionIdentitySet = new Set(['aurora']);
        const championReferenceMap = new Map([['aurora', { displayName: 'Aurora' }]]);

        const setContext = resolveSetParseContext({
            rawJSON: {},
            cdragonJSON: { sets: { '17': setData } },
            parseOptions: { setOverrides },
            rawShopDataLookup,
            source: 'pbe',
            hooks: {
                detectLatestSet: () => '17',
                detectLatestSetFromRaw: () => null,
                getLatestSetData: () => setData,
                buildSetChampionRecords: (latestSetData, source, overrides) => {
                    assert.equal(latestSetData, setData);
                    assert.equal(source, 'pbe');
                    assert.equal(overrides, setOverrides);
                    return setChampionRecords;
                },
                buildChampionIdentitySet: () => setChampionIdentitySet,
                buildChampionReferenceMap: () => championReferenceMap
            }
        });

        assert.equal(setContext.latestSet, '17');
        assert.equal(setContext.setOverrides, setOverrides);
        assert.equal(setContext.setData, setData);
        assert.equal(setContext.setChampionRecords, setChampionRecords);
        assert.equal(setContext.setChampionIdentitySet, setChampionIdentitySet);
        assert.equal(setContext.championReferenceMap, championReferenceMap);
        assert.equal(setContext.rawShopDataLookup, rawShopDataLookup);
    });

    it('prepares asset lookup data from set indexes and raw trait metadata', () => {
        const rawTraitMetadata = {
            traitBreakpoints: { Bruiser: [2, 4] },
            traitIcons: { Bruiser: 'raw-bruiser.png' }
        };
        const setData = {
            traits: [
                {
                    apiName: 'BruiserApi',
                    displayName: 'Bruiser',
                    effects: [{ minUnits: 2 }]
                }
            ]
        };

        const assetLookupContext = prepareAssetLookupContext({
            assetSources: {
                rawChampionSplashesHtml: '<html>champion</html>',
                rawTraitIconsHtml: '<html>trait</html>'
            },
            setData,
            latestSet: '17',
            source: 'pbe',
            rawTraitMetadata,
            setOverrides: { id: 'override' },
            hooks: {
                buildChampionAssetMap: (rawChampionSplashesHtml, latestSet, source) => {
                    assert.equal(rawChampionSplashesHtml, '<html>champion</html>');
                    assert.equal(latestSet, '17');
                    assert.equal(source, 'pbe');
                    return new Map([['aurora', 'aurora.png']]);
                },
                buildTraitIconMap: (rawTraitIconsHtml, latestSetData, latestSet, source, metadata) => {
                    assert.equal(rawTraitIconsHtml, '<html>trait</html>');
                    assert.equal(latestSetData, setData);
                    assert.equal(latestSet, '17');
                    assert.equal(source, 'pbe');
                    assert.equal(metadata, rawTraitMetadata);
                    return { BruiserApi: 'cdragon-bruiser.png' };
                },
                normalizeBreakpoints: (effects) => effects.map((effect) => effect.minUnits),
                isExcludedTraitName: () => false,
                shouldPreferRawAsset: () => true
            }
        });

        assert.deepEqual(Array.from(assetLookupContext.championAssets), [['aurora', 'aurora.png']]);
        assert.deepEqual(assetLookupContext.traitNamesByAlias, {
            BruiserApi: 'Bruiser',
            Bruiser: 'Bruiser'
        });
        assert.deepEqual(assetLookupContext.traitBreakpoints, {
            BruiserApi: [2],
            Bruiser: [2]
        });
        assert.deepEqual(assetLookupContext.traitIcons, {
            BruiserApi: 'cdragon-bruiser.png',
            Bruiser: 'raw-bruiser.png'
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
