// --- Global Registry ---
/** 
 * Holds references to the multi-select component instances.
 * @type {Object<string, {getValues: Function, setValues: Function, resolvePills: Function}>}
 */
const selectors = {};

/** 
 * Cached search results currently being viewed.
 * @type {Array}
 */
let currentResults = [];
let lastSearchParams = null;
let activeData = null;
let selectedBoardIndex = -1;
let hasBoundDraftListeners = false;
let isFetchingData = false;
const variantLockControls = new Map();
const roleDefaultsApi = window.roleDefaults || {};
const resolveDefaultTankRoles = roleDefaultsApi.deriveDefaultTankRoles || (() => []);
const resolveDefaultCarryRoles = roleDefaultsApi.deriveDefaultCarryRoles || (() => []);

/** 
 * Whether a search worker is currently running.
 * @type {boolean}
 */
let isSearching = false;
const electronBridge = window.electronAPI;
const hasElectronAPI = !!electronBridge;
const searchLimits = electronBridge?.limits || {};
const defaultDataSource = electronBridge?.defaultDataSource || 'pbe';
let rendererBootScheduled = false;
let uiShellInitialized = false;
let staticUiListenersBound = false;

function hasRequiredShellElements() {
    const requiredIds = [
        'dataSourceSelect',
        'fetchBtn',
        'status',
        'dataStats',
        'resultsQuerySummary',
        'boardSpotlight',
        'sortMode',
        'searchBtn',
        'cancelBtn',
        'resetFiltersBtn',
        'resBody'
    ];

    return requiredIds.every((id) => !!document.getElementById(id));
}

function bindStaticUiListeners() {
    if (staticUiListenersBound) return;
    staticUiListenersBound = true;

    document.getElementById('fetchBtn')?.addEventListener('click', () => {
        fetchData().catch((error) => {
            reportRendererInitFailure(error);
        });
    });

    document.getElementById('sortMode')?.addEventListener('change', () => {
        if (currentResults.length === 0) return;
        renderResults(getSortedResults(currentResults));
    });

    document.getElementById('cancelBtn')?.addEventListener('click', async () => {
        if (!electronBridge?.cancelSearch) return;
        await electronBridge.cancelSearch();
        document.getElementById('status').innerText = 'Cancelling search...';
        renderQuerySummary(lastSearchParams, 'Cancelling active search...');
    });

    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
        if (isSearching) {
            showAlert('Cancel the current search before resetting filters.');
            return;
        }

        document.getElementById('boardSize').value = 9;
        document.getElementById('maxResults').value = 100;
        document.getElementById('onlyActiveToggle').checked = true;
        document.getElementById('tierRankToggle').checked = true;
        document.getElementById('includeUniqueToggle').checked = false;

        if (selectors.mustInclude) selectors.mustInclude.setValues([]);
        if (selectors.mustExclude) selectors.mustExclude.setValues([]);
        if (selectors.mustIncludeTraits) selectors.mustIncludeTraits.setValues([]);
        if (selectors.mustExcludeTraits) selectors.mustExcludeTraits.setValues([]);
        if (selectors.extraEmblems) selectors.extraEmblems.setValues([]);
        applyDefaultRoleFilters(true);
        applyVariantLocks({});

        lastSearchParams = null;
        currentResults = [];
        renderEmptySummary('Awaiting execution');
        renderEmptySpotlight();
        renderQuerySummary(null, 'Filters reset. Build a fresh query and compute when ready.');
        document.getElementById('resBody').innerHTML = '<tr><td colspan="6" class="table-awaiting">Awaiting execution...</td></tr>';
        document.getElementById('status').innerText = activeData
            ? `Loaded ${activeData.unitMap.size} parsed champions and ready for a new query.`
            : 'Status: Unloaded';
    });

    document.addEventListener('keydown', (event) => {
        const isSubmitChord = (event.ctrlKey || event.metaKey) && event.key === 'Enter';
        if (!isSubmitChord || isSearching) return;
        event.preventDefault();
        document.getElementById('searchBtn')?.click();
    });

    document.getElementById('searchBtn')?.addEventListener('click', handleSearchClick);
}

function initializeUiShell() {
    if (uiShellInitialized) return true;
    if (!hasRequiredShellElements()) {
        return false;
    }

    setDataStats();
    renderQuerySummary(null, hasElectronAPI ? 'Initializing UI...' : 'Electron bridge unavailable');
    renderEmptySpotlight(hasElectronAPI ? 'Loading data...' : 'Electron preload bridge unavailable.');
    setStatusMessage(hasElectronAPI ? 'Initializing UI...' : 'Electron preload bridge unavailable.');
    bindStaticUiListeners();
    syncFetchButtonState();
    uiShellInitialized = true;
    return true;
}

async function bootstrapRenderer() {
    if (bootstrapRenderer.started) return;
    if (!initializeUiShell()) return;
    bootstrapRenderer.started = true;
    const sourceSelect = document.getElementById('dataSourceSelect');
    if (sourceSelect) {
        sourceSelect.value = defaultDataSource;
    }
    await fetchData();
}

function reportRendererInitFailure(error) {
    const errorMessage = error?.message || String(error);
    console.error('[Renderer Init Failed]', error);
    setStatusMessage(`Renderer init failed: ${errorMessage}`);
}

