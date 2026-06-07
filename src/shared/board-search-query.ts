export const DEFAULT_QUERY = {
    boardSize: 9,
    maxResults: 500,
    mustInclude: [],
    mustExclude: [],
    mustIncludeTraits: [],
    mustExcludeTraits: [],
    tankRoles: [],
    carryRoles: [],
    extraEmblems: [],
    variantLocks: {},
    onlyActive: true,
    tierRank: true,
    includeUnique: false
};

type SearchQueryLimits = {
    DEFAULT_MAX_RESULTS?: number;
    MAX_RESULTS?: number;
};

export type SearchParamsInput = LooseRecord & {
    variantLocks?: LooseRecord;
};

type ActiveSearchUnit = LooseRecord & {
    id?: unknown;
    variants?: LooseRecord[];
};

type ActiveSearchData = LooseRecord & {
    units?: ActiveSearchUnit[];
    unitMap?: Map<string, ActiveSearchUnit>;
    traits?: unknown[];
    roles?: unknown[];
};

const normalizationMetadataCache = new WeakMap();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeStringValue(value: unknown) {
    const candidate = isRecord(value)
        ? value.value ?? value.id ?? value.name ?? value.label ?? ''
        : value;

    return String(candidate ?? '').trim();
}

export function normalizeStringList(values: unknown) {
    if (!Array.isArray(values)) return [];

    const seen = new Set();
    const normalized: string[] = [];

    values.forEach((value) => {
        const stringValue = normalizeStringValue(value);
        if (!stringValue || seen.has(stringValue)) return;

        seen.add(stringValue);
        normalized.push(stringValue);
    });

    return normalized;
}

export function normalizeStringMap(values: unknown) {
    if (!isRecord(values) || Array.isArray(values)) {
        return {};
    }

    const normalized = {};
    Object.keys(values).sort().forEach((rawKey) => {
        const key = String(rawKey ?? '').trim();
        const value = normalizeStringValue(values[rawKey]);
        if (!key || !value) return;

        normalized[key] = value;
    });

    return normalized;
}

function normalizeVariantLocks(values: unknown) {
    const normalized = normalizeStringMap(values);
    const variantLocks = {};

    Object.keys(normalized).forEach((unitId) => {
        if (normalized[unitId] !== 'auto') {
            variantLocks[unitId] = normalized[unitId];
        }
    });

    return variantLocks;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return fallback;

    return Math.min(Math.max(parsed, min), max);
}

