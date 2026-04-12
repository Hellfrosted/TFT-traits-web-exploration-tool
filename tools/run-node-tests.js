const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function collectTestFiles(dir, results = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectTestFiles(fullPath, results);
            continue;
        }

        if (entry.isFile() && entry.name.endsWith('.test.js')) {
            results.push(fullPath);
        }
    }

    return results;
}

const repoRoot = path.resolve(__dirname, '..');
const testDir = path.join(repoRoot, 'test');
const testFiles = collectTestFiles(testDir).sort();

if (testFiles.length === 0) {
    console.error('No test files found under test/.');
    process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: repoRoot,
    stdio: 'inherit'
});

if (result.error) {
    throw result.error;
}

process.exit(result.status ?? 1);
