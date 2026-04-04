const { createMainRuntime } = require('./main-process/runtime.js');

if (process.versions?.electron) {
    createMainRuntime().start();
}

module.exports = {
    createMainRuntime
};
