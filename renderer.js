// All renderer/*.js modules must be loaded before this file to populate window.TFTRenderer.
const rendererNamespace = window.TFTRenderer;
if (!rendererNamespace) {
    throw new Error('window.TFTRenderer is not defined. Ensure all renderer modules are loaded before renderer.js.');
}

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
