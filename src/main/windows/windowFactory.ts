import {BrowserWindow, type BrowserWindowConstructorOptions} from 'electron';

type SecureWebPreferencesOptions = {
    preloadPath: string;
    spellcheck?: boolean;
};

type ShortcutOptions = {
    closeOnEscape?: boolean;
    onEscape?: () => void;
};

export function buildSecureWebPreferences({
                                              preloadPath,
                                              spellcheck,
                                          }: SecureWebPreferencesOptions): NonNullable<BrowserWindowConstructorOptions['webPreferences']> {
    return {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        ...(typeof spellcheck === 'boolean' ? {spellcheck} : {}),
    };
}

export function createAppWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
    const win = new BrowserWindow({
        autoHideMenuBar: true,
        backgroundColor: '#0b0c10',
        ...options,
    });
    win.setMenuBarVisibility(false);
    win.removeMenu();
    return win;
}

export function createFramelessAppWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
    return createAppWindow({
        frame: false,
        titleBarStyle: 'hidden',
        ...options,
    });
}

export function attachWindowShortcuts(win: BrowserWindow, options: ShortcutOptions = {}): void {
    const {closeOnEscape = false, onEscape} = options;
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const key = String(input.key || '').toLowerCase();
        if (key === 'escape' && closeOnEscape) {
            event.preventDefault();
            if (onEscape) {
                onEscape();
                return;
            }
            if (!win.isDestroyed()) {
                win.close();
            }
            return;
        }
        const isF12 = key === 'f12';
        const isCtrlShiftI = input.control && input.shift && key === 'i';
        const isCmdAltI = input.meta && input.alt && key === 'i';
        if (!isF12 && !isCtrlShiftI && !isCmdAltI) return;
        event.preventDefault();
        if (!win.isDestroyed()) {
            win.webContents.openDevTools({mode: 'detach'});
        }
    });
}
