const { LIMITS } = require('./constants.js');
const normalizationMetadataCache = new WeakMap();

const UI_LIMITS = {
    MIN_BOARD_SIZE: 1,
    MAX_BOARD_SIZE: 20,
    MIN_RESULTS: 1,
    MAX_RESULTS: LIMITS.MAX_RESULTS || 1000
};

function normalizeStringList(values) {
    if (!Array.isArray(values)) return [];

    const seen = new Set();
    const normalized = [];

    values.forEach((value) => {
        let candidate = value;
        if (candidate && typeof candidate === 'object') {
            candidate = candidate.value ?? candidate.id ?? candidate.name ?? candidate.label ?? '';
        }

        const stringValue = String(candidate ?? '').trim();
        if (!stringValue || seen.has(stringValue)) return;

        seen.add(stringValue);
        normalized.push(stringValue);
    });

    return normalized;
}

function normalizeStringValue(value) {
    let candidate = value;
    if (candidate && typeof candidate === 'object') {
        candidate = candidate.value ?? candidate.id ?? candidate.name ?? candidate.label ?? '';
    }

    return String(candidate ?? '').trim();
}

function normalizeStringMap(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
        return {};
    }

    const normalized = {};
    Object.keys(values).sort().forEach((rawKey) => {
        const key = String(rawKey ?? '').trim();
        const value = normalizeStringValue(values[rawKey]);
        if (!key || !value) {
            return;
        }

        normalized[key] = value;
    });

    return normalized;
}

function clampInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(Math.max(parsed, min), max);
}

function normalizeBoolean(value) {
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
            return false;
        }
        if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
            return true;
        }
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    return !!value;
}

function normalizeSearchParams(params: LooseRecord = {}) {
    return {
        boardSize: clampInteger(params.boardSize, 9, UI_LIMITS.MIN_BOARD_SIZE, UI_LIMITS.MAX_BOARD_SIZE),
        maxResults: clampInteger(
            params.maxResults,
            LIMITS.DEFAULT_MAX_RESULTS,
            UI_LIMITS.MIN_RESULTS,
            UI_LIMITS.MAX_RESULTS
        ),
        mustInclude: normalizeStringList(params.mustInclude),
        mustExclude: normalizeStringList(params.mustExclude),
        mustIncludeTraits: normalizeStringList(params.mustIncludeTraits),
        mustExcludeTraits: normalizeStringList(params.mustExcludeTraits),
        tankRoles: normalizeStringList(params.tankRoles),
        carryRoles: normalizeStringList(params.carryRoles),
        extraEmblems: normalizeStringList(params.extraEmblems),
        variantLocks: normalizeStringMap(params.variantLocks),
        onlyActive: normalizeBoolean(params.onlyActive),
        tierRank: normalizeBoolean(params.tierRank),
        includeUnique: normalizeBoolean(params.includeUnique)
    };
}

function filterAllowedValues(values, allowedValues) {
    if (!allowedValues) {
        return values;
    }

    return values.filter((value) => allowedValues.has(value));
}

function getUnitsFromDataCache(dataCache) {
    if (Array.isArray(dataCache?.units)) {
        return dataCache.units;
    }

    if (dataCache?.unitMap instanceof Map) {
        return [...dataCache.unitMap.values()];
    }

    return [];
}