function scheduleRendererBootstrap() {
    if (rendererBootScheduled) return;
    rendererBootScheduled = true;

    const runBootstrap = () => {
        bootstrapRenderer().catch((error) => {
            reportRendererInitFailure(error);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runBootstrap, { once: true });
    } else {
        runBootstrap();
    }

    window.addEventListener('load', runBootstrap, { once: true });
    setTimeout(runBootstrap, 1500);
}

function getSelectedDataSource() {
    const sourceSelect = document.getElementById('dataSourceSelect');
    return sourceSelect?.value || defaultDataSource;
}

function getDataSourceLabel(source) {
    return source === 'latest' ? 'Live' : 'PBE';
}

function formatSnapshotAge(timestamp) {
    const parsedTimestamp = Number(timestamp);
    if (!Number.isFinite(parsedTimestamp) || parsedTimestamp <= 0) {
        return '';
    }

    const ageMs = Math.max(0, Date.now() - parsedTimestamp);
    const ageMinutes = Math.round(ageMs / 60000);
    if (ageMinutes < 1) {
        return 'freshly cached';
    }
    if (ageMinutes < 60) {
        return `${ageMinutes}m old`;
    }

    const ageHours = Math.round(ageMinutes / 60);
    if (ageHours < 24) {
        return `${ageHours}h old`;
    }

    const ageDays = Math.round(ageHours / 24);
    return `${ageDays}d old`;
}

function getBoardMetric(board) {
    return board.synergyScore ?? board.traitsCount ?? 0;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.escapeHtml = escapeHtml;

function renderIconImage(url, alt, className) {
    if (!url) return '';
    return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy">`;
}

function renderUnitPill(name, board = null) {
    const unit = activeData?.unitMap?.get(name);
    const label = unit?.displayName || name;
    const variantAssignment = board?.variantAssignments?.[name];
    const variantLabel = typeof variantAssignment === 'string'
        ? variantAssignment
        : variantAssignment?.label || '';
    const fullLabel = variantLabel ? `${label} (${variantLabel})` : label;
    const iconMarkup = renderIconImage(unit?.iconUrl, label, 'pill-icon unit-icon');

    return `<span class="unit-pill">${iconMarkup}<span>${escapeHtml(fullLabel)}</span></span>`;
}

function renderTraitChip(trait, extraClassName = '') {
    const iconMarkup = renderIconImage(trait.iconUrl, trait.trait, 'pill-icon trait-icon');
    const className = ['trait-chip', extraClassName].filter(Boolean).join(' ');
    return `<span class="${className}">${iconMarkup}${escapeHtml(trait.label)}</span>`;
}

function setResultsSummary(content) {
    const summary = document.getElementById('resultsSummary');
    if (summary) {
        summary.innerHTML = content;
    }
}

function setQuerySummary(content) {
    const summary = document.getElementById('resultsQuerySummary');
    if (summary) {
        summary.innerHTML = content;
    }
}

function setDataStats(units = '-', traits = '-', roles = '-', assets = '-') {
    const stats = document.getElementById('dataStats');
    if (!stats) return;

    stats.innerHTML = `
        <div class="data-stat">
            <span class="data-stat-label">Units</span>
            <strong class="data-stat-value">${units}</strong>
        </div>
        <div class="data-stat">
            <span class="data-stat-label">Traits</span>
            <strong class="data-stat-value">${traits}</strong>
        </div>
        <div class="data-stat">
            <span class="data-stat-label">Roles</span>
            <strong class="data-stat-value">${roles}</strong>
        </div>
        <div class="data-stat">
            <span class="data-stat-label">Splashes</span>
            <strong class="data-stat-value">${assets}</strong>
        </div>
    `;
}

function setStatusMessage(message) {
    const status = document.getElementById('status');
    if (status) {
        status.innerText = message;
    }
}

function applyDefaultRoleFilters(force = false) {
    if (!activeData?.roles) return;

    const defaultTankRoles = resolveDefaultTankRoles(activeData.roles);
    const defaultCarryRoles = resolveDefaultCarryRoles(activeData.roles);

    if (selectors.tankRoles && (force || selectors.tankRoles.getValues().length === 0)) {
        selectors.tankRoles.setValues(defaultTankRoles);
    }

    if (selectors.carryRoles && (force || selectors.carryRoles.getValues().length === 0)) {
        selectors.carryRoles.setValues(defaultCarryRoles);
    }
}

function getVariantCapableUnits() {
    if (!activeData?.unitMap) return [];

    return [...activeData.unitMap.values()]
        .filter((unit) => Array.isArray(unit.variants) && unit.variants.length > 0)
        .sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));
}

function getCurrentVariantLocks() {
    const variantLocks = {};

    variantLockControls.forEach((select, unitId) => {
        const value = String(select.value || '').trim();
        if (!value || value === 'auto') {
            return;
        }

        variantLocks[unitId] = value;
    });

    return variantLocks;
}

function applyVariantLocks(variantLocks = {}) {
    variantLockControls.forEach((select, unitId) => {
        const requested = variantLocks?.[unitId] || 'auto';
        const hasRequestedOption = Array.from(select.options).some((option) => option.value === requested);
        select.value = hasRequestedOption ? requested : 'auto';
    });
}

