const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isWslRuntime, resolveLocalBinCommand, toWindowsPath } = require(
    path.join(process.cwd(), 'tools/local-bin.cjs')
);

describe('local tool runner helpers', () => {
    it('detects WSL runtimes', () => {
        assert.equal(
            isWslRuntime({
                platform: 'linux',
                release: '6.6.87.2-microsoft-standard-WSL2',
                wslDistroName: 'Ubuntu'
            }),
            true
        );

        assert.equal(
            isWslRuntime({
                platform: 'linux',
                release: '6.8.0',
                wslDistroName: undefined
            }),
            false
        );
    });

    it('rewrites mounted Windows paths', () => {
        assert.equal(
            toWindowsPath('/mnt/e/dev/TFT-traits-web-exploration-tool'),
            'E:\\dev\\TFT-traits-web-exploration-tool'
        );
        assert.equal(toWindowsPath('/tmp/local-project'), '/tmp/local-project');
    });

    it('routes WSL binaries through cmd.exe when Windows shims are installed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-bin-'));
        fs.mkdirSync(path.join(tempDir, 'node_modules', '.bin'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'node_modules', '.bin', 'biome.CMD'), '');

        const commandSpec = resolveLocalBinCommand(
            'biome',
            ['lint', '.'],
            {
                platform: 'linux',
                release: '6.6.87.2-microsoft-standard-WSL2',
                wslDistroName: 'Ubuntu'
            },
            tempDir
        );

        assert.deepEqual(commandSpec, {
            command: 'cmd.exe',
            args: ['/c', `cd /d ${toWindowsPath(tempDir)} && call node_modules\\.bin\\biome.CMD lint .`]
        });
    });

    it('uses local unix bins in WSL when only unix shims are installed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-bin-'));
        fs.mkdirSync(path.join(tempDir, 'node_modules', '.bin'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'node_modules', '.bin', 'eslint'), '');

        const commandSpec = resolveLocalBinCommand(
            'eslint',
            ['src'],
            {
                platform: 'linux',
                release: '6.6.87.2-microsoft-standard-WSL2',
                wslDistroName: 'Ubuntu'
            },
            tempDir
        );

        assert.deepEqual(commandSpec, {
            command: path.join(tempDir, 'node_modules', '.bin', 'eslint'),
            args: ['src']
        });
    });

    it('uses local unix bins outside WSL', () => {
        const commandSpec = resolveLocalBinCommand(
            'vite',
            ['build'],
            {
                platform: 'linux',
                release: '6.8.0',
                wslDistroName: undefined
            },
            '/tmp/project'
        );

        assert.deepEqual(commandSpec, {
            command: '/tmp/project/node_modules/.bin/vite',
            args: ['build']
        });
    });
});
