const { spawn } = require('node:child_process');
const path = require('node:path');
const { resolveElectronLaunch } = require('./electron-launch.js');

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

    await new Promise<void>((resolve, reject) => {
        const child = spawn(electronLaunch.command, electronLaunch.args, {
            cwd: repoRoot,
            stdio: 'inherit',
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: undefined
            }
        });

        const timeoutId = setTimeout(() => {
            child.kill();
            reject(new Error(`Electron smoke test timed out after ${timeoutMs}ms.`));
        }, timeoutMs);

        child.once('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });

        child.once('exit', (code, signal) => {
            clearTimeout(timeoutId);
            if (signal) {
                reject(new Error(`Electron smoke test terminated with signal ${signal}.`));
                return;
            }

            if (code !== 0) {
                reject(new Error(`Electron smoke test exited with code ${code}.`));
                return;
            }

            resolve();
        });
    });
}

main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
});
