import type {BrowserWindow} from 'electron';

interface LoadWindowContentOptions {
    isDev: boolean;
    devUrls: WindowContentTarget[];
    prodFiles: WindowContentTarget[];
    windowName?: string;
}

type WindowContentTarget =
    | string
    | {
    target: string;
    query?: Record<string, string>;
    hash?: string;
};

export async function loadWindowContent(
    win: BrowserWindow,
    {isDev, devUrls, prodFiles, windowName = 'window'}: LoadWindowContentOptions,
): Promise<void> {
    if (win.isDestroyed()) return;
    attachWindowDiagnostics(win, windowName);
    const targets = isDev ? devUrls : prodFiles;
    let lastError: unknown = null;

    for (const target of targets) {
        if (win.isDestroyed()) return;
        try {
            if (isDev) {
                if (typeof target === 'string') {
                    await win.loadURL(target);
                } else {
                    await win.loadURL(appendQueryAndHash(target.target, target.query, target.hash));
                }
            } else {
                if (typeof target === 'string') {
                    await win.loadFile(target);
                } else {
                    const normalizedHash = normalizeHash(target.hash);
                    if (normalizedHash) {
                        await win.loadFile(target.target, {query: target.query, hash: normalizedHash});
                    } else {
                        await win.loadFile(target.target, {query: target.query});
                    }
                }
            }
            return;
        } catch (error) {
            if (isDestroyedObjectError(error)) return;
            if (win.isDestroyed()) return;
            lastError = error;
        }
    }

    if (win.isDestroyed()) return;
    throw lastError instanceof Error ? lastError : new Error('Failed to load window content');
}

function appendQueryAndHash(target: string, query?: Record<string, string>, hash?: string): string {
    const url = new URL(target);
    if (query && Object.keys(query).length > 0) {
        for (const [key, value] of Object.entries(query)) {
            url.searchParams.set(key, value);
        }
    }
    const normalizedHash = normalizeHash(hash);
    if (normalizedHash) url.hash = normalizedHash;
    return url.toString();
}

function normalizeHash(hash?: string): string | undefined {
    if (!hash) return undefined;
    const value = String(hash).trim();
    if (!value) return undefined;
    if (value.startsWith('#')) return value.slice(1);
    return value;
}

function isDestroyedObjectError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /object has been destroyed/i.test(message);
}

function attachWindowDiagnostics(win: BrowserWindow, windowName: string): void {
    if (win.isDestroyed()) return;
    const wc = win.webContents as BrowserWindow['webContents'] & { __lunaDiagAttached?: boolean };
    if (wc.__lunaDiagAttached) return;
    wc.__lunaDiagAttached = true;

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        console.error(`[${windowName}] did-fail-load`, {
            errorCode,
            errorDescription,
            validatedURL,
            isMainFrame,
        });
    });

    wc.on('preload-error', (_event, preloadPath, error) => {
        console.error(`[${windowName}] preload-error`, {preloadPath, error: String(error)});
    });

    wc.on('render-process-gone', (_event, details) => {
        console.error(`[${windowName}] render-process-gone`, details);
    });

    wc.on('console-message', (details) => {
        console.log(
            `[${windowName}] console(${details.level}) ${details.sourceId}:${details.lineNumber} ${details.message}`,
        );
    });
}
