const {
    createCancelledSearchResponse,
    createWorkerProgressPayload,
    shouldPersistSearchResults,
    createWorkerDoneResponse,
    createWorkerErrorResponse,
    createWorkerExitResponse
} = require('./search-service-state.js');

function createSearchWorkerRunner({
    Worker,
    workerPath,
    ipcChannels,
    getMainWindow
}) {
    return async function runWorkerSearch({
        searchContext,
        workerData,
        cacheService,
        cacheKey,
        searchFingerprint,
        normalizedParams,
        cleanup
    }) {
        return await new Promise((resolve) => {
            let resolved = false;

            const safeResolve = (value) => {
                if (resolved) {
                    return;
                }
                resolved = true;
                searchContext.settle = null;
                resolve(value);
            };

            const terminateWorker = () => {
                if (searchContext.terminated) {
                    return searchContext.terminatePromise || Promise.resolve();
                }
                if (!searchContext.worker) {
                    searchContext.terminated = true;
                    cleanup();
                    return Promise.resolve();
                }

                searchContext.terminated = true;
                try {
                    const result = searchContext.worker.terminate();
                    searchContext.terminatePromise = Promise.resolve(result)
                        .catch(() => {})
                        .finally(() => {
                            cleanup();
                        });
                } catch {
                    cleanup();
                    return Promise.resolve();
                }

                return searchContext.terminatePromise;
            };

            searchContext.settle = safeResolve;
            searchContext.worker = new Worker(workerPath, { workerData });
            if (searchContext.cancelled) {
                void terminateWorker();
                safeResolve(createCancelledSearchResponse(searchContext.searchId));
                return;
            }

            searchContext.worker.on('message', (msg) => {
                if (msg.type === 'progress') {
                    const mainWindow = getMainWindow();
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send(
                            ipcChannels.SEARCH_PROGRESS,
                            createWorkerProgressPayload(searchContext.searchId, msg)
                        );
                    }
                    return;
                }

                if (msg.type !== 'done') {
                    return;
                }

                searchContext.completed = true;
                if (searchContext.cancelled) {
                    void terminateWorker();
                    safeResolve(createCancelledSearchResponse(searchContext.searchId));
                    return;
                }

                safeResolve(createWorkerDoneResponse(msg, searchContext.searchId));
                if (shouldPersistSearchResults(msg.results)) {
                    void cacheService.writeCache(cacheKey, searchFingerprint, normalizedParams, msg.results)
                        .catch(() => {})
                        .finally(() => {
                            void terminateWorker();
                        });
                    return;
                }

                void terminateWorker();
            });

            searchContext.worker.on('error', (error) => {
                safeResolve(
                    createWorkerErrorResponse(error, searchContext.searchId, searchContext.cancelled)
                );
            });

            searchContext.worker.on('exit', (code) => {
                cleanup();
                if (searchContext.completed) {
                    return;
                }
                safeResolve(createWorkerExitResponse(code, searchContext.searchId, searchContext.cancelled));
            });
        });
    };
}

module.exports = {
    createSearchWorkerRunner
};
