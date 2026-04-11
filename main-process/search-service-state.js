function createSearchResponse({
    success = true,
    cancelled = false,
    fromCache = false,
    results = [],
    error = null,
    searchId = null
} = {}) {
    return { success, cancelled, fromCache, results, error, searchId };
}

function createSearchContext(searchId) {
    return {
        searchId,
        cancelled: false,
        worker: null,
        settle: null,
        completed: false,
        terminated: false,
        terminatePromise: null
    };
}

function createMissingDataResponse() {
    return createSearchResponse({
        success: false,
        error: 'No TFT data loaded yet. Fetch data first.'
    });
}

function createBusySearchResponse() {
    return createSearchResponse({
        success: false,
        error: 'A search is already in progress. Please cancel it first.'
    });
}

function createCachedSearchResponse(results, searchId) {
    return createSearchResponse({
        success: true,
        fromCache: true,
        results,
        searchId
    });
}

function createCancelledSearchResponse(searchId = null) {
    return createSearchResponse({
        cancelled: true,
        searchId
    });
}

function createWorkerProgressPayload(searchId, message) {
    return {
        searchId,
        pct: message?.pct,
        checked: message?.checked,
        total: message?.total
    };
}

function shouldPersistSearchResults(results) {
    return Array.isArray(results) && results.length > 0 && !results[0]?.error;
}

function createWorkerDoneResponse(message, searchId) {
    if (message?.success) {
        return createSearchResponse({
            success: true,
            fromCache: false,
            results: Array.isArray(message?.results) ? message.results : [],
            searchId
        });
    }

    return createSearchResponse({
        success: false,
        error: message?.error,
        searchId
    });
}

function createWorkerErrorResponse(error, searchId, cancelled = false) {
    if (cancelled) {
        return createCancelledSearchResponse(searchId);
    }

    return createSearchResponse({
        success: false,
        error: error?.toString?.() || String(error),
        searchId
    });
}

function createWorkerExitResponse(code, searchId, cancelled = false) {
    if (cancelled) {
        return createCancelledSearchResponse(searchId);
    }

    if (code === 0) {
        return createSearchResponse({
            success: false,
            error: 'Search worker exited before returning a result.',
            searchId
        });
    }

    return createSearchResponse({
        success: false,
        error: `Worker exited with code ${code}`,
        searchId
    });
}

module.exports = {
    createSearchResponse,
    createSearchContext,
    createMissingDataResponse,
    createBusySearchResponse,
    createCachedSearchResponse,
    createCancelledSearchResponse,
    createWorkerProgressPayload,
    shouldPersistSearchResults,
    createWorkerDoneResponse,
    createWorkerErrorResponse,
    createWorkerExitResponse
};
