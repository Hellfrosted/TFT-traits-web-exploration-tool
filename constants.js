/**
 * Shared constants for the TFT Board Explorer application.
 * Used by main.js and preload.js (Node.js contexts).
 */

/** IPC channel names for Electron main <-> renderer communication */
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

/** Search engine limits and thresholds */
const LIMITS = {
    /** Maximum number of empty board slots the DFS will enumerate */
    MAX_REMAINING_SLOTS: 7,
    /** Abort search if combination count exceeds this */
    COMBINATION_LIMIT: 50_000_000_000,
    /** Report progress every N combinations checked */
    PROGRESS_INTERVAL: 500_000,
    /** Default number of top results to keep */
    DEFAULT_MAX_RESULTS: 200,
    /** Warn user if estimated combinations exceed this threshold */
    LARGE_SEARCH_THRESHOLD: 6_000_000_000
};

/** Network fetch configuration */
const NETWORK = {
    MAX_RETRIES: 3,
    RETRY_BASE_DELAY_MS: 1000
};

module.exports = {
    IPC_CHANNELS,
    DATA_SOURCES,
    DEFAULT_DATA_SOURCE,
    LIMITS,
    NETWORK
};
