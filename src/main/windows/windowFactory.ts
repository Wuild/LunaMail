import {app, BrowserWindow, type BrowserWindowConstructorOptions} from 'electron';
import path from 'path';
import fs from 'fs';

type SecureWebPreferencesOptions = {
	preloadPath: string;
	spellcheck?: boolean;
};

type ShortcutOptions = {
	closeOnEscape?: boolean;
	onEscape?: () => void;
};

let cachedWindowIconPath: string | null | undefined;

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

export function resolveWindowIconPath(): string | null {
	if (cachedWindowIconPath !== undefined) {
		return cachedWindowIconPath;
	}
	const linuxCandidates = [
		path.join(app.getAppPath(), 'build/icons/512x512.png'),
		path.join(app.getAppPath(), 'build/icon.png'),
		path.join(app.getAppPath(), 'src/resources/llama.png'),
		path.join(app.getAppPath(), 'src/resources/luna.png'),
		path.join(process.cwd(), 'build/icons/512x512.png'),
		path.join(process.cwd(), 'build/icon.png'),
		path.join(process.cwd(), 'src/resources/llama.png'),
		path.join(process.cwd(), 'src/resources/luna.png'),
	];
	const defaultCandidates = [
		path.join(app.getAppPath(), 'build/icon.ico'),
		path.join(app.getAppPath(), 'build/icons/512x512.png'),
		path.join(app.getAppPath(), 'build/icon.png'),
		path.join(app.getAppPath(), 'src/resources/llama.ico'),
		path.join(app.getAppPath(), 'src/resources/llama.png'),
		path.join(app.getAppPath(), 'src/resources/luna.ico'),
		path.join(app.getAppPath(), 'src/resources/luna.png'),
		path.join(process.cwd(), 'build/icon.ico'),
		path.join(process.cwd(), 'build/icons/512x512.png'),
		path.join(process.cwd(), 'build/icon.png'),
		path.join(process.cwd(), 'src/resources/llama.ico'),
		path.join(process.cwd(), 'src/resources/llama.png'),
		path.join(process.cwd(), 'src/resources/luna.ico'),
		path.join(process.cwd(), 'src/resources/luna.png'),
	];
	const candidates = process.platform === 'linux' ? linuxCandidates : defaultCandidates;
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			cachedWindowIconPath = candidate;
			return cachedWindowIconPath;
		}
	}
	cachedWindowIconPath = null;
	return cachedWindowIconPath;
}

export function createAppWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
	const appIconPath = resolveWindowIconPath();

	const win = new BrowserWindow({
		autoHideMenuBar: true,
		backgroundColor: '#0b0c10',
		minimizable: true,
		...options,
		icon: options.icon ?? appIconPath ?? undefined,
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
			win.webContents.openDevTools();
		}
	});
}
