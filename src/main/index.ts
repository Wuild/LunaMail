import {app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, Notification, shell} from 'electron';
import path from 'path';
import {createAppLogger, onDebugLog} from './debug/debugLog.js';
import {initDb} from '@main/db/index.js';
import {getAccounts} from './db/repositories/accountsRepo.js';
import {
	getCurrentUnreadCount,
	registerAccountIpc,
	setAccountCountChangedListener,
	setAutoSyncIntervalMinutes,
	setNewMailListener,
	setUnreadCountListener,
	startAccountAutoSync,
	stopAccountAutoSync,
} from './ipc/accounts.js';
import {installTrustedSenderGuard} from './ipc/installTrustedSenderGuard.js';
import {queueCloudOAuthCallbackUrl, registerCloudIpc} from './ipc/cloud.js';
import {queueMailOAuthCallbackUrl} from './mail/oauth.js';
import {createProtocolHandler} from './protocol/handler.js';
import {registerSettingsIpc} from './ipc/settings.js';
import {
	broadcastAccountSyncStatus,
	broadcastGlobalError,
	broadcastToAllWindows,
	broadcastUnreadCountUpdated,
} from './ipc/broadcast.js';
import {broadcastAutoUpdateState, registerUpdaterIpc} from './ipc/updater.js';
import {registerWindowIpc} from './ipc/windows.js';
import {
	getAppSettings,
	getAppSettingsBootSnapshotSync,
	getAppSettingsSync,
	getSpellCheckerLanguages,
} from './settings/store.js';
import {resolveNotificationIconPath} from './notifications/icon.js';
import {resolveSenderNotificationIconPath} from './notifications/senderIcon.js';
import {getMessageById} from './db/repositories/mailRepo.js';
import {reconcileDemoData} from './demo/demoMode.js';
import {checkForUpdates, initAutoUpdater, runStartupUpdateFlow, setAutoUpdateEnabled} from './updater/autoUpdate.js';
import type {GlobalErrorEvent, GlobalErrorSource} from '@/shared/ipcTypes.js';
import type {ComposeDraftPayload} from './windows/composeWindow.js';
import {openComposeWindow} from './windows/composeWindow.js';
import {createMainWindowManager} from './windows/mainWindow.js';
import {
	attachWindowShortcuts,
	buildSecureWebPreferences,
	createAppWindow,
	createFramelessAppWindow,
	resolveWindowIconPath,
} from './windows/windowFactory.js';
import {createTrayController, resolveLinuxTrayIconPath, resolveWindowsTrayIconPath} from './windows/tray.js';
import {APP_NAME, APP_PROTOCOL} from '@/shared/appConfig.js';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let currentUnreadCount = 0;
let mainWindowActionsEnabled = false;
let mainWindowLoaded = false;
let startupFlowComplete = false;
let pendingMainWindowNavigation: {route: string; replaceHistory: boolean} | null = null;
let pendingStartupRoute: string | null = null;
let pendingStartupCompose = false;
let stopDebugForwarding: (() => void) | null = null;
let backgroundUpdateCheckTimer: ReturnType<typeof setInterval> | null = null;
let initialBackgroundUpdateCheckTimer: ReturnType<typeof setTimeout> | null = null;
let notificationOpenCooldownTimer: ReturnType<typeof setTimeout> | null = null;
let notificationOpenInFlight = false;
const pendingGlobalErrors: GlobalErrorEvent[] = [];
const appIconPath = resolveWindowIconPath();
const linuxTrayIconPath = resolveLinuxTrayIconPath(appIconPath);
const windowsTrayIconPath = resolveWindowsTrayIconPath(appIconPath);
const notificationIconPath = resolveNotificationIconPath();
const MAIN_WINDOW_MIN_WIDTH = 900;
const MAIN_WINDOW_MIN_HEIGHT = 600;
const DEV_SPLASH_MIN_DURATION_MS = 1200;
const logger = createAppLogger('main');
const mainWindowManager = createMainWindowManager({
	isDev,
	logger,
	mainWindowMinWidth: MAIN_WINDOW_MIN_WIDTH,
	mainWindowMinHeight: MAIN_WINDOW_MIN_HEIGHT,
	buildSecureWebPreferences,
	createAppWindow,
	createFramelessAppWindow,
	attachWindowShortcuts,
	getAppSettingsSync,
	getSpellCheckerLanguages,
	shouldMinimizeToTray: () => !isQuitting,
	onWindowCloseToTray: () => {
		trayController.ensureTray(currentUnreadCount);
	},
	onWindowClosed: () => {
		mainWindow = null;
		mainWindowLoaded = false;
		pendingMainWindowNavigation = null;
	},
	onWindowReadyToFlushGlobalErrors: flushPendingGlobalErrors,
	onWindowDidFinishLoad: () => {
		mainWindowLoaded = true;
		if (pendingMainWindowNavigation) {
			const target = pendingMainWindowNavigation;
			pendingMainWindowNavigation = null;
			navigateMainWindowToRouteDirect(target.route, {replaceHistory: target.replaceHistory});
		}
		ensureTray();
		applyTrayContextMenu();
	},
	onEnsureBackgroundUpdateChecks: ensureBackgroundUpdateChecks,
	onWindowCreated: (win) => {
		mainWindow = win;
		mainWindowLoaded = false;
	},
});
const trayController = createTrayController({
	appName: APP_NAME,
	appIconPath,
	linuxTrayIconPath,
	windowsTrayIconPath,
	isActionsEnabled: () => mainWindowActionsEnabled,
	onShowApp: () => openMainWindowEntryPoint(),
	onCompose: () => openComposeQuickAction(),
	onNavigate: (route) => navigateMainWindowToRoute(route),
	onQuit: () => {
		isQuitting = true;
		app.quit();
	},
});
const protocolHandler = createProtocolHandler({
	logger,
	queueMailOAuthCallbackUrl,
	queueCloudOAuthCallbackUrl,
	handleFallbackProtocolUrl: handleAppProtocolFallbackUrl,
	openMainWindowEntryPoint,
	navigateMainWindowToRoute,
	openComposeQuickAction,
	showMainWindow,
	isMainWindowActionsEnabled: () => mainWindowActionsEnabled,
	openComposeFromMailtoUrl: openComposeFromMailto,
});
installTrustedSenderGuard(ipcMain);
const LINK_WARNING_WRAPPER_PROTOCOL = `${APP_PROTOCOL}:`;
const UNSAFE_LINK_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:']);
const NEVER_OPEN_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'about:']);
const UNSAFE_LINK_EXTENSIONS = new Set([
	'.apk',
	'.appimage',
	'.bat',
	'.cmd',
	'.com',
	'.cpl',
	'.deb',
	'.dmg',
	'.exe',
	'.hta',
	'.jar',
	'.js',
	'.jse',
	'.lnk',
	'.mjs',
	'.msi',
	'.msp',
	'.msu',
	'.pkg',
	'.ps1',
	'.reg',
	'.rpm',
	'.scr',
	'.sh',
	'.vb',
	'.vbe',
	'.vbs',
	'.wsf',
	'.wsh',
]);
const bootSettings = getAppSettingsBootSnapshotSync();
if (!bootSettings.hardwareAcceleration) {
	app.disableHardwareAcceleration();
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	const text = String(error ?? '').trim();
	return text || 'Unknown error';
}