function getNormalizationMetadata(dataCache) {
    if (!dataCache || typeof dataCache !== 'object') {
        return null;
    }

    const cachedMetadata = normalizationMetadataCache.get(dataCache);
    if (cachedMetadata) {
        return cachedMetadata;
    }

    const units = getUnitsFromDataCache(dataCache);
    const allowedUnitIds = new Set(units.map((unit) => String(unit?.id ?? '').trim()).filter(Boolean));
    const allowedTraits = new Set(
        Array.isArray(dataCache.traits) ? dataCache.traits.map((value) => String(value ?? '').trim()).filter(Boolean) : []
    );
    const allowedRoles = new Set(
        Array.isArray(dataCache.roles) ? dataCache.roles.map((value) => String(value ?? '').trim()).filter(Boolean) : []
    );
    const allowedVariantsByUnit = new Map();
    units.forEach((unit) => {
        const unitId = String(unit?.id ?? '').trim();
        if (!unitId || !Array.isArray(unit?.variants)) {
            return;
        }
        const allowedVariants = new Set(
            unit.variants.map((variant) => String(variant?.id ?? '').trim()).filter(Boolean)
        );
        if (allowedVariants.size > 0) {
            allowedVariantsByUnit.set(unitId, allowedVariants);
        }
    });

    const metadata = {
        allowedUnitIds,
        allowedTraits,
        allowedRoles,
        allowedVariantsByUnit
    };
    normalizationMetadataCache.set(dataCache, metadata);
    return metadata;
}

function normalizeSearchParamsForData(params = {}, dataCache = null) {
    const normalized = normalizeSearchParams(params);
    if (!dataCache || typeof dataCache !== 'object') {
        return normalized;
    }

    const metadata = getNormalizationMetadata(dataCache);
    const allowedUnitIds = metadata?.allowedUnitIds || new Set();
    const allowedTraits = metadata?.allowedTraits || new Set();
    const allowedRoles = metadata?.allowedRoles || new Set();
    const allowedVariantsByUnit = metadata?.allowedVariantsByUnit || new Map();

    const filteredVariantLocks = {};
    Object.keys(normalized.variantLocks || {}).forEach((unitId) => {
        const variantId = normalized.variantLocks[unitId];
        const allowedVariants = allowedVariantsByUnit.get(unitId);
        if (!allowedVariants || !allowedVariants.has(variantId)) {
            return;
        }
        filteredVariantLocks[unitId] = variantId;
    });

    return {
        ...normalized,
        mustInclude: filterAllowedValues(normalized.mustInclude, allowedUnitIds),
        mustExclude: filterAllowedValues(normalized.mustExclude, allowedUnitIds),
        mustIncludeTraits: filterAllowedValues(normalized.mustIncludeTraits, allowedTraits),
        mustExcludeTraits: filterAllowedValues(normalized.mustExcludeTraits, allowedTraits),
        tankRoles: filterAllowedValues(normalized.tankRoles, allowedRoles),
        carryRoles: filterAllowedValues(normalized.carryRoles, allowedRoles),
        extraEmblems: filterAllowedValues(normalized.extraEmblems, allowedTraits),
        variantLocks: filteredVariantLocks
    };
}

function buildSerializableSearchParams(params = {}) {
    const normalized = normalizeSearchParams(params);
    return {
        boardSize: normalized.boardSize,
        maxResults: normalized.maxResults ?? LIMITS.DEFAULT_MAX_RESULTS,
        mustInclude: [...(normalized.mustInclude || [])].sort(),
        mustExclude: [...(normalized.mustExclude || [])].sort(),
        mustIncludeTraits: [...(normalized.mustIncludeTraits || [])].sort(),
        mustExcludeTraits: [...(normalized.mustExcludeTraits || [])].sort(),
        tankRoles: [...(normalized.tankRoles || [])].sort(),
        carryRoles: [...(normalized.carryRoles || [])].sort(),
        extraEmblems: [...(normalized.extraEmblems || [])].sort(),
        variantLocks: Object.keys(normalized.variantLocks || {}).sort().map((unitId) => [
            unitId,
            normalized.variantLocks[unitId]
        ]),
        onlyActive: !!normalized.onlyActive,
        tierRank: !!normalized.tierRank,
        includeUnique: !!normalized.includeUnique
    };
}

function serializeSearchParams(params = {}) {
    return JSON.stringify(buildSerializableSearchParams(params));
}

module.exports = {
    normalizeBoolean,
    normalizeSearchParamsForData,
    normalizeSearchParams,
    serializeSearchParams,
    normalizeStringList,
    normalizeStringMap
};
