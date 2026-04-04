const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const DataEngine = require('../data.js');
const { NETWORK } = require('../constants.js');

function createCustomSetOverrides(unitOverrides = {}) {
    return {
        excludedUnitPatterns: [],
        excludedUnitSuffixes: [],
        excludedUnitExact: [],
        excludedTraitNames: [],
        roleOverrides: {},
        allowedUnknownRoleUnits: [],
        specialCaseNotes: {},
        unitOverrides
    };
}

describe('DataEngine data source helpers', () => {
    it('normalizes unsupported sources back to the default channel', () => {
        assert.equal(DataEngine.normalizeDataSource('latest'), 'latest');
        assert.equal(DataEngine.normalizeDataSource('pbe'), 'pbe');
        assert.equal(DataEngine.normalizeDataSource('unknown'), 'pbe');
    });
});

describe('DataEngine._detectLatestSet', () => {
    it('returns the highest numeric set key', () => {
        const cdragon = { sets: { '12': {}, '13': {}, '14': {} } };
        assert.equal(DataEngine._detectLatestSet(cdragon), '14');
    });

    it('returns null when no numeric set keys exist', () => {
        const cdragon = { sets: { latest: {}, pbe: {} } };
        assert.equal(DataEngine._detectLatestSet(cdragon), null);
    });

    it('falls back to the highest set prefix found in raw champion records', () => {
        const rawJSON = {
            'Characters/TFT16_Annie': {
                mCharacterName: 'TFT16_Annie',
                unitTagsString: 'Champion'
            },
            'Characters/TFT17_KaiSa': {
                mCharacterName: 'TFT17_KaiSa',
                unitTagsString: 'Champion'
            }
        };

        assert.equal(DataEngine._detectLatestSetFromRaw(rawJSON), '17');
    });

    it('falls back to shop and trait asset paths when champion names do not carry the current set prefix', () => {
        const rawJSON = {
            '{TraitMystic}': {
                mName: 'Mystic',
                mIconPath: 'ASSETS/UX/TraitIcons/Trait_Icon_18_Mystic.TFT_Set18.tex',
                __type: 'TftTraitData'
            },
            '{ShopKarma}': {
                mName: 'Karma',
                TeamPlannerPortraitPath: 'ASSETS/Characters/TFT18_Karma/HUD/TFT18_Karma_Square.TFT_Set18.tex',
                __type: 'TftShopData'
            },
            'Characters/Karma': {
                mCharacterName: 'Karma',
                unitTagsString: 'Champion',
                mLinkedTraits: [{ TraitData: '{TraitMystic}' }],
                mShopData: '{ShopKarma}'
            }
        };

        assert.equal(DataEngine._detectLatestSetFromRaw(rawJSON), '18');
    });
});

describe('DataEngine asset URL trust boundaries', () => {
    it('rejects absolute off-origin asset URLs', () => {
        assert.equal(
            DataEngine._assetPathToRawUrl('https://example.com/evil.png', 'pbe'),
            null
        );
    });

    it('ignores champion splash entries that resolve outside the expected asset directory', () => {
        const championAssets = DataEngine._buildChampionAssetMap(`
            <a href="https://example.com/tft17_kaisa_teamplanner_splash.png">external</a>
            <a href="tft17_kaisa_teamplanner_splash.png">safe</a>
        `, '17', 'pbe');

        assert.equal(championAssets.get('kaisa').url, 'https://raw.communitydragon.org/pbe/game/assets/ux/tft/championsplashes/patching/tft17_kaisa_teamplanner_splash.png');
    });
});

