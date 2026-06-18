const fs = require('node:fs');
const path = require('node:path');
const { runSmokeProcess } = require('./smoke-process-runner.js');

function findPackagedExecutable(distRoot) {
    const candidates = fs
        .readdirSync(distRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /-win32-x64$/i.test(entry.name))
        .map((entry) => {
            const appDir = path.join(distRoot, entry.name);
            const executableBaseName = entry.name.replace(/-win32-x64$/i, '');
            return {
                appDir,
                exePath: path.join(appDir, `${executableBaseName}.exe`),
                mtimeMs: fs.statSync(appDir).mtimeMs
            };
        })
        .filter((entry) => fs.existsSync(entry.exePath))
        .sort((left, right) => right.mtimeMs - left.mtimeMs);

    return candidates[0] || null;
}

async function runExecutable(exePath) {
    const timeoutMs = 30_000;
    await runSmokeProcess({
        command: exePath,
        args: ['--smoke-test'],
        cwd: path.dirname(exePath),
        timeoutMs,
        label: 'Packaged smoke test'
    });
}

async function main() {
    const buildRoot = path.resolve(__dirname, '..');
    const repoRoot = path.basename(buildRoot) === 'build' ? path.resolve(buildRoot, '..') : buildRoot;
    const distRoot = path.join(repoRoot, 'dist');
    const packagedApp = findPackagedExecutable(distRoot);

    if (!packagedApp) {
        throw new Error('No packaged Windows app was found under dist/. Run `npm run pack:win` first.');
    }

    await runExecutable(packagedApp.exePath);
}

main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
});
