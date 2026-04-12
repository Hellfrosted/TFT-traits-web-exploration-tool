(function initializeSearchShellUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    function requireSearchUiState() {
        const searchUiState = ns.searchUiState || ns.createSearchUiState?.(ns.shared || {});
        if (!searchUiState) {
            throw new Error('Renderer search UI state unavailable.');
        }

        return searchUiState;
    }

    ns.createSearchShellUi = function createSearchShellUi(app, hooks = {}) {
        const { state } = app;
        const {
            resolveShellElements,
            formatBoardEstimate,
            reportRendererIssue,
            setResultsBodyMessage
        } = ns.shared || {};
        const searchUiState = requireSearchUiState();
        const {
            reporterState = {}
        } = hooks;

        function buildSearchMeta() {
            return searchUiState.buildSearchMeta();
        }

        function buildSearchButtonLabel(progress = null) {
            return searchUiState.buildSearchButtonLabel(progress, {
                isSearching: state.isSearching,
                formatBoardEstimate
            });
        }

        function buildSearchTableMessage() {
            return searchUiState.buildSearchTableMessage();
        }

        function reportShellMismatchOnce(missingIds, contextMessage) {
            reportRendererIssue(app, reporterState, 'shellMismatch', {
                consoleMessage: `[Renderer Shell Mismatch] ${contextMessage}`,
                consoleDetail: { missingIds },
                statusMessage: 'Renderer shell mismatch: search controls unavailable.',
                querySummary: {
                    params: state.lastSearchParams || null,
                    meta: 'Shell mismatch'
                }
            });
        }

        function resetSearchStateForShellMismatch() {
            state.isSearching = false;
            state.isCancellingSearch = false;
            state.activeSearchEstimate = null;
            state.activeSearchId = null;
            app.queryUi.syncFetchButtonState();
            app.queryUi.syncSearchButtonState();
        }

        function resolveSearchShell(contextMessage, options = {}) {
            const { elements, missingIds } = resolveShellElements(['searchBtn', 'cancelBtn', 'resBody']);
            if (missingIds.length === 0) {
                return elements;
            }

            reportShellMismatchOnce(missingIds, contextMessage);
            if (options.requireStableState) {
                resetSearchStateForShellMismatch();
            }

            return null;
        }

        function getSearchControlUiState(searching, searchLabel = buildSearchButtonLabel()) {
            return searchUiState.getSearchControlUiState(searching, searchLabel);
        }

        function applySearchControlUi(shell, uiState = {}) {
            const { searchBtn, cancelBtn } = shell || {};

            if (searchBtn && uiState.searchDisabled !== undefined) {
                searchBtn.disabled = !!uiState.searchDisabled;
            }
            if (searchBtn && uiState.searchClassDisabled !== undefined) {
                searchBtn.classList.toggle('disabled', !!uiState.searchClassDisabled);
            }
            if (searchBtn && uiState.searchText !== undefined && uiState.searchText !== null) {
                searchBtn.innerText = uiState.searchText;
            }
            if (cancelBtn && uiState.cancelDisplay !== undefined) {
                cancelBtn.style.display = uiState.cancelDisplay;
            }
            if (cancelBtn && uiState.cancelDisabled !== undefined) {
                cancelBtn.disabled = !!uiState.cancelDisabled;
            }
        }

        function getActiveSearchUiState({
            isSearching = false,
            progress = null,
            fallbackProgress = null,
            lastSearchParams = null,
            currentResults = []
        } = {}) {
            return searchUiState.getActiveSearchUiState({
                isSearching,
                progress,
                fallbackProgress,
                lastSearchParams,
                currentResults
            });
        }

        function renderActiveSearchUi(progress = null) {
            const shell = resolveSearchShell('Unable to render active search UI.');
            if (!shell) {
                return;
            }

            const { searchBtn, resBody: tbody } = shell;
            const uiState = getActiveSearchUiState({
                isSearching: state.isSearching,
                progress,
                fallbackProgress: state.activeSearchProgress,
                lastSearchParams: state.lastSearchParams,
                currentResults: state.currentResults
            });

            if (searchBtn && uiState.searchLabel) {
                searchBtn.innerText = uiState.searchLabel;
            }

            app.queryUi.renderQuerySummary(uiState.querySummaryParams, uiState.querySummaryMeta);

            app.results.renderEstimateSummary(state.activeSearchEstimate);
            app.results.renderSearchingSpotlight();

            if (tbody && uiState.shouldRenderPendingRow) {
                setResultsBodyMessage(app, tbody, uiState.pendingRowMessage);
            }
        }

        function setCancellingSearch(cancelling) {
            state.isCancellingSearch = cancelling;
            const shell = resolveSearchShell('Unable to update cancel search state.');
            const cancelBtn = shell?.cancelBtn;
            if (cancelBtn) {
                cancelBtn.disabled = cancelling;
            }
        }

        function setSearchState(searching) {
            const shell = resolveSearchShell('Unable to update search controls.', {
                requireStableState: true
            });
            if (!shell) {
                return;
            }

            state.isSearching = searching;
            if (searching) {
                setCancellingSearch(false);
                state.activeSearchId = null;
                state.activeSearchProgress = null;
            }

            if (searching) {
                applySearchControlUi(shell, getSearchControlUiState(searching, buildSearchButtonLabel()));
            } else {
                setCancellingSearch(false);
                app.queryUi.syncSearchButtonState();
                applySearchControlUi(shell, getSearchControlUiState(false));
                state.activeSearchEstimate = null;
                state.activeSearchProgress = null;
                if (state.activeSearchId !== null && state.activeSearchId !== undefined) {
                    state.lastCompletedSearchId = state.activeSearchId;
                }
                state.activeSearchId = null;
            }

            app.queryUi.syncFetchButtonState();
            if (searching) {
                app.queryUi.syncSearchButtonState();
            }
        }

        function prepareSearchRun(shell) {
            app.queryUi.clampNumericInput('boardSize', 1, 20, 9);
            app.queryUi.clampNumericInput(
                'maxResults',
                1,
                state.searchLimits.MAX_RESULTS || 1000,
                state.searchLimits.DEFAULT_MAX_RESULTS || 500
            );

            state.currentResults = [];
            state.activeSearchEstimate = null;
            setSearchState(true);

            return shell.resBody;
        }

        return {
            buildSearchMeta,
            buildSearchButtonLabel,
            buildSearchTableMessage,
            resolveSearchShell,
            getSearchControlUiState,
            applySearchControlUi,
            getActiveSearchUiState,
            renderActiveSearchUi,
            setCancellingSearch,
            setSearchState,
            prepareSearchRun
        };
    };
})();
