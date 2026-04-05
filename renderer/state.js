(function initializeRendererStateFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createState = function createState() {
        const electronBridge = window.electronAPI;
        const roleDefaultsApi = window.roleDefaults || {};

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
            activeSearchEstimate: null,
            variantLockControls: new Map(),
            electronBridge,
            hasElectronAPI: !!electronBridge,
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