function toErrorDetail(error: unknown): string | null {
	if (error instanceof Error) {
		const detail = String(error.stack || error.message || '').trim();
		return detail || null;
	}
	if (typeof error === 'string') return error.trim() || null;
	try {
		const asJson = JSON.stringify(error);
		return asJson && asJson !== '{}' ? asJson : null;
	} catch {
		return null;
	}
}

function createGlobalErrorEvent(params: {
	source: GlobalErrorSource;
	message: string;
	detail?: string | null;
	fatal?: boolean;
}): GlobalErrorEvent {
	return {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
		source: params.source,
		message: params.message,
		detail: params.detail ?? null,
		timestamp: new Date().toISOString(),
		fatal: Boolean(params.fatal),
	};
}

function emitGlobalError(params: {
	source: GlobalErrorSource;
	message: string;
	detail?: string | null;
	fatal?: boolean;
}): void {
	const payload = createGlobalErrorEvent(params);
	logger.error('Global error source=%s fatal=%s message=%s', payload.source, String(payload.fatal), payload.message);
	if (payload.detail) {
		logger.debug('Global error detail: %s', payload.detail);
	}
	if (BrowserWindow.getAllWindows().length === 0) {
		pendingGlobalErrors.push(payload);
		if (pendingGlobalErrors.length > 30) pendingGlobalErrors.shift();
		return;
	}
	broadcastGlobalError(payload);
}

function flushPendingGlobalErrors(win: BrowserWindow): void {
	if (pendingGlobalErrors.length === 0) return;
	const queued = pendingGlobalErrors.splice(0, pendingGlobalErrors.length);
	for (const item of queued) {
		try {
			win.webContents.send('global-error', item);
		} catch {
			pendingGlobalErrors.push(item);
			break;
		}
	}
}

function registerGlobalErrorHandlers(): void {
	process.on('uncaughtException', (error) => {
		emitGlobalError({
			source: 'main-process',
			message: toErrorMessage(error),
			detail: toErrorDetail(error),
			fatal: true,
		});
	});

	process.on('unhandledRejection', (reason) => {
		emitGlobalError({
			source: 'main-process',
			message: `Unhandled promise rejection: ${toErrorMessage(reason)}`,
			detail: toErrorDetail(reason),
		});
	});
}

function createWindow(initialRoute?: string | null) {
	mainWindowManager.createWindow({initialRoute});
}

function triggerBackgroundUpdateCheck(reason: string): void {
	logger.info('Triggering background update check reason=%s', reason);
	void checkForUpdates().catch((error) => {
		logger.warn(
			'Background update check failed reason=%s error=%s',
			reason,
			(error as any)?.message || String(error),
		);
		console.warn(`Background update check failed (${reason}):`, error);
	});
}

function ensureBackgroundUpdateChecks(): void {
	if (initialBackgroundUpdateCheckTimer || backgroundUpdateCheckTimer) return;
	logger.info('Scheduling background update checks');
	initialBackgroundUpdateCheckTimer = setTimeout(() => {
		initialBackgroundUpdateCheckTimer = null;
		triggerBackgroundUpdateCheck('initial-main-window');
	}, 15000);
	backgroundUpdateCheckTimer = setInterval(
		() => {
			triggerBackgroundUpdateCheck('interval-main-window');
		},
		6 * 60 * 60 * 1000,
	);
}

