import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MultiSelect } from './components/MultiSelect';
import {
    DEFAULT_QUERY,
    buildTraitSummary,
    collectUnitTraitLabels,
    createActiveData,
    deriveDefaultCarryRoles,
    deriveDefaultTankRoles,
    formatBoardEstimate,
    formatNumber,
    formatSnapshotAge,
    formatTimestamp,
    getAssetCoverageLabel,
    getBoardMetric,
    getDataSourceLabel,
    getVariantAssignment,
    normalizeSearchParams,
    sortBoards,
    summarizeParams
} from './helpers';

const api = window.electronAPI;

function Dialog({ dialog, onResolve }) {
    if (!dialog) return null;
    return (
        <div id="dialogModal" className="modal-overlay active" aria-hidden="false">
            <div className="modal dialog-modal" role="dialog" aria-modal="true" aria-labelledby="dialogTitle" aria-describedby="dialogMessage">
                <div className="modal-header dialog-header">
                    <h3 id="dialogTitle" className="dialog-title">{dialog.title}</h3>
                    <button className="modal-close" id="dialogClose" aria-label="Close dialog" onClick={() => onResolve(false)}>x</button>
                </div>
                <div className="modal-body dialog-body">
                    <p id="dialogMessage" className="dialog-message">{dialog.message}</p>
                </div>
                <div className="modal-footer dialog-footer">
                    {dialog.type === 'confirm' ? (
                        <button className="btn-sm btn-outline dialog-btn-cancel" id="dialogCancelBtn" onClick={() => onResolve(false)}>Cancel</button>
                    ) : null}
                    <button className="btn-sm dialog-btn-ok" id="dialogOkBtn" onClick={() => onResolve(true)}>OK</button>
                </div>
            </div>
        </div>
    );
}

function useDialog() {
    const resolverRef = useRef(null);
    const [dialog, setDialog] = useState(null);

    function resolve(value) {
        const resolver = resolverRef.current;
        resolverRef.current = null;
        setDialog(null);
        resolver?.(value);
    }

    function showAlert(message, title = 'Attention') {
        return new Promise((resolvePromise) => {
            resolverRef.current = resolvePromise;
            setDialog({ type: 'alert', message, title });
        });
    }

    function showConfirm(message, title = 'Confirmation') {
        return new Promise((resolvePromise) => {
            resolverRef.current = resolvePromise;
            setDialog({ type: 'confirm', message, title });
        });
    }

    return { dialog, resolve, showAlert, showConfirm };
}

function QuerySummary({ query, meta }) {
    const chips = useMemo(() => {
        if (!query) return [];
        const items = [];
        if (query.boardSize !== DEFAULT_QUERY.boardSize) items.push(`Level ${query.boardSize}`);
        if (query.maxResults !== (api?.limits?.DEFAULT_MAX_RESULTS || DEFAULT_QUERY.maxResults)) items.push(`${query.maxResults} max`);
        if (query.mustInclude?.length) items.push(`Include ${query.mustInclude.length} units`);
        if (query.mustExclude?.length) items.push(`Exclude ${query.mustExclude.length} units`);
        if (query.mustIncludeTraits?.length) items.push(`Force ${query.mustIncludeTraits.length} traits`);
        if (query.mustExcludeTraits?.length) items.push(`Ban ${query.mustExcludeTraits.length} traits`);
        if (query.extraEmblems?.length) items.push(`${query.extraEmblems.length} emblems`);
        const lockCount = Object.keys(query.variantLocks || {}).length;
        if (lockCount) items.push(`${lockCount} locked modes`);
        if (query.includeUnique) items.push('Unique traits on');
        if (!query.onlyActive) items.push('Inactive traits counted');
        if (!query.tierRank) items.push('Flat trait ranking');
        return items;
    }, [query]);
    const metaClass = /failed|error|cancel|unavailable|reduce|waiting/i.test(meta)
        ? 'query-summary-meta-warning'
        : chips.length > 0
            ? 'query-summary-meta-active'
            : '';

    return (
        <div id="resultsQuerySummary" className="query-summary-card">
            <div className="query-summary-heading">
                <span className="query-summary-label">Query</span>
                <span className={`query-summary-meta ${metaClass}`}>{meta}</span>
            </div>
            {chips.length > 0 ? (
                <div className="query-chip-list">
                    {chips.map((chip) => <span className="query-chip" key={chip}>{chip}</span>)}
                </div>
            ) : null}
        </div>
    );
}