function renderVariantLockControls(preservedLocks = null) {
    const section = document.getElementById('variantLocksSection');
    const container = document.getElementById('variantLocksContainer');
    if (!section || !container) return;

    const variantUnits = getVariantCapableUnits();
    const locks = preservedLocks || getCurrentVariantLocks();
    variantLockControls.clear();
    container.innerHTML = '';

    if (variantUnits.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    variantUnits.forEach((unit) => {
        const row = document.createElement('div');
        row.className = 'variant-lock-row';

        const label = document.createElement('div');
        label.className = 'variant-lock-name';
        label.textContent = unit.displayName || unit.id;

        const select = document.createElement('select');
        select.className = 'variant-lock-select';
        select.setAttribute('aria-label', `${unit.displayName || unit.id} variant lock`);

        const autoOption = document.createElement('option');
        autoOption.value = 'auto';
        autoOption.textContent = 'Auto';
        select.appendChild(autoOption);

        unit.variants.forEach((variant) => {
            const option = document.createElement('option');
            option.value = variant.id;
            option.textContent = variant.label || variant.id;
            select.appendChild(option);
        });

        row.appendChild(label);
        row.appendChild(select);
        container.appendChild(row);
        variantLockControls.set(unit.id, select);

        select.addEventListener('change', refreshDraftQuerySummary);
    });

    applyVariantLocks(locks);
}

function getAssetCoverageLabel(assetValidation) {
    if (!assetValidation || assetValidation.championAssetCount === 0) {
        return 'N/A';
    }

    return `${assetValidation.matchedChampionCount}/${assetValidation.totalUnits}`;
}

function summarizeAssetValidation(assetValidation) {
    if (!assetValidation) {
        return '';
    }

    if (assetValidation.championAssetCount === 0) {
        return 'Splash manifest unavailable.';
    }

    const parts = [
        `${assetValidation.matchedChampionCount}/${assetValidation.totalUnits} champion splashes matched`
    ];
    if (assetValidation.missingChampionIcons.length > 0) {
        const missingPreview = assetValidation.missingChampionIcons.slice(0, 3).join(', ');
        const suffix = assetValidation.missingChampionIcons.length > 3 ? ', ...' : '';
        parts.push(`${assetValidation.missingChampionIcons.length} missing (${missingPreview}${suffix})`);
    }
    return parts.join(', ');
}

function syncFetchButtonState() {
    const fetchBtn = document.getElementById('fetchBtn');
    if (!fetchBtn) return;
    const shouldDisable = isSearching || isFetchingData;
    fetchBtn.disabled = shouldDisable;
    fetchBtn.style.opacity = shouldDisable ? '0.5' : '1';
}

function renderEmptySummary(message) {
    setResultsSummary(`
        <div class="summary-card">
            <span class="summary-label">Status</span>
            <span class="summary-value">${escapeHtml(message)}</span>
        </div>
        <div class="summary-card">
            <span class="summary-label">Top Score</span>
            <span class="summary-value">-</span>
        </div>
        <div class="summary-card">
            <span class="summary-label">Lowest Cost</span>
            <span class="summary-value">-</span>
        </div>
        <div class="summary-card">
            <span class="summary-label">Best Value</span>
            <span class="summary-value">-</span>
        </div>
    `);
}

function renderEmptySpotlight(message = 'No selection') {
    const spotlight = document.getElementById('boardSpotlight');
    if (!spotlight) return;

    spotlight.className = 'board-spotlight empty';
    spotlight.innerHTML = `
        <div class="board-spotlight-header">
            <div>
                <span class="board-spotlight-label">Selected Board</span>
                <h3 class="board-spotlight-title">No selection</h3>
            </div>
            <span class="board-spotlight-rank">Awaiting results</span>
        </div>
        <p class="board-spotlight-empty">${escapeHtml(message)}</p>
    `;
}

function renderQuerySummary(params = null, meta = 'Idle') {
    if (!params) {
        setQuerySummary(`
            <span class="query-summary-label">Query</span>
            <div class="query-summary-content">${escapeHtml(meta)}</div>
        `);
        return;
    }

    const chips = [
        `Level ${params.boardSize}`,
        `Max ${params.maxResults}`
    ];

    if (params.mustInclude?.length) chips.push(`Include ${params.mustInclude.length} units`);
    if (params.mustExclude?.length) chips.push(`Exclude ${params.mustExclude.length} units`);
    if (params.mustIncludeTraits?.length) chips.push(`Force ${params.mustIncludeTraits.length} traits`);
    if (params.mustExcludeTraits?.length) chips.push(`Ban ${params.mustExcludeTraits.length} traits`);
    if (params.extraEmblems?.length) chips.push(`${params.extraEmblems.length} emblems`);
    if (Object.keys(params.variantLocks || {}).length) chips.push(`${Object.keys(params.variantLocks).length} locked modes`);
    if (params.includeUnique) chips.push('Unique traits on');
    if (!params.onlyActive) chips.push('Inactive traits counted');
    if (!params.tierRank) chips.push('Flat trait ranking');

    setQuerySummary(`
        <span class="query-summary-label">Query</span>
        <div class="query-summary-content">${escapeHtml(meta)}</div>
        <div class="query-chip-list">${chips.map((chip) => `<span class="query-chip">${escapeHtml(chip)}</span>`).join('')}</div>
    `);
}

function getCurrentSearchParams() {
    return {
        boardSize: parseInt(document.getElementById('boardSize').value, 10) || 9,
        maxResults: parseInt(document.getElementById('maxResults').value, 10) || 100,
        mustInclude: selectors.mustInclude?.getValues() || [],
        mustExclude: selectors.mustExclude?.getValues() || [],
        mustIncludeTraits: selectors.mustIncludeTraits?.getValues() || [],
        mustExcludeTraits: selectors.mustExcludeTraits?.getValues() || [],
        extraEmblems: selectors.extraEmblems?.getValues() || [],
        variantLocks: getCurrentVariantLocks(),
        tankRoles: selectors.tankRoles?.getValues() || [],
        carryRoles: selectors.carryRoles?.getValues() || [],
        onlyActive: document.getElementById('onlyActiveToggle').checked,
        tierRank: document.getElementById('tierRankToggle').checked,
        includeUnique: document.getElementById('includeUniqueToggle').checked
    };
}

function clampNumericInput(id, min, max, fallback) {
    const input = document.getElementById(id);
    const parsed = parseInt(input.value, 10);

    if (Number.isNaN(parsed)) {
        input.value = fallback;
        return fallback;
    }

    const clamped = Math.min(Math.max(parsed, min), max);
    if (clamped !== parsed) input.value = clamped;
    return clamped;
}

function refreshDraftQuerySummary() {
    if (!activeData || isSearching) return;
    const params = getCurrentSearchParams();
    const signalCount = params.mustInclude.length
        + params.mustExclude.length
        + params.mustIncludeTraits.length
        + params.mustExcludeTraits.length
        + params.extraEmblems.length
        + Object.keys(params.variantLocks || {}).length;
    const meta = signalCount > 0
        ? `${signalCount} active constraints`
        : 'Idle';
    renderQuerySummary(params, meta);
}

function bindDraftQueryListeners() {
    if (hasBoundDraftListeners) return;
    hasBoundDraftListeners = true;

    ['boardSize', 'maxResults'].forEach((id) => {
        const input = document.getElementById(id);
        input.addEventListener('change', () => {
            if (id === 'boardSize') clampNumericInput('boardSize', 1, 20, 9);
            if (id === 'maxResults') clampNumericInput('maxResults', 1, 10000, 100);
            refreshDraftQuerySummary();
        });
    });

    ['onlyActiveToggle', 'tierRankToggle', 'includeUniqueToggle'].forEach((id) => {
        document.getElementById(id).addEventListener('change', refreshDraftQuerySummary);
    });

    document.querySelector('.controls-body')?.addEventListener('selectionchange', refreshDraftQuerySummary);
}

function buildBoardTraitSummary(board) {
    if (!activeData?.unitMap) return [];

    const counts = new Map();
    const hasPrecomputedTraitCounts = board?.traitCounts && typeof board.traitCounts === 'object';
    if (hasPrecomputedTraitCounts) {
        Object.entries(board.traitCounts).forEach(([trait, count]) => {
            counts.set(trait, count);
        });
    } else {
        for (const unitName of board.units) {
            const unit = activeData.unitMap.get(unitName);
            if (!unit) continue;
            for (const trait of unit.traits) {
                counts.set(trait, (counts.get(trait) || 0) + 1);
            }
        }
    }

    if (!hasPrecomputedTraitCounts) {
        for (const emblem of lastSearchParams?.extraEmblems || []) {
            counts.set(emblem, (counts.get(emblem) || 0) + 1);
        }
    }

    const activeTraits = [];
    counts.forEach((count, trait) => {
        const breakpoints = activeData.traitBreakpoints?.[trait] || [1];
        let levelReached = 0;
        for (const breakpoint of breakpoints) {
            if (count >= breakpoint) levelReached = breakpoint;
            else break;
        }

        const isUnique = breakpoints.length === 1 && breakpoints[0] === 1;
        if (!lastSearchParams?.includeUnique && isUnique) return;
        if (lastSearchParams?.onlyActive && levelReached === 0) return;

        const nextBreakpoint = breakpoints.find((breakpoint) => breakpoint > count) || breakpoints[breakpoints.length - 1];
        activeTraits.push({
            trait,
            count,
            levelReached,
            isActive: levelReached > 0,
            label: levelReached > 0 ? `${trait} ${count}/${levelReached}` : `${trait} ${count}/${nextBreakpoint}`,
            iconUrl: activeData?.traitIcons?.[trait] || null
        });
    });

    return activeTraits.sort((a, b) =>
        b.levelReached - a.levelReached ||
        b.count - a.count ||
        a.trait.localeCompare(b.trait)
    );
}

function getBoardSortLabel() {
    const labels = {
        mostTraits: 'Best Synergy',
        lowestCost: 'Lowest Cost',
        highestCost: 'Highest Cost',
        bestValue: 'Best Value'
    };

    return labels[getActiveSortMode()] || labels.mostTraits;
}

function renderBoardSpotlight(board, rankIndex) {
    if (!board) {
        renderEmptySpotlight();
        return;
    }

    const spotlight = document.getElementById('boardSpotlight');
    const traits = buildBoardTraitSummary(board);
    const unitsMarkup = board.units.map((name) => renderUnitPill(name, board)).join('');
    const traitMarkup = traits.length > 0
        ? traits.map((trait) => renderTraitChip(trait, trait.isActive ? 'trait-chip-active' : 'trait-chip-inactive')).join('')
        : '<span class="trait-chip trait-chip-empty">No qualifying traits</span>';
    const valueScore = (getBoardMetric(board) / Math.max(board.totalCost, 1)).toFixed(2);

    spotlight.className = 'board-spotlight';
    spotlight.innerHTML = `
        <div class="board-spotlight-header">
            <div>
                <span class="board-spotlight-label">Selected Board</span>
                <h3 class="board-spotlight-title">Level ${board.units.length} board - ${getBoardMetric(board)} score</h3>
            </div>
            <span class="board-spotlight-rank">Rank #${rankIndex + 1} by ${getBoardSortLabel()}</span>
        </div>
        <div class="spotlight-inline">
            <div class="spotlight-inline-block">
                <div class="spotlight-metrics">
                    <span class="spotlight-metric">Score ${getBoardMetric(board)}</span>
                    <span class="spotlight-metric">1-Star ${board.totalCost}</span>
                    <span class="spotlight-metric">2-Star ${board.totalCost * 3}</span>
                    <span class="spotlight-metric">Value ${valueScore}</span>
                </div>
            </div>
            <div class="spotlight-inline-block">
                <div class="spotlight-unit-list">${unitsMarkup}</div>
            </div>
            <div class="spotlight-inline-block spotlight-inline-traits">
                <div class="spotlight-traits">${traitMarkup}</div>
            </div>
        </div>
    `;
}

// --- Global Error Handlers ---
window.onerror = (message, source, lineno, colno, error) => {
    console.error('[Browser Error]', message, source, lineno, error);
    setStatusMessage(`Renderer error: ${message}`);
    showAlert(`Uncaught UI Exception: ${message}`, 'Application Error');
    return true;
};

window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Rejection]', event.reason);
    setStatusMessage(`Async error: ${event.reason?.message || event.reason}`);
    showAlert(`Async Exception: ${event.reason}`, 'Application Error');
});