async function applyDemoMode(settings = getAppSettingsSync()): Promise<void> {
	try {
		const result = await reconcileDemoData(Boolean(settings.developerDemoMode));
		for (const created of result.createdAccounts) {
			broadcastToAllWindows('account-added', created);
		}
		for (const deleted of result.deletedAccounts) {
			broadcastToAllWindows('account-deleted', deleted);
		}
		for (const accountId of result.touchedAccountIds) {
			broadcastAccountSyncStatus({
				accountId,
				status: 'done',
				source: 'demo-seed',
				summary: {accountId, folders: 0, messages: 0, newMessages: 0},
			});
		}
		broadcastUnreadCountUpdated(result.unreadCount);
		updateUnreadIndicators(result.unreadCount);
	} catch (error) {
		logger.warn('Failed to apply demo mode: %s', toErrorMessage(error));
	}
}

function ensureTray(): void {
	if (!startupFlowComplete || !mainWindowLoaded) return;
	trayController.ensureTray(currentUnreadCount);
}

function applyTrayContextMenu(): void {
	trayController.refreshMenu();
}

function openMainWindowEntryPoint(): void {
	showMainWindow();
	if (!startupFlowComplete) return;
	if (mainWindowActionsEnabled) return;
	void getAccounts()
		.then((rows) => {
			if (rows.length > 0) {
				setMainWindowActionsEnabled(true);
				navigateMainWindowToRouteDirect('/email', {replaceHistory: true});
				return;
			}
			navigateMainWindowToRouteDirect('/onboarding', {replaceHistory: true});
		})
		.catch(() => {
			navigateMainWindowToRouteDirect('/onboarding', {replaceHistory: true});
		});
}

function openAddAccountRouteInMainWindow(): void {
	showMainWindow();
	navigateMainWindowToRouteDirect('/add-account');
}

function openUpdaterRouteInMainWindow(): boolean {
	const win = showMainWindow();
	if (!win || win.isDestroyed()) return false;
	navigateMainWindowToRouteDirect('/windows/splash');
	return true;
}

function setMainWindowActionsEnabled(enabled: boolean): void {
	const next = Boolean(enabled);
	if (mainWindowActionsEnabled === next) return;
	mainWindowActionsEnabled = next;
	ensureTray();
	applyTrayContextMenu();
	configurePlatformQuickActions();
}

function navigateMainWindowToRoute(route: string): void {
	if (!mainWindowActionsEnabled) {
		openMainWindowEntryPoint();
		return;
	}
	showMainWindow();
	navigateMainWindowToRouteDirect(route);
}

function navigateMainWindowToRouteDirect(route: string, options: {replaceHistory?: boolean} = {}): void {
	if (!mainWindow || mainWindow.isDestroyed()) return;
	const replaceHistory = Boolean(options.replaceHistory);
	if (!mainWindowLoaded || mainWindow.webContents.isLoadingMainFrame()) {
		pendingMainWindowNavigation = {route, replaceHistory};
		return;
	}
	pendingMainWindowNavigation = null;
	if (replaceHistory) {
		const targetHash = route.startsWith('#') ? route : `#${route}`;
		void mainWindow.webContents
			.executeJavaScript(`window.location.replace(${JSON.stringify(targetHash)})`)
			.catch(() => undefined);
		return;
	}
	void mainWindow.webContents
		.executeJavaScript(`window.location.hash = ${JSON.stringify(route)}`)
		.catch(() => undefined);
}

function openComposeQuickAction(): void {
	if (!mainWindowActionsEnabled) {
		openMainWindowEntryPoint();
		return;
	}
	const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
	openComposeWindow(parent);
}

function toMainProcessLaunchArgs(extraArgs: string[]): string[] {
	if (process.defaultApp && process.argv.length >= 2) {
		return [path.resolve(process.argv[1]), ...extraArgs];
	}
	return extraArgs;
}

function configurePlatformQuickActions(): void {
	if (process.platform === 'darwin' && app.dock) {
		const dockMenu = Menu.buildFromTemplate(
			mainWindowActionsEnabled
				? [
						{label: 'Compose Email', click: () => openComposeQuickAction()},
						{type: 'separator'},
						{label: 'Mail', click: () => navigateMainWindowToRoute('/email')},
						{label: 'Contacts', click: () => navigateMainWindowToRoute('/contacts')},
						{label: 'Calendar', click: () => navigateMainWindowToRoute('/calendar')},
						{label: 'Cloud', click: () => navigateMainWindowToRoute('/cloud')},
						{type: 'separator'},
						{label: 'Settings', click: () => navigateMainWindowToRoute('/settings/application')},
						{label: 'Debug', click: () => navigateMainWindowToRoute('/debug')},
						{label: 'Help', click: () => navigateMainWindowToRoute('/help')},
					]
				: [{label: 'Open Onboarding', click: () => showMainWindow()}],
		);
		app.dock.setMenu(dockMenu);
	}

	if (process.platform === 'win32') {
		const jumpPath = process.execPath;
		void app.setJumpList([
			{
				type: 'tasks',
				items: mainWindowActionsEnabled
					? [
							{
								type: 'task',
								title: 'Compose Email',
								description: 'Open a compose window',
								program: jumpPath,
								args: toMainProcessLaunchArgs(['--action=compose']).join(' '),
							},
							{
								type: 'task',
								title: 'Mail',
								description: 'Open mail',
								program: jumpPath,
								args: toMainProcessLaunchArgs(['--route=/email']).join(' '),
							},
							{
								type: 'task',
								title: 'Contacts',
								description: 'Open contacts',
								program: jumpPath,
								args: toMainProcessLaunchArgs(['--route=/contacts']).join(' '),
							},
							{
								type: 'task',
								title: 'Calendar',
								description: 'Open calendar',
								program: jumpPath,
								args: toMainProcessLaunchArgs(['--route=/calendar']).join(' '),
							},
							{
								type: 'task',
								title: 'Cloud',
								description: 'Open cloud files',
								program: jumpPath,
								args: toMainProcessLaunchArgs(['--route=/cloud']).join(' '),
							},
						]
					: [],
			},
		]);
	}
}

