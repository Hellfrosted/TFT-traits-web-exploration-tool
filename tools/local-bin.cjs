#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function resolveWslRuntimeHelperPath() {
    const localHelperPath = path.join(__dirname, 'wsl-runtime.cjs');
    if (fs.existsSync(localHelperPath)) {
        return localHelperPath;
    }

    return path.join(__dirname, '..', '..', 'tools', 'wsl-runtime.cjs');
}

const { getRuntimeInfo, isWslRuntime, toWindowsPath } = require(resolveWslRuntimeHelperPath());

function quoteForCmd(argument) {
    return `"${String(argument).replaceAll('"', '""')}"`;
}

function renderCmdArgument(argument) {
    const normalized = String(argument);
    if (/[\s"&|<>^()%!]/.test(normalized)) {
        return quoteForCmd(normalized);
    }

    return normalized;
}

function resolveLocalBinCommand(
    binName,
    binArgs,
    runtime = getRuntimeInfo(),
    cwd = process.cwd()
) {
    if (isWslRuntime(runtime)) {
        const windowsShim = path.join(cwd, 'node_modules', '.bin', `${binName}.CMD`);
        if (!fs.existsSync(windowsShim)) {
            return {
                command: path.join(cwd, 'node_modules', '.bin', binName),
                args: [...binArgs]
            };
        }

        const windowsCwd = toWindowsPath(cwd);
        const command = [
            'cd',
            '/d',
            renderCmdArgument(windowsCwd),
            '&&',
            'call',
            `node_modules\\.bin\\${binName}.CMD`,
            ...binArgs.map(renderCmdArgument)
        ].join(' ');

        return {
            command: 'cmd.exe',
            args: ['/c', command]
        };
    }

    if (runtime.platform === 'win32') {
        const command = ['call', `node_modules\\.bin\\${binName}.CMD`, ...binArgs.map(renderCmdArgument)].join(' ');
        return {
            command: 'cmd.exe',
            args: ['/c', command]
        };
    }

    return {
        command: path.join(cwd, 'node_modules', '.bin', binName),
        args: [...binArgs]
    };
}

function main() {
    const [, , binName, ...binArgs] = process.argv;
    if (!binName) {
        console.error('Usage: node tools/local-bin.cjs <bin> [args...]');
        process.exit(1);
    }

    const commandSpec = resolveLocalBinCommand(binName, binArgs);
    const result = spawnSync(commandSpec.command, commandSpec.args, {
        cwd: process.cwd(),
        stdio: 'inherit'
    });

    if (result.error) {
        throw result.error;
    }

    process.exit(result.status ?? 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    isWslRuntime,
    resolveLocalBinCommand,
    toWindowsPath
};