// Use the restored IPC error bridge from preload.js
if (window.electronAPI && window.electronAPI.onMainProcessError) {
    window.electronAPI.onMainProcessError((data) => {
        showAlert(data.message, 'Backend Error');
    });
}

// --- Data Fetching ---

/**
 * Fetch TFT data for the selected Community Dragon channel and initialize UI controls.
 */
async function fetchData() {
    const source = getSelectedDataSource();
    const sourceLabel = getDataSourceLabel(source);
    const preservedVariantLocks = getCurrentVariantLocks();
    isFetchingData = true;
    syncFetchButtonState();
    setStatusMessage(`Connecting to ${sourceLabel} Data Engine...`);

    try {
        if (!hasElectronAPI) {
            throw new Error('Electron preload bridge is unavailable.');
        }

        const res = await electronBridge.fetchData(source);
        if (res.success) {
            const activeSource = res.dataSource || source;
            const activeSourceLabel = getDataSourceLabel(activeSource);
            const setLabel = res.setNumber ? `${activeSourceLabel} Set ${res.setNumber}` : `${activeSourceLabel} latest detected set`;
            const fingerprintShort = res.dataFingerprint ? res.dataFingerprint.slice(0, 8) : 'unknown';
            const snapshotAgeLabel = formatSnapshotAge(res.snapshotFetchedAt);
            const cacheSummary = res.usedCachedSnapshot
                ? ` Using cached snapshot${snapshotAgeLabel ? ` (${snapshotAgeLabel})` : ''}.`
                : '';
            setStatusMessage(`Loaded ${res.count} parsed champions from ${setLabel} (${fingerprintShort}).`);
            activeData = {
                unitMap: new Map(res.units.map((unit) => [unit.id, unit])),
                roles: res.roles || [],
                traitBreakpoints: res.traitBreakpoints || {},
                traitIcons: res.traitIcons || {},
                assetValidation: res.assetValidation || null,
                setNumber: res.setNumber,
                dataSource: activeSource,
                dataFingerprint: res.dataFingerprint,
                hashMap: res.hashMap || {},
                snapshotFetchedAt: res.snapshotFetchedAt || null,
                usedCachedSnapshot: !!res.usedCachedSnapshot
            };
            const assetSummary = summarizeAssetValidation(res.assetValidation);
            setStatusMessage(assetSummary
                ? `Loaded ${res.count} parsed champions from ${setLabel} (${fingerprintShort}). ${assetSummary}${cacheSummary}`
                : `Loaded ${res.count} parsed champions from ${setLabel} (${fingerprintShort}).${cacheSummary}`);
            setDataStats(
                res.units.length,
                res.traits.length,
                res.roles.length,
                getAssetCoverageLabel(res.assetValidation)
            );
            renderQuerySummary(null, `Loaded ${setLabel}`);
             
            // Initialize Multi-Select Inputs
            // 1. Units
            selectors.mustInclude = setupMultiSelect('mustIncludeContainer', res.units, true);
            selectors.mustExclude = setupMultiSelect('mustExcludeContainer', res.units, true);
            // 2. Traits
            const traitOptions = res.traits.map((trait) => ({
                value: trait,
                label: trait,
                iconUrl: res.traitIcons?.[trait] || null
            }));
            selectors.mustIncludeTraits = setupMultiSelect('mustIncludeTraitsContainer', traitOptions, false);
            selectors.mustExcludeTraits = setupMultiSelect('mustExcludeTraitsContainer', traitOptions, false);
            selectors.extraEmblems = setupMultiSelect('extraEmblemsContainer', traitOptions, false);
            // 3. Roles
            selectors.tankRoles = setupMultiSelect('tankRolesContainer', res.roles, false);
            selectors.carryRoles = setupMultiSelect('carryRolesContainer', res.roles, false);
            renderVariantLockControls(lastSearchParams?.variantLocks || preservedVariantLocks);

            // Resolve any hashed values restored from prior cached searches.
            Object.values(selectors).forEach(s => s.resolvePills(res.hashMap));
            applyDefaultRoleFilters();
            bindDraftQueryListeners();
            refreshDraftQuerySummary();
            
            // Populate initial history list
            updateHistoryList();
        } else {
            const retained = activeData?.unitMap?.size
                ? ` Retaining previously loaded ${activeData.unitMap.size}-unit ${getDataSourceLabel(activeData.dataSource)} dataset.`
                : '';
            setStatusMessage(`Error: ${res.error}.${retained}`);
            if (!activeData) {
                setDataStats();
            }
            showAlert(res.error, 'Data Fetch Failed');
        }
    } catch (err) {
        const retained = activeData?.unitMap?.size
            ? ` Retaining previously loaded ${activeData.unitMap.size}-unit ${getDataSourceLabel(activeData.dataSource)} dataset.`
            : '';
        setStatusMessage(`Failed to communicate with main process: ${err.message || err}.${retained}`);
        if (!activeData) {
            setDataStats();
        }
        console.error(err);
    } finally {
        isFetchingData = false;
        syncFetchButtonState();
    }
}

