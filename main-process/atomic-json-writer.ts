const RECOVERABLE_RENAME_ERROR_CODES = new Set(['EEXIST', 'EPERM']);
const RECOVERABLE_UNLINK_ERROR_CODES = new Set(['ENOENT']);

type AtomicJsonFileSystem = {
    readonly writeFile: (filePath: string, payload: string, encoding: 'utf-8') => Promise<void>;
    readonly rename: (fromPath: string, toPath: string) => Promise<void>;
    readonly unlink: (filePath: string) => Promise<void>;
};

type WriteJsonPayloadAtomicallyOptions = {
    readonly fsp: AtomicJsonFileSystem;
    readonly filePath: string;
    readonly payload: string;
    readonly tempSuffix: string;
};

function getErrorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
        return undefined;
    }
    const { code } = error;
    return typeof code === 'string' ? code : undefined;
}

function isRecoverableFsError(error: unknown, codes: ReadonlySet<string>): boolean {
    const code = getErrorCode(error);
    return code !== undefined && codes.has(code);
}

export async function writeJsonPayloadAtomically({
    fsp,
    filePath,
    payload,
    tempSuffix
}: WriteJsonPayloadAtomicallyOptions): Promise<void> {
    const tempPath = `${filePath}.${tempSuffix}.tmp`;
    await fsp.writeFile(tempPath, payload, 'utf-8');
    try {
        await fsp.rename(tempPath, filePath);
    } catch (renameError) {
        if (!isRecoverableFsError(renameError, RECOVERABLE_RENAME_ERROR_CODES)) {
            throw renameError;
        }
        try {
            await fsp.unlink(filePath);
        } catch (unlinkError) {
            if (!isRecoverableFsError(unlinkError, RECOVERABLE_UNLINK_ERROR_CODES)) {
                throw unlinkError;
            }
        }
        await fsp.rename(tempPath, filePath);
    }
}

module.exports = {
    writeJsonPayloadAtomically
};
