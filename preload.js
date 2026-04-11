const { contextBridge, ipcRenderer } = require('electron');

// Keep preload self-contained so a local module load cannot break the renderer bridge.
// The bridge contract is loaded when available and falls back to local mirrors if not.
let bridgeContract;
try {
    bridgeContract = require('./bridge-contract.js');
} catch {
    bridgeContract = undefined;
}

const IPC_CHANNELS = bridgeContract?.IPC_CHANNELS || {
    FETCH_DATA: 'fetch-data',
    SEARCH_BOARDS: 'search-boards',
    CANCEL_SEARCH: 'cancel-search',
    GET_SEARCH_ESTIMATE: 'get-search-estimate',
    NORMALIZE_SEARCH_PARAMS: 'normalize-search-params',
    LIST_CACHE: 'list-cache',
    DELETE_CACHE_ENTRY: 'delete-cache-entry',
    CLEAR_ALL_CACHE: 'clear-all-cache',
    SEARCH_PROGRESS: 'search-progress',
    MAIN_PROCESS_ERROR: 'main-process-error'
};

const DATA_SOURCES = bridgeContract?.DATA_SOURCES || {
    PBE: 'pbe',
    LIVE: 'latest'
};

const DEFAULT_DATA_SOURCE = bridgeContract?.DEFAULT_DATA_SOURCE || DATA_SOURCES.PBE;
const SMOKE_TEST_FLAG = bridgeContract?.SMOKE_TEST_FLAG || '--smoke-test';

const LIMITS = bridgeContract?.LIMITS || {
    MAX_REMAINING_SLOTS: 7,
    COMBINATION_LIMIT: 50_000_000_000,
    PROGRESS_INTERVAL: 500_000,
    DEFAULT_MAX_RESULTS: 500,
    MAX_RESULTS: 1000,
    RESULTS_PAGE_SIZE: 100,
    LARGE_SEARCH_THRESHOLD: 6_000_000_000
};
const RENDERER_CONTRACT = bridgeContract?.RENDERER_CONTRACT || {
    requiredBridgeMethods: [
        'fetchData',
        'searchBoards',
        'cancelSearch',
        'listCache',
        'deleteCacheEntry',
        'clearAllCache',
        'getSearchEstimate',
        'normalizeSearchParams'
    ],
    requiredShellIds: [
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
    ]
};

contextBridge.exposeInMainWorld('electronAPI', {
    limits: LIMITS,
    dataSources: DATA_SOURCES,
    defaultDataSource: DEFAULT_DATA_SOURCE,
    rendererContract: RENDERER_CONTRACT,
    flags: {
        smokeTest: process.argv.includes(SMOKE_TEST_FLAG)
    },

    fetchData: (source) => ipcRenderer.invoke(IPC_CHANNELS.FETCH_DATA, source),
    searchBoards: (params) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_BOARDS, params),
    cancelSearch: () => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_SEARCH),
    listCache: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_CACHE),
    deleteCacheEntry: (key) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_CACHE_ENTRY, key),
    clearAllCache: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_ALL_CACHE),
    getSearchEstimate: (params) => ipcRenderer.invoke(IPC_CHANNELS.GET_SEARCH_ESTIMATE, params),
    normalizeSearchParams: (params) => ipcRenderer.invoke(IPC_CHANNELS.NORMALIZE_SEARCH_PARAMS, params),

    onSearchProgress: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on(IPC_CHANNELS.SEARCH_PROGRESS, listener);
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_PROGRESS, listener);
        };
    },

    onMainProcessError: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on(IPC_CHANNELS.MAIN_PROCESS_ERROR, listener);
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.MAIN_PROCESS_ERROR, listener);
        };
    }
});
