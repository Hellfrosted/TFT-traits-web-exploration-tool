const IPC_CHANNELS = {
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

const DATA_SOURCES = {
    PBE: 'pbe',
    LIVE: 'latest'
};

const DEFAULT_DATA_SOURCE = DATA_SOURCES.PBE;

const LIMITS = {
    MAX_REMAINING_SLOTS: 7,
    COMBINATION_LIMIT: 50_000_000_000,
    PROGRESS_INTERVAL: 500_000,
    DEFAULT_MAX_RESULTS: 500,
    MAX_RESULTS: 1000,
    RESULTS_PAGE_SIZE: 100,
    LARGE_SEARCH_THRESHOLD: 6_000_000_000
};

const SMOKE_TEST_FLAG = '--smoke-test';

const RENDERER_CONTRACT = {
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

module.exports = {
    IPC_CHANNELS,
    DATA_SOURCES,
    DEFAULT_DATA_SOURCE,
    LIMITS,
    SMOKE_TEST_FLAG,
    RENDERER_CONTRACT
};
