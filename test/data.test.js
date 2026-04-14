const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TextEncoder } = require('node:util');
const DataEngine = require('../data.js');
const { NETWORK } = require('../constants.js');

function createHeaders(headerMap = {}) {
    const normalized = Object.fromEntries(
        Object.entries(headerMap).map(([key, value]) => [String(key).toLowerCase(), value])
    );

    return {
        get(name) {
            return normalized[String(name).toLowerCase()] ?? null;
        }
    };
}

function createStreamingResponse(chunks, options = {}) {
    const encoder = new TextEncoder();
    const encodedChunks = chunks.map((chunk) => chunk instanceof Uint8Array ? chunk : encoder.encode(chunk));
    let index = 0;
    let cancelCount = 0;

    return {
        response: {
            ok: true,
            headers: createHeaders(options.headers),
            body: {
                getReader() {
                    return {
                        async read() {
                            if (index >= encodedChunks.length) {
                                return { done: true, value: undefined };
                            }

                            const value = encodedChunks[index];
                            index += 1;
                            return { done: false, value };
                        },
                        async cancel() {
                            cancelCount += 1;
                        },
                        releaseLock() {}
                    };
                }
            },
            text: async () => {
                throw new Error('stream response should not fall back to text()');
            }
        },
        getCancelCount() {
            return cancelCount;
        }
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

        let networkCalls = 0;
        const fetchJson = async () => {
            networkCalls += 1;
            throw new Error('network should not be used');
        };
        const fetchText = async () => {
            networkCalls += 1;
            throw new Error('network should not be used');
        };

        const parsed = await DataEngine.fetchAndParse({
            source: 'latest',
            fetchJson,
            fetchText,
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

        const jsonUrls = [];
        const textUrls = [];
        let cachedSnapshot = null;

        const fetchJson = async (url) => {
            jsonUrls.push(url);
            return jsonUrls.length === 1 ? freshRawChar : freshRawTraits;
        };
        const fetchText = async (url) => {
            textUrls.push(url);
            return null;
        };

        const parsed = await DataEngine.fetchAndParse({
            source: 'latest',
            fetchJson,
            fetchText,
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

    it('falls back to a fresh cached snapshot when Community Dragon is unreachable', async () => {
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

        const parsed = await DataEngine.fetchAndParse({
            source: 'latest',
            fetchJson: async () => {
                throw new Error('network down');
            },
            fetchText: async () => {
                throw new Error('network down');
            },
            readFallback: async () => ({
                source: 'latest',
                fetchedAt: Date.now(),
                rawChar,
                rawTraits
            })
        });

        assert.equal(parsed.usedCachedSnapshot, true);
        assert.deepEqual(parsed.units.map((unit) => unit.id), ['Skarner']);
    });

    it('rejects stale cached snapshots when Community Dragon is unreachable', async () => {
        const staleFetchedAt = Date.now() - NETWORK.DATA_CACHE_TTL_MS_BY_SOURCE.latest - 1;

        await assert.rejects(
            DataEngine.fetchAndParse({
                source: 'latest',
                fetchJson: async () => {
                    throw new Error('network down');
                },
                fetchText: async () => {
                    throw new Error('network down');
                },
                readFallback: async () => ({
                    source: 'latest',
                    fetchedAt: staleFetchedAt,
                    rawChar: { stale: true }
                })
            }),
            /no fresh offline data available/i
        );
    });
});

describe('DataEngine._fetchWithRetry', () => {
    it('rejects oversized Content-Length values before reading the body', async () => {
        let fetchCalls = 0;
        let readerRequested = false;
        const jsonLimit = NETWORK.MAX_RESPONSE_BYTES_BY_TYPE.json;

        const fetchOversizedHeader = async () => {
            fetchCalls += 1;
            return {
                ok: true,
                headers: createHeaders({
                    'content-length': String(jsonLimit + 1)
                }),
                body: {
                    getReader() {
                        readerRequested = true;
                        throw new Error('body reader should not be requested');
                    }
                },
                text: async () => {
                    throw new Error('text() should not be called');
                }
            };
        };

        await assert.rejects(
            DataEngine._fetchWithRetry('https://example.com/too-large.json', 'json', fetchOversizedHeader, NETWORK),
            /Response too large for json/i
        );

        assert.equal(fetchCalls, 1);
        assert.equal(readerRequested, false);
    });

    it('rejects streamed responses that cross the size limit and does not retry', async () => {
        let fetchCalls = 0;
        const streamedResponse = createStreamingResponse(['abcd', 'efgh']);

        const fetchOversizedStream = async () => {
            fetchCalls += 1;
            return streamedResponse.response;
        };

        await assert.rejects(
            DataEngine._fetchWithRetry('https://example.com/too-large.txt', 'text', fetchOversizedStream, {
                MAX_RETRIES: 3,
                RETRY_BASE_DELAY_MS: 1,
                FETCH_TIMEOUT_MS: 50,
                MAX_RESPONSE_BYTES_BY_TYPE: {
                    text: 6
                }
            }),
            /Response too large for text/i
        );

        assert.equal(fetchCalls, 1);
        assert.equal(streamedResponse.getCancelCount(), 1);
    });

    it('rejects oversized fallback text responses after measuring bytes and does not retry', async () => {
        let fetchCalls = 0;
        const fetchOversizedText = async () => {
            fetchCalls += 1;
            return {
                ok: true,
                headers: createHeaders(),
                body: null,
                text: async () => 'abcdefgh'
            };
        };

        await assert.rejects(
            DataEngine._fetchWithRetry('https://example.com/too-large-fallback.txt', 'text', fetchOversizedText, {
                MAX_RETRIES: 3,
                RETRY_BASE_DELAY_MS: 1,
                FETCH_TIMEOUT_MS: 50,
                MAX_RESPONSE_BYTES_BY_TYPE: {
                    text: 6
                }
            }),
            /Response too large for text/i
        );

        assert.equal(fetchCalls, 1);
    });

    it('keeps normal JSON and text responses working with bounded reads', async () => {
        const fetchJson = async () => createStreamingResponse(['{"ok":', 'true}'], {
            headers: {
                'content-length': '11'
            }
        }).response;

        const fetchText = async () => ({
            ok: true,
            headers: createHeaders({
                'content-length': '5'
            }),
            body: null,
            text: async () => 'hello'
        });

        const jsonResult = await DataEngine._fetchWithRetry('https://example.com/data.json', 'json', fetchJson, NETWORK);
        const textResult = await DataEngine._fetchWithRetry('https://example.com/data.txt', 'text', fetchText, NETWORK);

        assert.deepEqual(jsonResult, { ok: true });
        assert.equal(textResult, 'hello');
    });

    it('times out stalled requests and retries per-attempt with AbortController', async () => {
        let fetchCalls = 0;
        const fetchTimeoutMs = 25;
        const stalledFetch = async (_url, { signal }) => await new Promise((_resolve, reject) => {
            fetchCalls += 1;
            signal.addEventListener('abort', () => {
                const abortError = new Error('aborted');
                abortError.name = 'AbortError';
                reject(abortError);
            }, { once: true });
        });

        await assert.rejects(
            DataEngine._fetchWithRetry('https://example.com/stalled.json', 'json', stalledFetch, {
                MAX_RETRIES: 2,
                RETRY_BASE_DELAY_MS: 1,
                FETCH_TIMEOUT_MS: fetchTimeoutMs
            }),
            new RegExp(`timed out after ${fetchTimeoutMs}ms`, 'i')
        );
        assert.equal(fetchCalls, 2);
    });

    it('preserves retry behavior when a timed-out attempt is followed by a successful retry', async () => {
        let fetchCalls = 0;
        const fetchTimeoutMs = 25;
        const flakyFetch = async (_url, { signal }) => {
            fetchCalls += 1;
            if (fetchCalls === 1) {
                return await new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => {
                        const abortError = new Error('aborted');
                        abortError.name = 'AbortError';
                        reject(abortError);
                    }, { once: true });
                });
            }
            return {
                ok: true,
                headers: createHeaders({
                    'content-length': '11'
                }),
                body: null,
                text: async () => '{"ok":true}'
            };
        };

        const result = await DataEngine._fetchWithRetry('https://example.com/flaky.json', 'json', flakyFetch, {
            MAX_RETRIES: 2,
            RETRY_BASE_DELAY_MS: 1,
            FETCH_TIMEOUT_MS: fetchTimeoutMs
        });

        assert.deepEqual(result, { ok: true });
        assert.equal(fetchCalls, 2);
    });
});

