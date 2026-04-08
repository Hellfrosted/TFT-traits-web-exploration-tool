(function initializeRendererStateFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createState = function createState() {
        const electronBridge = window.electronAPI;
        const roleDefaultsApi = window.roleDefaults || {};
        const rendererComponents = ns.components || {};
        const rendererDialog = ns.dialog || {};

        return {
            selectors: {},
            currentResults: [],
            currentResultsFingerprint: null,
            lastSearchParams: null,
            activeData: null,
            selectedBoardIndex: -1,
            isFetchingData: false,
            nextDataFetchRequestId: 0,
            activeDataFetchRequestId: 0,
            isSearching: false,
            isCancellingSearch: false,
            activeSearchId: null,
            activeSearchEstimate: null,
            activeSearchProgress: null,
            variantLockControls: new Map(),
            electronBridge,
            hasElectronAPI: !!electronBridge,
            dependencies: {
                setupMultiSelect: typeof rendererComponents.setupMultiSelect === 'function'
                    ? rendererComponents.setupMultiSelect
                    : null,
                showAlert: typeof rendererDialog.showAlert === 'function'
                    ? rendererDialog.showAlert
                    : null,
                showConfirm: typeof rendererDialog.showConfirm === 'function'
                    ? rendererDialog.showConfirm
                    : null
            },
            searchLimits: electronBridge?.limits || {},
            defaultDataSource: electronBridge?.defaultDataSource || 'pbe',
            flags: {
                smokeTest: !!electronBridge?.flags?.smokeTest
            },
            listeners: {
                staticBound: false,
                draftBound: false,
                bootScheduled: false,
                uiInitialized: false,
                bootStarted: false
            },
            cleanupFns: [],
            resolveDefaultTankRoles: roleDefaultsApi.deriveDefaultTankRoles || (() => []),
            resolveDefaultCarryRoles: roleDefaultsApi.deriveDefaultCarryRoles || (() => [])
        };
    };
})();
