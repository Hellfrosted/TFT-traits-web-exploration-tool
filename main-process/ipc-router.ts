function createIpcRouter({
    ipcMain,
    ipcChannels,
    defaultDataSource,
    rendererDevServerUrl = '',
    getMainWindow,
    dataService,
    searchService,
    cacheService,
    normalizeSearchParams,
    serializeSearchParams,
    onDataFingerprintLoaded
}: LooseRecord = {}) {
    function assertTrustedSender(event, channel) {
        const mainWindow = getMainWindow();
        const hasLiveMainWindow =
            !!mainWindow && (typeof mainWindow.isDestroyed !== 'function' || !mainWindow.isDestroyed());
        const sender = event?.sender;
        const senderFrame = event?.senderFrame || sender?.mainFrame || null;
        const expectedWebContents = mainWindow?.webContents;
        const senderMatchesMainWindow =
            !!sender &&
            !!expectedWebContents &&
            (sender === expectedWebContents ||
                (Number.isInteger(sender.id) &&
                    Number.isInteger(expectedWebContents.id) &&
                    sender.id === expectedWebContents.id));
        const isMainFrame = senderFrame?.isMainFrame !== false;
        const senderUrl =
            typeof senderFrame?.url === 'string' && senderFrame.url ? senderFrame.url : sender?.getURL?.();

        const isFileRenderer = typeof senderUrl === 'string' && senderUrl.startsWith('file://');
        const isTrustedDevRenderer =
            rendererDevServerUrl && typeof senderUrl === 'string' && senderUrl.startsWith(rendererDevServerUrl);

        if (
            !hasLiveMainWindow ||
            !senderMatchesMainWindow ||
            !isMainFrame ||
            typeof senderUrl !== 'string' ||
            (!isFileRenderer && !isTrustedDevRenderer)
        ) {
            console.warn(`Rejected unauthorized IPC sender for ${channel}.`);
            throw new Error('Unauthorized IPC sender.');
        }
    }

    function handleTrusted(channel, handler) {
        ipcMain.handle(channel, async (event, ...args) => {
            assertTrustedSender(event, channel);
            return await handler(event, ...args);
        });
    }

    function normalizeSearchParamsPayload(params) {
        if (typeof searchService.normalizePayload === 'function') {
            return searchService.normalizePayload(params);
        }

        const fallbackParams = normalizeSearchParams(params);
        return {
            params: fallbackParams,
            comparisonKey: serializeSearchParams(fallbackParams),
            dataFingerprint: dataService.getDataCache()?.dataFingerprint || null
        };
    }

    function registerHandlers() {
        handleTrusted(ipcChannels.FETCH_DATA, async (_event, requestedSource = defaultDataSource) => {
            try {
                const response = await dataService.fetchData(requestedSource);
                if (response?.success && response.dataFingerprint) {
                    onDataFingerprintLoaded(response.dataFingerprint);
                }
                return response;
            } catch (error) {
                return { success: false, error: error.toString() };
            }
        });

        handleTrusted(ipcChannels.GET_SEARCH_ESTIMATE, async (_event, params) => {
            return await searchService.getSearchEstimate(params);
        });

        handleTrusted(ipcChannels.NORMALIZE_SEARCH_PARAMS, async (_event, params) => {
            return normalizeSearchParamsPayload(params);
        });

        handleTrusted(ipcChannels.SEARCH_BOARDS, async (_event, params) => {
            return await searchService.searchBoards(params);
        });

        handleTrusted(ipcChannels.CANCEL_SEARCH, async () => {
            return await searchService.cancelSearch();
        });

        handleTrusted(ipcChannels.LIST_CACHE, async (_event, options = null) => {
            try {
                const activeDataFingerprint = dataService.getDataCache()?.dataFingerprint || null;
                const entries = await cacheService.listCacheEntries(activeDataFingerprint, options || {});
                return { success: true, entries };
            } catch (error) {
                return { success: false, error: error.toString() };
            }
        });

        handleTrusted(ipcChannels.DELETE_CACHE_ENTRY, async (_event, key) => {
            try {
                await cacheService.deleteCacheEntry(key);
                return { success: true };
            } catch (error) {
                return { success: false, error: error.toString() };
            }
        });

        handleTrusted(ipcChannels.CLEAR_ALL_CACHE, async () => {
            try {
                const summary = await cacheService.clearAllCache();
                return {
                    success: true,
                    deleted: summary.deleted,
                    failures: summary.failures || []
                };
            } catch (error) {
                return { success: false, error: error.toString() };
            }
        });

        return () => {
            ipcMain.removeHandler(ipcChannels.FETCH_DATA);
            ipcMain.removeHandler(ipcChannels.GET_SEARCH_ESTIMATE);
            ipcMain.removeHandler(ipcChannels.NORMALIZE_SEARCH_PARAMS);
            ipcMain.removeHandler(ipcChannels.SEARCH_BOARDS);
            ipcMain.removeHandler(ipcChannels.CANCEL_SEARCH);
            ipcMain.removeHandler(ipcChannels.LIST_CACHE);
            ipcMain.removeHandler(ipcChannels.DELETE_CACHE_ENTRY);
            ipcMain.removeHandler(ipcChannels.CLEAR_ALL_CACHE);
        };
    }

    return {
        assertTrustedSender,
        handleTrusted,
        registerHandlers
    };
}

module.exports = {
    createIpcRouter
};