function updateUnreadIndicators(unreadCount: number): void {
	currentUnreadCount = Math.max(0, Number(unreadCount) || 0);
	const settings = getAppSettingsSync();
	const showUnreadInTitleBar = settings.showUnreadInTitleBar;
	ensureTray();
	trayController.updateTooltip(currentUnreadCount);

	const label = currentUnreadCount > 0 ? String(currentUnreadCount) : '';
	try {
		app.setBadgeCount(currentUnreadCount);
	} catch {
		// ignore unsupported badge count APIs
	}
	if (process.platform === 'darwin' && app.dock) {
		app.dock.setBadge(label);
	}
	for (const win of BrowserWindow.getAllWindows()) {
		if (process.platform === 'win32') {
			win.setOverlayIcon(null, '');
		}
		win.setTitle(showUnreadInTitleBar && currentUnreadCount > 0 ? `${APP_NAME} (${currentUnreadCount})` : APP_NAME);
	}
}

function focusMainWindowAndOpenMessage(
	target: {
		accountId: number;
		folderPath: string;
		messageId: number;
	} | null,
): void {
	if (notificationOpenInFlight) return;
	notificationOpenInFlight = true;
	if (notificationOpenCooldownTimer) {
		clearTimeout(notificationOpenCooldownTimer);
	}
	notificationOpenCooldownTimer = setTimeout(() => {
		notificationOpenInFlight = false;
		notificationOpenCooldownTimer = null;
	}, 500);

	const openedWindow = showMainWindow();
	if (!openedWindow) {
		app.emit('activate');
		return;
	}
	if (!target) return;
	if (!mainWindow || mainWindow.isDestroyed()) return;

	const sendTarget = () => {
		if (!mainWindow || mainWindow.isDestroyed()) return;
		try {
			mainWindow.webContents.send('open-message-target', target);
		} catch {
			// ignore renderer messaging failures from notification click handlers
		}
	};

	const sendTargetWithRetry = (attempt: number) => {
		sendTarget();
		if (attempt >= 5) return;
		setTimeout(() => {
			if (!mainWindow || mainWindow.isDestroyed()) return;
			sendTargetWithRetry(attempt + 1);
		}, 180);
	};

	const navigateToMailThenSendTarget = () => {
		if (!mainWindow || mainWindow.isDestroyed()) return;
		navigateMainWindowToRoute('/email');
		setTimeout(() => sendTargetWithRetry(0), 120);
	};

	if (mainWindow.webContents.isLoadingMainFrame()) {
		mainWindow.webContents.once('did-finish-load', () => {
			navigateToMailThenSendTarget();
		});
		return;
	}
	navigateToMailThenSendTarget();
}

function showMainWindow(): BrowserWindow | null {
	if (!mainWindow || mainWindow.isDestroyed()) {
		createWindow();
	}
	if (!mainWindow || mainWindow.isDestroyed()) return null;
	try {
		if (process.platform === 'linux') {
			app.focus({steal: true});
		} else {
			app.focus();
		}
	} catch {
		// ignore app focus failures
	}
	if (mainWindow.isMinimized()) {
		mainWindow.restore();
	}
	if (!mainWindow.isVisible()) {
		mainWindow.show();
	}
	trayController.hideTray();
	mainWindow.moveTop();
	mainWindow.focus();
	return mainWindow;
}

function playNotificationSound(): void {
	const settings = getAppSettingsSync();
	if (!settings.playNotificationSound) return;
	try {
		shell.beep();
	} catch {
		// ignore sound failures
	}
}

function applyRuntimeSettings(): void {
	const settings = getAppSettingsSync();
	logger.info(
		'Applying runtime settings theme=%s syncInterval=%d autoUpdate=%s spellcheck=%s',
		settings.theme,
		settings.syncIntervalMinutes,
		settings.autoUpdateEnabled,
		settings.spellcheckEnabled,
	);
	nativeTheme.themeSource = settings.theme === 'system' ? 'system' : settings.theme;
	setAutoSyncIntervalMinutes(settings.syncIntervalMinutes);
	setAutoUpdateEnabled(settings.autoUpdateEnabled);
	for (const win of BrowserWindow.getAllWindows()) {
		win.webContents.session.setSpellCheckerLanguages(getSpellCheckerLanguages(settings.language));
		(
			win.webContents.session as typeof win.webContents.session & {
				setSpellCheckerEnabled?: (enabled: boolean) => void;
			}
		).setSpellCheckerEnabled?.(settings.spellcheckEnabled);
	}
	updateUnreadIndicators(currentUnreadCount);
	ensureTray();
}

function notifyNativeThemeUpdated(): void {
	const settings = getAppSettingsSync();
	if (settings.theme !== 'system') return;
	const payload = {shouldUseDarkColors: nativeTheme.shouldUseDarkColors};
	for (const win of BrowserWindow.getAllWindows()) {
		try {
			win.webContents.send('native-theme-updated', payload);
		} catch {
			// ignore renderer messaging failures
		}
	}
}

function handleAppProtocolFallbackUrl(url: string): boolean {
	if (!isAppProtocolUrl(url)) return false;
	if (!resolveWrappedMessageLink(url)) return false;
	const owner = mainWindow ?? undefined;
	void handleExternalUrl(url, owner);
	return true;
}

