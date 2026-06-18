const os = require('node:os');

function getRuntimeInfo() {
    return {
        platform: process.platform,
        release: os.release(),
        wslDistroName: process.env.WSL_DISTRO_NAME
    };
}

function isWslRuntime(runtime = getRuntimeInfo()) {
    if (runtime.platform !== 'linux') {
        return false;
    }

    return runtime.release.toLowerCase().includes('microsoft') || Boolean(runtime.wslDistroName);
}

function toWindowsPath(pathValue) {
    const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(pathValue);
    if (!match) {
        return pathValue;
    }

    const [, driveLetter, rest] = match;
    return `${driveLetter.toUpperCase()}:\\${rest.replaceAll('/', '\\')}`;
}

module.exports = {
    getRuntimeInfo,
    isWslRuntime,
    toWindowsPath
};
