const { spawn } = require('node:child_process');
const path = require('node:path');
const { resolveElectronLaunch } = require('./electron-launch.js');

const electronBinary = require('electron');
const buildRoot = path.resolve(__dirname, '..');
const repoRoot = path.basename(buildRoot) === 'build' ? path.resolve(buildRoot, '..') : buildRoot;
const electronLaunch = resolveElectronLaunch(electronBinary, repoRoot, []);
const child = spawn(electronLaunch.command, electronLaunch.args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
        ...process.env,
        TFT_RENDERER_DEV_SERVER_URL: process.env.TFT_RENDERER_DEV_SERVER_URL || 'http://127.0.0.1:5173',
        ELECTRON_RUN_AS_NODE: undefined
    }
});

child.once('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 0);
});
