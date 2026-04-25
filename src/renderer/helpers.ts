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

type SearchParams = {
    boardSize?: unknown;
    maxResults?: unknown;
    mustInclude?: unknown[];
    mustExclude?: unknown[];
    mustIncludeTraits?: unknown[];
    mustExcludeTraits?: unknown[];
    tankRoles?: unknown[];
    carryRoles?: unknown[];
    extraEmblems?: unknown[];
    variantLocks?: Record<string, unknown>;
    onlyActive?: unknown;
    tierRank?: unknown;
    includeUnique?: unknown;
};

type RendererLimits = {
    DEFAULT_MAX_RESULTS?: number;
    MAX_RESULTS?: number;
};

type VariantAssignment = {
    id?: string;
    label?: string;
};

type UnitLike = LooseRecord & {
    id?: string;
    traits?: string[];
    variants?: UnitLike[];
    traitContributions?: Record<string, number>;
};

type BoardLike = LooseRecord & {
    synergyScore?: number;
    traitsCount?: number;
    totalCost?: number;
    traitCounts?: Record<string, number>;
    variantAssignments?: Record<string, string | VariantAssignment>;
};

type ActiveData = LooseRecord & {
    units: UnitLike[];
    unitMap: Map<string, UnitLike>;
    traits: string[];
    roles: string[];
    traitBreakpoints: Record<string, number[]>;
    traitIcons: Record<string, string>;
};

export function formatNumber(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '-';
    return new Intl.NumberFormat('en-US').format(numeric);
}

