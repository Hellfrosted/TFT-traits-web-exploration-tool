const path = require('node:path');
const { resolveElectronLaunch } = require('./electron-launch.js');
const { runSmokeProcess } = require('./smoke-process-runner.js');

async function main() {
    const electronBinary = require('electron');
    const buildRoot = path.resolve(__dirname, '..');
    const repoRoot = path.basename(buildRoot) === 'build' ? path.resolve(buildRoot, '..') : buildRoot;
    const timeoutMs = 30_000;
    const extraArgs = ['--smoke-test'];

    if (process.env.CI) {
        if (process.platform === 'linux') {
            extraArgs.push('--no-sandbox');
        }

        extraArgs.push('--disable-gpu', '--disable-dev-shm-usage');
    }

    const electronLaunch = resolveElectronLaunch(electronBinary, repoRoot, extraArgs);

    await runSmokeProcess({
        command: electronLaunch.command,
        args: electronLaunch.args,
        cwd: repoRoot,
        timeoutMs,
        label: 'Electron smoke test'
    });
}

main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
});
