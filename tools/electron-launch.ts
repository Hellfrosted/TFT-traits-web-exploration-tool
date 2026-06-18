const fs = require('node:fs');
const path = require('node:path');

type RuntimeInfo = {
    readonly platform: string;
    readonly release: string;
    readonly wslDistroName?: string | undefined;
};

type ElectronLaunch = {
    readonly command: string;
    readonly args: readonly string[];
};

type WslRuntimeHelpers = {
    readonly getRuntimeInfo: () => RuntimeInfo;
    readonly isWslRuntime: (runtimeInfo: RuntimeInfo) => boolean;
    readonly toWindowsPath: (pathValue: string) => string;
};

function resolveWslRuntimeHelperPath(): string {
    const localHelperPath = path.join(__dirname, 'wsl-runtime.cjs');
    if (fs.existsSync(localHelperPath)) {
        return localHelperPath;
    }

    return path.join(__dirname, '..', '..', 'tools', 'wsl-runtime.cjs');
}

const { getRuntimeInfo, isWslRuntime, toWindowsPath }: WslRuntimeHelpers = require(resolveWslRuntimeHelperPath());

function resolveElectronLaunch(
    electronBinary: string,
    appRoot: string,
    extraArgs: readonly string[],
    runtimeInfo: RuntimeInfo = getRuntimeInfo()
): ElectronLaunch {
    if (!isWslRuntime(runtimeInfo) || !electronBinary.toLowerCase().endsWith('.exe')) {
        return {
            command: electronBinary,
            args: [appRoot, ...extraArgs]
        };
    }

    return {
        command: 'cmd.exe',
        args: ['/c', toWindowsPath(electronBinary), toWindowsPath(appRoot), ...extraArgs]
    };
}

module.exports = {
    resolveElectronLaunch,
    toWindowsPath
};