export function formatBoardEstimate(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'variable';
    if (numeric >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(1)}B`;
    if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
    if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
    return formatNumber(numeric);
}

export function formatTimestamp(value: unknown) {
    if (!value) return '-';
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

export function formatSnapshotAge(value: unknown) {
    if (!value) return '';
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) return '';
    const elapsedMs = Date.now() - date.getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return '';
    const minutes = Math.floor(elapsedMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m old`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours}h old`;
    return `${Math.floor(hours / 24)}d old`;
}

export function getDataSourceLabel(source: unknown) {
    return source === 'latest' ? 'Live' : 'PBE';
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function normalizeStringList(values: unknown) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const normalized: string[] = [];
    values.forEach((value) => {
        const candidate = typeof value === 'object' && value
            ? value.value ?? value.id ?? value.name ?? value.label
            : value;
        const stringValue = String(candidate ?? '').trim();
        if (!stringValue || seen.has(stringValue)) return;
        seen.add(stringValue);
        normalized.push(stringValue);
    });
    return normalized;
}

export function normalizeSearchParams(params: SearchParams = {}, limits: RendererLimits = {}) {
    const maxResultsLimit = limits.MAX_RESULTS || 1000;
    const defaultMaxResults = limits.DEFAULT_MAX_RESULTS || DEFAULT_QUERY.maxResults;
    const variantLocks = {};
    if (params.variantLocks && typeof params.variantLocks === 'object' && !Array.isArray(params.variantLocks)) {
        Object.keys(params.variantLocks).sort().forEach((unitId) => {
            const key = String(unitId ?? '').trim();
            const value = String(params.variantLocks[unitId] ?? '').trim();
            if (key && value && value !== 'auto') {
                variantLocks[key] = value;
            }
        });
    }

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
        variantLocks,
        onlyActive: !!params.onlyActive,
        tierRank: !!params.tierRank,
        includeUnique: !!params.includeUnique
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

export function summarizeParams(params: SearchParams = {}) {
    const parts: string[] = [];
    if (params.boardSize) parts.push(`Level ${params.boardSize}`);
    if (params.mustInclude?.length) parts.push(`include ${params.mustInclude.length} units`);
    if (params.mustExclude?.length) parts.push(`ban ${params.mustExclude.length} units`);
    if (params.mustIncludeTraits?.length) parts.push(`force ${params.mustIncludeTraits.length} traits`);
    if (params.mustExcludeTraits?.length) parts.push(`exclude ${params.mustExcludeTraits.length} traits`);
    if (params.extraEmblems?.length) parts.push(`${params.extraEmblems.length} emblems`);
    const lockCount = Object.keys(params.variantLocks || {}).length;
    if (lockCount) parts.push(`${lockCount} locked modes`);
    if (params.includeUnique) parts.push('unique traits on');
    if (params.onlyActive === false) parts.push('inactive counted');
    if (params.tierRank === false) parts.push('flat ranking');
    return parts.length ? parts.join(' • ') : 'Default query';
}

export function getBoardMetric(board: BoardLike) {
    return Number(board?.synergyScore ?? board?.traitsCount ?? 0);
}

export function sortBoards(results: BoardLike[], sortMode: string) {
    const sorters = {
        mostTraits: (left, right) => getBoardMetric(right) - getBoardMetric(left) || Number(right.totalCost || 0) - Number(left.totalCost || 0),
        lowestCost: (left, right) => Number(left.totalCost || 0) - Number(right.totalCost || 0) || getBoardMetric(right) - getBoardMetric(left),
        highestCost: (left, right) => Number(right.totalCost || 0) - Number(left.totalCost || 0) || getBoardMetric(right) - getBoardMetric(left),
        bestValue: (left, right) => (getBoardMetric(right) / Math.max(Number(right.totalCost || 0), 1)) - (getBoardMetric(left) / Math.max(Number(left.totalCost || 0), 1))
    };
    return [...(Array.isArray(results) ? results : [])].sort(sorters[sortMode] || sorters.mostTraits);
}

export function createActiveData(response: LooseRecord, fallbackSource: string): ActiveData {
    return {
        units: response.units || [],
        unitMap: new Map((response.units || []).map((unit) => [unit.id, unit])),
        traits: response.traits || [],
        roles: response.roles || [],
        traitBreakpoints: response.traitBreakpoints || {},
        traitIcons: response.traitIcons || {},
        assetValidation: response.assetValidation || null,
        setNumber: response.setNumber,
        dataSource: response.dataSource || fallbackSource,
        dataFingerprint: response.dataFingerprint || null,
        hashMap: response.hashMap || {},
        snapshotFetchedAt: response.snapshotFetchedAt || null,
        usedCachedSnapshot: !!response.usedCachedSnapshot
    };
}

export function getAssetCoverageLabel(assetValidation: LooseRecord) {
    if (!assetValidation) return 'N/A';
    const valid = Number(assetValidation.valid ?? assetValidation.validCount);
    const total = Number(assetValidation.total ?? assetValidation.totalCount);
    if (Number.isFinite(valid) && Number.isFinite(total) && total > 0) {
        return `${valid}/${total}`;
    }
    if (typeof assetValidation.coverage === 'string') return assetValidation.coverage;
    return 'N/A';
}

export function getVariantAssignment(board: BoardLike, unitId: string) {
    const assignment = board?.variantAssignments?.[unitId];
    if (!assignment) return null;
    if (typeof assignment === 'string') return { id: assignment, label: assignment };
    return assignment;
}

export function buildTraitSummary(board: BoardLike, activeData: ActiveData, query: SearchParams) {
    if (!board || !activeData) return [];
    const counts = new Map<string, number>();
    Object.entries(board.traitCounts || {}).forEach(([trait, count]) => {
        const numeric = Number(count);
        if (trait && Number.isFinite(numeric) && numeric > 0) {
            counts.set(trait, numeric);
        }
    });
    (query.extraEmblems || []).forEach((trait) => {
        const traitName = String(trait ?? '').trim();
        if (traitName) {
            counts.set(traitName, (counts.get(traitName) || 0) + 1);
        }
    });

    return [...counts.entries()]
        .map(([trait, count]) => {
            const breakpoints = activeData.traitBreakpoints?.[trait] || [1];
            let levelReached = 0;
            for (const breakpoint of breakpoints) {
                if (count >= breakpoint) levelReached = breakpoint;
                else break;
            }
            const isUnique = breakpoints.length === 1 && breakpoints[0] === 1;
            if (!query.includeUnique && isUnique) return null;
            const nextBreakpoint = breakpoints.find((breakpoint) => breakpoint > count) || breakpoints.at(-1) || 1;
            return {
                trait,
                count,
                levelReached,
                isActive: levelReached > 0,
                iconUrl: activeData.traitIcons?.[trait] || null,
                label: levelReached > 0 ? `${trait} ${count}/${levelReached}` : `${trait} ${count}/${nextBreakpoint}`
            };
        })
        .filter(Boolean)
        .sort((left, right) =>
            Number(right.isActive) - Number(left.isActive)
            || right.levelReached - left.levelReached
            || right.count - left.count
            || left.trait.localeCompare(right.trait)
        );
}

export function collectUnitTraitLabels(unit: UnitLike) {
    const traitNames = new Set<string>();
    const addTraitNames = (entity: UnitLike) => {
        if (!entity || typeof entity !== 'object') return;
        if (entity.traitContributions && typeof entity.traitContributions === 'object') {
            Object.keys(entity.traitContributions).forEach((traitName) => traitName && traitNames.add(traitName));
            return;
        }
        (entity.traits || []).forEach((traitName) => traitName && traitNames.add(traitName));
    };
    addTraitNames(unit);
    (unit?.variants || []).forEach(addTraitNames);
    return [...traitNames].sort((left, right) => left.localeCompare(right));
}
