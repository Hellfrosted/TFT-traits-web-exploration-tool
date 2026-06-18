const { spawn } = require('node:child_process');

type RunSmokeProcessOptions = {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly timeoutMs: number;
    readonly label: string;
};

function runSmokeProcess(options: RunSmokeProcessOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(options.command, options.args, {
            cwd: options.cwd,
            stdio: 'inherit',
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: undefined
            }
        });

        const timeoutId = setTimeout(() => {
            child.kill();
            reject(new Error(`${options.label} timed out after ${options.timeoutMs}ms.`));
        }, options.timeoutMs);

        child.once('error', (error: Error) => {
            clearTimeout(timeoutId);
            reject(error);
        });

        child.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
            clearTimeout(timeoutId);
            if (signal) {
                reject(new Error(`${options.label} terminated with signal ${signal}.`));
                return;
            }

            if (code !== 0) {
                reject(new Error(`${options.label} exited with code ${code}.`));
                return;
            }

            resolve();
        });
    });
}

module.exports = {
    runSmokeProcess
};
