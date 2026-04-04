const REQUIRED_BRIDGE_METHODS = [
    'fetchData',
    'searchBoards',
    'cancelSearch',
    'listCache',
    'deleteCacheEntry',
    'clearAllCache',
    'getSearchEstimate'
];

const REQUIRED_SHELL_IDS = [
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

function createWindowService({
    app,
    BrowserWindow,
    preloadPath,
    ipcChannels,
    isSmokeTest,
    smokeTimeoutMs = 15000
}) {
    let mainWindow;
    let smokeTestFinished = false;
    let smokeTimeoutHandle = null;
    let smokeExitHandle = null;

    function clearTimer(handle) {
        if (handle) {
            clearTimeout(handle);
        }
    }

    function setManagedTimeout(callback, delay) {
        const handle = setTimeout(callback, delay);
        if (typeof handle?.unref === 'function') {
            handle.unref();
        }
        return handle;
    }

    function getMainWindow() {
        return mainWindow;
    }

    function finishSmokeTest(code, detail) {
        if (!isSmokeTest || smokeTestFinished) return;
        smokeTestFinished = true;
        clearTimer(smokeTimeoutHandle);
        smokeTimeoutHandle = null;
        clearTimer(smokeExitHandle);
        smokeExitHandle = null;
        if (detail) {
            if (code === 0) {
                console.log(`[SmokeTest] ${detail}`);
            } else {
                console.error(`[SmokeTest] ${detail}`);
            }
        }
        smokeExitHandle = setManagedTimeout(() => {
            smokeExitHandle = null;
            app.exit(code);
        }, 50);
    }

    async function runSmokeTest() {
        if (!mainWindow || mainWindow.isDestroyed()) {
            finishSmokeTest(1, 'Main window was unavailable.');
            return;
        }

        try {
            const result = await mainWindow.webContents.executeJavaScript(`(() => {
                const requiredMethods = ${JSON.stringify(REQUIRED_BRIDGE_METHODS)};
                const requiredIds = ${JSON.stringify(REQUIRED_SHELL_IDS)};
                const electronApi = window.electronAPI;
                const missingMethods = requiredMethods.filter((methodName) => typeof electronApi?.[methodName] !== 'function');
                const missingIds = requiredIds.filter((id) => !document.getElementById(id));
                const preloadFailureText = document.body?.innerText?.includes('Electron preload bridge unavailable') || false;

                return {
                    hasElectronAPI: !!electronApi,
                    missingMethods,
                    missingIds,
                    preloadFailureText
                };
            })()`, true);

            if (!result?.hasElectronAPI) {
                finishSmokeTest(1, 'window.electronAPI was not exposed.');
                return;
            }
            if (result.missingMethods?.length) {
                finishSmokeTest(1, `Missing bridge methods: ${result.missingMethods.join(', ')}`);
                return;
            }
            if (result.missingIds?.length) {
                finishSmokeTest(1, `Missing shell nodes: ${result.missingIds.join(', ')}`);
                return;
            }
            if (result.preloadFailureText) {
                finishSmokeTest(1, 'Preload failure UI was rendered.');
                return;
            }

            finishSmokeTest(0, 'Renderer booted with bridge and shell intact.');
        } catch (error) {
            finishSmokeTest(1, error?.message || String(error));
        }
    }

    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                preload: preloadPath
            }
        });

        mainWindow.setMenuBarVisibility(false);
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('[Main] Renderer finished loading index.html');
            if (isSmokeTest) {
                runSmokeTest();
            }
        });
        mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            console.error('[Main] Renderer failed to load', {
                errorCode,
                errorDescription,
                validatedURL,
                isMainFrame
            });
            finishSmokeTest(1, `Renderer failed to load: ${errorDescription} (${errorCode})`);
        });
        mainWindow.webContents.on('preload-error', (_event, preloadPathValue, error) => {
            console.error('[Main] Preload script failed', {
                preloadPath: preloadPathValue,
                message: error?.message || String(error)
            });
            finishSmokeTest(1, `Preload failed: ${error?.message || String(error)}`);
        });
        mainWindow.webContents.on('console-message', (event) => {
            const level = event.level ?? 'log';
            const message = event.message ?? '';
            const line = event.lineNumber ?? '';
            const sourceId = event.sourceId ?? 'unknown';
            console.log(`[Renderer:${level}] ${message} (${sourceId}:${line})`);
        });
        mainWindow.loadFile('index.html');
        return mainWindow;
    }

    function notifyRendererError(message) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(ipcChannels.MAIN_PROCESS_ERROR, { message });
        }
    }

    function scheduleSmokeTimeout() {
        if (isSmokeTest) {
            clearTimer(smokeTimeoutHandle);
            smokeTimeoutHandle = setManagedTimeout(() => {
                smokeTimeoutHandle = null;
                finishSmokeTest(1, 'Smoke test timed out before renderer verification completed.');
            }, smokeTimeoutMs);
        }
    }

    return {
        createWindow,
        getMainWindow,
        finishSmokeTest,
        notifyRendererError,
        scheduleSmokeTimeout
    };
}

module.exports = {
    createWindowService
};
