(function initializeQueryControlStateFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createQueryControlState = function createQueryControlState(options = {}) {
        const {
            getDefaultBoardSize = () => 9,
            getDefaultMaxResults = () => 500
        } = options;

        function getFetchButtonUiState({
            isSearching = false,
            isFetchingData = false
        } = {}) {
            const disabled = isSearching || isFetchingData;
            return {
                disabled,
                opacity: disabled ? '0.5' : '1'
            };
        }

        function applyFetchButtonUi(button, uiState) {
            button.disabled = !!uiState?.disabled;
            button.style.opacity = uiState?.opacity || '1';
        }

        function getSearchButtonUiState({
            isSearching = false,
            isFetchingData = false,
            hasActiveData = false
        } = {}) {
            const disabled = isSearching || isFetchingData || !hasActiveData;
            return {
                disabled,
                classDisabled: disabled,
                text: isSearching
                    ? null
                    : (isFetchingData ? 'Loading data...' : 'Compute')
            };
        }

        function applySearchButtonUi(button, uiState) {
            button.disabled = !!uiState?.disabled;
            button.classList.toggle('disabled', !!uiState?.classDisabled);

            if (uiState?.text !== null && uiState?.text !== undefined) {
                button.innerText = uiState.text;
            }
        }

        function readQueryControlValues(controls) {
            return {
                boardSize: parseInt(controls.boardSize?.value, 10) || getDefaultBoardSize(),
                maxResults: parseInt(controls.maxResults?.value, 10) || getDefaultMaxResults(),
                onlyActive: !!controls.onlyActiveToggle?.checked,
                tierRank: !!controls.tierRankToggle?.checked,
                includeUnique: !!controls.includeUniqueToggle?.checked
            };
        }

        function getDefaultSearchParams() {
            return {
                boardSize: getDefaultBoardSize(),
                maxResults: getDefaultMaxResults(),
                mustInclude: [],
                mustExclude: [],
                mustIncludeTraits: [],
                mustExcludeTraits: [],
                extraEmblems: [],
                variantLocks: {},
                tankRoles: null,
                carryRoles: null,
                onlyActive: true,
                tierRank: true,
                includeUnique: false
            };
        }

        function applyQueryControlValues(controls, params) {
            if (controls.boardSize) controls.boardSize.value = params.boardSize || getDefaultBoardSize();
            if (controls.maxResults) controls.maxResults.value = params.maxResults || getDefaultMaxResults();
            if (controls.onlyActiveToggle) controls.onlyActiveToggle.checked = !!params.onlyActive;
            if (controls.tierRankToggle) controls.tierRankToggle.checked = !!params.tierRank;
            if (controls.includeUniqueToggle) controls.includeUniqueToggle.checked = !!params.includeUnique;
        }

        function applyRoleSelectorSearchParams(selector, values, defaultValues = null) {
            if (!selector) {
                return;
            }

            if (Array.isArray(values)) {
                selector.setValues(values);
                return;
            }

            if (defaultValues) {
                selector.setValues(defaultValues);
            }
        }

        function clampNumericInput(input, min, max, fallback) {
            if (!input) {
                return fallback;
            }

            const parsed = parseInt(input.value, 10);
            if (Number.isNaN(parsed)) {
                input.value = fallback;
                return fallback;
            }

            const clamped = Math.min(Math.max(parsed, min), max);
            if (clamped !== parsed) {
                input.value = clamped;
            }
            return clamped;
        }

        return {
            getFetchButtonUiState,
            applyFetchButtonUi,
            getSearchButtonUiState,
            applySearchButtonUi,
            readQueryControlValues,
            getDefaultSearchParams,
            applyQueryControlValues,
            applyRoleSelectorSearchParams,
            clampNumericInput
        };
    };
})();