describe('DataEngine.fetchAndParse', () => {
    it('reuses a fresh cached raw snapshot without hitting Community Dragon', async () => {
        const rawChar = {
            '{TraitSentinel}': { mName: 'Sentinel' },
            '{RoleTank}': { mName: 'Tank' },
            'Characters/Set13Champion': {
                mCharacterName: 'TFT13_Skarner',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [{ TraitData: '{TraitSentinel}' }]
            }
        };
        const rawTraits = {
            sets: {
                '13': {
                    traits: [{ apiName: 'Sentinel', name: 'Sentinel', effects: [{ minUnits: 2 }] }]
                }
            }
        };

        const originalFetchJson = DataEngine._fetchJsonWithRetry;
        const originalFetchText = DataEngine._fetchTextWithRetry;
        let networkCalls = 0;
        DataEngine._fetchJsonWithRetry = async () => {
            networkCalls += 1;
            throw new Error('network should not be used');
        };
        DataEngine._fetchTextWithRetry = async () => {
            networkCalls += 1;
            throw new Error('network should not be used');
        };

        try {
            const parsed = await DataEngine.fetchAndParse({
                source: 'latest',
                readFallback: async () => ({
                    source: 'latest',
                    fetchedAt: Date.now(),
                    rawChar,
                    rawTraits
                })
            });

            assert.equal(networkCalls, 0);
            assert.equal(parsed.usedCachedSnapshot, true);
            assert.equal(parsed.dataSource, 'latest');
            assert.equal(parsed.snapshotFetchedAt > 0, true);
            assert.deepEqual(parsed.units.map((unit) => unit.id), ['Skarner']);
        } finally {
            DataEngine._fetchJsonWithRetry = originalFetchJson;
            DataEngine._fetchTextWithRetry = originalFetchText;
        }
    });

    it('refreshes Community Dragon data when the cached live snapshot is stale', async () => {
        const staleFetchedAt = Date.now() - NETWORK.DATA_CACHE_TTL_MS_BY_SOURCE.latest - 1;
        const freshRawChar = {
            '{TraitSentinel}': { mName: 'Sentinel' },
            '{RoleTank}': { mName: 'Tank' },
            'Characters/Set13Champion': {
                mCharacterName: 'TFT13_Skarner',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [{ TraitData: '{TraitSentinel}' }]
            }
        };
        const freshRawTraits = {
            sets: {
                '13': {
                    traits: [{ apiName: 'Sentinel', name: 'Sentinel', effects: [{ minUnits: 2 }] }]
                }
            }
        };

        const originalFetchJson = DataEngine._fetchJsonWithRetry;
        const originalFetchText = DataEngine._fetchTextWithRetry;
        const jsonUrls = [];
        const textUrls = [];
        let cachedSnapshot = null;

        DataEngine._fetchJsonWithRetry = async (url) => {
            jsonUrls.push(url);
            return jsonUrls.length === 1 ? freshRawChar : freshRawTraits;
        };
        DataEngine._fetchTextWithRetry = async (url) => {
            textUrls.push(url);
            return null;
        };

        try {
            const parsed = await DataEngine.fetchAndParse({
                source: 'latest',
                readFallback: async () => ({
                    source: 'latest',
                    fetchedAt: staleFetchedAt,
                    rawChar: { stale: true }
                }),
                writeFallback: async (data) => {
                    cachedSnapshot = data;
                }
            });

            assert.equal(parsed.usedCachedSnapshot, false);
            assert.equal(jsonUrls.length, 2);
            assert.equal(textUrls.length, 2);
            assert.ok(cachedSnapshot);
            assert.equal(cachedSnapshot.source, 'latest');
            assert.equal(typeof cachedSnapshot.fetchedAt, 'number');
            assert.deepEqual(parsed.units.map((unit) => unit.id), ['Skarner']);
        } finally {
            DataEngine._fetchJsonWithRetry = originalFetchJson;
            DataEngine._fetchTextWithRetry = originalFetchText;
        }
    });

    it('keeps a PBE snapshot fresh until the next 11 AM Pacific rollover', () => {
        const fetchedAt = DataEngine._getZonedDateTimestamp({
            year: 2026,
            month: 4,
            day: 3,
            hour: 10,
            minute: 30,
            second: 0
        }, 'America/Los_Angeles');

        const snapshot = {
            source: 'pbe',
            fetchedAt,
            rawChar: { ok: true }
        };

        const justBeforeRollover = DataEngine._getZonedDateTimestamp({
            year: 2026,
            month: 4,
            day: 3,
            hour: 10,
            minute: 59,
            second: 59
        }, 'America/Los_Angeles');
        const justAfterRollover = DataEngine._getZonedDateTimestamp({
            year: 2026,
            month: 4,
            day: 3,
            hour: 11,
            minute: 0,
            second: 1
        }, 'America/Los_Angeles');

        assert.equal(DataEngine._isRawDataSnapshotFresh(snapshot, 'pbe', justBeforeRollover), true);
        assert.equal(DataEngine._isRawDataSnapshotFresh(snapshot, 'pbe', justAfterRollover), false);
    });

    it('extends PBE freshness to the following day when fetched after the daily rollover', () => {
        const fetchedAt = DataEngine._getZonedDateTimestamp({
            year: 2026,
            month: 4,
            day: 3,
            hour: 12,
            minute: 0,
            second: 0
        }, 'America/Los_Angeles');

        const snapshot = {
            source: 'pbe',
            fetchedAt,
            rawChar: { ok: true }
        };

        const nextMorning = DataEngine._getZonedDateTimestamp({
            year: 2026,
            month: 4,
            day: 4,
            hour: 10,
            minute: 59,
            second: 59
        }, 'America/Los_Angeles');
        const afterNextRollover = DataEngine._getZonedDateTimestamp({
            year: 2026,
            month: 4,
            day: 4,
            hour: 11,
            minute: 0,
            second: 1
        }, 'America/Los_Angeles');

        assert.equal(DataEngine._isRawDataSnapshotFresh(snapshot, 'pbe', nextMorning), true);
        assert.equal(DataEngine._isRawDataSnapshotFresh(snapshot, 'pbe', afterNextRollover), false);
    });
});

