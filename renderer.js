const rendererNamespace = window.TFTRenderer || {};

const app = {
    state: rendererNamespace.createState()
};

app.queryUi = rendererNamespace.createQueryUi(app);
app.results = rendererNamespace.createResultsUi(app);
app.history = rendererNamespace.createHistoryUi(app);
app.data = rendererNamespace.createDataController(app);
app.search = rendererNamespace.createSearchController(app);
app.bootstrap = rendererNamespace.createBootstrap(app);

window.TFTRenderer.app = app;

app.bootstrap.start();