scheduleRendererBootstrap();


// Listen for progress updates from the engine
if (electronBridge?.onSearchProgress) {
    electronBridge.onSearchProgress((data) => {
        const progressEl = document.getElementById('searchProgress');
        const searchBtn = document.getElementById('searchBtn');
        if (progressEl) {
            progressEl.textContent = `Computing... ${data.pct}%`;
            progressEl.style.display = 'block';
        }
        if (searchBtn) {
            searchBtn.innerText = `Searching... ${data.pct}%`;
        }
    });
}

// --- Results Rendering ---

const sortFunctions = {
    mostTraits: (a, b) => getBoardMetric(b) - getBoardMetric(a) || a.totalCost - b.totalCost,
    lowestCost: (a, b) => a.totalCost - b.totalCost || getBoardMetric(b) - getBoardMetric(a),
    highestCost: (a, b) => b.totalCost - a.totalCost || getBoardMetric(b) - getBoardMetric(a),
    bestValue: (a, b) => (getBoardMetric(b) / b.totalCost) - (getBoardMetric(a) / a.totalCost)
};

function getActiveSortMode() {
    return document.getElementById('sortMode')?.value || 'mostTraits';
}

function getSortedResults(results) {
    const sortFn = sortFunctions[getActiveSortMode()] || sortFunctions.mostTraits;
    return [...results].sort(sortFn);
}