function DataStats({ activeData }) {
    const coverage = activeData ? getAssetCoverageLabel(activeData.assetValidation) : '-';
    const stats = [
        ['Units', activeData?.units?.length ?? '-'],
        ['Traits', activeData?.traits?.length ?? '-'],
        ['Roles', activeData?.roles?.length ?? '-'],
        ['Splashes', coverage]
    ];
    return (
        <div id="dataStats" className="data-stats data-stats-overview">
            {stats.map(([label, value]) => (
                <div className="data-stat" key={label}>
                    <span className="data-stat-label">{label}</span>
                    <strong className="data-stat-value">{value}</strong>
                </div>
            ))}
        </div>
    );
}

function UnitPill({ unitId, board, activeData }) {
    const unit = activeData?.unitMap?.get(unitId);
    const baseLabel = unit?.displayName || unitId;
    const variant = getVariantAssignment(board, unitId);
    const label = variant?.label ? `${baseLabel} (${variant.label})` : baseLabel;
    return (
        <span className="unit-pill">
            {unit?.iconUrl ? <img className="pill-icon unit-icon" src={unit.iconUrl} alt={baseLabel} loading="lazy" /> : null}
            <span>{label}</span>
        </span>
    );
}

function TraitChip({ trait }) {
    return (
        <span className={`trait-chip${trait.isActive ? '' : ' trait-chip-muted'}`} title={trait.label}>
            {trait.iconUrl ? <img className="pill-icon trait-icon" src={trait.iconUrl} alt={trait.trait} loading="lazy" /> : null}
            {trait.label}
        </span>
    );
}

function ResultsSummary({ results, estimate }) {
    if (estimate && (!results || results.length === 0)) {
        return (
            <div id="resultsSummary" className="results-summary">
                <div className="summary-card"><span className="summary-label">Estimate</span><span className="summary-value">~{formatBoardEstimate(estimate.count)} boards</span></div>
                <div className="summary-card"><span className="summary-label">Open Slots</span><span className="summary-value">{Number.isFinite(Number(estimate.remainingSlots)) ? estimate.remainingSlots : '-'}</span></div>
                <div className="summary-card"><span className="summary-label">Best Score</span><span className="summary-value">-</span></div>
                <div className="summary-card"><span className="summary-label">Best Value</span><span className="summary-value">-</span></div>
            </div>
        );
    }

    const safeResults = Array.isArray(results) ? results : [];
    const topScore = safeResults.reduce((best, board) => Math.max(best, getBoardMetric(board)), Number.NEGATIVE_INFINITY);
    const lowestCost = safeResults.reduce((best, board) => Math.min(best, Number(board.totalCost || 0)), Number.POSITIVE_INFINITY);
    const bestValue = safeResults.reduce((best, board) => Math.max(best, getBoardMetric(board) / Math.max(Number(board.totalCost || 0), 1)), 0);
    return (
        <div id="resultsSummary" className="results-summary">
            <div className="summary-card"><span className="summary-label">Boards</span><span className="summary-value">{safeResults.length ? formatNumber(safeResults.length) : 'Awaiting execution'}</span></div>
            <div className="summary-card"><span className="summary-label">Best Score</span><span className="summary-value">{Number.isFinite(topScore) ? topScore : '-'}</span></div>
            <div className="summary-card"><span className="summary-label">Cost Floor</span><span className="summary-value">{Number.isFinite(lowestCost) ? lowestCost : '-'}</span></div>
            <div className="summary-card"><span className="summary-label">Best Value</span><span className="summary-value">{bestValue ? bestValue.toFixed(2) : '-'}</span></div>
        </div>
    );
}

