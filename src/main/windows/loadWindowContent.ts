import type {BrowserWindow} from 'electron';

interface LoadWindowContentOptions {
    isDev: boolean;
    devUrls: string[];
    prodFiles: string[];
    windowName?: string;
}

export async function loadWindowContent(
    win: BrowserWindow,
    {isDev, devUrls, prodFiles, windowName = 'window'}: LoadWindowContentOptions
): Promise<void> {
    attachWindowDiagnostics(win, windowName);
    const targets = isDev ? devUrls : prodFiles;
    let lastError: unknown = null;

    for (const target of targets) {
        try {
            if (isDev) {
                await win.loadURL(target);
            } else {
                await win.loadFile(target);
            }
            return;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to load window content');
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