/**
 * Render search results into the results table.
 * @param {Array} results - Computed board objects
 */
function renderResults(results) {
    const tbody = document.getElementById('resBody');
    tbody.innerHTML = '';
    selectedBoardIndex = results.length > 0 ? 0 : -1;

    if (!results || results.length === 0) {
        renderEmptySummary('No results');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #ff5252; padding: 20px;">No results found for these constraints.</td></tr>';
        renderEmptySpotlight('No boards matched the current filters. Relax constraints or widen the search.');
        return;
    }

    if (results[0].error) {
        renderEmptySummary('Search error');
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">${escapeHtml(results[0].error)}</td></tr>`;
        renderEmptySpotlight('Search failed before a board could be inspected.');
        return;
    }

    const bestValue = results.reduce((best, board) => Math.max(best, getBoardMetric(board) / Math.max(board.totalCost, 1)), 0);
    const lowestCost = results.reduce((best, board) => Math.min(best, board.totalCost), Number.POSITIVE_INFINITY);
    const topScore = results.reduce((best, board) => Math.max(best, getBoardMetric(board)), Number.NEGATIVE_INFINITY);
    setResultsSummary(`
        <div class="summary-card">
            <span class="summary-label">Status</span>
            <span class="summary-value">${results.length} boards</span>
        </div>
        <div class="summary-card">
            <span class="summary-label">Top Score</span>
            <span class="summary-value">${topScore}</span>
        </div>
        <div class="summary-card">
            <span class="summary-label">Lowest Cost</span>
            <span class="summary-value">${lowestCost}</span>
        </div>
        <div class="summary-card">
            <span class="summary-label">Best Value</span>
            <span class="summary-value">${bestValue.toFixed(2)}</span>
        </div>
    `);

    results.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.className = i === selectedBoardIndex ? 'result-row-selected' : '';
        const traits = buildBoardTraitSummary(r);
        const traitMarkup = traits.length > 0
            ? traits.slice(0, 6).map((trait) =>
                renderTraitChip(trait, trait.isActive ? 'trait-chip-active' : 'trait-chip-inactive')
            ).join('')
            : '<span class="trait-chip trait-chip-empty">No qualifying traits</span>';
        const unitsMarkup = r.units.map((name) => renderUnitPill(name, r)).join('');
        const valueScore = (getBoardMetric(r) / Math.max(r.totalCost, 1)).toFixed(2);

        tr.innerHTML = `
            <td class="rank-cell">#${i + 1}</td>
            <td>
                <div class="score-stack">
                    <strong>${getBoardMetric(r)}</strong>
                    <span>Value ${valueScore}</span>
                </div>
            </td>
            <td><div class="trait-chip-list">${traitMarkup}</div></td>
            <td>${r.totalCost}</td>
            <td>${r.totalCost * 3}</td>
            <td><div class="unit-pill-list">${unitsMarkup}</div></td>
        `;
        tr.addEventListener('click', () => {
            selectedBoardIndex = i;
            renderBoardSpotlight(results[selectedBoardIndex], selectedBoardIndex);
            Array.from(tbody.children).forEach((row, rowIndex) => {
                row.classList.toggle('result-row-selected', rowIndex === selectedBoardIndex);
            });
        });
        tbody.appendChild(tr);
    });

    renderBoardSpotlight(results[selectedBoardIndex], selectedBoardIndex);
}

