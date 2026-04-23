import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent';
import {loadWindowState} from './windowState';

type MainWindowLogger = {
	info: (...args: any[]) => void;
	debug: (...args: any[]) => void;
};

type MainWindowManagerDeps = {
	isDev: boolean;
	logger: MainWindowLogger;
	mainWindowMinWidth: number;
	mainWindowMinHeight: number;
	buildSecureWebPreferences: (input: {preloadPath: string; spellcheck: boolean}) => Electron.WebPreferences;
	createAppWindow: (options: Electron.BrowserWindowConstructorOptions) => BrowserWindow;
	createFramelessAppWindow: (options: Electron.BrowserWindowConstructorOptions) => BrowserWindow;
	attachWindowShortcuts: (window: BrowserWindow) => void;
	getAppSettingsSync: () => {
		useNativeTitleBar: boolean;
		spellcheckEnabled: boolean;
		language: string;
		minimizeToTray: boolean;
	};
	getSpellCheckerLanguages: (language: any) => string[];
	shouldMinimizeToTray: () => boolean;
	onWindowCloseToTray: () => void;
	onWindowClosed: () => void;
	onWindowReadyToFlushGlobalErrors: (window: BrowserWindow) => void;
	onWindowDidFinishLoad?: (window: BrowserWindow) => void;
	onWindowBoundsChanged?: (window: BrowserWindow) => void;
	onWindowCreated?: (window: BrowserWindow) => void;
	onEnsureBackgroundUpdateChecks: () => void;
};

export function createMainWindowManager(deps: MainWindowManagerDeps): {
	createWindow: (options?: {initialRoute?: string | null}) => BrowserWindow;
	getMainWindow: () => BrowserWindow | null;
} {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	let mainWindow: BrowserWindow | null = null;

	function createWindow(options: {initialRoute?: string | null} = {}): BrowserWindow {
		deps.logger.info('Creating main window');
		const preloadPath = path.join(app.getAppPath(), 'preload.cjs');
		const windowState = loadWindowState({
			defaultWidth: 1200,
			defaultHeight: 800,
			file: 'main-window-stateon',
		});
		const currentSettings = deps.getAppSettingsSync();
		const useNativeTitleBar = Boolean(currentSettings.useNativeTitleBar);

		const windowOptions = {
			x: windowState.x,
			y: windowState.y,
			width: windowState.width,
			height: windowState.height,
			minWidth: deps.mainWindowMinWidth,
			minHeight: deps.mainWindowMinHeight,
			webPreferences: deps.buildSecureWebPreferences({
				preloadPath,
				spellcheck: currentSettings.spellcheckEnabled,
			}),
		};
		const win = useNativeTitleBar
			? deps.createAppWindow(windowOptions)
			: deps.createFramelessAppWindow(windowOptions);
		deps.attachWindowShortcuts(win);
		windowState.restoreDisplayState(win);
		windowState.attach(win);
		win.webContents.session.setSpellCheckerLanguages(getSpellCheckerLanguagesSafe(deps, currentSettings.language));
		(
			win.webContents.session as typeof win.webContents.session & {
				setSpellCheckerEnabled?: (enabled: boolean) => void;
			}
		).setSpellCheckerEnabled?.(currentSettings.spellcheckEnabled);
		win.on('close', (event) => {
			const settings = deps.getAppSettingsSync();
			if (!deps.shouldMinimizeToTray() || !settings.minimizeToTray) return;
			event.preventDefault();
			win.hide();
			deps.onWindowCloseToTray();
		});
		win.on('closed', () => {
			if (mainWindow === win) {
				mainWindow = null;
			}
			deps.onWindowClosed();
		});
		mainWindow = win;
		win.webContents.once('did-finish-load', () => {
			deps.onWindowReadyToFlushGlobalErrors(win);
			deps.onWindowDidFinishLoad?.(win);
		});
		deps.logger.info('Main window created id=%d', win.id);
		deps.onEnsureBackgroundUpdateChecks();
		deps.onWindowCreated?.(win);
		const initialRouteHash =
			typeof options.initialRoute === 'string' && options.initialRoute.trim().length > 0
				? options.initialRoute
				: undefined;
		if (deps.isDev) {
			void loadWindowContent(win, {
				isDev: deps.isDev,
				devUrls: [
					{
						target: 'http://127.0.0.1:5174/window.html',
						hash: initialRouteHash,
					},
					{
						target: 'http://127.0.0.1:5174/src/renderer/window.html',
						hash: initialRouteHash,
					},
				],
				prodFiles: [],
				windowName: 'main',
			}).catch((error) => {
				console.error('Failed to load main window (dev):', error);
			});
		} else {
			void loadWindowContent(win, {
				isDev: deps.isDev,
				devUrls: [],
				prodFiles: [
					{
						target: path.join(__dirname, '..', '..', 'build', 'renderer', 'window.html'),
						hash: initialRouteHash,
					},
				],
				windowName: 'main',
			}).catch((error) => {
				console.error('Failed to load main window (prod):', error);
			});
		}
		return win;
	}

	return {
		createWindow,
		getMainWindow: () => mainWindow,
	};
}

function getSpellCheckerLanguagesSafe(deps: MainWindowManagerDeps, language: string): string[] {
	try {
		return deps.getSpellCheckerLanguages(language);
	} catch {
		return ['en-US'];
	}
}
