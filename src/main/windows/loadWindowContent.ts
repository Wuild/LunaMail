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
                    await win.loadURL(appendQuery(target.target, target.query));
                }
            } else {
                if (typeof target === 'string') {
                    await win.loadFile(target);
                } else {
                    await win.loadFile(target.target, {query: target.query});
                }
            }
            return;
        } catch (error) {
            if (win.isDestroyed()) return;
            lastError = error;
        }
    }

    if (win.isDestroyed()) return;
    throw lastError instanceof Error ? lastError : new Error('Failed to load window content');
}

function appendQuery(target: string, query?: Record<string, string>): string {
    if (!query || Object.keys(query).length === 0) return target;
    const url = new URL(target);
    for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}

function attachWindowDiagnostics(win: BrowserWindow, windowName: string): void {
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

    wc.on('console-message', (_event, level, message, line, sourceId) => {
        console.log(`[${windowName}] console(${level}) ${sourceId}:${line} ${message}`);
    });
}
