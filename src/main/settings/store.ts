import Store from 'electron-store';
import type {
	AppLanguage,
	AppSettings,
	AppSettingsPatch,
	AppTheme,
	MailListSort,
	MailView,
} from '@llamamail/app/ipcTypes';
import {createDefaultAppSettings, DEFAULT_APP_SETTINGS} from '@llamamail/app/defaults';
import {
	normalizeNavRailOrder,
	normalizeSyncIntervalMinutes,
	parseAppLanguage,
	parseMailListSort,
	parseAppTheme,
	parseMailView,
} from '@llamamail/app/settingsRules';

export type {AppLanguage, AppSettings, AppSettingsPatch, AppTheme, MailListSort, MailView} from '@llamamail/app/ipcTypes';

let settingsCache: AppSettings = createDefaultAppSettings();
let hasLoaded = false;
let settingsStore: Store<AppSettings> | null = null;

function getSettingsStore(): Store<AppSettings> {
	if (settingsStore) return settingsStore;
	settingsStore = new Store<AppSettings>({
		name: 'settings',
		defaults: createDefaultAppSettings(),
		accessPropertiesByDotNotation: false,
	});
	return settingsStore;
}

function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
	const parseBoolean = (value: unknown, fallback: boolean): boolean => {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'number') return value !== 0;
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
			if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off')
				return false;
		}
		return fallback;
	};
	const parseNullableBoolean = (value: unknown): boolean | null => {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'number') return value !== 0;
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
			if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off')
				return false;
		}
		return null;
	};
	const language: AppLanguage = parseAppLanguage(input?.language);
	const theme: AppTheme = parseAppTheme(input?.theme);
	const mailView: MailView = parseMailView(input?.mailView);
	const mailListSort: MailListSort = parseMailListSort(input?.mailListSort);
	const navRailOrder = normalizeNavRailOrder(input?.navRailOrder);
	const blockRemoteContent = parseBoolean(input?.blockRemoteContent, DEFAULT_APP_SETTINGS.blockRemoteContent);
	const remoteContentAllowlist = Array.isArray(input?.remoteContentAllowlist)
		? [
				...new Set(
					input.remoteContentAllowlist
						.map((entry) =>
							String(entry || '')
								.trim()
								.toLowerCase(),
						)
						.filter((entry) => entry.length > 0)
						.slice(0, 500),
				),
			]
		: DEFAULT_APP_SETTINGS.remoteContentAllowlist;

	const syncIntervalMinutes = normalizeSyncIntervalMinutes(input?.syncIntervalMinutes);

	const minimizeToTray = parseBoolean(input?.minimizeToTray, DEFAULT_APP_SETTINGS.minimizeToTray);
	const useNativeTitleBar = parseBoolean(input?.useNativeTitleBar, DEFAULT_APP_SETTINGS.useNativeTitleBar);
	const hardwareAcceleration = parseBoolean(input?.hardwareAcceleration, DEFAULT_APP_SETTINGS.hardwareAcceleration);
	const pendingHardwareAcceleration = parseNullableBoolean(input?.pendingHardwareAcceleration);
	const pendingUseNativeTitleBar = parseNullableBoolean(input?.pendingUseNativeTitleBar);
	const spellcheckEnabled = parseBoolean(input?.spellcheckEnabled, DEFAULT_APP_SETTINGS.spellcheckEnabled);
	const playNotificationSound = parseBoolean(
		input?.playNotificationSound,
		DEFAULT_APP_SETTINGS.playNotificationSound,
	);
	const showUnreadInTitleBar = parseBoolean(input?.showUnreadInTitleBar, DEFAULT_APP_SETTINGS.showUnreadInTitleBar);
	const autoUpdateEnabled = parseBoolean(input?.autoUpdateEnabled, DEFAULT_APP_SETTINGS.autoUpdateEnabled);
	const developerMode = parseBoolean(input?.developerMode, DEFAULT_APP_SETTINGS.developerMode);
	const developerDemoMode = parseBoolean(input?.developerDemoMode, DEFAULT_APP_SETTINGS.developerDemoMode);
	const developerShowRouteOverlay = parseBoolean(
		input?.developerShowRouteOverlay,
		DEFAULT_APP_SETTINGS.developerShowRouteOverlay,
	);
	const developerShowSendNotifications = parseBoolean(
		input?.developerShowSendNotifications,
		DEFAULT_APP_SETTINGS.developerShowSendNotifications,
	);
	const developerShowSystemFailureNotifications = parseBoolean(
		input?.developerShowSystemFailureNotifications,
		DEFAULT_APP_SETTINGS.developerShowSystemFailureNotifications,
	);
	const developerShowDebugNavItem = parseBoolean(
		input?.developerShowDebugNavItem,
		DEFAULT_APP_SETTINGS.developerShowDebugNavItem,
	);

	return {
		language,
		theme,
		mailView,
		mailListSort,
		navRailOrder,
		hardwareAcceleration,
		pendingHardwareAcceleration,
		spellcheckEnabled,
		playNotificationSound,
		showUnreadInTitleBar,
		blockRemoteContent,
		remoteContentAllowlist,
		minimizeToTray,
		useNativeTitleBar,
		pendingUseNativeTitleBar,
		syncIntervalMinutes,
		autoUpdateEnabled,
		developerMode,
		developerDemoMode,
		developerShowRouteOverlay,
		developerShowSendNotifications,
		developerShowSystemFailureNotifications,
		developerShowDebugNavItem,
	};
}

function applyPendingRestartSettings(settings: AppSettings): {settings: AppSettings; changed: boolean} {
	let changed = false;
	let next = settings;
	if (settings.pendingHardwareAcceleration !== null) {
		changed = true;
		next = {
			...next,
			hardwareAcceleration: settings.pendingHardwareAcceleration,
			pendingHardwareAcceleration: null,
		};
	}
	if (settings.pendingUseNativeTitleBar !== null) {
		changed = true;
		next = {
			...next,
			useNativeTitleBar: settings.pendingUseNativeTitleBar,
			pendingUseNativeTitleBar: null,
		};
	}
	return {settings: next, changed};
}

export async function getAppSettings(): Promise<AppSettings> {
	if (hasLoaded) return settingsCache;
	hasLoaded = true;
	try {
		const parsed = getSettingsStore().store as Partial<AppSettings>;
		settingsCache = sanitizeSettings(parsed);
	} catch {
		settingsCache = createDefaultAppSettings();
		getSettingsStore().store = settingsCache;
	}
	return settingsCache;
}

export function getAppSettingsSync(): AppSettings {
	return settingsCache;
}

export function getAppSettingsBootSnapshotSync(): AppSettings {
	try {
		const parsed = getSettingsStore().store as Partial<AppSettings>;
		const sanitized = sanitizeSettings(parsed);
		const {settings, changed} = applyPendingRestartSettings(sanitized);
		settingsCache = settings;
		if (changed) {
			getSettingsStore().store = settingsCache;
		}
		hasLoaded = true;
		return settingsCache;
	} catch {
		return settingsCache;
	}
}

export async function updateAppSettings(patch: AppSettingsPatch): Promise<AppSettings> {
	const current = await getAppSettings();
	settingsCache = sanitizeSettings({
		...current,
		...patch,
	});
	getSettingsStore().store = settingsCache;
	return settingsCache;
}

export function resolveLocaleTag(language: AppLanguage): string | undefined {
	if (language === 'system') return undefined;
	return language;
}

export function getSpellCheckerLanguages(_language: AppLanguage): string[] {
	return ['en-US'];
}
