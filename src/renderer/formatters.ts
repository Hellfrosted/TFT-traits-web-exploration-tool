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