function installExternalNavigationPolicy(): void {
	app.on('web-contents-created', (_event, contents) => {
		logger.debug('web-contents-created id=%d', contents.id);
		contents.on('render-process-gone', (_goneEvent, details) => {
			if (!BrowserWindow.fromWebContents(contents)) return;
			emitGlobalError({
				source: 'renderer-process',
				message: `Renderer process exited (${details.reason})`,
				detail: JSON.stringify(details),
				fatal: details.reason !== 'clean-exit',
			});
		});
		contents.on('did-fail-load', (_loadEvent, errorCode, errorDescription, validatedURL, isMainFrame) => {
			if (!BrowserWindow.fromWebContents(contents)) return;
			if (errorCode === -3) return;
			if (!isMainFrame) return;
			emitGlobalError({
				source: 'window-load',
				message: `Failed to load window content (${errorCode}): ${errorDescription}`,
				detail: validatedURL || null,
			});
		});
		contents.on('preload-error', (_preloadEvent, preloadPath, error) => {
			if (!BrowserWindow.fromWebContents(contents)) return;
			emitGlobalError({
				source: 'web-contents',
				message: `Preload script error in ${preloadPath}`,
				detail: toErrorDetail(error),
				fatal: true,
			});
		});
		contents.on('will-prevent-unload', (event) => {
			const owner = BrowserWindow.fromWebContents(contents) ?? undefined;
			if (owner && !owner.isDestroyed()) {
				if (owner.isMinimized()) owner.restore();
				if (!owner.isVisible()) owner.show();
				owner.focus();
			}
			const dialogOptions: Electron.MessageBoxSyncOptions = {
				type: 'warning',
				title: APP_NAME,
				message: 'Discard unsaved changes?',
				detail: 'This window has unsaved changes. Leaving will discard them.',
				buttons: ['Discard Changes', 'Cancel'],
				defaultId: 1,
				cancelId: 1,
				noLink: true,
			};
			const choice = owner
				? dialog.showMessageBoxSync(owner, dialogOptions)
				: dialog.showMessageBoxSync(dialogOptions);
			if (choice === 0) {
				event.preventDefault();
			}
		});
		contents.on('context-menu', (_menuEvent, params) => {
			const canEdit = Boolean(params.isEditable);
			const editFlags = params.editFlags ?? {};
			if (canEdit) {
				const suggestionItems: Electron.MenuItemConstructorOptions[] = [];
				const misspelledWord = String(params.misspelledWord || '').trim();
				const dictionarySuggestions = Array.isArray(params.dictionarySuggestions)
					? params.dictionarySuggestions.filter((value) => value.trim().length > 0)
					: [];
				if (misspelledWord && dictionarySuggestions.length > 0) {
					for (const suggestion of dictionarySuggestions.slice(0, 8)) {
						suggestionItems.push({
							label: suggestion,
							click: () => {
								contents.replaceMisspelling(suggestion);
							},
						});
					}
					suggestionItems.push({type: 'separator'});
				}
				if (misspelledWord) {
					suggestionItems.push({
						label: 'Add to Dictionary',
						click: () => {
							contents.session.addWordToSpellCheckerDictionary(misspelledWord);
						},
					});
					suggestionItems.push({type: 'separator'});
				}
				const nativeEditMenu = Menu.buildFromTemplate([
					...suggestionItems,
					{label: 'Undo', role: 'undo', enabled: Boolean(editFlags.canUndo)},
					{label: 'Redo', role: 'redo', enabled: Boolean(editFlags.canRedo)},
					{type: 'separator'},
					{label: 'Cut', role: 'cut', enabled: Boolean(editFlags.canCut)},
					{label: 'Copy', role: 'copy', enabled: Boolean(editFlags.canCopy)},
					{label: 'Paste', role: 'paste', enabled: Boolean(editFlags.canPaste)},
					{type: 'separator'},
					{label: 'Select All', role: 'selectAll'},
				]);
				const owner = BrowserWindow.fromWebContents(contents) ?? undefined;
				if (owner) {
					nativeEditMenu.popup({window: owner});
				} else {
					nativeEditMenu.popup();
				}
				return;
			}

			const frameUrl = String((params as any)?.frameURL || '');
			const pageUrl = String((params as any)?.pageURL || contents.getURL() || '');
			const isDebugConsolePage = /#\/debug(?:$|[/?])/.test(pageUrl);
			const isIframeContext = Boolean(frameUrl) && frameUrl !== pageUrl;
			const isMailContentFrame = isIframeContext && /^about:srcdoc/i.test(frameUrl);
			const template: Electron.MenuItemConstructorOptions[] = [];
			const owner = BrowserWindow.fromWebContents(contents) ?? undefined;
			const hasSelection = Boolean((params.selectionText || '').trim());
			const linkUrl = String(params.linkURL || '').trim();
			const resolvedLinkUrl = resolveWrappedMessageLink(linkUrl)?.targetUrl ?? linkUrl;
			const hasLink = /^(https?:|mailto:)/i.test(linkUrl) || isAppProtocolUrl(linkUrl);
			const imageUrl = String((params.srcURL || '').trim());
			const hasImage = Boolean(imageUrl);
			const imageCanOpenExternally = /^(https?:|file:)/i.test(imageUrl);
			const imageHasAddress = !/^data:/i.test(imageUrl);

			if (!isMailContentFrame && !hasImage && !(isDebugConsolePage && hasSelection)) {
				// Renderer-level custom menus handle non-iframe contexts unless this is an image context.
				return;
			}

			if (hasImage) {
				template.push({
					label: 'Copy Image',
					click: () => {
						contents.copyImageAt(params.x, params.y);
					},
				});
				if (imageCanOpenExternally) {
					template.push({
						label: 'Open Image',
						click: () => {
							void handleExternalUrl(imageUrl, owner);
						},
					});
				}
				if (imageHasAddress) {
					template.push({
						label: 'Copy Image Address',
						click: () => {
							clipboard.writeText(imageUrl);
						},
					});
				}
				template.push({type: 'separator'});
			}

			if (isMailContentFrame && hasLink) {
				template.push({
					label: 'Open Link',
					click: () => {
						void handleExternalUrl(linkUrl, owner);
					},
				});
				template.push({
					label: 'Copy Link Address',
					click: () => {
						clipboard.writeText(resolvedLinkUrl);
					},
				});
				template.push({type: 'separator'});
			}

			if (isMailContentFrame && hasSelection) {
				template.push({label: 'Copy', role: 'copy'});
				template.push({type: 'separator'});
			}
			if (isDebugConsolePage && hasSelection) {
				template.push({label: 'Copy', role: 'copy'});
				template.push({label: 'Select All', role: 'selectAll'});
				template.push({type: 'separator'});
			}

			while (template[template.length - 1]?.type === 'separator') {
				template.pop();
			}
			if (template.length === 0) return;
			const menu = Menu.buildFromTemplate(template);
			if (owner) {
				menu.popup({window: owner});
				return;
			}
			menu.popup();
		});

		contents.setWindowOpenHandler(({url}) => {
			if (isInternalAppUrl(url)) {
				return {action: 'deny'};
			}
			logger.info('Blocked external window open and delegated to external handler url=%s', url);
			const owner = BrowserWindow.fromWebContents(contents) ?? undefined;
			void handleExternalUrl(url, owner);
			return {action: 'deny'};
		});

		contents.on('will-navigate', (event, url) => {
			if (isInternalAppUrl(url)) return;
			event.preventDefault();
			logger.info('Blocked navigation and delegated to external handler url=%s', url);
			const owner = BrowserWindow.fromWebContents(contents) ?? undefined;
			void handleExternalUrl(url, owner);
		});

		contents.on('update-target-url', (_event, url) => {
			const rawUrl = resolveWrappedMessageLink(url || '')?.targetUrl ?? (url || '');
			contents.send('link-hover-url', rawUrl);
		});
	});
}