describe('DataEngine.parseData', () => {
    it('builds units, roles, and trait breakpoints from the latest detected set', () => {
        const rawJSON = {
            '{TraitSentinel}': { mName: 'Sentinel' },
            '{RoleTank}': { mName: 'Tank' },
            'Characters/Set13Champion': {
                mCharacterName: 'TFT13_Skarner',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [{ TraitData: '{TraitSentinel}' }]
            }
        };

        const cdragonJSON = {
            sets: {
                '12': {
                    traits: [
                        {
                            apiName: 'OldTrait',
                            effects: [{ minUnits: 2 }]
                        }
                    ]
                },
                '13': {
                    traits: [
                        {
                            apiName: 'Sentinel',
                            name: 'Sentinel',
                            displayName: 'Sentinel',
                            effects: [{ minUnits: 2 }, { minUnits: 4 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);

        assert.deepEqual(parsed.units, [
            {
                id: 'Skarner',
                displayName: 'Skarner',
                cost: 3,
                role: 'Tank',
                traits: ['Sentinel'],
                traitContributions: { Sentinel: 1 },
                traitIds: ['{TraitSentinel}']
            }
        ]);
        assert.deepEqual(parsed.roles, ['Tank']);
        assert.deepEqual(parsed.traits, ['Sentinel']);
        assert.deepEqual(parsed.traitBreakpoints.Sentinel, [2, 4]);
        assert.equal(parsed.setNumber, '13');
        assert.match(parsed.dataFingerprint, /^[a-f0-9]{40}$/);
    });

    it('maps dev trait aliases to player-facing trait names when CDragon provides them', () => {
        const rawJSON = {
            '{TraitChallenger}': { mName: 'TFT17_ASTrait' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/Set17Champion': {
                mCharacterName: 'TFT17_KaiSa',
                unitTagsString: 'Champion',
                tier: 4,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitChallenger}' }]
            }
        };

        const cdragonJSON = {
            sets: {
                '17': {
                    champions: [
                        {
                            apiName: 'TFT17_Kaisa',
                            characterName: 'TFT17_Kaisa',
                            name: "Kai'Sa",
                            squareIcon: 'ASSETS/Characters/TFT17_Kaisa/Skins/Base/Images/TFT17_Kaisa_splash_tile_69.TFT_Set17.tex',
                            traits: ['Challenger']
                        },
                        {
                            apiName: 'TFT17_MissingUnit',
                            characterName: 'TFT17_MissingUnit',
                            name: 'Missing Unit',
                            squareIcon: 'ASSETS/Characters/TFT17_MissingUnit/Skins/Base/Images/TFT17_MissingUnit_splash_tile_1.TFT_Set17.tex',
                            traits: ['Challenger']
                        }
                    ],
                    traits: [
                        {
                            apiName: 'TFT17_ASTrait',
                            name: 'Challenger',
                            effects: [{ minUnits: 2 }, { minUnits: 4 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);
        assert.deepEqual(parsed.units[0].traits, ['Challenger']);
        assert.deepEqual(parsed.traits, ['Challenger']);
        assert.deepEqual(parsed.traitBreakpoints.TFT17_ASTrait, [2, 4]);
        assert.deepEqual(parsed.traitBreakpoints.Challenger, [2, 4]);
    });

    it('resolves champion and trait icon assets and reports coverage using asset listings', () => {
        const rawJSON = {
            '{TraitChallenger}': { mName: 'TFT17_ASTrait' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/Set17KaiSa': {
                mCharacterName: 'TFT17_KaiSa',
                unitTagsString: 'Champion',
                tier: 4,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitChallenger}' }]
            },
            'Characters/Set17Missing': {
                mCharacterName: 'TFT17_MissingUnit',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitChallenger}' }]
            }
        };

        const cdragonJSON = {
            sets: {
                '17': {
                    champions: [
                        {
                            apiName: 'TFT17_Kaisa',
                            characterName: 'TFT17_Kaisa',
                            name: "Kai'Sa",
                            squareIcon: 'ASSETS/Characters/TFT17_Kaisa/Skins/Base/Images/TFT17_Kaisa_splash_tile_69.TFT_Set17.tex',
                            traits: ['Challenger']
                        },
                        {
                            apiName: 'TFT17_MissingUnit',
                            characterName: 'TFT17_MissingUnit',
                            name: 'Missing Unit',
                            squareIcon: 'ASSETS/Characters/TFT17_MissingUnit/Skins/Base/Images/TFT17_MissingUnit_splash_tile_1.TFT_Set17.tex',
                            traits: ['Challenger']
                        }
                    ],
                    traits: [
                        {
                            apiName: 'TFT17_ASTrait',
                            name: 'Challenger',
                            icon: 'ASSETS/UX/TraitIcons/Trait_Icon_17_Challenger.TFT_Set17.tex',
                            effects: [{ minUnits: 2 }, { minUnits: 4 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON, {
            rawChampionSplashesHtml: `
                <a href="tft17_kaisa_teamplanner_splash.png">tft17_kaisa_teamplanner_splash.png</a>
                <a href="tft17_kaisa_mobile_small.png">tft17_kaisa_mobile_small.png</a>
                <a href="tft17_unused_mobile_small.png">tft17_unused_mobile_small.png</a>
            `
        });

        const kaiSa = parsed.units.find((unit) => unit.id === 'KaiSa');
        const missing = parsed.units.find((unit) => unit.id === 'MissingUnit');

        assert.equal(
            kaiSa.iconUrl,
            'https://raw.communitydragon.org/pbe/game/assets/characters/tft17_kaisa/skins/base/images/tft17_kaisa_splash_tile_69.tft_set17.png'
        );
        assert.equal(
            missing.iconUrl,
            'https://raw.communitydragon.org/pbe/game/assets/characters/tft17_missingunit/skins/base/images/tft17_missingunit_splash_tile_1.tft_set17.png'
        );
        assert.equal(
            parsed.traitIcons.Challenger,
            'https://raw.communitydragon.org/pbe/game/assets/ux/traiticons/trait_icon_17_challenger.tft_set17.png'
        );
        assert.deepEqual(parsed.assetValidation, {
            championAssetCount: 2,
            matchedChampionCount: 2,
            totalUnits: 2,
            missingChampionIcons: [],
            unmatchedChampionAssets: 0,
            traitIconCount: 1,
            totalTraits: 1
        });
    });

    it('uses live asset bases when parsing latest-channel data', () => {
        const rawJSON = {
            '{TraitChallenger}': { mName: 'TFT17_ASTrait' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/Set17KaiSa': {
                mCharacterName: 'TFT17_KaiSa',
                unitTagsString: 'Champion',
                tier: 4,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitChallenger}' }]
            }
        };

        const cdragonJSON = {
            sets: {
                '17': {
                    champions: [
                        {
                            apiName: 'TFT17_Kaisa',
                            characterName: 'TFT17_Kaisa',
                            name: "Kai'Sa",
                            squareIcon: 'ASSETS/Characters/TFT17_Kaisa/Skins/Base/Images/TFT17_Kaisa_splash_tile_69.TFT_Set17.tex',
                            traits: ['Challenger']
                        }
                    ],
                    traits: [
                        {
                            apiName: 'TFT17_ASTrait',
                            name: 'Challenger',
                            icon: 'ASSETS/UX/TraitIcons/Trait_Icon_17_Challenger.TFT_Set17.tex',
                            effects: [{ minUnits: 2 }, { minUnits: 4 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON, {}, { source: 'latest' });

        assert.equal(
            parsed.units[0].iconUrl,
            'https://raw.communitydragon.org/latest/game/assets/characters/tft17_kaisa/skins/base/images/tft17_kaisa_splash_tile_69.tft_set17.png'
        );
        assert.equal(
            parsed.traitIcons.Challenger,
            'https://raw.communitydragon.org/latest/game/assets/ux/traiticons/trait_icon_17_challenger.tft_set17.png'
        );
        assert.equal(parsed.dataSource, 'latest');
    });

    it('normalizes duplicate and invalid breakpoint values', () => {
        const rawJSON = {
            '{TraitBruiser}': { mName: 'Bruiser' },
            '{RoleTank}': { mName: 'Tank' },
            'Characters/Set14Champion': {
                mCharacterName: 'TFT14_DrMundo',
                unitTagsString: 'Champion',
                tier: 4,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [{ TraitData: '{TraitBruiser}' }]
            }
        };

        const cdragonJSON = {
            sets: {
                '14': {
                    traits: [
                        {
                            apiName: 'Bruiser',
                            effects: [
                                { minUnits: 4 },
                                { minUnits: 2 },
                                { minUnits: 4 },
                                { minUnits: 0 },
                                {}
                            ]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);
        assert.deepEqual(parsed.traitBreakpoints.Bruiser, [2, 4]);
    });

    it('returns parsed units even when CDragon trait data is unavailable', () => {
        const rawJSON = {
            '{TraitInvoker}': { mName: 'Invoker' },
            '{RoleCarry}': { mName: 'Carry' },
            '{ShopKarma}': {
                TeamPlannerPortraitPath: 'ASSETS/Characters/TFT12_Karma/HUD/TFT12_Karma_Square.TFT_Set12.tex'
            },
            'Characters/Set12Champion': {
                mCharacterName: 'TFT12_Karma',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mShopData: '{ShopKarma}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null);

        assert.equal(parsed.units.length, 1);
        assert.equal(parsed.units[0].id, 'Karma');
        assert.equal(parsed.units[0].displayName, 'Karma');
        assert.equal(
            parsed.units[0].iconUrl,
            'https://raw.communitydragon.org/pbe/game/assets/characters/tft12_karma/hud/tft12_karma_square.tft_set12.png'
        );
        assert.deepEqual(parsed.traitBreakpoints, {});
        assert.equal(parsed.setNumber, '12');
        assert.match(parsed.dataFingerprint, /^[a-f0-9]{40}$/);
    });

    it('scopes parsed units to the latest raw set when CDragon is unavailable', () => {
        const rawJSON = {
            '{TraitInvoker}': { mName: 'Invoker' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/TFT16_Annie': {
                mCharacterName: 'TFT16_Annie',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            },
            'Characters/TFT17_Karma': {
                mCharacterName: 'TFT17_Karma',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null);

        assert.equal(parsed.setNumber, '17');
        assert.deepEqual(parsed.units.map((unit) => unit.id), ['Karma']);
    });

    it('scopes parsed units using raw asset signals when champion names carry stale set prefixes', () => {
        const rawJSON = {
            '{TraitMystic}': {
                mName: 'Mystic',
                mIconPath: 'ASSETS/UX/TraitIcons/Trait_Icon_18_Mystic.TFT_Set18.tex',
                mConditionalTraitSets: [{ minUnits: 2 }],
                __type: 'TftTraitData'
            },
            '{TraitInvoker}': {
                mName: 'Invoker',
                mIconPath: 'ASSETS/UX/TraitIcons/Trait_Icon_17_Invoker.TFT_Set17.tex',
                mConditionalTraitSets: [{ minUnits: 2 }],
                __type: 'TftTraitData'
            },
            '{RoleCarry}': { mName: 'Carry' },
            '{ShopKarma}': {
                mName: 'Karma',
                TeamPlannerPortraitPath: 'ASSETS/Characters/TFT18_Karma/HUD/TFT18_Karma_Square.TFT_Set18.tex',
                __type: 'TftShopData'
            },
            '{ShopAnnie}': {
                mName: 'TFT17_Annie',
                TeamPlannerPortraitPath: 'ASSETS/Characters/TFT17_Annie/HUD/TFT17_Annie_Square.TFT_Set17.tex',
                __type: 'TftShopData'
            },
            'Characters/StaleKarma': {
                mCharacterName: 'TFT17_Karma',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mShopData: '{ShopKarma}',
                mLinkedTraits: [{ TraitData: '{TraitMystic}' }]
            },
            'Characters/TFT17_Annie': {
                mCharacterName: 'TFT17_Annie',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mShopData: '{ShopAnnie}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null);

        assert.equal(parsed.setNumber, '18');
        assert.deepEqual(parsed.units.map((unit) => unit.id), ['Karma']);
    });

    it('scopes parsed units to the detected set when older-set raw records share the same champion alias', () => {
        const rawJSON = {
            '{TraitStar}': { mName: 'Stargazer' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/TFT16_Annie': {
                mCharacterName: 'TFT16_Annie',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitStar}' }]
            },
            'Characters/TFT17_KaiSa': {
                mCharacterName: 'TFT17_KaiSa',
                unitTagsString: 'Champion',
                tier: 4,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitStar}' }]
            }
        };

        const cdragonJSON = {
            sets: {
                '16': {
                    champions: [
                        {
                            apiName: 'TFT16_Annie',
                            characterName: 'TFT16_Annie',
                            name: 'Annie',
                            traits: ['OldTrait']
                        }
                    ],
                    traits: [
                        {
                            apiName: 'OldTrait',
                            displayName: 'OldTrait',
                            effects: [{ minUnits: 2 }]
                        }
                    ]
                },
                '17': {
                    champions: [
                        {
                            apiName: 'TFT17_Annie',
                            characterName: 'TFT17_Annie',
                            name: 'Annie',
                            traits: ['Stargazer']
                        },
                        {
                            apiName: 'TFT17_Kaisa',
                            characterName: 'TFT17_Kaisa',
                            name: "Kai'Sa",
                            traits: ['Stargazer']
                        }
                    ],
                    traits: [
                        {
                            apiName: 'Stargazer',
                            displayName: 'Stargazer',
                            effects: [{ minUnits: 2 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);

        assert.deepEqual(parsed.units.map((unit) => unit.id), ['KaiSa']);
        assert.deepEqual(parsed.traits, ['Stargazer']);
    });

    it('falls back to raw trait breakpoint and icon data when CDragon is unavailable', () => {
        const rawJSON = {
            '{TraitInvoker}': {
                mName: 'Invoker',
                mIconPath: 'ASSETS/UX/TraitIcons/Trait_Icon_17_Invoker.TFT_Set17.tex',
                mConditionalTraitSets: [{ minUnits: 2 }, { minUnits: 4 }],
                __type: 'TftTraitData'
            },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/Set12Champion': {
                mCharacterName: 'TFT12_Karma',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null);

        assert.deepEqual(parsed.units[0].traits, ['Invoker']);
        assert.deepEqual(parsed.traitBreakpoints.Invoker, [2, 4]);
        assert.equal(
            parsed.traitIcons.Invoker,
            'https://raw.communitydragon.org/pbe/game/assets/ux/traiticons/trait_icon_17_invoker.tft_set17.png'
        );
    });

    it('matches raw trait icon directories when raw trait data lacks a direct icon path', () => {
        const rawJSON = {
            '{TraitInvoker}': {
                mName: 'Invoker',
                mConditionalTraitSets: [{ minUnits: 2 }, { minUnits: 4 }],
                __type: 'TftTraitData'
            },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/TFT17_Karma': {
                mCharacterName: 'TFT17_Karma',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null, {
            rawTraitIconsHtml: '<a href="trait_icon_17_invoker.png">trait_icon_17_invoker.png</a>'
        });

        assert.equal(
            parsed.traitIcons.Invoker,
            'https://raw.communitydragon.org/pbe/game/assets/ux/traiticons/trait_icon_17_invoker.png'
        );
    });

    it('uses raw shop data portrait paths for champion icons when CDragon metadata is unavailable', () => {
        const rawJSON = {
            '{TraitInvoker}': {
                mName: 'Invoker'
            },
            '{RoleCarry}': { mName: 'Carry' },
            '{ShopKarma}': {
                mName: 'TFT17_Karma',
                TeamPlannerPortraitPath: 'ASSETS/Characters/TFT17_Karma/HUD/TFT17_Karma_Square.TFT_Set17.tex',
                SquareSplashPath: 'ASSETS/Characters/TFT17_Karma/Skins/Base/Images/TFT17_Karma_splash_tile_11.TFT_Set17.tex',
                __type: 'TftShopData'
            },
            'Characters/TFT17_Karma': {
                mCharacterName: 'TFT17_Karma',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mShopData: '{ShopKarma}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null);

        assert.equal(
            parsed.units[0].iconUrl,
            'https://raw.communitydragon.org/pbe/game/assets/characters/tft17_karma/hud/tft17_karma_square.tft_set17.png'
        );
    });

    it('uses reverse raw shop lookups when champion records omit mShopData', () => {
        const rawJSON = {
            '{TraitInvoker}': {
                mName: 'Invoker'
            },
            '{RoleCarry}': { mName: 'Carry' },
            '{ShopKarma}': {
                mName: 'TFT17_Karma',
                TeamPlannerPortraitPath: 'ASSETS/Characters/TFT17_Karma/HUD/TFT17_Karma_Square.TFT_Set17.tex',
                __type: 'TftShopData'
            },
            'Characters/TFT17_Karma': {
                mCharacterName: 'TFT17_Karma',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null);

        assert.equal(
            parsed.units[0].iconUrl,
            'https://raw.communitydragon.org/pbe/game/assets/characters/tft17_karma/hud/tft17_karma_square.tft_set17.png'
        );
    });

    it('prefers authoritative raw asset paths when CDragon metadata points at a different set', () => {
        const rawJSON = {
            '{TraitInvoker}': {
                mName: 'Invoker',
                mIconPath: 'ASSETS/UX/TraitIcons/Trait_Icon_17_Invoker.TFT_Set17.tex',
                mConditionalTraitSets: [{ minUnits: 2 }],
                __type: 'TftTraitData'
            },
            '{RoleCarry}': { mName: 'Carry' },
            '{ShopKarma}': {
                mName: 'TFT17_Karma',
                TeamPlannerPortraitPath: 'ASSETS/Characters/TFT17_Karma/HUD/TFT17_Karma_Square.TFT_Set17.tex',
                __type: 'TftShopData'
            },
            'Characters/TFT17_Karma': {
                mCharacterName: 'TFT17_Karma',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mShopData: '{ShopKarma}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            }
        };

        const cdragonJSON = {
            sets: {
                '17': {
                    champions: [
                        {
                            apiName: 'TFT17_Karma',
                            characterName: 'TFT17_Karma',
                            name: 'Karma',
                            squareIcon: 'ASSETS/Characters/TFT16_Karma/Skins/Base/Images/TFT16_Karma_splash_tile_11.TFT_Set16.tex',
                            traits: ['Invoker']
                        }
                    ],
                    traits: [
                        {
                            apiName: 'Invoker',
                            name: 'Invoker',
                            icon: 'ASSETS/UX/TraitIcons/Trait_Icon_16_Invoker.TFT_Set16.tex',
                            effects: [{ minUnits: 2 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);

        assert.equal(
            parsed.units[0].iconUrl,
            'https://raw.communitydragon.org/pbe/game/assets/characters/tft17_karma/hud/tft17_karma_square.tft_set17.png'
        );
        assert.equal(
            parsed.traitIcons.Invoker,
            'https://raw.communitydragon.org/pbe/game/assets/ux/traiticons/trait_icon_17_invoker.tft_set17.png'
        );
    });

    it('prefers higher-quality same-set raw shop portraits over same-set metadata splash tiles', () => {
        const rawJSON = {
            '{TraitInvoker}': {
                mName: 'Invoker'
            },
            '{RoleCarry}': { mName: 'Carry' },
            '{ShopKarma}': {
                mName: 'TFT17_Karma',
                TeamPlannerPortraitPath: 'ASSETS/Characters/TFT17_Karma/HUD/TFT17_Karma_Square.TFT_Set17.tex',
                __type: 'TftShopData'
            },
            'Characters/TFT17_Karma': {
                mCharacterName: 'TFT17_Karma',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mShopData: '{ShopKarma}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            }
        };

        const cdragonJSON = {
            sets: {
                '17': {
                    champions: [
                        {
                            apiName: 'TFT17_Karma',
                            characterName: 'TFT17_Karma',
                            name: 'Karma',
                            squareIcon: 'ASSETS/Characters/TFT17_Karma/Skins/Base/Images/TFT17_Karma_splash_tile_11.TFT_Set17.tex',
                            traits: ['Invoker']
                        }
                    ],
                    traits: [
                        {
                            apiName: 'Invoker',
                            name: 'Invoker',
                            effects: [{ minUnits: 2 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);

        assert.equal(
            parsed.units[0].iconUrl,
            'https://raw.communitydragon.org/pbe/game/assets/characters/tft17_karma/hud/tft17_karma_square.tft_set17.png'
        );
    });

    it('changes the data fingerprint when the parsed dataset changes', () => {
        const rawJSON = {
            '{TraitInvoker}': { mName: 'Invoker' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/Set12Champion': {
                mCharacterName: 'TFT12_Karma',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitInvoker}' }]
            }
        };

        const parsedA = DataEngine.parseData(rawJSON, null);
        const parsedB = DataEngine.parseData({
            ...rawJSON,
            'Characters/Set12Champion': {
                ...rawJSON['Characters/Set12Champion'],
                tier: 3
            }
        }, null);

        assert.notEqual(parsedA.dataFingerprint, parsedB.dataFingerprint);
    });

    it('skips non-playable god records from the unit list', () => {
        const rawJSON = {
            '{TraitDuelist}': { mName: 'Duelist' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/God_Ahri': {
                mCharacterName: 'God_Ahri',
                unitTagsString: 'Champion',
                tier: 4,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitDuelist}' }]
            },
            'Characters/TFT17_Ahri': {
                mCharacterName: 'TFT17_Ahri',
                unitTagsString: 'Champion',
                tier: 4,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitDuelist}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null);

        assert.deepEqual(parsed.units.map((unit) => unit.id), ['Ahri']);
    });

    it('skips enemy-only variants that would otherwise duplicate the champion label', () => {
        const rawJSON = {
            '{TraitBastion}': { mName: 'Bastion' },
            '{RoleTank}': { mName: 'Tank' },
            'Characters/TFT17_Enemy_Aatrox': {
                mCharacterName: 'TFT17_Enemy_Aatrox',
                unitTagsString: 'Champion',
                tier: 5,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: []
            },
            'Characters/TFT17_Aatrox': {
                mCharacterName: 'TFT17_Aatrox',
                unitTagsString: 'Champion',
                tier: 1,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [{ TraitData: '{TraitBastion}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null);
        assert.deepEqual(parsed.units.map((unit) => unit.id), ['Aatrox']);
        assert.deepEqual(parsed.units.map((unit) => unit.displayName), ['Aatrox']);
    });

    it('skips internal clone, summon, and prop variants from the board pool', () => {
        const rawJSON = {
            '{TraitVanguard}': { mName: 'Vanguard' },
            '{RoleTank}': { mName: 'Tank' },
            'Characters/TFT17_MissFortune_TraitClone': {
                mCharacterName: 'TFT17_MissFortune_TraitClone',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [{ TraitData: '{TraitVanguard}' }]
            },
            'Characters/TFT17_IvernMinion': {
                mCharacterName: 'TFT17_IvernMinion',
                unitTagsString: 'Champion',
                tier: 2,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [{ TraitData: '{TraitVanguard}' }]
            },
            'Characters/TFT17_ShenProp': {
                mCharacterName: 'TFT17_ShenProp',
                unitTagsString: 'Champion',
                tier: 1,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [{ TraitData: '{TraitVanguard}' }]
            },
            'Characters/TFT17_Summon': {
                mCharacterName: 'TFT17_Summon',
                unitTagsString: 'Champion',
                tier: 1,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [{ TraitData: '{TraitVanguard}' }]
            },
            'Characters/TFT17_Leona': {
                mCharacterName: 'TFT17_Leona',
                unitTagsString: 'Champion',
                tier: 4,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [{ TraitData: '{TraitVanguard}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null);
        assert.deepEqual(parsed.units.map((unit) => unit.id), ['Leona']);
    });

    it('drops placeholder choice traits so they do not inflate scoring', () => {
        const rawJSON = {
            '{TraitReal}': { mName: 'TFT17_MissFortuneUniqueTrait' },
            '{TraitPlaceholder}': { mName: 'TFT17_MissFortuneUndeterminedTrait' },
            '{TraitConduit}': { mName: 'Conduit' },
            '{TraitChallenger}': { mName: 'Challenger' },
            '{TraitReplicator}': { mName: 'Replicator' },
            'Characters/TFT17_MissFortune': {
                mCharacterName: 'TFT17_MissFortune',
                unitTagsString: 'Champion',
                tier: 3,
                mLinkedTraits: [
                    { TraitData: '{TraitReal}' },
                    { TraitData: '{TraitPlaceholder}' }
                ]
            },
            'Characters/TFT17_MissFortune_TraitClone': {
                mCharacterName: 'TFT17_MissFortune_TraitClone',
                unitTagsString: 'Champion',
                tier: 3,
                mLinkedTraits: [
                    { TraitData: '{TraitConduit}' },
                    { TraitData: '{TraitChallenger}' },
                    { TraitData: '{TraitReplicator}' }
                ]
            }
        };

        const cdragonJSON = {
            sets: {
                '17': {
                    traits: [
                        {
                            apiName: 'TFT17_MissFortuneUniqueTrait',
                            displayName: 'Gun Goddess',
                            effects: [{ minUnits: 1 }]
                        },
                        {
                            apiName: 'TFT17_MissFortuneUndeterminedTrait',
                            displayName: 'Choose Trait',
                            effects: [{ minUnits: 1 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);
        assert.deepEqual(parsed.units[0].traits, ['Gun Goddess']);
        assert.deepEqual(parsed.traits, ['Challenger', 'Conduit', 'Gun Goddess', 'Replicator']);
        assert.deepEqual(
            parsed.units[0].variants.map((variant) => variant.traits),
            [
                ['Gun Goddess', 'Conduit'],
                ['Gun Goddess', 'Challenger'],
                ['Gun Goddess', 'Replicator']
            ]
        );
    });

    it('auto-detects selectable trait variants from trait-clone records when no manual unit override exists', () => {
        const rawJSON = {
            '{TraitFixed}': { mName: 'TFT17_SwitcherUniqueTrait' },
            '{TraitPlaceholder}': { mName: 'TFT17_SwitcherUndeterminedTrait' },
            '{TraitConduit}': { mName: 'TFT17_ManaTrait' },
            '{TraitReplicator}': { mName: 'TFT17_APTrait' },
            '{RoleTank}': { mName: 'Tank' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/TFT17_Switcher': {
                mCharacterName: 'TFT17_Switcher',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleTank}',
                mLinkedTraits: [
                    { TraitData: '{TraitFixed}' },
                    { TraitData: '{TraitPlaceholder}' }
                ]
            },
            'Characters/TFT17_Switcher_TraitClone': {
                mCharacterName: 'TFT17_Switcher_TraitClone',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [
                    { TraitData: '{TraitConduit}' },
                    { TraitData: '{TraitReplicator}' }
                ]
            }
        };

        const cdragonJSON = {
            sets: {
                '17': {
                    traits: [
                        {
                            apiName: 'TFT17_SwitcherUniqueTrait',
                            displayName: 'Gun Goddess',
                            effects: [{ minUnits: 1 }]
                        },
                        {
                            apiName: 'TFT17_SwitcherUndeterminedTrait',
                            displayName: 'Choose Trait',
                            effects: [{ minUnits: 1 }]
                        },
                        {
                            apiName: 'TFT17_ManaTrait',
                            displayName: 'Conduit',
                            effects: [{ minUnits: 2 }]
                        },
                        {
                            apiName: 'TFT17_APTrait',
                            displayName: 'Replicator',
                            effects: [{ minUnits: 2 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);

        assert.deepEqual(parsed.units[0].traits, ['Gun Goddess']);
        assert.deepEqual(
            parsed.units[0].variants.map((variant) => variant.label),
            ['Conduit Mode', 'Replicator Mode']
        );
        assert.deepEqual(
            parsed.units[0].variants.map((variant) => variant.role),
            ['Carry', 'Carry']
        );
        assert.deepEqual(parsed.traits, ['Conduit', 'Gun Goddess', 'Replicator']);
    });

    it('promotes a stable variant role when the base unit role is unknown', () => {
        const rawJSON = {
            '{TraitFixed}': { mName: 'TFT17_SwitcherUniqueTrait' },
            '{TraitPlaceholder}': { mName: 'TFT17_SwitcherUndeterminedTrait' },
            '{TraitConduit}': { mName: 'TFT17_ManaTrait' },
            '{TraitReplicator}': { mName: 'TFT17_APTrait' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/TFT17_Switcher': {
                mCharacterName: 'TFT17_Switcher',
                unitTagsString: 'Champion',
                tier: 3,
                mLinkedTraits: [
                    { TraitData: '{TraitFixed}' },
                    { TraitData: '{TraitPlaceholder}' }
                ]
            },
            'Characters/TFT17_Switcher_TraitClone': {
                mCharacterName: 'TFT17_Switcher_TraitClone',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [
                    { TraitData: '{TraitConduit}' },
                    { TraitData: '{TraitReplicator}' }
                ]
            }
        };

        const cdragonJSON = {
            sets: {
                '17': {
                    traits: [
                        {
                            apiName: 'TFT17_SwitcherUniqueTrait',
                            displayName: 'Gun Goddess',
                            effects: [{ minUnits: 1 }]
                        },
                        {
                            apiName: 'TFT17_SwitcherUndeterminedTrait',
                            displayName: 'Choose Trait',
                            effects: [{ minUnits: 1 }]
                        },
                        {
                            apiName: 'TFT17_ManaTrait',
                            displayName: 'Conduit',
                            effects: [{ minUnits: 2 }]
                        },
                        {
                            apiName: 'TFT17_APTrait',
                            displayName: 'Replicator',
                            effects: [{ minUnits: 2 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);

        assert.equal(parsed.units[0].role, 'Carry');
        assert.deepEqual(parsed.roles, ['Carry']);
    });

    it('preserves unit-level conditional effects from custom overrides', () => {
        const rawJSON = {
            '{TraitCore}': { mName: 'Core' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/TFT17_Switcher': {
                mCharacterName: 'TFT17_Switcher',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitCore}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null, {}, {
            setOverrides: createCustomSetOverrides({
                Switcher: {
                    conditionalEffects: [
                        {
                            conditions: {
                                requiredActiveTraits: ['Guardian']
                            },
                            traitContributions: {
                                Arcane: 1
                            }
                        }
                    ]
                }
            })
        });

        assert.deepEqual(parsed.units[0].conditionalEffects, [
            {
                conditions: {
                    requiredActiveTraits: ['Guardian']
                },
                traitContributions: {
                    Arcane: 1
                }
            }
        ]);
        assert.deepEqual(parsed.traits, ['Arcane', 'Core']);
    });

    it('preserves unit-level conditional profiles from custom overrides', () => {
        const rawJSON = {
            '{TraitCore}': { mName: 'Core' },
            '{TraitShadow}': { mName: 'Shadow' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/TFT17_Switcher': {
                mCharacterName: 'TFT17_Switcher',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [
                    { TraitData: '{TraitCore}' },
                    { TraitData: '{TraitShadow}' }
                ]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null, {}, {
            setOverrides: createCustomSetOverrides({
                Switcher: {
                    conditionalProfiles: [
                        {
                            conditions: {
                                requiredActiveTraits: ['Guardian']
                            },
                            addTraits: ['Arcane'],
                            removeTraits: ['Shadow']
                        }
                    ]
                }
            })
        });

        assert.deepEqual(parsed.units[0].conditionalProfiles, [
            {
                conditions: {
                    requiredActiveTraits: ['Guardian']
                },
                traits: ['Core', 'Arcane'],
                traitContributions: {
                    Core: 1,
                    Arcane: 1
                }
            }
        ]);
        assert.deepEqual(parsed.traits, ['Arcane', 'Core', 'Shadow']);
    });

    it('preserves selection-group conditional effects from custom overrides', () => {
        const rawJSON = {
            '{TraitCore}': { mName: 'Core' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/TFT17_Switcher': {
                mCharacterName: 'TFT17_Switcher',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [{ TraitData: '{TraitCore}' }]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null, {}, {
            setOverrides: createCustomSetOverrides({
                Switcher: {
                    selectionGroups: [
                        {
                            id: 'mode',
                            options: [
                                {
                                    id: 'arcane',
                                    label: 'Arcane Mode',
                                    addTraits: ['Arcane'],
                                    conditionalEffects: [
                                        {
                                            conditions: {
                                                requiredUnits: ['Warden']
                                            },
                                            traitContributions: {
                                                Arcane: 1
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            })
        });

        assert.deepEqual(parsed.units[0].variants, [
            {
                id: 'arcane',
                label: 'Arcane Mode',
                role: 'Carry',
                traits: ['Core', 'Arcane'],
                traitContributions: {
                    Core: 1,
                    Arcane: 1
                },
                conditionalEffects: [
                    {
                        conditions: {
                            requiredUnits: ['Warden']
                        },
                        traitContributions: {
                            Arcane: 1
                        }
                    }
                ]
            }
        ]);
        assert.deepEqual(parsed.traits, ['Arcane', 'Core']);
    });

    it('preserves selection-group conditional profiles from custom overrides', () => {
        const rawJSON = {
            '{TraitCore}': { mName: 'Core' },
            '{TraitShadow}': { mName: 'Shadow' },
            '{RoleCarry}': { mName: 'Carry' },
            'Characters/TFT17_Switcher': {
                mCharacterName: 'TFT17_Switcher',
                unitTagsString: 'Champion',
                tier: 3,
                CharacterRole: '{RoleCarry}',
                mLinkedTraits: [
                    { TraitData: '{TraitCore}' },
                    { TraitData: '{TraitShadow}' }
                ]
            }
        };

        const parsed = DataEngine.parseData(rawJSON, null, {}, {
            setOverrides: createCustomSetOverrides({
                Switcher: {
                    selectionGroups: [
                        {
                            id: 'mode',
                            options: [
                                {
                                    id: 'arcane',
                                    label: 'Arcane Mode',
                                    addTraits: ['Arcane'],
                                    conditionalProfiles: [
                                        {
                                            conditions: {
                                                requiredUnits: ['Warden']
                                            },
                                            removeTraits: ['Shadow']
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            })
        });

        assert.deepEqual(parsed.units[0].variants, [
            {
                id: 'arcane',
                label: 'Arcane Mode',
                role: 'Carry',
                traits: ['Core', 'Shadow', 'Arcane'],
                traitContributions: {
                    Core: 1,
                    Shadow: 1,
                    Arcane: 1
                },
                conditionalProfiles: [
                    {
                        conditions: {
                            requiredUnits: ['Warden']
                        },
                        traits: ['Core', 'Arcane'],
                        traitContributions: {
                            Core: 1,
                            Arcane: 1
                        }
                    }
                ]
            }
        ]);
        assert.deepEqual(parsed.traits, ['Arcane', 'Core', 'Shadow']);
    });

    it('keeps tracked special-role units as Unknown without surfacing Unknown as a selectable role', () => {
        const rawJSON = {
            '{TraitReal}': { mName: 'TFT17_MissFortuneUniqueTrait' },
            '{TraitPlaceholder}': { mName: 'TFT17_MissFortuneUndeterminedTrait' },
            '{TraitConduit}': { mName: 'Conduit' },
            '{TraitChallenger}': { mName: 'Challenger' },
            '{TraitReplicator}': { mName: 'Replicator' },
            'Characters/TFT17_MissFortune': {
                mCharacterName: 'TFT17_MissFortune',
                unitTagsString: 'Champion',
                tier: 3,
                mLinkedTraits: [
                    { TraitData: '{TraitReal}' },
                    { TraitData: '{TraitPlaceholder}' }
                ]
            },
            'Characters/TFT17_MissFortune_TraitClone': {
                mCharacterName: 'TFT17_MissFortune_TraitClone',
                unitTagsString: 'Champion',
                tier: 3,
                mLinkedTraits: [
                    { TraitData: '{TraitConduit}' },
                    { TraitData: '{TraitChallenger}' },
                    { TraitData: '{TraitReplicator}' }
                ]
            }
        };

        const cdragonJSON = {
            sets: {
                '17': {
                    champions: [
                        {
                            apiName: 'TFT17_MissFortune',
                            characterName: 'TFT17_MissFortune',
                            name: 'Miss Fortune',
                            role: null,
                            traits: ['TFT17_MissFortuneUniqueTrait']
                        }
                    ],
                    traits: [
                        {
                            apiName: 'TFT17_MissFortuneUniqueTrait',
                            displayName: 'Gun Goddess',
                            effects: [{ minUnits: 1 }]
                        },
                        {
                            apiName: 'TFT17_MissFortuneUndeterminedTrait',
                            displayName: 'Choose Trait',
                            effects: [{ minUnits: 1 }]
                        }
                    ]
                }
            }
        };

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);

        assert.equal(parsed.units[0].role, 'Unknown');
        assert.equal(parsed.roles.includes('Unknown'), false);
        assert.deepEqual(parsed.traits, ['Challenger', 'Conduit', 'Gun Goddess', 'Replicator']);
        assert.deepEqual(
            parsed.units[0].variants.map((variant) => variant.label),
            ['Conduit Mode', 'Challenger Mode', 'Replicator Mode']
        );
        assert.deepEqual(
            parsed.units[0].variants.map((variant) => variant.traits),
            [
                ['Gun Goddess', 'Conduit'],
                ['Gun Goddess', 'Challenger'],
                ['Gun Goddess', 'Replicator']
            ]
        );
    });
});
