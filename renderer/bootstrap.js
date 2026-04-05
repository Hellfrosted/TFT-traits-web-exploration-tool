(function initializeBootstrapFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { hasRequiredShellElements } = ns.shared;

    ns.createBootstrap = function createBootstrap(app) {
        const { state } = app;

        function reportRendererInitFailure(error) {
            const errorMessage = error?.message || String(error);
            console.error('[Renderer Init Failed]', error);
            app.queryUi.setStatusMessage(`Renderer init failed: ${errorMessage}`);
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
            document.getElementById('resBody').innerHTML = '<tr><td colspan="6" class="table-awaiting">Awaiting execution...</td></tr>';
            app.queryUi.setStatusMessage(state.activeData
                ? `Loaded ${state.activeData.unitMap.size} parsed champions and ready for a new query.`
                : 'Status: Unloaded');
        }

        function bindStaticUiListeners() {
            if (state.listeners.staticBound) return;
            state.listeners.staticBound = true;

            document.getElementById('fetchBtn')?.addEventListener('click', () => {
                app.data.fetchData().catch((error) => {
                    reportRendererInitFailure(error);
                });
            });

            document.getElementById('sortMode')?.addEventListener('change', () => {
                if (state.currentResults.length === 0) return;
                app.results.renderResults(app.results.getSortedResults(state.currentResults));
            });

            document.getElementById('cancelBtn')?.addEventListener('click', () => {
                app.search.requestCancelSearch().catch((error) => {
                    reportRendererInitFailure(error);
                });
            });

            document.getElementById('resetFiltersBtn')?.addEventListener('click', resetFilters);

            document.addEventListener('keydown', (event) => {
                const isSubmitChord = (event.ctrlKey || event.metaKey) && event.key === 'Enter';
                if (!isSubmitChord || state.isSearching) return;
                event.preventDefault();
                document.getElementById('searchBtn')?.click();
            });

            document.getElementById('searchBtn')?.addEventListener('click', app.search.handleSearchClick);
        }

        function initializeUiShell() {
            if (state.listeners.uiInitialized) return true;
            if (!hasRequiredShellElements()) {
                return false;
            }

            app.queryUi.setDataStats();
            app.queryUi.renderQuerySummary(null, state.hasElectronAPI ? 'Initializing UI...' : 'Electron bridge unavailable');
            app.results.renderEmptySpotlight(state.hasElectronAPI ? 'Loading data...' : 'Electron preload bridge unavailable.');
            app.queryUi.setStatusMessage(state.hasElectronAPI ? 'Initializing UI...' : 'Electron preload bridge unavailable.');
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
            const sourceSelect = document.getElementById('dataSourceSelect');
            if (sourceSelect) {
                sourceSelect.value = state.defaultDataSource;
            }

            if (!state.flags.smokeTest) {
                await app.data.fetchData();
            }
        }

        function scheduleRendererBootstrap() {
            if (state.listeners.bootScheduled) return;
            state.listeners.bootScheduled = true;

            const runBootstrap = () => {
                bootstrapRenderer().catch((error) => {
                    reportRendererInitFailure(error);
                });
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', runBootstrap, { once: true });
                window.addEventListener('load', runBootstrap, { once: true });
                setTimeout(runBootstrap, 1500);
                return;
            }

            runBootstrap();
        }

        function installErrorHandlers() {
            window.onerror = (message, source, lineno, colno, error) => {
                console.error('[Browser Error]', message, source, lineno, error);
                app.queryUi.setStatusMessage(`Renderer error: ${message}`);
                showAlert(`Uncaught UI Exception: ${message}`, 'Application Error');
                return true;
            };

            window.addEventListener('unhandledrejection', (event) => {
                console.error('[Unhandled Rejection]', event.reason);
                app.queryUi.setStatusMessage(`Async error: ${event.reason?.message || event.reason}`);
                showAlert(`Async Exception: ${event.reason}`, 'Application Error');
            });

            if (state.electronBridge?.onMainProcessError) {
                const dispose = state.electronBridge.onMainProcessError((data) => {
                    showAlert(data.message, 'Backend Error');
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
            installErrorHandlers();
            app.search.subscribeProgressUpdates();
            scheduleRendererBootstrap();
        }

        return {
            start,
            initializeUiShell,
            scheduleRendererBootstrap,
            reportRendererInitFailure
        };
    };
})();
