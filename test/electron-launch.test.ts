const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveElectronLaunch,
    toWindowsPath
} = require('../tools/electron-launch.js');

describe('Electron launch helpers', () => {
    it('converts WSL electron launches into cmd.exe invocations', () => {
        const launch = resolveElectronLaunch(
            '/mnt/e/dev/TFT-traits-web-exploration-tool/node_modules/.pnpm/electron@41.1.1/node_modules/electron/dist/electron.exe',
            '/mnt/e/dev/TFT-traits-web-exploration-tool',
            ['--smoke-test'],
            {
                platform: 'linux',
                release: '6.6.87.2-microsoft-standard-WSL2',
                wslDistroName: 'Ubuntu'
            }
        );

        assert.deepEqual(launch, {
            command: 'cmd.exe',
            args: [
                '/c',
                'E:\\dev\\TFT-traits-web-exploration-tool\\node_modules\\.pnpm\\electron@41.1.1\\node_modules\\electron\\dist\\electron.exe',
                'E:\\dev\\TFT-traits-web-exploration-tool',
                '--smoke-test'
            ]
        });
    });

    it('leaves non-WSL launches unchanged', () => {
        const launch = resolveElectronLaunch(
            '/tmp/electron',
            '/tmp/app',
            ['--dev'],
            {
                platform: 'linux',
                release: '6.8.0',
                wslDistroName: undefined
            }
        );

        assert.deepEqual(launch, {
            command: '/tmp/electron',
            args: ['/tmp/app', '--dev']
        });
    });

    it('only rewrites mounted Windows paths', () => {
        assert.equal(
            toWindowsPath('/mnt/e/dev/TFT-traits-web-exploration-tool'),
            'E:\\dev\\TFT-traits-web-exploration-tool'
        );
        assert.equal(toWindowsPath('/tmp/app'), '/tmp/app');
    });
});