function BoardSpotlight({ board, rankIndex, activeData, query, sortMode }) {
    if (!board) {
        return (
            <div id="boardSpotlight" className="board-spotlight empty">
                <div className="board-spotlight-header">
                    <div>
                        <span className="board-spotlight-label">Selected Board</span>
                        <h3 className="board-spotlight-title">No selection</h3>
                    </div>
                    <span className="board-spotlight-rank">Awaiting results</span>
                </div>
                <p className="board-spotlight-empty">No board selected.</p>
            </div>
        );
    }
    const metric = getBoardMetric(board);
    const unitCount = Array.isArray(board.units) ? board.units.length : 0;
    const occupiedSlots = Number.isFinite(Number(board.occupiedSlots)) ? Number(board.occupiedSlots) : unitCount;
    const sortLabels = {
        mostTraits: 'Best Synergy',
        lowestCost: 'Lowest Cost',
        highestCost: 'Highest Cost',
        bestValue: 'Best Value'
    };
    const traits = buildTraitSummary(board, activeData, query).slice(0, 14);
    return (
        <div id="boardSpotlight" className="board-spotlight">
            <div className="board-spotlight-header">
                <div>
                    <span className="board-spotlight-label">Selected Board</span>
                    <h3 className="board-spotlight-title">
                        {occupiedSlots === unitCount ? `Level ${occupiedSlots} board` : `${occupiedSlots}-slot board (${unitCount} units)`}
                    </h3>
                </div>
                <span className="board-spotlight-rank">Rank #{rankIndex + 1} by {sortLabels[sortMode] || sortLabels.mostTraits}</span>
            </div>
            <div className="spotlight-metrics">
                <span>Score {metric}</span>
                <span>1-Star {board.totalCost}</span>
                <span>2-Star {Number(board.totalCost || 0) * 3}</span>
                <span>Value {(metric / Math.max(Number(board.totalCost || 0), 1)).toFixed(2)}</span>
            </div>
            <div className="spotlight-traits">{traits.map((trait) => <TraitChip trait={trait} key={trait.trait} />)}</div>
            <div className="spotlight-units">
                {(board.units || []).map((unitId) => <UnitPill unitId={unitId} board={board} activeData={activeData} key={unitId} />)}
            </div>
        </div>
    );
}