// --- Search Lifecycle ---

/**
 * Update the UI to reflect search state.
 * @param {boolean} searching 
 */
function setSearchState(searching) {
    isSearching = searching;
    const searchBtn = document.getElementById('searchBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const progressEl = document.getElementById('searchProgress');

    if (searching) {
        searchBtn.disabled = true;
        searchBtn.classList.add('disabled');
        searchBtn.innerText = 'Searching...';
        cancelBtn.style.display = 'block';
    } else {
        searchBtn.disabled = false;
        searchBtn.classList.remove('disabled');
        searchBtn.innerText = 'Compute';
        cancelBtn.style.display = 'none';
        if (progressEl) progressEl.style.display = 'none';
    }

    syncFetchButtonState();
}

async function handleSearchClick() {
    if (isSearching) return;

    clampNumericInput('boardSize', 1, 20, 9);
    clampNumericInput('maxResults', 1, 10000, 100);

    const tbody = document.getElementById('resBody');
    renderEmptySummary('Searching');
    renderEmptySpotlight('Searching...');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Initializing DFS engine...</td></tr>';
    
    setSearchState(true);

    if (!selectors.mustInclude) {
        renderEmptySummary('Data required');
        renderQuerySummary(null, 'Load data first');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Please fetch data first.</td></tr>';
        setSearchState(false);
        return;
    }

    try {
        const params = {
            boardSize: parseInt(document.getElementById('boardSize').value, 10),
            maxResults: parseInt(document.getElementById('maxResults').value, 10) || 200,
            mustInclude: selectors.mustInclude.getValues(),
            mustExclude: selectors.mustExclude.getValues(),
            mustIncludeTraits: selectors.mustIncludeTraits.getValues(),
            mustExcludeTraits: selectors.mustExcludeTraits.getValues(),
            extraEmblems: selectors.extraEmblems.getValues(),
            variantLocks: getCurrentVariantLocks(),
            tankRoles: selectors.tankRoles.getValues(),
            carryRoles: selectors.carryRoles.getValues(),
            onlyActive: document.getElementById('onlyActiveToggle').checked,
            tierRank: document.getElementById('tierRankToggle').checked,
            includeUnique: document.getElementById('includeUniqueToggle').checked
        };
        lastSearchParams = params;
        renderQuerySummary(params, 'Searching');

        if (!electronBridge?.getSearchEstimate) {
            throw new Error('Electron preload bridge is unavailable.');
        }
        const estimate = await electronBridge.getSearchEstimate(params);
        const maxRemainingSlots = searchLimits.MAX_REMAINING_SLOTS ?? 7;
        const largeSearchThreshold = searchLimits.LARGE_SEARCH_THRESHOLD ?? 6_000_000_000;

        if (estimate.remainingToPick > maxRemainingSlots) {
            renderEmptySummary('Board too large');
            renderQuerySummary(params, `Too many open slots. The current engine limit is ${maxRemainingSlots} remaining picks.`);
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ff5252; padding: 20px;">Board too large! DFS engine supports up to ${maxRemainingSlots} empty slots.</td></tr>`;
            return;
        }

        if (estimate.count > largeSearchThreshold) {
            const confirmed = await showConfirm(`Search volume: ~${(estimate.count / 1e9).toFixed(1)}B combinations. This may take a minute. Continue?`, 'Performance Warning');
            if (!confirmed) {
                renderEmptySummary('Search aborted');
                renderQuerySummary(params, 'Search cancelled');
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #aaa;">Search aborted by user.</td></tr>';
                return;
            }
        }

        const startTime = Date.now();
        if (!electronBridge?.searchBoards) {
            throw new Error('Electron preload bridge is unavailable.');
        }
        const response = await electronBridge.searchBoards(params);
        if (response.cancelled) {
            currentResults = [];
            document.getElementById('status').innerText = 'Search cancelled.';
            renderEmptySummary('Search cancelled');
            renderQuerySummary(params, 'Search cancelled');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #ff5252;">Search cancelled.</td></tr>';
            return;
        }

        if (!response.success) {
            const errorMessage = response.error || 'Search failed unexpectedly.';
            currentResults = [];
            document.getElementById('status').innerText = `Search Error: ${errorMessage}`;
            showAlert(errorMessage, 'Search Failed');
            renderEmptySummary('Search error');
            renderQuerySummary(params, `Error: ${errorMessage}`);
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ff5252; padding: 20px;">${escapeHtml(errorMessage)}</td></tr>`;
            return;
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const results = response.results;
        const fromCache = response.fromCache;

        currentResults = results && results.length > 0 && !results[0].error ? results : [];

        if (currentResults.length > 0) {
            const statusInfo = fromCache
                ? `Found ${results.length} results (from cache in ${elapsed}s)`
                : `Found ${results.length} results (computed in ${elapsed}s)`;
            document.getElementById('status').innerText = statusInfo;
            renderQuerySummary(
                params,
                fromCache
                    ? `${results.length} cached boards in ${elapsed}s`
                    : `${results.length} boards in ${elapsed}s`
            );
            updateHistoryList();
        } else if (results && results[0] && results[0].error) {
            document.getElementById('status').innerText = `Search Error: ${results[0].error}`;
            renderQuerySummary(params, `Error: ${results[0].error}`);
        } else {
            renderQuerySummary(params, 'No matching boards');
        }

        const sorted = currentResults.length > 0 ? getSortedResults(currentResults) : results;
        renderResults(sorted);
    } catch (error) {
        console.error(error);
        document.getElementById('status').innerText = 'Search failed unexpectedly.';
        showAlert(error.message || String(error), 'Search Failed');
        renderEmptySummary('Search error');
        renderQuerySummary(lastSearchParams, `Unexpected failure: ${error.message || String(error)}`);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #ff5252; padding: 20px;">Search failed unexpectedly.</td></tr>';
    } finally {
        setSearchState(false);
    }
}

// --- History & Persistence ---

/**
 * Update the recent searches history sidebar.
 */
async function updateHistoryList() {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;
    if (!electronBridge?.listCache) {
        listEl.innerHTML = '<div class="history-empty">History unavailable</div>';
        return;
    }
    let res;
    try {
        res = await electronBridge.listCache();
    } catch (error) {
        listEl.innerHTML = `<div class="history-empty">History unavailable: ${escapeHtml(error.message || String(error))}</div>`;
        return;
    }
    
    if (!res.success || res.entries.length === 0) {
        listEl.innerHTML = res.success
            ? '<div class="history-empty">No history</div>'
            : `<div class="history-empty">History unavailable: ${escapeHtml(res.error || 'Unknown error')}</div>`;
        return;
    }

    // Top 5 recent only
    const recent = res.entries.slice(0, 5);
    listEl.innerHTML = '';
    
    recent.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'history-item';
        
        const paramsStr = summarizeParams(entry.params);
        const title = entry.params ? `Level ${entry.params.boardSize}` : 'Saved Search';

        item.innerHTML = `
            <div class="history-title">${escapeHtml(title)}</div>
            <div class="history-params" title="${escapeHtml(paramsStr)}">${escapeHtml(paramsStr)}</div>
            <div class="history-meta">
                <span>${entry.resultCount} results</span>
                <span>${escapeHtml(formatTimestamp(entry.timestamp))}</span>
            </div>
        `;
        
        item.addEventListener('click', () => loadSearchFromHistory(entry));
        listEl.appendChild(item);
    });
}

