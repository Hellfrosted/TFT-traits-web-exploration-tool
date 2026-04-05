function createWindowService({
    app,
    BrowserWindow,
    preloadPath,
    ipcChannels,
    rendererContract,
    isSmokeTest,
    smokeTimeoutMs = 20000
}) {
    let mainWindow;
    let smokeTestFinished = false;
    let smokeTimeoutHandle = null;
    let smokeExitHandle = null;
    const rendererInspectionTimeoutMs = Math.max(1000, smokeTimeoutMs - 1000);
    const requiredBridgeMethods = Array.isArray(rendererContract?.requiredBridgeMethods)
        ? rendererContract.requiredBridgeMethods
        : [];
    const requiredShellIds = Array.isArray(rendererContract?.requiredShellIds)
        ? rendererContract.requiredShellIds
        : [];

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
                const requiredMethods = ${JSON.stringify(requiredBridgeMethods)};
                const requiredIds = ${JSON.stringify(requiredShellIds)};
                const deadline = Date.now() + ${rendererInspectionTimeoutMs};

                return new Promise((resolve) => {
                    let deadlineTimer = null;
                    let observer = null;

                    const cleanup = () => {
                        if (deadlineTimer) {
                            clearTimeout(deadlineTimer);
                            deadlineTimer = null;
                        }
                        if (observer) {
                            observer.disconnect();
                            observer = null;
                        }
                        window.removeEventListener('tft-renderer-ready', inspect);
                        document.removeEventListener('readystatechange', inspect);
                    };

                    const inspect = () => {
                        const electronApi = window.electronAPI;
                        const missingMethods = requiredMethods.filter((methodName) => typeof electronApi?.[methodName] !== 'function');
                        const missingIds = requiredIds.filter((id) => !document.getElementById(id));
                        const preloadFailureText = document.body?.innerText?.includes('Electron preload bridge unavailable') || false;
                        const explicitReady = document.documentElement?.dataset?.tftReady === '1';
                        const ready = explicitReady && !!electronApi && missingMethods.length === 0 && missingIds.length === 0 && !preloadFailureText;

                        if (ready || Date.now() >= deadline) {
                            cleanup();
                            resolve({
                                hasElectronAPI: !!electronApi,
                                missingMethods,
                                missingIds,
                                preloadFailureText
                            });
                            return;
                        }
                    };

                    window.addEventListener('tft-renderer-ready', inspect);
                    document.addEventListener('readystatechange', inspect);
                    if (typeof MutationObserver === 'function' && document.documentElement) {
                        observer = new MutationObserver(inspect);
                        observer.observe(document.documentElement, {
                            attributes: true,
                            childList: true,
                            subtree: true,
                            attributeFilter: ['data-tft-ready']
                        });
                    }
                    deadlineTimer = setTimeout(inspect, Math.max(0, deadline - Date.now()));
                    inspect();
                });
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
        mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        mainWindow.webContents.on('will-navigate', (event) => {
            event.preventDefault();
        });
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
        mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
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
