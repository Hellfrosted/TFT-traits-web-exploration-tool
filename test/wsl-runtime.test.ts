const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isWslRuntime, toWindowsPath } = require(path.join(process.cwd(), 'tools/wsl-runtime.cjs'));

describe('WSL runtime helpers', () => {
    it('detects linux non-WSL runtimes as non-WSL', () => {
        assert.equal(
            isWslRuntime({
                platform: 'linux',
                release: '6.8.0',
                wslDistroName: undefined
            }),
            false
        );
    });

    it('converts mounted Windows paths', () => {
        assert.equal(toWindowsPath('/mnt/c/tmp/x'), 'C:\\tmp\\x');
    });

    it('passes through non-mounted paths', () => {
        assert.equal(toWindowsPath('/home/user/project'), '/home/user/project');
    });

    it('loads built entrypoints from an isolated build-only tools directory', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wsl-runtime-build-only-'));
        try {
            const tempTools = path.join(tempRoot, 'build', 'tools');
            fs.mkdirSync(tempTools, { recursive: true });
            const requiredToolFiles = ['electron-launch.js', 'local-bin.cjs', 'wsl-runtime.cjs'];
            const sourceTools = [
                path.join(process.cwd(), 'tools'),
                path.join(process.cwd(), 'build', 'tools')
            ].find((candidate) => requiredToolFiles.every((fileName) => fs.existsSync(path.join(candidate, fileName))));

            assert.ok(sourceTools, 'Expected built tools under cwd/tools or cwd/build/tools.');
            for (const fileName of requiredToolFiles) {
                fs.copyFileSync(path.join(sourceTools, fileName), path.join(tempTools, fileName));
            }

            const electronLaunch = require(path.join(tempTools, 'electron-launch.js'));
            const localBin = require(path.join(tempTools, 'local-bin.cjs'));

            assert.equal(electronLaunch.toWindowsPath('/mnt/c/tmp/x'), 'C:\\tmp\\x');
            assert.equal(localBin.toWindowsPath('/mnt/c/tmp/x'), 'C:\\tmp\\x');
        } finally {
            fs.rmSync(tempRoot, { force: true, recursive: true });
        }
    });
});