function isInternalAppUrl(url: string): boolean {
	if (url === 'about:blank' || url === 'about:srcdoc') return true;
	try {
		const parsed = new URL(url);
		if (parsed.protocol === 'file:') return true;
		return isDev && (parsed.origin === 'http://127.0.0.1:5174' || parsed.origin === 'http://localhost:5174');
	} catch {
		return false;
	}
}

async function handleExternalUrl(url: string, owner?: BrowserWindow): Promise<void> {
	if (!url) return;
	logger.debug('Handling external url=%s', url);
	const wrapped = resolveWrappedMessageLink(url);
	const targetUrl = wrapped?.targetUrl ?? url;
	const riskHints = assessExternalUrlRisk(targetUrl);
	if (wrapped?.senderUntrusted) {
		riskHints.unshift('Sender is not allowlisted for direct link opens');
	}
	if (riskHints.length > 0) {
		const confirmed = await confirmUnsafeUrlOpen(targetUrl, riskHints, owner);
		if (!confirmed) return;
	}
	const protocol = getUrlProtocol(targetUrl);
	if (protocol && NEVER_OPEN_SCHEMES.has(protocol)) {
		logger.warn('Blocked non-openable external URL scheme: %s', protocol);
		return;
	}
	if (/^mailto:/i.test(targetUrl)) {
		protocolHandler.queueMailtoUrl(targetUrl);
		return;
	}
	void shell.openExternal(targetUrl);
}

function assessExternalUrlRisk(url: string): string[] {
	const hints: string[] = [];
	const protocol = getUrlProtocol(url);
	if (protocol && UNSAFE_LINK_SCHEMES.has(protocol)) {
		hints.push(`Uses unsafe scheme: ${protocol}`);
	}
	try {
		const parsed = new URL(url);
		const ext = path.extname(parsed.pathname || '').toLowerCase();
		if (ext && UNSAFE_LINK_EXTENSIONS.has(ext)) {
			hints.push(`Targets executable file type: ${ext}`);
		}
		if (parsed.username || parsed.password) {
			hints.push('Includes embedded credentials in URL');
		}
	} catch {
		// Keep a generic warning for malformed/unexpected URLs.
		hints.push('URL format is unusual or malformed');
	}
	return hints;
}

function getUrlProtocol(url: string): string | null {
	try {
		return new URL(url).protocol.toLowerCase();
	} catch {
		const schemeMatch = String(url).match(/^([a-z][a-z0-9+.-]*:)/i);
		return schemeMatch ? schemeMatch[1].toLowerCase() : null;
	}
}

function isAppProtocolUrl(url: string): boolean {
	return getUrlProtocol(url) === `${APP_PROTOCOL}:`;
}

async function confirmUnsafeUrlOpen(url: string, hints: string[], owner?: BrowserWindow): Promise<boolean> {
	const detail = `${hints.join('\n')}\n\n${url}`;
	const dialogOptions: Electron.MessageBoxOptions = {
		type: 'warning',
		title: APP_NAME,
		message: 'Potentially unsafe link',
		detail,
		buttons: ['Open anyway', 'Cancel'],
		defaultId: 1,
		cancelId: 1,
		noLink: true,
	};
	const result = owner
		? await dialog.showMessageBox(owner, dialogOptions)
		: await dialog.showMessageBox(dialogOptions);
	return result.response === 0;
}

