const { spawn } = require('node:child_process');
const path = require('node:path');

async function main() {
    const electronBinary = require('electron');
    const repoRoot = path.resolve(__dirname, '..');
    const timeoutMs = 30_000;

    await new Promise((resolve, reject) => {
        const child = spawn(electronBinary, [repoRoot, '--smoke-test'], {
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
