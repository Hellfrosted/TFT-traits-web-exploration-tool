const os = require('node:os');

type RuntimeInfo = {
    readonly platform: string;
    readonly release: string;
    readonly wslDistroName?: string | undefined;
};

type ElectronLaunch = {
    readonly command: string;
    readonly args: readonly string[];
};

function getRuntimeInfo(): RuntimeInfo {
    return {
        platform: process.platform,
        release: os.release(),
        wslDistroName: process.env.WSL_DISTRO_NAME
    };
}

function isWslRuntime(runtimeInfo: RuntimeInfo): boolean {
    if (runtimeInfo.platform !== 'linux') {
        return false;
    }

    const normalizedRelease = runtimeInfo.release.toLowerCase();
    return normalizedRelease.includes('microsoft') || Boolean(runtimeInfo.wslDistroName);
}

function toWindowsPath(pathValue: string): string {
    const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(pathValue);
    if (!match) {
        return pathValue;
    }

    const [, driveLetter, rest] = match;
    return `${driveLetter.toUpperCase()}:\\${rest.replaceAll('/', '\\')}`;
}

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