function ResultsTable({ results, activeData, query, selectedIndex, onSelect }) {
    const parentRef = useRef(null);
    const rowVirtualizer = useVirtualizer({
        count: results.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 76,
        overscan: 10
    });

    if (results.length === 0) {
        return (
            <div className="results-table-wrap">
                <table id="resTable" role="grid" aria-label="Board results" aria-rowcount={0} aria-colcount={6}>
                    <thead>
                        <tr role="row"><th>Rank</th><th>Score</th><th>Traits</th><th>1-Star Cost</th><th>2-Star Cost</th><th>Units</th></tr>
                    </thead>
                    <tbody id="resBody">
                        <tr role="row"><td role="gridcell" colSpan={6} className="table-awaiting">Awaiting execution...</td></tr>
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="results-table-wrap virtual-results-wrap" ref={parentRef}>
            <div id="resTable" className="virtual-results-table" role="grid" aria-label="Board results" aria-rowcount={results.length} aria-colcount={6}>
                <div className="virtual-results-header" role="row">
                    <span>Rank</span><span>Score</span><span>Traits</span><span>1-Star Cost</span><span>2-Star Cost</span><span>Units</span>
                </div>
                <div id="resBody" className="virtual-results-body" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const board = results[virtualRow.index];
                        const metric = getBoardMetric(board);
                        const traits = buildTraitSummary(board, activeData, query).slice(0, 6);
                        return (
                            <button
                                type="button"
                                className={`virtual-result-row${virtualRow.index === selectedIndex ? ' result-row-selected' : ''}`}
                                role="row"
                                aria-selected={virtualRow.index === selectedIndex}
                                key={virtualRow.key}
                                onClick={() => onSelect(virtualRow.index)}
                                style={{ transform: `translateY(${virtualRow.start}px)` }}
                            >
                                <span className="rank-cell">#{virtualRow.index + 1}</span>
                                <span className="score-stack"><strong>{metric}</strong><span>Value {(metric / Math.max(Number(board.totalCost || 0), 1)).toFixed(2)}</span></span>
                                <span className="result-trait-list">{traits.map((trait) => <TraitChip trait={trait} key={trait.trait} />)}</span>
                                <span>{board.totalCost ?? 0}</span>
                                <span>{Number(board.totalCost || 0) * 3}</span>
                                <span className="result-unit-list">{(board.units || []).map((unitId) => <UnitPill unitId={unitId} board={board} activeData={activeData} key={unitId} />)}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function CacheModal({ isOpen, onClose, showAlert, showConfirm, refreshHistory }) {
    const [entries, setEntries] = useState([]);
    const [message, setMessage] = useState('Loading...');

    async function loadCache() {
        setMessage('Loading...');
        try {
            const response = await api?.listCache?.();
            if (!response?.success) {
                setEntries([]);
                setMessage(`Failed to load cache: ${response?.error || 'Unknown error'}`);
                return;
            }
            setEntries(response.entries || []);
            setMessage(response.entries?.length ? '' : 'No cached searches found.');
        } catch (error) {
            setEntries([]);
            setMessage(`Failed to load cache: ${error.message || String(error)}`);
        }
    }

    useEffect(() => {
        if (isOpen) void loadCache();
    }, [isOpen]);

    if (!isOpen) {
        return <div id="cacheModal" className="modal-overlay" aria-hidden="true" inert />;
    }

    return (
        <div id="cacheModal" className="modal-overlay active" aria-hidden="false">
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cacheModalTitle">
                <div className="modal-header">
                    <h3 id="cacheModalTitle">Cached Searches</h3>
                    <button className="modal-close" id="cacheModalClose" aria-label="Close cached searches" onClick={onClose}>x</button>
                </div>
                <div className="modal-body" id="cacheModalBody">
                    {message ? <p className="cache-empty">{message}</p> : (
                        <table className="cache-table">
                            <thead><tr><th>Search Parameters</th><th>Results</th><th>Cached</th><th /></tr></thead>
                            <tbody>
                                {entries.map((entry) => (
                                    <tr key={entry.key}>
                                        <td className="cache-table-summary-cell" title={summarizeParams(entry.params)}>{summarizeParams(entry.params)}</td>
                                        <td>{entry.resultCount}</td>
                                        <td className="cache-table-timestamp-cell">{formatTimestamp(entry.timestamp)}</td>
                                        <td>
                                            <button
                                                className="btn-sm btn-danger cache-delete-btn"
                                                onClick={async () => {
                                                    const result = await api?.deleteCacheEntry?.(entry.key);
                                                    if (!result?.success) {
                                                        await showAlert(result?.error || 'Failed to delete cache entry.', 'Cache Error');
                                                        return;
                                                    }
                                                    refreshHistory();
                                                    await loadCache();
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="modal-footer">
                    <button
                        className="btn-sm btn-danger"
                        id="clearAllCacheBtn"
                        onClick={async () => {
                            const confirmed = await showConfirm('Are you sure you want to delete all cached search results and fallback snapshots? This action cannot be undone.', 'Clear All Cache');
                            if (!confirmed) return;
                            const result = await api?.clearAllCache?.();
                            if (!result?.success) {
                                await showAlert(result?.error || 'Failed to clear cache.', 'Cache Error');
                                return;
                            }
                            refreshHistory();
                            await loadCache();
                        }}
                    >
                        Clear All
                    </button>
                    <button className="btn-sm btn-outline" id="cacheModalDone" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
}

export function App() {
    const dialogState = useDialog();
    const [source, setSource] = useState(api?.defaultDataSource || 'pbe');
    const [status, setStatus] = useState(api ? 'Initializing UI...' : 'Electron preload bridge unavailable.');
    const [summaryMeta, setSummaryMeta] = useState(api ? 'Initializing UI...' : 'Electron bridge unavailable');
    const [activeData, setActiveData] = useState(null);
    const [query, setQuery] = useState(() => normalizeSearchParams(DEFAULT_QUERY, api?.limits || {}));
    const [lastSearchParams, setLastSearchParams] = useState(null);
    const [results, setResults] = useState([]);
    const deferredResults = useDeferredValue(results);
    const [sortMode, setSortMode] = useState('mostTraits');
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [estimate, setEstimate] = useState(null);
    const [history, setHistory] = useState([]);
    const [isFetching, setIsFetching] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [cacheOpen, setCacheOpen] = useState(false);
    const [progress, setProgress] = useState(null);
    const sortedResults = useMemo(() => sortBoards(deferredResults, sortMode), [deferredResults, sortMode]);
    const selectedBoard = selectedIndex >= 0 ? sortedResults[selectedIndex] : null;

    const unitOptions = useMemo(() => (activeData?.units || []).map((unit) => ({
        ...unit,
        pillLabel: unit.displayName || unit.id,
        dropdownMeta: collectUnitTraitLabels(unit).join(' • ')
    })), [activeData]);
    const traitOptions = useMemo(() => (activeData?.traits || []).map((trait) => ({
        value: trait,
        label: trait,
        iconUrl: activeData?.traitIcons?.[trait] || ''
    })), [activeData]);
    const roleOptions = activeData?.roles || [];
    const variantUnits = useMemo(() => (activeData?.units || []).filter((unit) => unit.variants?.length > 0), [activeData]);

    function updateQuery(patch) {
        setQuery((current) => normalizeSearchParams({ ...current, ...patch }, api?.limits || {}));
    }

    async function normalizeThroughBridge(params = query) {
        if (api?.normalizeSearchParams) {
            try {
                const payload = await api.normalizeSearchParams(params);
                if (payload?.params) return payload.params;
            } catch (error) {
                console.error('[Query Normalization Failed]', error);
            }
        }
        return normalizeSearchParams(params, api?.limits || {});
    }

    async function refreshHistory() {
        try {
            const response = await api?.listCache?.({ limit: 5 });
            setHistory(response?.success ? response.entries || [] : []);
        } catch {
            setHistory([]);
        }
    }

    async function fetchData(selectedSource = source) {
        if (!api?.fetchData) {
            setStatus('Electron preload bridge unavailable.');
            return;
        }
        setIsFetching(true);
        setStatus(`Connecting to ${getDataSourceLabel(selectedSource)} Data Engine...`);
        try {
            const response = await api.fetchData(selectedSource);
            if (!response?.success) {
                setStatus(`Error: ${response?.error || 'Unknown error'}.`);
                await dialogState.showAlert(response?.error || 'Unknown error', 'Data Fetch Failed');
                return;
            }
            const nextData = createActiveData(response, selectedSource);
            const assetCoverage = getAssetCoverageLabel(nextData.assetValidation);
            const setLabel = nextData.setNumber
                ? `${getDataSourceLabel(nextData.dataSource)} Set ${nextData.setNumber}`
                : `${getDataSourceLabel(nextData.dataSource)} latest detected set`;
            const cacheAge = nextData.usedCachedSnapshot ? formatSnapshotAge(nextData.snapshotFetchedAt) : '';
            const statusParts = [`${setLabel} ready`, `${nextData.units.length} units`];
            if (assetCoverage && assetCoverage !== 'N/A') statusParts.push(`${assetCoverage} splashes`);
            if (nextData.usedCachedSnapshot) statusParts.push(cacheAge ? `cached ${cacheAge}` : 'cached');
            if (nextData.dataFingerprint) statusParts.push(nextData.dataFingerprint.slice(0, 8));
            startTransition(() => {
                setActiveData(nextData);
                setQuery((current) => normalizeSearchParams({
                    ...current,
                    tankRoles: current.tankRoles?.length ? current.tankRoles : deriveDefaultTankRoles(nextData.roles),
                    carryRoles: current.carryRoles?.length ? current.carryRoles : deriveDefaultCarryRoles(nextData.roles)
                }, api?.limits || {}));
                setSummaryMeta(`Loaded ${setLabel}`);
                setStatus(statusParts.join(' • '));
            });
            await refreshHistory();
        } catch (error) {
            setStatus(`Failed to communicate with main process: ${error.message || String(error)}.`);
            console.error(error);
        } finally {
            setIsFetching(false);
        }
    }

    async function refreshEstimate(params = query) {
        if (!activeData || !api?.getSearchEstimate || isSearching || isFetching) return;
        try {
            const normalized = await normalizeThroughBridge(params);
            const nextEstimate = await api.getSearchEstimate(normalized);
            setEstimate(nextEstimate);
        } catch (error) {
            console.error('[Draft Estimate Failed]', error);
        }
    }

    async function runSearch(params = query) {
        if (isSearching) return;
        if (isFetching) {
            setStatus('Data refresh is still in progress. Wait for it to finish before searching.');
            setSummaryMeta('Waiting for data refresh');
            return;
        }
        if (!activeData) {
            setStatus('Load data before searching.');
            setSummaryMeta('No data loaded');
            return;
        }
        if (!api?.searchBoards) {
            setStatus('Electron preload bridge unavailable.');
            return;
        }

        setIsSearching(true);
        setIsCancelling(false);
        setProgress(null);
        setResults([]);
        setSelectedIndex(-1);
        setStatus('Preparing search...');
        try {
            const normalized = await normalizeThroughBridge(params);
            setLastSearchParams(normalized);
            setQuery(normalized);
            setSummaryMeta('Searching...');
            const nextEstimate = await api.getSearchEstimate(normalized);
            setEstimate(nextEstimate);
            const maxRemainingSlots = api?.limits?.MAX_REMAINING_SLOTS ?? 7;
            if (nextEstimate?.remainingSlots > maxRemainingSlots) {
                setStatus(`Search too broad: reduce open slots to ${maxRemainingSlots} or fewer.`);
                setSummaryMeta('Reduce board size or add required units');
                return;
            }
            const largeSearchThreshold = api?.limits?.LARGE_SEARCH_THRESHOLD ?? 6_000_000_000;
            if (Number.isFinite(Number(nextEstimate?.count)) && nextEstimate.count > largeSearchThreshold) {
                const confirmed = await dialogState.showConfirm(`Search volume: ~${(nextEstimate.count / 1e9).toFixed(1)}B combinations. This may take a minute. Continue?`, 'Performance Warning');
                if (!confirmed) {
                    setStatus('Search cancelled before execution.');
                    setSummaryMeta('Search aborted');
                    return;
                }
            }
            const startTime = Date.now();
            const response = await api.searchBoards(normalized);
            if (response?.cancelled) {
                setStatus('Search cancelled.');
                setSummaryMeta('Search cancelled');
                return;
            }
            if (!response?.success) {
                setStatus(`Search failed: ${response?.error || 'Unknown error'}`);
                setSummaryMeta('Search failed');
                return;
            }
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const nextResults = Array.isArray(response.results) && !response.results[0]?.error ? response.results : [];
            setResults(nextResults);
            setSelectedIndex(nextResults.length ? 0 : -1);
            setStatus(nextResults.length
                ? `${formatNumber(nextResults.length)} boards found${response.fromCache ? ' from cache' : ''} in ${elapsed}s.`
                : 'No results found for these constraints.');
            setSummaryMeta(nextResults.length ? `Computed in ${elapsed}s${response.fromCache ? ' from cache' : ''}` : 'No results');
            await refreshHistory();
        } catch (error) {
            setStatus(`Search failed: ${error.message || String(error)}`);
            setSummaryMeta('Search failed');
            console.error(error);
        } finally {
            setIsSearching(false);
            setIsCancelling(false);
        }
    }

    async function cancelSearch() {
        if (!isSearching || isCancelling) return;
        setIsCancelling(true);
        setStatus('Cancelling search...');
        try {
            const response = await api?.cancelSearch?.();
            if (!response?.success) {
                setStatus(response?.error || 'Unable to cancel the active search.');
                setIsCancelling(false);
            }
        } catch (error) {
            setStatus(`Unable to cancel search: ${error.message || String(error)}`);
            setIsCancelling(false);
        }
    }

    function resetFilters() {
        if (isSearching || isFetching) {
            void dialogState.showAlert('Cancel the current search before resetting filters.');
            return;
        }
        setQuery(normalizeSearchParams({
            ...DEFAULT_QUERY,
            maxResults: api?.limits?.DEFAULT_MAX_RESULTS || DEFAULT_QUERY.maxResults,
            tankRoles: activeData ? deriveDefaultTankRoles(activeData.roles) : [],
            carryRoles: activeData ? deriveDefaultCarryRoles(activeData.roles) : []
        }, api?.limits || {}));
        setLastSearchParams(null);
        setResults([]);
        setSelectedIndex(-1);
        setEstimate(null);
        setSummaryMeta('Filters reset. Build a fresh query and compute when ready.');
        setStatus(activeData ? `Loaded ${activeData.unitMap.size} parsed champions and ready for a new query.` : 'Status: Unloaded');
    }

    useEffect(() => {
        document.documentElement.dataset.tftReady = '1';
        window.dispatchEvent(new CustomEvent('tft-renderer-ready', { detail: { ready: true } }));
        if (api?.onMainProcessError) {
            return api.onMainProcessError((data) => {
                void dialogState.showAlert(data.message, 'Backend Error');
            });
        }
        return undefined;
    }, []);

    useEffect(() => {
        if (!api?.flags?.smokeTest) {
            void fetchData(source);
        }
    }, []);

    useEffect(() => {
        if (!api?.onSearchProgress) return undefined;
        return api.onSearchProgress((data) => {
            setProgress(data);
            if (data?.pct !== undefined) {
                setStatus(`Searching... ${Math.round(Number(data.pct) * 100)}%`);
            }
        });
    }, []);

    useEffect(() => {
        const handler = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void runSearch();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [query, activeData, isSearching, isFetching]);

    useEffect(() => {
        const handle = setTimeout(() => {
            void refreshEstimate(query);
        }, 250);
        return () => clearTimeout(handle);
    }, [query, activeData, isSearching, isFetching]);

    return (
        <>
            <div className="app-shell">
                <aside className="controls panel">
                    <div className="controls-header">
                        <div className="controls-heading">
                            <div className="title-block"><h1 className="app-title">TFT Board Explorer</h1></div>
                            <button id="manageCacheBtn" className="btn-outline btn-cache-manage" onClick={() => setCacheOpen(true)}>Manage Cache</button>
                        </div>
                        <div className="toolbar-row toolbar-actions">
                            <select id="dataSourceSelect" aria-label="Data source" value={source} onChange={(event) => setSource(event.target.value)}>
                                <option value="pbe">PBE</option>
                                <option value="latest">Live</option>
                            </select>
                            <button id="fetchBtn" disabled={isFetching || isSearching} onClick={() => fetchData(source)}>{isFetching ? 'Fetching...' : 'Fetch Data'}</button>
                            <button id="resetFiltersBtn" className="btn-outline" onClick={resetFilters}>Reset Filters</button>
                        </div>
                        <div className="status-panel">
                            <div id="status" className="status-text" role="status" aria-live="polite">{status}</div>
                            <p className="status-shortcuts">Ctrl/Cmd + Enter runs the current query.</p>
                        </div>
                    </div>

                    <div className="controls-body">
                        <DataStats activeData={activeData} />
                        <section className="control-section">
                            <div className="section-heading"><h2>Board Parameters</h2><span className="section-hint">Sets search size and output cap</span></div>
                            <div className="number-grid">
                                <div className="field-group">
                                    <label htmlFor="boardSize">Board Size</label>
                                    <input id="boardSize" type="number" min="1" max="20" step="1" value={query.boardSize} onChange={(event) => updateQuery({ boardSize: event.target.value })} />
                                </div>
                                <div className="field-group">
                                    <label htmlFor="maxResults">Max Results</label>
                                    <input id="maxResults" type="number" min="1" max={api?.limits?.MAX_RESULTS || 1000} step="1" value={query.maxResults} onChange={(event) => updateQuery({ maxResults: event.target.value })} />
                                </div>
                            </div>
                        </section>

                        <section className="control-section">
                            <div className="section-heading"><h2>Units</h2><span className="section-hint">Hard includes and bans</span></div>
                            <MultiSelect id="mustInclude" label="Must Include Units" options={unitOptions} value={query.mustInclude} onChange={(value) => updateQuery({ mustInclude: value })} placeholder="Type to find champions" />
                            <MultiSelect id="mustExclude" label="Must Exclude Units" options={unitOptions} value={query.mustExclude} onChange={(value) => updateQuery({ mustExclude: value })} placeholder="Type to find champions" />
                        </section>

                        <section id="variantLocksSection" className={`control-section${variantUnits.length ? '' : ' hidden'}`}>
                            <div className="section-heading"><h2>Variant Locks</h2><span className="section-hint">Optional mode constraints</span></div>
                            <div id="variantLocksContainer" className="variant-locks-grid">
                                {variantUnits.map((unit) => (
                                    <label className="variant-lock-row" key={unit.id}>
                                        <span>{unit.displayName || unit.id}</span>
                                        <select
                                            value={query.variantLocks?.[unit.id] || 'auto'}
                                            onChange={(event) => updateQuery({ variantLocks: { ...query.variantLocks, [unit.id]: event.target.value } })}
                                        >
                                            <option value="auto">Auto</option>
                                            {unit.variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.label || variant.id}</option>)}
                                        </select>
                                    </label>
                                ))}
                            </div>
                        </section>

                        <section className="control-section">
                            <div className="section-heading"><h2>Traits</h2><span className="section-hint">Filters and emblem counts</span></div>
                            <MultiSelect id="mustIncludeTraits" label="Must Include Traits" options={traitOptions} value={query.mustIncludeTraits} onChange={(value) => updateQuery({ mustIncludeTraits: value })} placeholder="Type to find traits" />
                            <MultiSelect id="mustExcludeTraits" label="Must Exclude Traits" options={traitOptions} value={query.mustExcludeTraits} onChange={(value) => updateQuery({ mustExcludeTraits: value })} placeholder="Type to find traits" />
                            <MultiSelect id="extraEmblems" label="Extra Emblems" options={traitOptions} value={query.extraEmblems} onChange={(value) => updateQuery({ extraEmblems: value })} placeholder="Type to add emblems" />
                        </section>

                        <details className="control-section advanced-settings-panel">
                            <summary><span>Roles and Scoring</span><span className="details-hint">Role filters, trait scoring, and optional unique traits.</span></summary>
                            <div className="details-content">
                                <div className="synergy-settings-panel">
                                    <div className="settings-block-title">Synergy Settings</div>
                                    <div className="synergy-options">
                                        <label className="synergy-label"><input id="onlyActiveToggle" type="checkbox" checked={query.onlyActive} onChange={(event) => updateQuery({ onlyActive: event.target.checked })} /> Only Count Active Synergies</label>
                                        <label className="synergy-label"><input id="tierRankToggle" type="checkbox" checked={query.tierRank} onChange={(event) => updateQuery({ tierRank: event.target.checked })} /> Rank by Synergy Tier</label>
                                        <label className="synergy-label"><input id="includeUniqueToggle" type="checkbox" checked={query.includeUnique} onChange={(event) => updateQuery({ includeUnique: event.target.checked })} /> Include Unique (1-unit) Traits</label>
                                    </div>
                                </div>
                                <MultiSelect id="tankRoles" label="Tank Roles" options={roleOptions} value={query.tankRoles} onChange={(value) => updateQuery({ tankRoles: value })} placeholder="Type to find roles" />
                                <MultiSelect id="carryRoles" label="Carry / Ranged Roles" options={roleOptions} value={query.carryRoles} onChange={(value) => updateQuery({ carryRoles: value })} placeholder="Type to find roles" />
                            </div>
                        </details>

                        <section className="control-section history-panel">
                            <div className="section-heading"><h2>Recent Searches</h2><span className="section-hint">Replay and compare</span></div>
                            <div id="historyList" className="history-list">
                                {history.length ? history.slice(0, 5).map((entry) => (
                                    <button
                                        className="history-item"
                                        key={entry.key || entry.timestamp}
                                        onClick={async () => {
                                            const normalized = await normalizeThroughBridge(entry.params);
                                            setQuery(normalized);
                                            await runSearch(normalized);
                                        }}
                                    >
                                        <div className="history-title">{entry.params ? `Level ${entry.params.boardSize}` : 'Saved Search'}</div>
                                        <div className="history-params">{summarizeParams(entry.params)}</div>
                                        <div className="history-meta"><span>{entry.resultCount} results</span><span>{formatTimestamp(entry.timestamp)}</span></div>
                                    </button>
                                )) : <div className="history-empty">No recent searches yet</div>}
                            </div>
                        </section>
                    </div>

                    <div className="controls-footer">
                        <div className="footer-actions">
                            <button id="searchBtn" disabled={!activeData || isFetching || isSearching} className={isSearching ? 'disabled' : ''} onClick={() => runSearch()}>
                                {isSearching ? (progress?.pct ? `Searching ${Math.round(Number(progress.pct) * 100)}%` : 'Searching...') : 'Compute'}
                            </button>
                            <button id="cancelBtn" disabled={!isSearching || isCancelling} onClick={cancelSearch}>{isCancelling ? 'Cancelling...' : 'Cancel Search'}</button>
                        </div>
                    </div>
                </aside>

                <main id="resultsWorkspace" className="workspace panel" data-results-mode={sortedResults.length ? 'ready' : 'empty'}>
                    <div className="workspace-header">
                        <div className="results-title-block"><h2 className="results-title">Board Results</h2></div>
                        <div className="results-header-actions">
                            <div id="resultsPager" className="results-pager" aria-live="polite">{sortedResults.length ? `${formatNumber(sortedResults.length)} boards` : ''}</div>
                            <div className="sorting-controls">
                                <label className="sorting-label" htmlFor="sortMode">Sort</label>
                                <select id="sortMode" className="sorting-select" value={sortMode} onChange={(event) => {
                                    setSortMode(event.target.value);
                                    setSelectedIndex(sortedResults.length ? 0 : -1);
                                }}>
                                    <option value="mostTraits">Best Synergy</option>
                                    <option value="lowestCost">Lowest Cost</option>
                                    <option value="highestCost">Highest Cost</option>
                                    <option value="bestValue">Best Value (Traits/Gold)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    {!sortedResults.length ? <div id="resultsEmptyState" className="results-empty-state" role="status" aria-live="polite">Run a query to inspect ranked boards.</div> : null}
                    <div className="results-ready-shell">
                        <QuerySummary query={lastSearchParams || query} meta={summaryMeta} />
                        <ResultsSummary results={sortedResults} estimate={estimate} />
                        <BoardSpotlight board={selectedBoard} rankIndex={selectedIndex} activeData={activeData} query={lastSearchParams || query} sortMode={sortMode} />
                        <ResultsTable results={sortedResults} activeData={activeData} query={lastSearchParams || query} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
                    </div>
                </main>
            </div>

            <CacheModal
                isOpen={cacheOpen}
                onClose={() => setCacheOpen(false)}
                showAlert={dialogState.showAlert}
                showConfirm={dialogState.showConfirm}
                refreshHistory={() => void refreshHistory()}
            />
            <Dialog dialog={dialogState.dialog} onResolve={dialogState.resolve} />
        </>
    );
}
