const crypto = require('crypto');
const { URL } = require('url');
const { DATA_SOURCES, DEFAULT_DATA_SOURCE, NETWORK } = require('./constants.js');
const { getSetOverrides } = require('./setOverrides.js');

/**
 * @typedef {Object} UnitVariantData
 * @property {string} id - Stable variant identifier (e.g. "conduit")
 * @property {string} label - User-facing label for the selected mode
 * @property {string} role - Resolved role name for the variant
 * @property {string[]} traits - Resolved trait names for the variant profile
 * @property {Object<string, number>} [traitContributions] - Explicit per-trait contribution counts for the variant
 * @property {Object<string, any>} [conditions] - Optional board-state requirements for this variant
 * @property {{conditions?: Object<string, any>, traitContributions: Object<string, number>}[]} [conditionalEffects] - Optional board-state bonuses that apply once when conditions are satisfied
 * @property {{conditions?: Object<string, any>, traits: string[], traitContributions: Object<string, number>}[]} [conditionalProfiles] - Optional ordered replacement profiles that activate when conditions are satisfied
 */

/**
 * @typedef {Object} UnitData
 * @property {string} id - Clean champion name (e.g. "Jinx")
 * @property {number} cost - Gold cost / tier (1-5)
 * @property {string} role - Resolved role name
 * @property {string[]} traits - Resolved trait names
 * @property {Object<string, number>} [traitContributions] - Explicit per-trait contribution counts for special mechanics
 * @property {{conditions?: Object<string, any>, traitContributions: Object<string, number>}[]} [conditionalEffects] - Optional board-state bonuses that apply once when conditions are satisfied
 * @property {{conditions?: Object<string, any>, traits: string[], traitContributions: Object<string, number>}[]} [conditionalProfiles] - Optional ordered replacement profiles that activate when conditions are satisfied
 * @property {string[]} traitIds - Raw trait hash IDs for breakpoint matching
 * @property {string} displayName - Clean UI label for the unit
 * @property {string|null} [iconUrl] - Optional resolved splash icon URL
 * @property {UnitVariantData[]} [variants] - Optional alternate trait profiles for mode-select units
 * @property {Object<string, string>} traitIcons - Trait name to icon URL dictionary
 * @property {{championAssetCount: number, matchedChampionCount: number, totalUnits: number, missingChampionIcons: string[], unmatchedChampionAssets: number, traitIconCount: number, totalTraits: number}} assetValidation
 */

/**
 * @typedef {Object} ParsedData
 * @property {UnitData[]} units - All parsed champion units
 * @property {string[]} traits - Sorted list of all trait names
 * @property {string[]} roles - Sorted list of all role names
 * @property {Object<string, number[]>} traitBreakpoints - Trait name → sorted breakpoint thresholds
 * @property {Object<string, string>} hashMap - Hash ID → resolved name dictionary
 */

const SOURCE_URLS = {
    [DATA_SOURCES.PBE]: {
        characters: 'https://raw.communitydragon.org/pbe/game/data/tftteamplanner/characters.bin.json',
        cdragon: 'https://raw.communitydragon.org/pbe/cdragon/tft/en_us.json',
        traitIcons: 'https://raw.communitydragon.org/pbe/game/assets/ux/traiticons/',
        championSplashes: 'https://raw.communitydragon.org/pbe/game/assets/ux/tft/championsplashes/patching/',
        assetBase: 'https://raw.communitydragon.org/pbe/game/assets/'
    },
    [DATA_SOURCES.LIVE]: {
        characters: 'https://raw.communitydragon.org/latest/game/data/tftteamplanner/characters.bin.json',
        cdragon: 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json',
        traitIcons: 'https://raw.communitydragon.org/latest/game/assets/ux/traiticons/',
        championSplashes: 'https://raw.communitydragon.org/latest/game/assets/ux/tft/championsplashes/patching/',
        assetBase: 'https://raw.communitydragon.org/latest/game/assets/'
    }
};

class DataEngine {
    static normalizeDataSource(source = DEFAULT_DATA_SOURCE) {
        return source === DATA_SOURCES.LIVE ? DATA_SOURCES.LIVE : DEFAULT_DATA_SOURCE;
    }

    static getSourceUrls(source = DEFAULT_DATA_SOURCE) {
        const normalizedSource = this.normalizeDataSource(source);
        return SOURCE_URLS[normalizedSource];
    }