export function normalizeBoolean(value: unknown) {
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

export function normalizeSearchParams(params: SearchParamsInput = {}, limits: SearchQueryLimits = {}) {
    const maxResultsLimit = limits.MAX_RESULTS || 1000;
    const defaultMaxResults = limits.DEFAULT_MAX_RESULTS || DEFAULT_QUERY.maxResults;

    return {
        boardSize: clampInteger(params.boardSize, DEFAULT_QUERY.boardSize, 1, 20),
        maxResults: clampInteger(params.maxResults, defaultMaxResults, 1, maxResultsLimit),
        mustInclude: normalizeStringList(params.mustInclude),
        mustExclude: normalizeStringList(params.mustExclude),
        mustIncludeTraits: normalizeStringList(params.mustIncludeTraits),
        mustExcludeTraits: normalizeStringList(params.mustExcludeTraits),
        tankRoles: normalizeStringList(params.tankRoles),
        carryRoles: normalizeStringList(params.carryRoles),
        extraEmblems: normalizeStringList(params.extraEmblems),
        variantLocks: normalizeVariantLocks(params.variantLocks),
        onlyActive: normalizeBoolean(params.onlyActive),
        tierRank: normalizeBoolean(params.tierRank),
        includeUnique: normalizeBoolean(params.includeUnique)
    };
}

function filterAllowedValues(values: string[], allowedValues: Set<string>) {
    return values.filter((value) => allowedValues.has(value));
}

function getUnitsFromDataCache(dataCache: ActiveSearchData) {
    if (Array.isArray(dataCache?.units)) {
        return dataCache.units;
    }

    if (dataCache?.unitMap instanceof Map) {
        return [...dataCache.unitMap.values()];
    }

    return [];
}

function getNormalizationMetadata(dataCache: ActiveSearchData) {
    const cachedMetadata = normalizationMetadataCache.get(dataCache);
    if (cachedMetadata) return cachedMetadata;

    const units = getUnitsFromDataCache(dataCache);
    const allowedUnitIds = new Set(units.map((unit) => String(unit?.id ?? '').trim()).filter(Boolean));
    const allowedTraits = new Set(normalizeStringList(dataCache.traits));
    const allowedRoles = new Set(normalizeStringList(dataCache.roles));
    const allowedVariantsByUnit = new Map();

    units.forEach((unit) => {
        const unitId = String(unit?.id ?? '').trim();
        if (!unitId || !Array.isArray(unit?.variants)) return;

        const allowedVariants = new Set(
            unit.variants.map((variant) => normalizeStringValue(variant?.id)).filter(Boolean)
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

export function normalizeSearchParamsForData(params: SearchParamsInput = {}, dataCache: ActiveSearchData | null = null) {
    const normalized = normalizeSearchParams(params);
    if (!dataCache || typeof dataCache !== 'object') {
        return normalized;
    }

    const metadata = getNormalizationMetadata(dataCache);
    const filteredVariantLocks = {};
    Object.keys(normalized.variantLocks).forEach((unitId) => {
        const variantId = normalized.variantLocks[unitId];
        const allowedVariants = metadata.allowedVariantsByUnit.get(unitId);
        if (allowedVariants?.has(variantId)) {
            filteredVariantLocks[unitId] = variantId;
        }
    });

    return {
        ...normalized,
        mustInclude: filterAllowedValues(normalized.mustInclude, metadata.allowedUnitIds),
        mustExclude: filterAllowedValues(normalized.mustExclude, metadata.allowedUnitIds),
        mustIncludeTraits: filterAllowedValues(normalized.mustIncludeTraits, metadata.allowedTraits),
        mustExcludeTraits: filterAllowedValues(normalized.mustExcludeTraits, metadata.allowedTraits),
        tankRoles: filterAllowedValues(normalized.tankRoles, metadata.allowedRoles),
        carryRoles: filterAllowedValues(normalized.carryRoles, metadata.allowedRoles),
        extraEmblems: filterAllowedValues(normalized.extraEmblems, metadata.allowedTraits),
        variantLocks: filteredVariantLocks
    };
}

export function deriveDefaultTankRoles(roles: unknown) {
    return normalizeStringList(roles).filter((role) => /tank/i.test(role));
}

export function deriveDefaultCarryRoles(roles: unknown) {
    const normalizedRoles = normalizeStringList(roles);
    const tankRoles = new Set(deriveDefaultTankRoles(normalizedRoles).map((role) => role.toLowerCase()));
    return normalizedRoles.filter((role) => role.toLowerCase() !== 'unknown' && !tankRoles.has(role.toLowerCase()));
}

export function withDefaultRoleFilters(params: SearchParamsInput = {}, dataCache: ActiveSearchData | null = null, limits: SearchQueryLimits = {}) {
    const roles = dataCache?.roles || [];
    return normalizeSearchParams({
        ...params,
        tankRoles: normalizeStringList(params.tankRoles).length ? params.tankRoles : deriveDefaultTankRoles(roles),
        carryRoles: normalizeStringList(params.carryRoles).length ? params.carryRoles : deriveDefaultCarryRoles(roles)
    }, limits);
}

export function createDefaultSearchQuery(dataCache: ActiveSearchData | null = null, limits: SearchQueryLimits = {}) {
    return withDefaultRoleFilters({
        ...DEFAULT_QUERY,
        maxResults: limits.DEFAULT_MAX_RESULTS || DEFAULT_QUERY.maxResults
    }, dataCache, limits);
}

export function buildSerializableSearchParams(params: SearchParamsInput = {}) {
    const normalized = normalizeSearchParams(params);
    return {
        boardSize: normalized.boardSize,
        maxResults: normalized.maxResults,
        mustInclude: [...normalized.mustInclude].sort(),
        mustExclude: [...normalized.mustExclude].sort(),
        mustIncludeTraits: [...normalized.mustIncludeTraits].sort(),
        mustExcludeTraits: [...normalized.mustExcludeTraits].sort(),
        tankRoles: [...normalized.tankRoles].sort(),
        carryRoles: [...normalized.carryRoles].sort(),
        extraEmblems: [...normalized.extraEmblems].sort(),
        variantLocks: Object.keys(normalized.variantLocks).sort().map((unitId) => [
            unitId,
            normalized.variantLocks[unitId]
        ]),
        onlyActive: normalized.onlyActive,
        tierRank: normalized.tierRank,
        includeUnique: normalized.includeUnique
    };
}

export function serializeSearchParams(params: SearchParamsInput = {}) {
    return JSON.stringify(buildSerializableSearchParams(params));
}

export function summarizeSearchParams(params: SearchParamsInput = {}) {
    const normalized = normalizeSearchParams(params);
    const parts: string[] = [];
    if (normalized.boardSize) parts.push(`Level ${normalized.boardSize}`);
    if (normalized.mustInclude.length) parts.push(`include ${normalized.mustInclude.length} units`);
    if (normalized.mustExclude.length) parts.push(`ban ${normalized.mustExclude.length} units`);
    if (normalized.mustIncludeTraits.length) parts.push(`force ${normalized.mustIncludeTraits.length} traits`);
    if (normalized.mustExcludeTraits.length) parts.push(`exclude ${normalized.mustExcludeTraits.length} traits`);
    if (normalized.extraEmblems.length) parts.push(`${normalized.extraEmblems.length} emblems`);
    const lockCount = Object.keys(normalized.variantLocks).length;
    if (lockCount) parts.push(`${lockCount} locked modes`);
    if (normalized.includeUnique) parts.push('unique traits on');
    if (!normalized.onlyActive) parts.push('inactive counted');
    if (!normalized.tierRank) parts.push('flat ranking');
    return parts.length ? parts.join(' • ') : 'Default query';
}