function resolveWrappedMessageLink(url: string): {targetUrl: string; senderUntrusted: boolean} | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol.toLowerCase() !== LINK_WARNING_WRAPPER_PROTOCOL) {
			return null;
		}
		if (parsed.hostname.toLowerCase() !== 'link') return null;
		if (parsed.pathname !== '/open') return null;
		const targetUrl = String(parsed.searchParams.get('target') || '').trim();
		if (!targetUrl) return null;
		const senderUntrusted = String(parsed.searchParams.get('sender') || '').toLowerCase() === 'untrusted';
		return {targetUrl, senderUntrusted};
	} catch {
		return null;
	}
}

function openComposeFromMailto(url: string): void {
	logger.info('Opening compose from mailto');
	const draft = parseComposeDraftFromMailto(url);
	if (!draft) return;
	void getAccounts().then((accounts) => {
		if (accounts.length === 0) {
			setMainWindowActionsEnabled(false);
			openMainWindowEntryPoint();
			return;
		}
		if (!mainWindow || mainWindow.isDestroyed()) {
			createWindow();
		}
		const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
		openComposeWindow(parent, draft);
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.show();
			mainWindow.focus();
		}
	});
}

function parseComposeDraftFromMailto(url: string): ComposeDraftPayload | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol.toLowerCase() !== 'mailto:') return null;
		const toFromPath = splitAddressList(parsed.pathname);
		const toFromQuery = parsed.searchParams.getAll('to').flatMap(splitAddressList);
		const to = joinAddressList([...toFromPath, ...toFromQuery]);
		const cc = joinAddressList(parsed.searchParams.getAll('cc').flatMap(splitAddressList));
		const bcc = joinAddressList(parsed.searchParams.getAll('bcc').flatMap(splitAddressList));
		const subject = parsed.searchParams.get('subject')?.trim() || null;
		const bodyRaw = parsed.searchParams.get('body');
		const body = bodyRaw === null ? null : bodyRaw.replace(/\r\n/g, '\n');
		return {
			to,
			cc,
			bcc,
			subject,
			body,
		};
	} catch {
		return null;
	}
}