    /**
     * Convert internal/special unit ids into cleaner display labels for the UI.
     * @param {string} value
     * @returns {string}
     * @private
     */
    static _toDisplayName(value) {
        const normalized = this._normalizeUnitAlias(value);
        if (!normalized) return '';

        const base = normalized
            .replace(/^(God|Enemy)_/, '')
            .replace(/_TraitClone$/i, ' Clone')
            .replace(/Wolf$/i, ' Wolf')
            .replace(/Lantern$/i, ' Lantern')
            .replace(/Follower$/i, ' Follower')
            .replace(/Minion$/i, ' Minion')
            .replace(/Shrine$/i, ' Shrine')
            .replace(/Prop$/i, '')
            .replace(/_/g, ' ')
            .trim();

        return base
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Normalize a champion/unit key into a display-name-like alias for matching.
     * @param {string} value
     * @returns {string}
     * @private
     */
    static _normalizeUnitAlias(value) {
        return String(value || '')
            .replace(/^TFT\d+_/, '')
            .replace(/^TFT_/, '')
            .trim();
    }

    /**
     * Normalize trait breakpoint effects into a sorted, unique list of positive thresholds.
     * @param {Array<{minUnits?: number}> | undefined | null} effects
     * @returns {number[]}
     * @private
     */
    static _normalizeBreakpoints(effects) {
        if (!Array.isArray(effects)) return [];
        return [...new Set(
            effects
                .map((effect) => Number(effect?.minUnits))
                .filter((minUnits) => Number.isFinite(minUnits) && minUnits > 0)
        )].sort((a, b) => a - b);
    }

    /**
     * Fetch and parse Community Dragon data with retry logic.
     * @param {Object} [options] - Optional configuration
     * @param {'pbe'|'latest'} [options.source] - Community Dragon channel
     * @param {Function} [options.readFallback] - Callback to read cached raw data from disk (returns {rawChar, rawTraits} or null)
     * @param {Function} [options.writeFallback] - Callback to write raw data to disk for offline use
     * @returns {Promise<ParsedData>} Parsed champion, trait, and role data
     * @throws {Error} If all fetch attempts and fallback fail
     */
    static async fetchAndParse(options = {}) {
        const source = this.normalizeDataSource(options.source);
        const urls = this.getSourceUrls(source);
        let rawData;

        try {
            const [rawChar, rawTraits] = await Promise.all([
                this._fetchJsonWithRetry(urls.characters),
                this._fetchJsonWithRetry(urls.cdragon)
            ]);

            const [rawTraitIconsHtml, rawChampionSplashesHtml] = await Promise.all([
                this._fetchTextWithRetry(urls.traitIcons).catch((error) => {
                    console.warn('Failed to fetch trait icon directory:', error.message);
                    return null;
                }),
                this._fetchTextWithRetry(urls.championSplashes).catch((error) => {
                    console.warn('Failed to fetch champion splash directory:', error.message);
                    return null;
                })
            ]);

            rawData = {
                rawChar,
                rawTraits,
                rawTraitIconsHtml,
                rawChampionSplashesHtml
            };

            // Cache raw data for offline fallback
            if (options.writeFallback) {
                try {
                    await options.writeFallback(rawData);
                } catch (cacheErr) {
                    console.warn('Failed to write data fallback cache:', cacheErr.message);
                }
            }
        } catch (fetchErr) {
            // Attempt offline fallback
            if (options.readFallback) {
                const fallback = await options.readFallback();
                if (fallback && fallback.rawChar) {
                    console.warn('Using offline fallback data (CDragon unreachable)');
                    rawData = {
                        rawChar: fallback.rawChar,
                        rawTraits: fallback.rawTraits || null,
                        rawTraitIconsHtml: fallback.rawTraitIconsHtml || null,
                        rawChampionSplashesHtml: fallback.rawChampionSplashesHtml || null
                    };
                } else {
                    throw new Error(`Network error and no offline data available: ${fetchErr.message}`, { cause: fetchErr });
                }
            } else {
                throw fetchErr;
            }
        }

        // Validate response shape before parsing
        if (!rawData?.rawChar || typeof rawData.rawChar !== 'object') {
            throw new Error('Invalid character data: expected a JSON object');
        }

        return this.parseData(rawData.rawChar, rawData.rawTraits, {
            rawTraitIconsHtml: rawData.rawTraitIconsHtml,
            rawChampionSplashesHtml: rawData.rawChampionSplashesHtml
        }, { source });
    }

    static async fetchAndParsePBE(options = {}) {
        return this.fetchAndParse({
            ...options,
            source: DATA_SOURCES.PBE
        });
    }

    static async _fetchJsonWithRetry(url) {
        return this._fetchWithRetry(url, 'json');
    }

    static async _fetchTextWithRetry(url) {
        return this._fetchWithRetry(url, 'text');
    }

    /**
     * Fetch a URL with exponential backoff retry.
     * @param {string} url - URL to fetch
     * @returns {Promise<Object>} Parsed JSON response
     * @throws {Error} After all retries are exhausted
     * @private
     */
    static async _fetchWithRetry(url, responseType = 'json') {
        let lastError;
        for (let attempt = 0; attempt < NETWORK.MAX_RETRIES; attempt++) {
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                if (responseType === 'text') {
                    return await res.text();
                }
                return await res.json();
            } catch (err) {
                lastError = err;
                if (attempt < NETWORK.MAX_RETRIES - 1) {
                    const delay = NETWORK.RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                    console.warn(`Fetch attempt ${attempt + 1} failed for ${url}, retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        throw new Error(`Failed to fetch ${url} after ${NETWORK.MAX_RETRIES} attempts: ${lastError.message}`);
    }

    static _extractDirectoryFilenames(directoryHtml) {
        if (typeof directoryHtml !== 'string' || directoryHtml.length === 0) {
            return [];
        }

        return [...directoryHtml.matchAll(/href="([^"]+)"/gi)]
            .map((match) => decodeURIComponent(match[1] || ''))
            .map((href) => href.split('/').pop())
            .filter((name) => name && name !== '..');
    }

    static _normalizeSlug(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/^tft\d+_/, '')
            .replace(/^tft_/, '')
            .replace(/^(god|enemy)_/, '')
            .replace(/[^a-z0-9]+/g, '');
    }

    static _normalizeChampionIdentity(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    }

    static _extractSetNumberFromValue(value) {
        const match = String(value || '').match(/^TFT(\d+)_/i);
        return match ? match[1] : null;
    }

    static _extractSetNumbersFromText(value) {
        const text = String(value || '');
        if (!text) {
            return [];
        }

        const patterns = [
            /TFT(\d+)_/gi,
            /TFT[_-]?Set(\d+)/gi,
            /Trait[_-]?Icon[_-]?(\d+)[_-]/gi
        ];
        const setNumbers = new Set();

        patterns.forEach((pattern) => {
            for (const match of text.matchAll(pattern)) {
                const setNumber = String(match[1] || '').trim();
                if (setNumber) {
                    setNumbers.add(setNumber);
                }
            }
        });

        return [...setNumbers];
    }

    static _resolveHighestSetNumber(values) {
        const setNumbers = values
            .flatMap((value) => this._extractSetNumbersFromText(value))
            .map(Number)
            .filter((value) => Number.isFinite(value));

        if (setNumbers.length === 0) {
            return null;
        }

        return String(Math.max(...setNumbers));
    }

    static _assetMatchesSet(assetPathOrUrl, setNumber) {
        if (!assetPathOrUrl || !setNumber) {
            return false;
        }

        return this._extractSetNumbersFromText(assetPathOrUrl).includes(String(setNumber));
    }

    static _shouldPreferRawAsset(rawAssetPathOrUrl, currentAssetPathOrUrl, setNumber) {
        if (!rawAssetPathOrUrl) {
            return false;
        }
        if (!currentAssetPathOrUrl) {
            return true;
        }
        if (!setNumber) {
            return false;
        }

        return this._assetMatchesSet(rawAssetPathOrUrl, setNumber) &&
            !this._assetMatchesSet(currentAssetPathOrUrl, setNumber);
    }

    static _createChampionAssetCandidates(rawName, cleanName, displayName) {
        const variants = new Set();

        [rawName, cleanName, displayName].filter(Boolean).forEach((value) => {
            const normalized = this._normalizeUnitAlias(value);
            const label = this._toDisplayName(normalized);

            [normalized, label].filter(Boolean).forEach((variant) => {
                const slug = this._normalizeSlug(variant);
                if (slug) variants.add(slug);
            });
        });

        return [...variants];
    }

    static _buildChampionLookupKeys(rawName, cleanName, displayName) {
        const lookupKeys = new Set();
        const registerKey = (value) => {
            const identity = this._normalizeChampionIdentity(value);
            if (identity) {
                lookupKeys.add(identity);
            }
        };

        [rawName, cleanName, displayName].filter(Boolean).forEach(registerKey);
        this._createChampionAssetCandidates(rawName, cleanName, displayName).forEach(registerKey);

        return [...lookupKeys];
    }

    static _assetPathToRawUrl(assetPath, source = DEFAULT_DATA_SOURCE) {
        if (!assetPath) return null;
        const urls = this.getSourceUrls(source);

        const normalized = String(assetPath)
            .replace(/^ASSETS\//i, '')
            .replace(/\.tex$/i, '.png')
            .replace(/\\/g, '/')
            .toLowerCase();
        if (!normalized) return null;

        return new URL(normalized, urls.assetBase).toString();
    }

    static _buildChampionAssetMap(directoryHtml, setNumber, source = DEFAULT_DATA_SOURCE) {
        const urls = this.getSourceUrls(source);
        const championAssets = new Map();
        if (!setNumber) {
            return championAssets;
        }

        const setPrefix = setNumber ? `tft${setNumber}_` : null;

        this._extractDirectoryFilenames(directoryHtml).forEach((file) => {
            const lower = file.toLowerCase();
            if (!lower.endsWith('.png')) return;
            if (setPrefix && !lower.startsWith(setPrefix)) return;

            const rank = lower.includes('_teamplanner_splash.png')
                ? 2
                : lower.includes('_mobile_small.png')
                    ? 1
                    : 0;
            if (rank === 0) return;

            const slug = lower
                .replace(/^tft\d+_/, '')
                .replace(/_(teamplanner_splash|mobile_small)\.png$/, '')
                .replace(/[^a-z0-9]+/g, '');
            if (!slug) return;

            const current = championAssets.get(slug);
            if (!current || rank > current.rank) {
                championAssets.set(slug, {
                    file,
                    rank,
                    url: new URL(file, urls.championSplashes).toString()
                });
            }
        });

        return championAssets;
    }

    static _findChampionIcon(championAssets, rawName, cleanName, displayName) {
        const candidates = this._createChampionAssetCandidates(rawName, cleanName, displayName);
        for (const candidate of candidates) {
            const match = championAssets.get(candidate);
            if (match) {
                return { slug: candidate, ...match };
            }
        }

        return null;
    }

    static _rankChampionIconAsset(assetPathOrUrl) {
        const normalized = String(assetPathOrUrl || '').toLowerCase();
        if (!normalized) {
            return -1;
        }

        if (
            normalized.includes('teamplannerportrait') ||
            normalized.includes('/hud/') ||
            normalized.includes('_square')
        ) {
            return 4;
        }

        if (
            normalized.includes('squaresplash') ||
            normalized.includes('splash_tile') ||
            normalized.includes('teamplanner_splash')
        ) {
            return 3;
        }

        if (normalized.includes('mobile_small') || normalized.includes('splash')) {
            return 2;
        }

        return 0;
    }

    static _scoreRawShopData(shopData) {
        const preferredFields = [
            'TeamPlannerPortraitPath',
            'SquareSplashPath',
            'TeamPlannerSplashPath',
            'PcSplashPath',
            'AbilityIconPath'
        ];

        return preferredFields.reduce((score, fieldName, index) => {
            return score + (shopData?.[fieldName] ? (preferredFields.length - index) : 0);
        }, 0);
    }

    static _looksLikeShopData(shopData) {
        if (!shopData || typeof shopData !== 'object') {
            return false;
        }

        if (shopData.__type === 'TftShopData') {
            return true;
        }

        return [
            shopData.TeamPlannerPortraitPath,
            shopData.SquareSplashPath,
            shopData.TeamPlannerSplashPath,
            shopData.PcSplashPath,
            shopData.AbilityIconPath
        ].some((value) => typeof value === 'string' && value.length > 0);
    }

    static _buildRawShopDataLookup(rawJSON) {
        const lookup = new Map();

        for (const [key, value] of Object.entries(rawJSON || {})) {
            if (!this._looksLikeShopData(value)) {
                continue;
            }

            const rawName = value.mName || key;
            const cleanName = this._normalizeUnitAlias(rawName);
            const displayName = this._toDisplayName(cleanName) || cleanName;
            const score = this._scoreRawShopData(value);

            this._buildChampionLookupKeys(rawName, cleanName, displayName).forEach((lookupKey) => {
                const current = lookup.get(lookupKey);
                if (!current || score > current.score) {
                    lookup.set(lookupKey, { score, shopData: value });
                }
            });
        }

        return lookup;
    }

    static _buildSetChampionRecords(setData, source = DEFAULT_DATA_SOURCE, setOverrides = getSetOverrides()) {
        if (!Array.isArray(setData?.champions)) {
            return [];
        }

        return setData.champions.filter((champion) => {
            const rawName = champion.characterName || champion.apiName || '';
            if (!rawName || this._isExcludedUnit(rawName, setOverrides)) {
                return false;
            }

            return Array.isArray(champion.traits) && champion.traits.length > 0;
        }).map((champion) => {
            const cleanName = this._normalizeUnitAlias(champion.characterName || champion.apiName || champion.name);
            const displayName = champion.name || this._toDisplayName(cleanName) || cleanName;
            const iconUrl = this._assetPathToRawUrl(champion.squareIcon || champion.icon, source);

            return {
                cleanName,
                displayName,
                role: champion.role || null,
                iconUrl,
                identities: [...new Set(
                    [champion.characterName, champion.apiName]
                        .filter(Boolean)
                        .map((value) => this._normalizeChampionIdentity(value))
                        .filter(Boolean)
                )],
                candidates: this._createChampionAssetCandidates(
                    champion.characterName || champion.apiName,
                    cleanName,
                    displayName
                )
            };
        });
    }

    static _buildChampionIdentitySet(setChampionRecords) {
        const championIdentities = new Set();

        setChampionRecords.forEach((record) => {
            record.identities?.forEach((identity) => {
                championIdentities.add(identity);
            });
        });

        return championIdentities;
    }

    static _buildRawChampionRecordMap(rawJSON) {
        const recordMap = new Map();

        for (const [key, value] of Object.entries(rawJSON || {})) {
            if (this._isChampionRecord(key, value) && value.mCharacterName) {
                recordMap.set(value.mCharacterName, value);
            }
        }

        return recordMap;
    }

    static _buildChampionReferenceMap(setChampionRecords) {
        const championReferenceMap = new Map();

        setChampionRecords.forEach((record) => {
            record.candidates.forEach((candidate) => {
                if (!championReferenceMap.has(candidate)) {
                    championReferenceMap.set(candidate, record);
                }
            });
        });

        return championReferenceMap;
    }

    static _resolveRawShopIcon(shopData, source = DEFAULT_DATA_SOURCE) {
        if (!shopData || typeof shopData !== 'object') {
            return null;
        }

        const preferredPaths = [
            { field: 'TeamPlannerPortraitPath', rank: 4 },
            { field: 'SquareSplashPath', rank: 3 },
            { field: 'TeamPlannerSplashPath', rank: 2 },
            { field: 'PcSplashPath', rank: 1 },
            { field: 'AbilityIconPath', rank: 0 }
        ];

        for (const { field, rank } of preferredPaths) {
            const assetPath = shopData[field];
            const iconUrl = this._assetPathToRawUrl(assetPath, source);
            if (iconUrl) {
                return { url: iconUrl, field, rank };
            }
        }

        return null;
    }

    static _resolveRawShopIconUrl(shopData, source = DEFAULT_DATA_SOURCE) {
        return this._resolveRawShopIcon(shopData, source)?.url || null;
    }

    static _findChampionReference(championReferenceMap, rawName, cleanName, displayName) {
        const candidates = this._createChampionAssetCandidates(rawName, cleanName, displayName);
        for (const candidate of candidates) {
            const match = championReferenceMap.get(candidate);
            if (match) {
                return { slug: candidate, record: match };
            }
        }

        return null;
    }

    static _findRawShopData(rawChampionRecord, rawJSON, rawShopDataLookup = null, rawName = '', cleanName = '', displayName = '') {
        const directKey = rawChampionRecord?.mShopData;
        const directShopData = directKey ? rawJSON?.[directKey] : null;
        if (this._looksLikeShopData(directShopData)) {
            return directShopData;
        }

        for (const lookupKey of this._buildChampionLookupKeys(
            rawName || rawChampionRecord?.mCharacterName,
            cleanName || this._normalizeUnitAlias(rawChampionRecord?.mCharacterName),
            displayName || this._toDisplayName(cleanName || this._normalizeUnitAlias(rawChampionRecord?.mCharacterName))
        )) {
            const match = rawShopDataLookup?.get(lookupKey);
            if (match?.shopData) {
                return match.shopData;
            }
        }

        return null;
    }

    static _resolveRawChampionIcon(rawChampionRecord, rawJSON, rawShopDataLookup = null, rawName = '', cleanName = '', displayName = '', source = DEFAULT_DATA_SOURCE) {
        const shopData = this._findRawShopData(
            rawChampionRecord,
            rawJSON,
            rawShopDataLookup,
            rawName,
            cleanName,
            displayName
        );

        return this._resolveRawShopIcon(shopData, source);
    }

    static _buildTraitIconMap(directoryHtml, setData, setNumber, source = DEFAULT_DATA_SOURCE, rawTraitMetadata = null) {
        const urls = this.getSourceUrls(source);
        const fileEntries = this._extractDirectoryFilenames(directoryHtml)
            .filter((file) => file.toLowerCase().endsWith('.png'))
            .map((file) => ({
                file,
                baseName: file.toLowerCase().replace(/\.png$/, '')
            }));
        const traitIcons = {};
        const traitEntries = Array.isArray(setData?.traits)
            ? setData.traits.map((trait) => ({
                displayName: trait.displayName || trait.name || trait.apiName || trait.traitId,
                apiName: trait.apiName,
                icon: trait.icon,
                aliases: [trait.apiName, trait.name, trait.displayName, trait.traitId].filter(Boolean)
            }))
            : Array.isArray(rawTraitMetadata?.traitRecords)
                ? rawTraitMetadata.traitRecords.map((trait) => ({
                    displayName: trait.alias || trait.key,
                    apiName: trait.alias || trait.key,
                    icon: trait.iconPath || null,
                    aliases: [trait.alias, trait.key].filter(Boolean)
                }))
                : [];

        if (traitEntries.length === 0) {
            return traitIcons;
        }

        traitEntries.forEach((trait) => {
            const displayName = trait.displayName;
            if (!displayName) return;

            const directUrl = this._assetPathToRawUrl(trait.icon, source);
            if (directUrl) {
                traitIcons[displayName] = directUrl;
                return;
            }

            const candidates = new Set();
            const iconBaseName = String(trait.icon || '')
                .split('/')
                .pop()
                ?.toLowerCase()
                .replace(/\.tex$/, '');
            if (iconBaseName) {
                candidates.add(iconBaseName);
                candidates.add(iconBaseName.replace(/\.tft_set\d+$/, ''));
            }

            [displayName, trait.apiName, ...(trait.aliases || [])].forEach((alias) => {
                const aliasSlug = this._normalizeSlug(alias);
                if (!aliasSlug) {
                    return;
                }

                candidates.add(aliasSlug);
                if (setNumber) {
                    candidates.add(`trait_icon_${setNumber}_${aliasSlug}`);
                }
            });

            const match = fileEntries.find((entry) => {
                return [...candidates].some((candidate) =>
                    entry.baseName === candidate ||
                    entry.baseName.startsWith(`${candidate}.`) ||
                    entry.baseName.includes(candidate)
                );
            });

            if (match) {
                traitIcons[displayName] = new URL(match.file, urls.traitIcons).toString();
            }
        });

        return traitIcons;
    }

    static _buildRawTraitMetadata(rawJSON, source = DEFAULT_DATA_SOURCE) {
        const traitBreakpoints = {};
        const traitIcons = {};
        const traitRecords = [];

        for (const [key, value] of Object.entries(rawJSON || {})) {
            if (!value || value.__type !== 'TftTraitData') continue;

            const alias = value.mName || key;
            if (!alias) continue;
            traitRecords.push({
                key,
                alias,
                iconPath: value.mIconPath || null
            });

            const conditionalSets = [
                ...(Array.isArray(value.mConditionalTraitSets) ? value.mConditionalTraitSets : []),
                ...(Array.isArray(value.mTraitSets) ? value.mTraitSets : [])
            ];
            const breakpoints = this._normalizeBreakpoints(conditionalSets);
            if (breakpoints.length > 0) {
                traitBreakpoints[alias] = breakpoints;
                traitBreakpoints[key] = breakpoints;
            }

            const iconUrl = this._assetPathToRawUrl(value.mIconPath, source);
            if (iconUrl) {
                traitIcons[alias] = iconUrl;
                traitIcons[key] = iconUrl;
            }
        }

        return { traitBreakpoints, traitIcons, traitRecords };
    }

    static _getUnitOverride(cleanName, rawName, setOverrides = getSetOverrides()) {
        const unitOverrides = setOverrides.unitOverrides || {};
        return unitOverrides[cleanName] || unitOverrides[rawName] || null;
    }

    static _applyUnitTraitOverrides(traits, unitOverride = null) {
        const removeTraits = new Set(unitOverride?.removeTraits || []);
        const effectiveTraits = [];
        const seen = new Set();

        [...(traits || []), ...(unitOverride?.addTraits || [])].forEach((trait) => {
            const normalized = String(trait || '').trim();
            if (!normalized || removeTraits.has(normalized) || seen.has(normalized)) {
                return;
            }

            seen.add(normalized);
            effectiveTraits.push(normalized);
        });

        return effectiveTraits;
    }

    static _buildTraitContributionMap(traits, unitOverride = null) {
        const contributions = {};

        (traits || []).forEach((trait) => {
            contributions[trait] = (contributions[trait] || 0) + 1;
        });

        Object.entries(unitOverride?.traitContributions || {}).forEach(([trait, count]) => {
            const normalizedTrait = String(trait || '').trim();
            const numericCount = Math.trunc(Number(count));

            if (!normalizedTrait) {
                return;
            }
            if (!Number.isFinite(numericCount) || numericCount <= 0) {
                delete contributions[normalizedTrait];
                return;
            }

            contributions[normalizedTrait] = numericCount;
        });

        return contributions;
    }

    static _normalizeConditionalEffects(conditionalEffects) {
        if (!Array.isArray(conditionalEffects)) {
            return [];
        }

        return conditionalEffects.map((effect) => {
            const traitContributions = Object.entries(effect?.traitContributions || {}).reduce((result, [trait, count]) => {
                const normalizedTrait = String(trait || '').trim();
                const numericCount = Math.trunc(Number(count));
                if (!normalizedTrait || !Number.isFinite(numericCount) || numericCount <= 0) {
                    return result;
                }

                result[normalizedTrait] = numericCount;
                return result;
            }, {});

            if (Object.keys(traitContributions).length === 0) {
                return null;
            }

            return {
                ...(effect?.conditions && typeof effect.conditions === 'object'
                    ? { conditions: effect.conditions }
                    : {}),
                traitContributions
            };
        }).filter(Boolean);
    }

    static _normalizeConditionalProfiles(conditionalProfiles) {
        if (!Array.isArray(conditionalProfiles)) {
            return [];
        }

        return conditionalProfiles.map((profile) => {
            const normalizedAddTraits = (profile?.addTraits || [])
                .map((trait) => String(trait || '').trim())
                .filter(Boolean);
            const normalizedRemoveTraits = (profile?.removeTraits || [])
                .map((trait) => String(trait || '').trim())
                .filter(Boolean);
            const normalizedTraitContributions = Object.entries(profile?.traitContributions || {}).reduce((result, [trait, count]) => {
                const normalizedTrait = String(trait || '').trim();
                const numericCount = Math.trunc(Number(count));
                if (!normalizedTrait || !Number.isFinite(numericCount) || numericCount <= 0) {
                    return result;
                }

                result[normalizedTrait] = numericCount;
                return result;
            }, {});

            if (
                normalizedAddTraits.length === 0 &&
                normalizedRemoveTraits.length === 0 &&
                Object.keys(normalizedTraitContributions).length === 0
            ) {
                return null;
            }

            return {
                ...(profile?.conditions && typeof profile.conditions === 'object'
                    ? { conditions: profile.conditions }
                    : {}),
                ...(normalizedAddTraits.length > 0 ? { addTraits: normalizedAddTraits } : {}),
                ...(normalizedRemoveTraits.length > 0 ? { removeTraits: normalizedRemoveTraits } : {}),
                ...(Object.keys(normalizedTraitContributions).length > 0
                    ? { traitContributions: normalizedTraitContributions }
                    : {})
            };
        }).filter(Boolean);
    }

    static _buildConditionalProfiles(baseTraits, conditionalProfiles = []) {
        return this._normalizeConditionalProfiles(conditionalProfiles).map((profile) => {
            const overrideContributionTraits = Object.entries(profile.traitContributions || {})
                .filter(([, count]) => Number(count) > 0)
                .map(([trait]) => trait);
            const effectiveTraits = this._applyUnitTraitOverrides(
                [...baseTraits, ...overrideContributionTraits],
                profile
            );
            const traitContributions = this._buildTraitContributionMap(effectiveTraits, profile);

            return {
                ...(profile.conditions && Object.keys(profile.conditions).length > 0
                    ? { conditions: profile.conditions }
                    : {}),
                traits: effectiveTraits,
                traitContributions
            };
        }).filter((profile) => profile.traits.length > 0 || Object.keys(profile.traitContributions).length > 0);
    }

    static _buildUnitVariants(baseTraits, baseRole, unitOverride = null) {
        let variantDefinitions;

        if (Array.isArray(unitOverride?.selectionGroups) && unitOverride.selectionGroups.length > 0) {
            let selectionStates = [{
                idParts: [],
                labelParts: [],
                role: baseRole,
                addTraits: [],
                removeTraits: [],
                traitContributions: {},
                conditions: {},
                conditionalEffects: [],
                conditionalProfiles: []
            }];

            unitOverride.selectionGroups.forEach((group, groupIndex) => {
                const options = Array.isArray(group?.options) ? group.options : [];
                if (options.length === 0) {
                    return;
                }

                const nextStates = [];
                selectionStates.forEach((state) => {
                    options.forEach((option, optionIndex) => {
                        nextStates.push({
                            idParts: [...state.idParts, String(option.id || `${group.id || `group-${groupIndex}`}-${optionIndex + 1}`)],
                            labelParts: [...state.labelParts, String(option.label || option.id || `Option ${optionIndex + 1}`)],
                            role: option.role || state.role,
                            addTraits: [...state.addTraits, ...(option.addTraits || [])],
                            removeTraits: [...state.removeTraits, ...(option.removeTraits || [])],
                            traitContributions: {
                                ...state.traitContributions,
                                ...(option.traitContributions || {})
                            },
                            conditions: {
                                ...state.conditions,
                                ...(option.conditions || {})
                            },
                            conditionalEffects: [
                                ...state.conditionalEffects,
                                ...this._normalizeConditionalEffects(option.conditionalEffects)
                            ],
                            conditionalProfiles: [
                                ...state.conditionalProfiles,
                                ...this._normalizeConditionalProfiles(option.conditionalProfiles)
                            ]
                        });
                    });
                });

                selectionStates = nextStates;
            });

            variantDefinitions = selectionStates.map((state) => ({
                id: state.idParts.join('+'),
                label: state.labelParts.join(' + '),
                role: state.role,
                addTraits: state.addTraits,
                removeTraits: state.removeTraits,
                traitContributions: state.traitContributions,
                conditions: state.conditions,
                conditionalEffects: state.conditionalEffects,
                conditionalProfiles: state.conditionalProfiles
            }));
        } else if (Array.isArray(unitOverride?.variants) && unitOverride.variants.length > 0) {
            variantDefinitions = unitOverride.variants;
        } else {
            return [];
        }

        return variantDefinitions.map((variant, index) => {
            const variantTraits = this._applyUnitTraitOverrides(baseTraits, variant);
            const overrideContributionTraits = Object.entries(variant?.traitContributions || {})
                .filter(([, count]) => Number(count) > 0)
                .map(([trait]) => trait);
            const effectiveTraits = this._applyUnitTraitOverrides(
                [...variantTraits, ...overrideContributionTraits],
                variant
            );
            const traitContributions = this._buildTraitContributionMap(effectiveTraits, variant);
            const conditionalProfiles = this._buildConditionalProfiles(
                effectiveTraits,
                variant.conditionalProfiles
            );

            return {
                id: String(variant.id || `variant-${index + 1}`),
                label: String(variant.label || variant.id || `Variant ${index + 1}`),
                role: variant.role || baseRole,
                traits: effectiveTraits,
                traitContributions,
                ...(this._normalizeConditionalEffects(variant.conditionalEffects).length > 0
                    ? { conditionalEffects: this._normalizeConditionalEffects(variant.conditionalEffects) }
                    : {}),
                ...(conditionalProfiles.length > 0 ? { conditionalProfiles } : {}),
                ...(variant.conditions && Object.keys(variant.conditions).length > 0
                    ? { conditions: variant.conditions }
                    : {})
            };
        }).filter((variant) => variant.traits.length > 0 || Object.keys(variant.traitContributions).length > 0);
    }

    static _mergeUnitOverrides(baseOverride = null, extraOverride = null) {
        if (!baseOverride && !extraOverride) {
            return null;
        }
        if (!baseOverride) {
            return extraOverride;
        }
        if (!extraOverride) {
            return baseOverride;
        }

        return {
            ...extraOverride,
            ...baseOverride,
            addTraits: [...(extraOverride.addTraits || []), ...(baseOverride.addTraits || [])],
            removeTraits: [...(extraOverride.removeTraits || []), ...(baseOverride.removeTraits || [])],
            traitContributions: {
                ...(extraOverride.traitContributions || {}),
                ...(baseOverride.traitContributions || {})
            },
            conditionalEffects: [
                ...this._normalizeConditionalEffects(extraOverride.conditionalEffects),
                ...this._normalizeConditionalEffects(baseOverride.conditionalEffects)
            ],
            conditionalProfiles: [
                ...this._normalizeConditionalProfiles(extraOverride.conditionalProfiles),
                ...this._normalizeConditionalProfiles(baseOverride.conditionalProfiles)
            ],
            variants: baseOverride.variants || extraOverride.variants,
            selectionGroups: baseOverride.selectionGroups || extraOverride.selectionGroups
        };
    }

    static _buildDetectedVariantOverrides({
        rawName,
        baseRole,
        baseTraits,
        hasExcludedLinkedTraits,
        rawChampionRecordMap,
        hashDictionary,
        traitNamesByAlias,
        setOverrides
    }) {
        if (!hasExcludedLinkedTraits) {
            return null;
        }

        const cloneRecord = rawChampionRecordMap.get(`${rawName}_TraitClone`);
        if (!cloneRecord) {
            return null;
        }

        const cloneTraits = (cloneRecord.mLinkedTraits || []).reduce((result, traitLink) => {
            const traitId = traitLink?.TraitData;
            if (!traitId) return result;

            const alias = hashDictionary[traitId] || traitId;
            const resolvedName = traitNamesByAlias[alias] || traitNamesByAlias[traitId] || alias;
            if (!resolvedName || this._isExcludedTraitName(resolvedName, setOverrides)) {
                return result;
            }

            result.push(resolvedName);
            return result;
        }, []);
        const uniqueCloneTraits = [...new Set(cloneTraits)].filter((trait) => !baseTraits.includes(trait));
        if (uniqueCloneTraits.length === 0) {
            return null;
        }

        const cloneRoleId = cloneRecord.CharacterRole || 'Unknown';
        const cloneRoleName = hashDictionary[cloneRoleId] || baseRole;

        return {
            variants: uniqueCloneTraits.map((traitName) => ({
                id: this._normalizeSlug(traitName) || traitName.toLowerCase(),
                label: `${traitName} Mode`,
                addTraits: [traitName],
                role: cloneRoleName && cloneRoleName !== 'Unknown' ? cloneRoleName : baseRole
            }))
        };
    }

    /**
     * Check if a unit name matches any excluded pattern (PVE, fake, dummy, etc.)
     * @param {string} name - Raw character name
     * @returns {boolean} True if the unit should be skipped
     * @private
     */
    static _isExcludedUnit(name, setOverrides = getSetOverrides()) {
        const raw = String(name || '');
        const alias = this._normalizeUnitAlias(raw);
        const candidates = [raw, alias].filter(Boolean);
        const exactNames = new Set(setOverrides.excludedUnitExact || []);

        return candidates.some((value) => (
            (setOverrides.excludedUnitPatterns || []).some((pattern) => value.includes(pattern)) ||
            (setOverrides.excludedUnitSuffixes || []).some((suffix) => value.endsWith(suffix)) ||
            exactNames.has(value)
        ));
    }

    static _isExcludedTraitName(name, setOverrides = getSetOverrides()) {
        const normalized = String(name || '').trim();
        return (setOverrides.excludedTraitNames || []).includes(normalized);
    }

    /**
     * Check whether a raw record looks like a playable champion unit entry.
     * @param {string} key
     * @param {Record<string, any>} val
     * @returns {boolean}
     * @private
     */
    static _isChampionRecord(key, val) {
        if (!val || typeof val !== 'object') return false;

        const rawTags = val.unitTagsString;
        const hasChampionTag = Array.isArray(rawTags)
            ? rawTags.includes('Champion')
            : String(rawTags || '').includes('Champion');

        const looksLikeCharacterRecord =
            key.includes('CharacterRecords/Root') ||
            key.includes('Characters/');

        return looksLikeCharacterRecord && hasChampionTag && typeof val.mCharacterName === 'string';
    }

    /**
     * Auto-detect the latest TFT set number from CDragon data.
     * Falls back to checking known keys if the structure is unexpected.
     * @param {Object} cdragonJSON - Raw CDragon JSON response
     * @returns {string|null} Set number string (e.g. "17") or null if not found
     * @private
     */
    static _detectLatestSet(cdragonJSON) {
        if (!cdragonJSON || !cdragonJSON.sets) return null;
        
        const setKeys = Object.keys(cdragonJSON.sets)
            .map(Number)
            .filter(n => !isNaN(n));
        
        if (setKeys.length === 0) return null;
        
        return String(Math.max(...setKeys));
    }

    static _detectLatestSetFromRaw(rawJSON) {
        const setNumbers = new Set();

        for (const [key, val] of Object.entries(rawJSON || {})) {
            if (!this._isChampionRecord(key, val)) {
                if (val?.__type === 'TftShopData') {
                    this._extractSetNumbersFromText([
                        val.mName,
                        val.TeamPlannerPortraitPath,
                        val.SquareSplashPath,
                        val.TeamPlannerSplashPath,
                        val.PcSplashPath,
                        val.AbilityIconPath
                    ].join(' ')).forEach((setNumber) => setNumbers.add(Number(setNumber)));
                }

                if (val?.__type === 'TftTraitData') {
                    this._extractSetNumbersFromText([val.mName, val.mIconPath].join(' '))
                        .forEach((setNumber) => setNumbers.add(Number(setNumber)));
                }

                continue;
            }

            const setNumber = this._resolveHighestSetNumber([val.mCharacterName]);
            if (setNumber) {
                setNumbers.add(Number(setNumber));
            }
        }

        if (setNumbers.size === 0) {
            return null;
        }

        return String(Math.max(...setNumbers));
    }

    /**
     * Return the latest set payload from CDragon when available.
     * @param {Object|null} cdragonJSON
     * @returns {Object|null}
     * @private
     */
    static _getLatestSetData(cdragonJSON) {
        const latestSet = this._detectLatestSet(cdragonJSON);
        if (!latestSet || !cdragonJSON?.sets?.[latestSet]) {
            return null;
        }
        return cdragonJSON.sets[latestSet];
    }

    static _resolveRoleName({
        cleanName,
        rawName,
        roleId,
        hashDictionary,
        championReference,
        setOverrides
    }) {
        const roleOverrides = setOverrides.roleOverrides || {};
        const roleOverride = roleOverrides[cleanName] || roleOverrides[rawName] || null;
        if (roleOverride) return roleOverride;

        const hashedRole = hashDictionary[roleId];
        if (hashedRole && hashedRole !== 'Unknown') return hashedRole;

        const referenceRole = championReference?.record?.role;
        if (referenceRole && referenceRole !== 'Unknown') return referenceRole;

        return 'Unknown';
    }

    static _deriveStableVariantRole(baseRole, variants) {
        if (baseRole && baseRole !== 'Unknown') {
            return baseRole;
        }

        const variantRoles = [...new Set(
            (variants || [])
                .map((variant) => variant?.role)
                .filter((roleName) => roleName && roleName !== 'Unknown')
        )];

        if (variantRoles.length !== 1) {
            return baseRole;
        }

        const [variantRole] = variantRoles;
        const allVariantsMatch = (variants || []).every((variant) => variant?.role === variantRole);
        return allVariantsMatch ? variantRole : baseRole;
    }

    static _detectRawUnitSetNumber(rawChampionRecord, rawJSON, rawShopDataLookup = null) {
        const rawName = rawChampionRecord?.mCharacterName || '';
        const cleanName = this._normalizeUnitAlias(rawName);
        const displayName = this._toDisplayName(cleanName) || cleanName;
        const shopData = this._findRawShopData(
            rawChampionRecord,
            rawJSON,
            rawShopDataLookup,
            rawName,
            cleanName,
            displayName
        );
        const linkedTraitSignals = (rawChampionRecord?.mLinkedTraits || []).flatMap((traitLink) => {
            const traitRecord = rawJSON?.[traitLink?.TraitData];
            if (!traitRecord || traitRecord.__type !== 'TftTraitData') {
                return [];
            }

            return [traitRecord.mName, traitRecord.mIconPath];
        });

        return this._resolveHighestSetNumber([
            rawName,
            shopData?.mName,
            shopData?.TeamPlannerPortraitPath,
            shopData?.SquareSplashPath,
            shopData?.TeamPlannerSplashPath,
            shopData?.PcSplashPath,
            shopData?.AbilityIconPath,
            ...linkedTraitSignals
        ]);
    }

    /**
     * Compute a stable fingerprint for the parsed data so caches are scoped to a specific set snapshot.
     * @param {{units: UnitData[], traits: string[], roles: string[], traitBreakpoints: Object<string, number[]>, setNumber: string|null}} parsedData
     * @returns {string}
     * @private
     */
    static _createDataFingerprint(parsedData) {
        const fingerprintPayload = JSON.stringify({
            setNumber: parsedData.setNumber,
            units: parsedData.units.map((unit) => ({
                id: unit.id,
                cost: unit.cost,
                role: unit.role,
                traits: unit.traits,
                traitContributions: unit.traitContributions || null,
                conditionalEffects: unit.conditionalEffects || null,
                conditionalProfiles: unit.conditionalProfiles || null,
                variants: unit.variants || null
            })),
            traits: parsedData.traits,
            roles: parsedData.roles,
            traitBreakpoints: parsedData.traitBreakpoints
        });

        return crypto.createHash('sha1').update(fingerprintPayload).digest('hex');
    }

    /**
     * Parse raw Community Dragon JSON into structured champion/trait data.
     * @param {Object} rawJSON - Raw characters.bin.json data
     * @param {Object|null} cdragonJSON - Raw CDragon en_us.json data (nullable for offline/error cases)
     * @param {{rawTraitIconsHtml?: string|null, rawChampionSplashesHtml?: string|null}} [assetSources]
     * @param {{source?: 'pbe'|'latest', setOverrides?: ReturnType<typeof getSetOverrides>}} [parseOptions]
     * @returns {ParsedData} Parsed and structured game data
     */
    static parseData(rawJSON, cdragonJSON, assetSources = {}, parseOptions = {}) {
        const source = this.normalizeDataSource(parseOptions.source);
        const units = [];
        const traits = new Set();
        const roles = new Set();
        const hashDictionary = {};
        const traitNamesByAlias = {};
        const rawTraitMetadata = this._buildRawTraitMetadata(rawJSON, source);
        const rawChampionRecordMap = this._buildRawChampionRecordMap(rawJSON);
        const rawShopDataLookup = this._buildRawShopDataLookup(rawJSON);
        
        // Pass 1: Build a robust dictionary of hashes to names
        for (const [key, val] of Object.entries(rawJSON)) {
            if (key.startsWith('{') && key.endsWith('}')) {
                 const name = val.name || val.mName || val.mDisplayName || val.mLabel || val.mCharacterName;
                 if (name) hashDictionary[key] = name;
            }
        }
        
        // Pass 2: Fallback for names not caught in Pass 1
        for (const [key, val] of Object.entries(rawJSON)) {
             if (val.mName || val.mDisplayName || key.includes('Trait') || key.includes('CharacterRole')) {
                  if (!hashDictionary[key]) {
                      hashDictionary[key] = val.mName || val.mDisplayName || val.mCharacterName || key;
                  }
             }
        }

        // Parse Trait Breakpoints from CDragon (auto-detect latest set and store multiple aliases)
        const traitBreakpoints = {};
        const latestSet = this._detectLatestSet(cdragonJSON) || this._detectLatestSetFromRaw(rawJSON);
        const setOverrides = parseOptions.setOverrides || getSetOverrides({ setNumber: latestSet });
        const setData = this._getLatestSetData(cdragonJSON);
        const setChampionRecords = this._buildSetChampionRecords(setData, source, setOverrides);
        const setChampionIdentitySet = this._buildChampionIdentitySet(setChampionRecords);
        const championReferenceMap = this._buildChampionReferenceMap(setChampionRecords);
        const championAssets = this._buildChampionAssetMap(assetSources.rawChampionSplashesHtml, latestSet, source);
        const traitIcons = this._buildTraitIconMap(assetSources.rawTraitIconsHtml, setData, latestSet, source, rawTraitMetadata);
        const matchedChampionReferenceNames = new Set();
        if (setData?.traits && Array.isArray(setData.traits)) {
            setData.traits.forEach((trait) => {
                const bps = this._normalizeBreakpoints(trait.effects);
                const displayName = trait.displayName || trait.name || trait.apiName || trait.traitId;
                if (!displayName) return;

                const aliases = [
                    trait.apiName,
                    trait.name,
                    trait.displayName,
                    trait.traitId
                ].filter(Boolean);

                aliases.forEach((alias) => {
                    traitNamesByAlias[alias] = displayName;
                    if (bps.length > 0) {
                        traitBreakpoints[alias] = bps;
                    }
                });
            });
        }

        Object.entries(rawTraitMetadata.traitBreakpoints).forEach(([alias, breakpoints]) => {
            const resolvedName = traitNamesByAlias[alias] || alias;
            if (this._isExcludedTraitName(resolvedName, setOverrides)) return;

            if (!traitBreakpoints[alias]) {
                traitBreakpoints[alias] = breakpoints;
            }
            if (!traitBreakpoints[resolvedName]) {
                traitBreakpoints[resolvedName] = breakpoints;
            }
        });

        Object.entries(rawTraitMetadata.traitIcons).forEach(([alias, iconUrl]) => {
            const resolvedName = traitNamesByAlias[alias] || alias;
            if (this._isExcludedTraitName(resolvedName, setOverrides)) return;

            if (!traitIcons[alias] || this._shouldPreferRawAsset(iconUrl, traitIcons[alias], latestSet)) {
                traitIcons[alias] = iconUrl;
            }
            if (!traitIcons[resolvedName] || this._shouldPreferRawAsset(iconUrl, traitIcons[resolvedName], latestSet)) {
                traitIcons[resolvedName] = iconUrl;
            }
        });
        
        for (const [key, val] of Object.entries(rawJSON)) {
            if (this._isChampionRecord(key, val)) {
                const rawName = val.mCharacterName || '';
                if (this._isExcludedUnit(rawName, setOverrides) || val.tier === 0) continue;
                if (setChampionIdentitySet.size > 0) {
                    const rawIdentity = this._normalizeChampionIdentity(rawName);
                    if (!setChampionIdentitySet.has(rawIdentity)) {
                        continue;
                    }
                } else if (latestSet) {
                    const rawSetNumber = this._detectRawUnitSetNumber(val, rawJSON, rawShopDataLookup);
                    if (rawSetNumber && rawSetNumber !== latestSet) {
                        continue;
                    }
                }

                const tier = val.tier || 1;
                const cleanName = rawName.replace(/^TFT\d+_/, '');
                const displayName = this._toDisplayName(cleanName) || cleanName;
                const championReference = this._findChampionReference(championReferenceMap, rawName, cleanName, displayName);
                const unitOverride = this._getUnitOverride(cleanName, rawName, setOverrides);
                const roleName = this._resolveRoleName({
                    cleanName,
                    rawName,
                    roleId: val.CharacterRole || 'Unknown',
                    hashDictionary,
                    championReference,
                    setOverrides
                });

                const allLinkedTraits = (val.mLinkedTraits || []).reduce((result, traitLink) => {
                    const traitId = traitLink?.TraitData;
                    if (!traitId) return result;

                    const alias = hashDictionary[traitId] || traitId;
                    const resolvedName = traitNamesByAlias[alias] || traitNamesByAlias[traitId] || alias;
                    result.push({ traitId, resolvedName });
                    return result;
                }, []);
                const hasExcludedLinkedTraits = allLinkedTraits.some(({ resolvedName }) =>
                    this._isExcludedTraitName(resolvedName, setOverrides)
                );
                const linkedTraits = allLinkedTraits.filter(({ resolvedName }) =>
                    !this._isExcludedTraitName(resolvedName, setOverrides)
                );
                const linkedTraitNames = linkedTraits.map(({ resolvedName }) => resolvedName);
                const autoDetectedVariantOverride = !unitOverride?.variants?.length && !unitOverride?.selectionGroups?.length
                    ? this._buildDetectedVariantOverrides({
                        rawName,
                        baseRole: roleName,
                        baseTraits: linkedTraitNames,
                        hasExcludedLinkedTraits,
                        rawChampionRecordMap,
                        hashDictionary,
                        traitNamesByAlias,
                        setOverrides
                    })
                    : null;
                const mergedUnitOverride = this._mergeUnitOverrides(unitOverride, autoDetectedVariantOverride);
                const overrideContributionTraits = Object.entries(mergedUnitOverride?.traitContributions || {})
                    .filter(([, count]) => Number(count) > 0)
                    .map(([trait]) => trait);
                const effectiveTraitNames = this._applyUnitTraitOverrides(
                    [...linkedTraitNames, ...overrideContributionTraits],
                    mergedUnitOverride
                );
                const effectiveTraitSet = new Set(effectiveTraitNames);
                const linkedTraitIds = linkedTraits
                    .filter(({ resolvedName }) => effectiveTraitSet.has(resolvedName))
                    .map(({ traitId }) => traitId);
                const traitContributions = this._buildTraitContributionMap(effectiveTraitNames, mergedUnitOverride);
                const variants = this._buildUnitVariants(effectiveTraitNames, roleName, mergedUnitOverride);
                const conditionalEffects = this._normalizeConditionalEffects(mergedUnitOverride?.conditionalEffects);
                const conditionalProfiles = this._buildConditionalProfiles(
                    effectiveTraitNames,
                    mergedUnitOverride?.conditionalProfiles
                );
                const resolvedRoleName = this._deriveStableVariantRole(roleName, variants);
                effectiveTraitNames.forEach((traitName) => traits.add(traitName));
                conditionalEffects.forEach((effect) => {
                    Object.keys(effect.traitContributions).forEach((traitName) => traits.add(traitName));
                });
                conditionalProfiles.forEach((profile) => {
                    profile.traits.forEach((traitName) => traits.add(traitName));
                    Object.keys(profile.traitContributions).forEach((traitName) => traits.add(traitName));
                });
                variants.forEach((variant) => {
                    variant.traits.forEach((traitName) => traits.add(traitName));
                    (variant.conditionalEffects || []).forEach((effect) => {
                        Object.keys(effect.traitContributions).forEach((traitName) => traits.add(traitName));
                    });
                    (variant.conditionalProfiles || []).forEach((profile) => {
                        profile.traits.forEach((traitName) => traits.add(traitName));
                        Object.keys(profile.traitContributions).forEach((traitName) => traits.add(traitName));
                    });
                    if (variant.role && variant.role !== 'Unknown') {
                        roles.add(variant.role);
                    }
                });
                if (resolvedRoleName && resolvedRoleName !== 'Unknown') {
                    roles.add(resolvedRoleName);
                }
                const rawShopIcon = this._resolveRawChampionIcon(
                    val,
                    rawJSON,
                    rawShopDataLookup,
                    rawName,
                    cleanName,
                    displayName,
                    source
                );
                const championIcon = this._findChampionIcon(championAssets, rawName, cleanName, displayName);
                const preferredMetadataIcon = championReference?.record?.iconUrl
                    ? {
                        url: championReference.record.iconUrl,
                        rank: this._rankChampionIconAsset(championReference.record.iconUrl)
                    }
                    : championIcon
                        ? {
                            url: championIcon.url,
                            rank: championIcon.rank ?? this._rankChampionIconAsset(championIcon.url)
                        }
                        : null;
                const rawIconBeatsMetadata = rawShopIcon && (
                    this._shouldPreferRawAsset(rawShopIcon.url, preferredMetadataIcon?.url, latestSet) ||
                    (
                        this._assetMatchesSet(rawShopIcon.url, latestSet) &&
                        this._assetMatchesSet(preferredMetadataIcon?.url, latestSet) &&
                        rawShopIcon.rank > (preferredMetadataIcon?.rank ?? -1)
                    )
                );
                const resolvedIconUrl = rawIconBeatsMetadata
                    ? rawShopIcon.url
                    : (preferredMetadataIcon?.url || rawShopIcon?.url || null);
                if (championReference?.record?.displayName) {
                    matchedChampionReferenceNames.add(championReference.record.displayName);
                }

                units.push({
                    id: cleanName,
                    displayName,
                    cost: tier,
                    role: resolvedRoleName,
                    traits: effectiveTraitNames,
                    traitContributions,
                    ...(conditionalEffects.length > 0 ? { conditionalEffects } : {}),
                    ...(conditionalProfiles.length > 0 ? { conditionalProfiles } : {}),
                    traitIds: linkedTraitIds,
                    ...(variants.length > 0 ? { variants } : {}),
                    ...(resolvedIconUrl ? { iconUrl: resolvedIconUrl } : {})
                });
            }
        }

        const sortedTraits = Array.from(traits).sort();
        const missingChampionIcons = units
            .filter((unit) => !unit.iconUrl)
            .map((unit) => unit.displayName);
        
        const parsedData = {
            units, 
            traits: sortedTraits, 
            roles: Array.from(roles).sort(),
            traitBreakpoints,
            traitIcons,
            hashMap: hashDictionary,
            setNumber: latestSet,
            dataSource: source,
            setOverrides,
            assetValidation: {
                championAssetCount: setChampionRecords.length,
                matchedChampionCount: matchedChampionReferenceNames.size,
                totalUnits: units.length,
                missingChampionIcons,
                unmatchedChampionAssets: Math.max(0, setChampionRecords.length - matchedChampionReferenceNames.size),
                traitIconCount: Object.keys(traitIcons).length,
                totalTraits: sortedTraits.length
            }
        };

        return {
            ...parsedData,
            dataFingerprint: this._createDataFingerprint(parsedData)
        };
    }
}

module.exports = DataEngine;
