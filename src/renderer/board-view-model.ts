import type { SearchParamsInput } from '../shared/board-search-query';
import type { ActiveData } from './active-data';

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

export function getVariantAssignment(board: BoardLike, unitId: string) {
    const assignment = board?.variantAssignments?.[unitId];
    if (!assignment) return null;
    if (typeof assignment === 'string') return { id: assignment, label: assignment };
    return assignment;
}

export function buildTraitSummary(board: BoardLike, activeData: ActiveData, query: SearchParamsInput) {
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
