const { contextBridge, ipcRenderer } = require('electron');

// Keep preload self-contained so a secondary module load cannot break the renderer bridge.
const IPC_CHANNELS = {
    FETCH_DATA: 'fetch-data',
    SEARCH_BOARDS: 'search-boards',
    CANCEL_SEARCH: 'cancel-search',
    GET_SEARCH_ESTIMATE: 'get-search-estimate',
    LIST_CACHE: 'list-cache',
    DELETE_CACHE_ENTRY: 'delete-cache-entry',
    CLEAR_ALL_CACHE: 'clear-all-cache',
    SEARCH_PROGRESS: 'search-progress',
    MAIN_PROCESS_ERROR: 'main-process-error'
};

const DATA_SOURCES = {
    PBE: 'pbe',
    LIVE: 'latest'
};

const DEFAULT_DATA_SOURCE = DATA_SOURCES.PBE;

const LIMITS = {
    MAX_REMAINING_SLOTS: 7,
    COMBINATION_LIMIT: 50_000_000_000,
    PROGRESS_INTERVAL: 500_000,
    DEFAULT_MAX_RESULTS: 200,
    LARGE_SEARCH_THRESHOLD: 6_000_000_000
};

/**
 * Bridge between Electron main and renderer processes.
 * Exposes a limited, secure set of APIs to the window context.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    limits: LIMITS,
    dataSources: DATA_SOURCES,
    defaultDataSource: DEFAULT_DATA_SOURCE,
    flags: {
        smokeTest: process.argv.includes('--smoke-test')
    },

    /** Fetch latest champion and trait data from CommunityDragon/Cache */
    fetchData: (source) => ipcRenderer.invoke(IPC_CHANNELS.FETCH_DATA, source),

    /** Execute a recursive DFS search for optimal boards */
    searchBoards: (params) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_BOARDS, params),

    /** Cancel any currently running search worker */
    cancelSearch: () => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_SEARCH),

    /** List all cached search results from local storage */
    listCache: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_CACHE),

    /** Delete a specific cache entry by its MD5 key */
    deleteCacheEntry: (key) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_CACHE_ENTRY, key),

    /** Clear all cached search results */
    clearAllCache: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_ALL_CACHE),

    /** Get an algorithmic estimate of search combinations */
    getSearchEstimate: (params) => ipcRenderer.invoke(IPC_CHANNELS.GET_SEARCH_ESTIMATE, params),

    /** Listen for search progress updates (percentage and count) */
    onSearchProgress: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on(IPC_CHANNELS.SEARCH_PROGRESS, listener);
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_PROGRESS, listener);
        };
    },

    /** Listen for uncaught errors in the main process thread */
    onMainProcessError: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on(IPC_CHANNELS.MAIN_PROCESS_ERROR, listener);
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.MAIN_PROCESS_ERROR, listener);
        };
    }
});
