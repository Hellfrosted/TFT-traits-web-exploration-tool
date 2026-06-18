import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { writeJsonPayloadAtomically } from '../main-process/atomic-json-writer.js';

type FsError = Error & {
    readonly code: string;
};

type AtomicJsonWriterOperation =
    | readonly ['writeFile', string, string, 'utf-8']
    | readonly ['rename', string, string]
    | readonly ['unlink', string];

function createFsError(message: string, code: string): FsError {
    return Object.assign(new Error(message), { code });
}

describe('atomic JSON writer', () => {
    it('rejects nonrecoverable rename errors without unlinking the destination', async () => {
        const renameError = createFsError('cross-device rename failed', 'EXDEV');
        const operations: AtomicJsonWriterOperation[] = [];

        await assert.rejects(
            async () =>
                await writeJsonPayloadAtomically({
                    fsp: {
                        writeFile: async (filePath, payload, encoding) => {
                            operations.push(['writeFile', filePath, payload, encoding]);
                        },
                        rename: async (fromPath, toPath) => {
                            operations.push(['rename', fromPath, toPath]);
                            throw renameError;
                        },
                        unlink: async (filePath) => {
                            operations.push(['unlink', filePath]);
                        }
                    },
                    filePath: 'C:\\cache\\entry.json',
                    payload: '{"ok":true}',
                    tempSuffix: 'test-id'
                }),
            (error: unknown) => error === renameError
        );

        assert.deepEqual(operations, [
            ['writeFile', 'C:\\cache\\entry.json.test-id.tmp', '{"ok":true}', 'utf-8'],
            ['rename', 'C:\\cache\\entry.json.test-id.tmp', 'C:\\cache\\entry.json']
        ]);
    });

    it('unlinks the destination and retries after recoverable rename errors', async () => {
        const renameError = createFsError('destination exists', 'EEXIST');
        const operations: AtomicJsonWriterOperation[] = [];
        let renameCalls = 0;

        await writeJsonPayloadAtomically({
            fsp: {
                writeFile: async (filePath, payload, encoding) => {
                    operations.push(['writeFile', filePath, payload, encoding]);
                },
                rename: async (fromPath, toPath) => {
                    renameCalls += 1;
                    operations.push(['rename', fromPath, toPath]);
                    if (renameCalls === 1) {
                        throw renameError;
                    }
                },
                unlink: async (filePath) => {
                    operations.push(['unlink', filePath]);
                }
            },
            filePath: 'C:\\cache\\entry.json',
            payload: '{"ok":true}',
            tempSuffix: 'test-id'
        });

        assert.deepEqual(operations, [
            ['writeFile', 'C:\\cache\\entry.json.test-id.tmp', '{"ok":true}', 'utf-8'],
            ['rename', 'C:\\cache\\entry.json.test-id.tmp', 'C:\\cache\\entry.json'],
            ['unlink', 'C:\\cache\\entry.json'],
            ['rename', 'C:\\cache\\entry.json.test-id.tmp', 'C:\\cache\\entry.json']
        ]);
    });

    it('unlinks the destination and retries after EPERM rename errors', async () => {
        const renameError = createFsError('operation not permitted', 'EPERM');
        const operations: AtomicJsonWriterOperation[] = [];
        let renameCalls = 0;

        await writeJsonPayloadAtomically({
            fsp: {
                writeFile: async (filePath, payload, encoding) => {
                    operations.push(['writeFile', filePath, payload, encoding]);
                },
                rename: async (fromPath, toPath) => {
                    renameCalls += 1;
                    operations.push(['rename', fromPath, toPath]);
                    if (renameCalls === 1) {
                        throw renameError;
                    }
                },
                unlink: async (filePath) => {
                    operations.push(['unlink', filePath]);
                }
            },
            filePath: 'C:\\cache\\entry.json',
            payload: '{"ok":true}',
            tempSuffix: 'test-id'
        });

        assert.deepEqual(operations, [
            ['writeFile', 'C:\\cache\\entry.json.test-id.tmp', '{"ok":true}', 'utf-8'],
            ['rename', 'C:\\cache\\entry.json.test-id.tmp', 'C:\\cache\\entry.json'],
            ['unlink', 'C:\\cache\\entry.json'],
            ['rename', 'C:\\cache\\entry.json.test-id.tmp', 'C:\\cache\\entry.json']
        ]);
    });

    it('rejects arbitrary unlink errors without retrying the rename', async () => {
        const renameError = createFsError('destination exists', 'EEXIST');
        const unlinkError = createFsError('access denied while removing destination', 'EACCES');
        const operations: AtomicJsonWriterOperation[] = [];

        await assert.rejects(
            async () =>
                await writeJsonPayloadAtomically({
                    fsp: {
                        writeFile: async (filePath, payload, encoding) => {
                            operations.push(['writeFile', filePath, payload, encoding]);
                        },
                        rename: async (fromPath, toPath) => {
                            operations.push(['rename', fromPath, toPath]);
                            throw renameError;
                        },
                        unlink: async (filePath) => {
                            operations.push(['unlink', filePath]);
                            throw unlinkError;
                        }
                    },
                    filePath: 'C:\\cache\\entry.json',
                    payload: '{"ok":true}',
                    tempSuffix: 'test-id'
                }),
            (error: unknown) => error === unlinkError
        );

        assert.deepEqual(operations, [
            ['writeFile', 'C:\\cache\\entry.json.test-id.tmp', '{"ok":true}', 'utf-8'],
            ['rename', 'C:\\cache\\entry.json.test-id.tmp', 'C:\\cache\\entry.json'],
            ['unlink', 'C:\\cache\\entry.json']
        ]);
    });

    it('retries after the destination disappears before unlink', async () => {
        const renameError = createFsError('destination exists', 'EEXIST');
        const unlinkError = createFsError('destination already removed', 'ENOENT');
        const operations: AtomicJsonWriterOperation[] = [];
        let renameCalls = 0;

        await writeJsonPayloadAtomically({
            fsp: {
                writeFile: async (filePath, payload, encoding) => {
                    operations.push(['writeFile', filePath, payload, encoding]);
                },
                rename: async (fromPath, toPath) => {
                    renameCalls += 1;
                    operations.push(['rename', fromPath, toPath]);
                    if (renameCalls === 1) {
                        throw renameError;
                    }
                },
                unlink: async (filePath) => {
                    operations.push(['unlink', filePath]);
                    throw unlinkError;
                }
            },
            filePath: 'C:\\cache\\entry.json',
            payload: '{"ok":true}',
            tempSuffix: 'test-id'
        });

        assert.deepEqual(operations, [
            ['writeFile', 'C:\\cache\\entry.json.test-id.tmp', '{"ok":true}', 'utf-8'],
            ['rename', 'C:\\cache\\entry.json.test-id.tmp', 'C:\\cache\\entry.json'],
            ['unlink', 'C:\\cache\\entry.json'],
            ['rename', 'C:\\cache\\entry.json.test-id.tmp', 'C:\\cache\\entry.json']
        ]);
    });
});
