type UnitLike = LooseRecord & {
    id?: string;
};

export type ActiveData = LooseRecord & {
    units: UnitLike[];
    unitMap: Map<string | undefined, UnitLike>;
    traits: string[];
    roles: string[];
    traitBreakpoints: Record<string, number[]>;
    traitIcons: Record<string, string>;
};

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
