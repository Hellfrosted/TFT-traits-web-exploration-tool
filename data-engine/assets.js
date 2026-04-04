const { URL } = require('url');
const { DEFAULT_DATA_SOURCE } = require('../constants.js');
const { getSetOverrides } = require('../setOverrides.js');

module.exports = {
    _toDisplayName(value) {
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
    },

    _normalizeUnitAlias(value) {
        return String(value || '')
            .replace(/^TFT\d+_/, '')
            .replace(/^TFT_/, '')
            .trim();
    },

    _normalizeBreakpoints(effects) {
        if (!Array.isArray(effects)) return [];
        return [...new Set(
            effects
                .map((effect) => Number(effect?.minUnits))
                .filter((minUnits) => Number.isFinite(minUnits) && minUnits > 0)
        )].sort((a, b) => a - b);
    },

    _extractDirectoryFilenames(directoryHtml) {
        if (typeof directoryHtml !== 'string' || directoryHtml.length === 0) {
            return [];
        }

        return [...directoryHtml.matchAll(/href="([^"]+)"/gi)]
            .map((match) => decodeURIComponent(match[1] || ''))
            .map((href) => href.split('/').pop())
            .filter((name) => name && name !== '..');
    },

    _normalizeSlug(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/^tft\d+_/, '')
            .replace(/^tft_/, '')
            .replace(/^(god|enemy)_/, '')
            .replace(/[^a-z0-9]+/g, '');
    },

    _normalizeChampionIdentity(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    },

    _extractSetNumberFromValue(value) {
        const match = String(value || '').match(/^TFT(\d+)_/i);
        return match ? match[1] : null;
    },

    _extractSetNumbersFromText(value) {
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
    },

    _resolveHighestSetNumber(values) {
        const setNumbers = values
            .flatMap((value) => this._extractSetNumbersFromText(value))
            .map(Number)
            .filter((value) => Number.isFinite(value));

        if (setNumbers.length === 0) {
            return null;
        }

        return String(Math.max(...setNumbers));
    },

    _assetMatchesSet(assetPathOrUrl, setNumber) {
        if (!assetPathOrUrl || !setNumber) {
            return false;
        }

        return this._extractSetNumbersFromText(assetPathOrUrl).includes(String(setNumber));
    },

    _shouldPreferRawAsset(rawAssetPathOrUrl, currentAssetPathOrUrl, setNumber) {
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
    },

    _createChampionAssetCandidates(rawName, cleanName, displayName) {
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
    },

    _buildChampionLookupKeys(rawName, cleanName, displayName) {
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
    },

    _assetPathToRawUrl(assetPath, source = DEFAULT_DATA_SOURCE) {
        if (!assetPath) return null;
        const urls = this.getSourceUrls(source);

        const normalized = String(assetPath)
            .replace(/^ASSETS\//i, '')
            .replace(/\.tex$/i, '.png')
            .replace(/\\/g, '/')
            .toLowerCase();
        if (!normalized) return null;

        return this._resolveTrustedAssetUrl(normalized, urls.assetBase);
    },

    _resolveTrustedAssetUrl(assetPathOrUrl, baseUrl) {
        if (!assetPathOrUrl || !baseUrl) {
            return null;
        }

        try {
            const base = new URL(baseUrl);
            const resolved = new URL(String(assetPathOrUrl), base);
            if (resolved.protocol !== 'https:') {
                return null;
            }
            if (resolved.origin !== base.origin) {
                return null;
            }
            if (!resolved.pathname.startsWith(base.pathname)) {
                return null;
            }

            return resolved.toString();
        } catch {
            return null;
        }
    },

    _buildChampionAssetMap(directoryHtml, setNumber, source = DEFAULT_DATA_SOURCE) {
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
                    url: this._resolveTrustedAssetUrl(file, urls.championSplashes)
                });
            }
        });

        return championAssets;
    },

    _findChampionIcon(championAssets, rawName, cleanName, displayName) {
        const candidates = this._createChampionAssetCandidates(rawName, cleanName, displayName);
        for (const candidate of candidates) {
            const match = championAssets.get(candidate);
            if (match?.url) {
                return { slug: candidate, ...match };
            }
        }

        return null;
    },

    _rankChampionIconAsset(assetPathOrUrl) {
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
    },

    _scoreRawShopData(shopData) {
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
    },

    _looksLikeShopData(shopData) {
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
    },

    _buildRawShopDataLookup(rawJSON) {
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
    },

    _buildSetChampionRecords(setData, source = DEFAULT_DATA_SOURCE, setOverrides = getSetOverrides()) {
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
    },

    _buildChampionIdentitySet(setChampionRecords) {
        const championIdentities = new Set();

        setChampionRecords.forEach((record) => {
            record.identities?.forEach((identity) => {
                championIdentities.add(identity);
            });
        });

        return championIdentities;
    },

    _buildRawChampionRecordMap(rawJSON) {
        const recordMap = new Map();

        for (const [key, value] of Object.entries(rawJSON || {})) {
            if (this._isChampionRecord(key, value) && value.mCharacterName) {
                recordMap.set(value.mCharacterName, value);
            }
        }

        return recordMap;
    },

    _buildChampionReferenceMap(setChampionRecords) {
        const championReferenceMap = new Map();

        setChampionRecords.forEach((record) => {
            record.candidates.forEach((candidate) => {
                if (!championReferenceMap.has(candidate)) {
                    championReferenceMap.set(candidate, record);
                }
            });
        });

        return championReferenceMap;
    },

    _resolveRawShopIcon(shopData, source = DEFAULT_DATA_SOURCE) {
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
    },

    _resolveRawShopIconUrl(shopData, source = DEFAULT_DATA_SOURCE) {
        return this._resolveRawShopIcon(shopData, source)?.url || null;
    },

    _findChampionReference(championReferenceMap, rawName, cleanName, displayName) {
        const candidates = this._createChampionAssetCandidates(rawName, cleanName, displayName);
        for (const candidate of candidates) {
            const match = championReferenceMap.get(candidate);
            if (match) {
                return { slug: candidate, record: match };
            }
        }

        return null;
    },

    _findRawShopData(rawChampionRecord, rawJSON, rawShopDataLookup = null, rawName = '', cleanName = '', displayName = '') {
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
    },

    _resolveRawChampionIcon(rawChampionRecord, rawJSON, rawShopDataLookup = null, rawName = '', cleanName = '', displayName = '', source = DEFAULT_DATA_SOURCE) {
        const shopData = this._findRawShopData(
            rawChampionRecord,
            rawJSON,
            rawShopDataLookup,
            rawName,
            cleanName,
            displayName
        );

        return this._resolveRawShopIcon(shopData, source);
    },

    _buildTraitIconMap(directoryHtml, setData, setNumber, source = DEFAULT_DATA_SOURCE, rawTraitMetadata = null) {
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
                const resolvedUrl = this._resolveTrustedAssetUrl(match.file, urls.traitIcons);
                if (resolvedUrl) {
                    traitIcons[displayName] = resolvedUrl;
                }
            }
        });

        return traitIcons;
    },

    _buildRawTraitMetadata(rawJSON, source = DEFAULT_DATA_SOURCE) {
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
};
