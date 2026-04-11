(function initializeRendererApp() {
    const rendererNamespace = window.TFTRenderer || {};
    const REQUIRED_FACTORIES = [
        'createState',
        'createVariantLockUi',
        'createQuerySummaryUi',
        'createQueryControlState',
        'createQueryUi',
        'createResultsInteractions',
        'createResultsSpotlight',
        'createResultsSummaryUi',
        'createResultsUi',
        'createHistoryUi',
        'createDataController',
        'createSearchOperations',
        'createSearchShellUi',
        'createSearchOutcomesUi',
        'createSearchController',
        'createBootstrap',
        'createCacheModal'
    ];
    const REQUIRED_DEPENDENCIES = [
        'setupMultiSelect',
        'showAlert',
        'showConfirm'
    ];

    function publishRendererNotReady(reason) {
        const root = document.documentElement;
        if (root) {
            root.dataset.tftReady = '0';
        }

        const status = document.getElementById('status');
        if (status) {
            status.innerText = reason;
        }

        window.dispatchEvent(new CustomEvent('tft-renderer-ready', {
            detail: { ready: false }
        }));
    }

    function failStartup(reason, detail = null) {
        if (detail) {
            console.error(`[Renderer Startup Failed] ${reason}`, detail);
        } else {
            console.error(`[Renderer Startup Failed] ${reason}`);
        }

        publishRendererNotReady(reason);
    }

    const missingFactories = REQUIRED_FACTORIES.filter((factoryName) => typeof rendererNamespace[factoryName] !== 'function');
    if (missingFactories.length > 0) {
        failStartup(`Renderer factory contract missing: ${missingFactories.join(', ')}.`);
        return;
    }

    const dependencies = {
        setupMultiSelect: rendererNamespace.components?.setupMultiSelect,
        showAlert: rendererNamespace.dialog?.showAlert,
        showConfirm: rendererNamespace.dialog?.showConfirm
    };
    const missingDependencies = REQUIRED_DEPENDENCIES.filter((dependencyName) => typeof dependencies[dependencyName] !== 'function');
    if (missingDependencies.length > 0) {
        failStartup(`Renderer dependency contract missing: ${missingDependencies.join(', ')}.`);
        return;
    }

    const app = {
        state: rendererNamespace.createState()
    };

    app.shared = rendererNamespace.shared || {};
    app.state.dependencies = {
        ...(app.state.dependencies || {}),
        ...dependencies
    };

    app.queryUi = rendererNamespace.createQueryUi(app);
    app.results = rendererNamespace.createResultsUi(app);
    app.history = rendererNamespace.createHistoryUi(app);
    app.data = rendererNamespace.createDataController(app);
    app.search = rendererNamespace.createSearchController(app);
    app.bootstrap = rendererNamespace.createBootstrap(app);
    app.cacheModal = rendererNamespace.createCacheModal(app);

    window.TFTRenderer.app = app;

    try {
        app.cacheModal.start();
        app.bootstrap.start();
    } catch (error) {
        failStartup(`Renderer startup crashed: ${error?.message || String(error)}`, error);
    }
})();