function splitAddressList(value: string): string[] {
	if (!value) return [];
	let decoded = value;
	try {
		decoded = decodeURIComponent(value);
	} catch {
		// keep original value if decoding fails
	}
	return decoded
		.split(/[;,]/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function joinAddressList(items: string[]): string | null {
	if (items.length === 0) return null;
	return Array.from(new Set(items)).join(', ');
}

function configureLinuxDesktopEntryName(): void {
	if (process.platform !== 'linux') return;
	const runtimeDesktop = String(process.env.CHROME_DESKTOP || '').trim();
	const desktopNames = [runtimeDesktop, `${app.getName().toLowerCase()}.desktop`, `${app.getName()}.desktop`].filter(
		Boolean,
	);
	for (const desktopName of desktopNames) {
		try {
			(app as any).setDesktopName?.(desktopName);
			logger.info('Linux desktop name set to %s', desktopName);
			break;
		} catch {
			// try next candidate
		}
	}
}

const gotSingleInstanceLock = isDev ? true : app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
	console.warn('[main] Another app instance is already running; exiting current process.');
	logger.warn('Single instance lock unavailable, quitting');
	app.quit();
} else {
	configureLinuxDesktopEntryName();
	registerGlobalErrorHandlers();
	protocolHandler.registerEventHandlers();
	installExternalNavigationPolicy();

	app.whenReady()
		.then(async () => {
			logger.info('App ready start');
			console.log('[main-startup] app.whenReady entered');
			let devStartupWatchdog: ReturnType<typeof setTimeout> | null = null;
			let dbReady = true;
			if (isDev) {
				devStartupWatchdog = setTimeout(() => {
					console.warn('[main] Dev startup watchdog triggered; forcing main window show.');
					logger.warn('Dev startup watchdog triggered; forcing main window show');
					showMainWindow();
				}, 7000);
			}
			// Register IPC handlers first so renderer never sees "No handler registered"
			// even if a later startup step fails.
			registerAccountIpc();
			registerCloudIpc();
			registerSettingsIpc(
				(settings) => {
					applyRuntimeSettings();
					void applyDemoMode(settings);
				},
				{
					onOpenUpdaterView: () => openUpdaterRouteInMainWindow(),
				},
			);
			registerUpdaterIpc();
			registerWindowIpc({onOpenAddAccountRoute: openAddAccountRouteInMainWindow});
			logger.info('IPC handlers registered');
			console.log('[main-startup] IPC handlers registered');
			console.log('[main-startup] initDb start');
			try {
				initDb();
				logger.info('Database initialized');
				console.log('[main-startup] initDb done');
			} catch (error) {
				dbReady = false;
				const detail = toErrorDetail(error);
				console.error('[main-startup] Database initialization failed:', error);
				logger.error('Database initialization failed: %s', detail || toErrorMessage(error));
				emitGlobalError({
					source: 'main-process',
					message: `Database initialization failed: ${toErrorMessage(error)}`,
					detail,
					fatal: true,
				});
			}
			const settings = await getAppSettings();
			console.log('[main-startup] settings loaded');
			if (dbReady) {
				await applyDemoMode(settings);
			}
			console.log('[main-startup] demo mode applied');
			applyRuntimeSettings();
			setUnreadCountListener((count) => {
				updateUnreadIndicators(count);
			});
			setAccountCountChangedListener((count) => {
				setMainWindowActionsEnabled(count > 0);
				if (count > 0) return;
				openMainWindowEntryPoint();
			});
			setNewMailListener(({newMessages, source, target}) => {
				if (newMessages <= 0) return;
				if (source === 'send') return;
				if (!Notification.isSupported()) return;
				const title = newMessages === 1 ? 'New email received' : `${newMessages} new emails`;
				const body =
					source === 'startup' ? 'Mailbox synced with new unread messages.' : 'You have new unread messages.';
				void (async () => {
					try {
						const senderAddress =
							target && target.messageId > 0
								? (getMessageById(target.messageId)?.from_address ?? null)
								: null;
						const senderIconPath = await resolveSenderNotificationIconPath(senderAddress);
						const notification = new Notification({
							title,
							body,
							silent: false,
							...(senderIconPath || notificationIconPath
								? {icon: senderIconPath || notificationIconPath}
								: {}),
						});
						notification.on('click', () => {
							focusMainWindowAndOpenMessage(target);
						});
						notification.show();
						playNotificationSound();
					} catch {
						// ignore notification failures
					}
				})();
			});
			protocolHandler.registerProtocolClients();
			configurePlatformQuickActions();
			nativeTheme.on('updated', notifyNativeThemeUpdated);
			initAutoUpdater((state) => {
				broadcastAutoUpdateState(state);
			});
			logger.info('Auto updater initialized');
			console.log('[main-startup] auto updater initialized');
			stopDebugForwarding = onDebugLog((entry) => {
				for (const win of BrowserWindow.getAllWindows()) {
					win.webContents.send('debug-log', entry);
				}
			});
			logger.info('Debug forwarding active');
			createWindow('/windows/splash');
			showMainWindow();
			const startupFlowStartedAt = Date.now();
			const startupUpdateResult = await runStartupUpdateFlow();
			logger.info('Startup update flow result=%s', startupUpdateResult);
			console.log(`[main-startup] startup update flow result=${startupUpdateResult}`);
			if (startupUpdateResult === 'installing') {
				return;
			}
			if (isDev) {
				const elapsed = Date.now() - startupFlowStartedAt;
				const remaining = Math.max(0, DEV_SPLASH_MIN_DURATION_MS - elapsed);
				if (remaining > 0) {
					await new Promise((resolve) => setTimeout(resolve, remaining));
				}
			}

			const accounts = dbReady ? await getAccounts().catch(() => []) : [];
			logger.info('Loaded accounts count=%d', accounts.length);
			console.log(`[main-startup] accounts loaded count=${accounts.length}`);
			startupFlowComplete = true;
			setMainWindowActionsEnabled(accounts.length > 0);
			const startupIntent = protocolHandler.resolveLaunchIntent(process.argv);
			pendingStartupRoute = startupIntent.route;
			pendingStartupCompose = startupIntent.action === 'compose';
			if (accounts.length === 0) {
				navigateMainWindowToRouteDirect('/onboarding', {replaceHistory: true});
			} else {
				if (pendingStartupRoute) {
					navigateMainWindowToRouteDirect(pendingStartupRoute, {replaceHistory: true});
					pendingStartupRoute = null;
				} else {
					navigateMainWindowToRouteDirect('/email', {replaceHistory: true});
				}
				if (pendingStartupCompose) {
					openComposeQuickAction();
					pendingStartupCompose = false;
				}
			}
			protocolHandler.handleInitialLaunchArgs(process.argv);
			protocolHandler.flushPendingMailtoUrls();
			updateUnreadIndicators(getCurrentUnreadCount());
			if (dbReady) {
				startAccountAutoSync();
				logger.info('Auto sync started');
			}
			if (devStartupWatchdog) {
				clearTimeout(devStartupWatchdog);
				devStartupWatchdog = null;
			}

			app.on('activate', () => {
				if (mainWindow && !mainWindow.isDestroyed()) {
					showMainWindow();
					return;
				}
				void getAccounts().then((rows) => {
					if (rows.length === 0) {
						setMainWindowActionsEnabled(false);
						createWindow();
						openMainWindowEntryPoint();
						return;
					}
					showMainWindow();
				});
			});
		})
		.catch((error) => {
			console.error('[main-startup] Fatal startup failure:', error);
			logger.error('Fatal startup failure: %s', toErrorDetail(error) || toErrorMessage(error));
			emitGlobalError({
				source: 'main-process',
				message: `Fatal startup failure: ${toErrorMessage(error)}`,
				detail: toErrorDetail(error),
				fatal: true,
			});
		});

	app.on('before-quit', () => {
		logger.info('App before-quit');
		isQuitting = true;
		nativeTheme.removeListener('updated', notifyNativeThemeUpdated);
		if (initialBackgroundUpdateCheckTimer) {
			clearTimeout(initialBackgroundUpdateCheckTimer);
			initialBackgroundUpdateCheckTimer = null;
		}
		if (backgroundUpdateCheckTimer) {
			clearInterval(backgroundUpdateCheckTimer);
			backgroundUpdateCheckTimer = null;
		}
		if (stopDebugForwarding) {
			stopDebugForwarding();
			stopDebugForwarding = null;
		}
		stopAccountAutoSync();
		logger.info('Auto sync stopped');
	});

	app.on('window-all-closed', () => {
		logger.info('window-all-closed platform=%s', process.platform);
		if (process.platform !== 'darwin') app.quit();
	});
}