/**
 * Repopulate UI from a historical search entry.
 * @param {Object} entry - Cache entry
 */
function loadSearchFromHistory(entry) {
    if (isSearching) {
        showAlert("Wait for current search to finish or cancel it.");
        return;
    }

    const { params } = entry;
    if (!params) return;

    // Direct DOM population
    document.getElementById('boardSize').value = params.boardSize || 9;
    document.getElementById('maxResults').value = params.maxResults || 200;
    document.getElementById('onlyActiveToggle').checked = !!params.onlyActive;
    document.getElementById('tierRankToggle').checked = !!params.tierRank;
    document.getElementById('includeUniqueToggle').checked = !!params.includeUnique;

    // Component state restoration
    if (selectors.mustInclude) selectors.mustInclude.setValues(params.mustInclude || []);
    if (selectors.mustExclude) selectors.mustExclude.setValues(params.mustExclude || []);
    if (selectors.mustIncludeTraits) selectors.mustIncludeTraits.setValues(params.mustIncludeTraits || []);
    if (selectors.mustExcludeTraits) selectors.mustExcludeTraits.setValues(params.mustExcludeTraits || []);
    if (selectors.extraEmblems) selectors.extraEmblems.setValues(params.extraEmblems || []);
    if (selectors.tankRoles) selectors.tankRoles.setValues(params.tankRoles || []);
    if (selectors.carryRoles) selectors.carryRoles.setValues(params.carryRoles || []);
    applyVariantLocks(params.variantLocks || {});

    if (activeData?.hashMap) {
        selectors.tankRoles?.resolvePills(activeData.hashMap);
        selectors.carryRoles?.resolvePills(activeData.hashMap);
    }

    // Trigger instant cached search
    renderQuerySummary(params, 'Loaded a recent search. Replaying query now.');
    document.getElementById('searchBtn').click();
}

// --- Utilities ---

/**
 * Generate human-readable summary of params.
 */
function summarizeParams(params) {
    if (!params) return 'Incomplete data';
    const parts = [];
    if (params.mustInclude?.length) parts.push(`Inc: ${params.mustInclude.join(', ')}`);
    if (params.mustExclude?.length) parts.push(`Exc: ${params.mustExclude.join(', ')}`);
    if (params.mustIncludeTraits?.length) parts.push(`Traits: ${params.mustIncludeTraits.join(', ')}`);
    if (Object.keys(params.variantLocks || {}).length) parts.push(`Modes: ${Object.keys(params.variantLocks).length}`);
    return parts.join(' | ') || `Level ${params.boardSize}`;
}

/**
 * Format timestamp for history view.
 */
function formatTimestamp(ts) {
    if (!ts) return '-';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

window.updateHistoryList = updateHistoryList;
