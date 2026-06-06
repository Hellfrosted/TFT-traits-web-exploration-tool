#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const eslintTargets = [
    'bridge-contract.ts',
    'constants.ts',
    'data.ts',
    'engine.ts',
    'eslint.config.ts',
    'global.d.ts',
    'main.ts',
    'preload.ts',
    'searchParams.ts',
    'setOverrides.ts',
    'storage.ts',
    'vite.config.ts',
    'worker.ts',
    'src',
    'test',
    'tools',
    'data-engine',
    'engine',
    'main-process',
    'set-overrides',
    '--ignore-pattern',
    'tools/node/**',
    '--ignore-pattern',
    'tools/*.cjs',
    '--ext',
    '.ts,.tsx'
];

const runnerPath = path.join(__dirname, 'local-bin.cjs');
const result = spawnSync(process.execPath, [runnerPath, 'eslint', ...eslintTargets], {
    cwd: process.cwd(),
    stdio: 'inherit'
});

if (result.error) {
    throw result.error;
}

process.exit(result.status ?? 1);
