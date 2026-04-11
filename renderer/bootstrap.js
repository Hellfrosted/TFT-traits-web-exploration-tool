(function initializeBootstrapFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { getMissingRequiredShellIds, resolveShellElements, reportRendererIssue, createDialogInvoker, setResultsBodyMessage } = ns.shared;

    ns.createBootstrap = function createBootstrap(app) {
        const { state } = app;
        const reporterState = {
            missingDialogDependency: false
        };
        const showAlert = createDialogInvoker(app, reporterState, {
            methodName: 'showAlert'
        });

        function publishRendererReadyState(isReady) {
            const root = document.documentElement;
            if (root) {
                root.dataset.tftReady = isReady ? '1' : '0';
            }
            window.dispatchEvent(new CustomEvent('tft-renderer-ready', {
                detail: { ready: !!isReady }
            }));
        }

        function reportRendererInitFailure(error) {
            const errorMessage = error?.message || String(error);
            console.error('[Renderer Init Failed]', error);
            app.queryUi.setStatusMessage(`Renderer init failed: ${errorMessage}`);
            publishRendererReadyState(false);
        }

        function getBootstrapShellUiState(hasElectronAPI = state.hasElectronAPI) {
            if (hasElectronAPI) {
                return {
                    querySummaryMeta: 'Initializing UI...',
                    spotlightMessage: 'Loading data...',
                    statusMessage: 'Initializing UI...'
                };
            }

            return {
                querySummaryMeta: 'Electron bridge unavailable',
                spotlightMessage: 'Electron preload bridge unavailable.',
                statusMessage: 'Electron preload bridge unavailable.'
            };
        }

        function applyBootstrapShellUiState(uiState) {
            app.queryUi.setDataStats();
            app.queryUi.renderQuerySummary(null, uiState.querySummaryMeta);
            app.results.renderEmptySpotlight(uiState.spotlightMessage);
            app.queryUi.setStatusMessage(uiState.statusMessage);
        }

        function resetFilters() {
            if (state.isSearching || state.isFetchingData) {
                showAlert('Cancel the current search before resetting filters.');
                return;
            }

            app.queryUi.applySearchParams(app.queryUi.getDefaultSearchParams());

            state.lastSearchParams = null;
            state.currentResults = [];
            state.currentResultsFingerprint = null;
            app.results.renderEmptySummary('Awaiting execution');
            app.results.renderEmptySpotlight();
            app.queryUi.renderQuerySummary(null, 'Filters reset. Build a fresh query and compute when ready.');
            const { elements } = resolveShellElements(['resBody']);
            setResultsBodyMessage(app, elements.resBody, 'Awaiting execution...', 'table-awaiting');
            app.queryUi.setStatusMessage(state.activeData
                ? `Loaded ${state.activeData.unitMap.size} parsed champions and ready for a new query.`
                : 'Status: Unloaded');
        }

        function bindAsyncClickAction(element, action) {
            element?.addEventListener('click', () => {
                Promise.resolve(action()).catch((error) => {
                    reportRendererInitFailure(error);
                });
            });
        }

        function bindSortModeListener(sortMode) {
            sortMode?.addEventListener('change', () => {
                if (state.currentResults.length === 0) return;
                app.results.renderResults(app.results.getSortedResults(state.currentResults));
            });
        }

        function bindSearchShortcut(searchBtn) {
            document.addEventListener('keydown', (event) => {
                const isSubmitChord = (event.ctrlKey || event.metaKey) && event.key === 'Enter';
                if (!isSubmitChord || state.isSearching) return;
                event.preventDefault();
                searchBtn?.click();
            });
        }

        function bindStaticUiControlListeners(elements) {
            bindAsyncClickAction(elements.fetchBtn, () => app.data.fetchData());
            bindSortModeListener(elements.sortMode);
            bindAsyncClickAction(elements.cancelBtn, () => app.search.requestCancelSearch());
            elements.resetFiltersBtn?.addEventListener('click', resetFilters);
            elements.searchBtn?.addEventListener('click', app.search.handleSearchClick);
        }

        function bindStaticUiListeners() {
            if (state.listeners.staticBound) return;
            state.listeners.staticBound = true;
            const { elements } = resolveShellElements([
                'fetchBtn',
                'sortMode',
                'cancelBtn',
                'resetFiltersBtn',
                'searchBtn'
            ]);

            bindStaticUiControlListeners(elements);
            bindSearchShortcut(elements.searchBtn);
        }

        function initializeUiShell() {
            if (state.listeners.uiInitialized) return true;

            if (typeof state.dependencies?.showAlert !== 'function') {
                reportRendererIssue(app, null, null, {
                    consoleMessage: '[Renderer Dependency Missing] Missing required dialog helper: showAlert.',
                    statusMessage: 'Renderer dependency mismatch: missing required dialog helper (showAlert).'
                });
                publishRendererReadyState(false);
                return false;
            }

            const missingIds = getMissingRequiredShellIds();
            if (missingIds.length > 0) {
                reportRendererIssue(app, null, null, {
                    consoleMessage: '[Renderer Shell Incomplete] Missing required shell nodes:',
                    consoleDetail: missingIds,
                    statusMessage: `Renderer shell mismatch: missing required shell nodes (${missingIds.join(', ')}).`
                });
                publishRendererReadyState(false);
                return false;
            }

            applyBootstrapShellUiState(getBootstrapShellUiState());
            bindStaticUiListeners();
            app.queryUi.syncFetchButtonState();
            app.queryUi.syncSearchButtonState();
            state.listeners.uiInitialized = true;
            return true;
        }

        async function bootstrapRenderer() {
            if (state.listeners.bootStarted) return;
            if (!initializeUiShell()) return;
            state.listeners.bootStarted = true;
            const { elements } = resolveShellElements(['dataSourceSelect']);
            if (elements.dataSourceSelect) {
                elements.dataSourceSelect.value = state.defaultDataSource;
            }

            if (!state.flags.smokeTest) {
                await app.data.fetchData();
            }
            publishRendererReadyState(true);
        }

        function waitForRendererBootstrapReady(timeoutMs = 1500) {
            if (document.readyState !== 'loading') {
                return Promise.resolve();
            }

            return new Promise((resolve) => {
                let resolved = false;
                let timeoutHandle = null;

                const finish = () => {
                    if (resolved) {
                        return;
                    }
                    resolved = true;
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                        timeoutHandle = null;
                    }
                    document.removeEventListener('DOMContentLoaded', finish);
                    window.removeEventListener('load', finish);
                    resolve();
                };

                document.addEventListener('DOMContentLoaded', finish, { once: true });
                window.addEventListener('load', finish, { once: true });
                timeoutHandle = setTimeout(finish, timeoutMs);
            });
        }

        function scheduleRendererBootstrap() {
            if (state.listeners.bootScheduled) return;
            state.listeners.bootScheduled = true;

            if (document.readyState !== 'loading') {
                bootstrapRenderer().catch((error) => {
                    reportRendererInitFailure(error);
                });
                return;
            }

            waitForRendererBootstrapReady()
                .then(() => bootstrapRenderer())
                .catch((error) => {
                    reportRendererInitFailure(error);
                });
        }

        function installErrorHandlers() {
            window.onerror = (message, source, lineno, colno, error) => {
                console.error('[Browser Error]', message, source, lineno, error);
                app.queryUi.setStatusMessage(`Renderer error: ${message}`);
                void showAlert(`Uncaught UI Exception: ${message}`, 'Application Error');
                return true;
            };

            window.addEventListener('unhandledrejection', (event) => {
                console.error('[Unhandled Rejection]', event.reason);
                app.queryUi.setStatusMessage(`Async error: ${event.reason?.message || event.reason}`);
                void showAlert(`Async Exception: ${event.reason}`, 'Application Error');
            });

            if (state.electronBridge?.onMainProcessError) {
                const dispose = state.electronBridge.onMainProcessError((data) => {
                    void showAlert(data.message, 'Backend Error');
                });
                if (typeof dispose === 'function') {
                    state.cleanupFns.push(dispose);
                }
            }

            window.addEventListener('beforeunload', () => {
                while (state.cleanupFns.length > 0) {
                    const cleanup = state.cleanupFns.pop();
                    cleanup?.();
                }
            }, { once: true });
        }

        function start() {
            publishRendererReadyState(false);
            installErrorHandlers();
            app.search.subscribeProgressUpdates();
            scheduleRendererBootstrap();
        }

        return {
            start,
            initializeUiShell,
            scheduleRendererBootstrap,
            reportRendererInitFailure,
            __test: {
                getBootstrapShellUiState
            }
        };
    };
})();
