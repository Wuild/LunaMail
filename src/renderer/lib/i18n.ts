import type {AppSettings} from '@preload';
import {initRendererI18n, setRendererI18nLocale} from '@llamamail/app/i18n/renderer';
import {resolveEffectiveLocale, type I18nCatalogByNamespace, type SupportedAppLocale} from '@llamamail/app/i18n/types';
import {DEFAULT_APP_SETTINGS} from '@llamamail/app/defaults';
import {ipcClient} from './ipcClient';
import {getBundledRendererCatalog} from './i18nCatalog';

let cachedSystemLocale = 'en-US';

function toCatalogPayload(locale: SupportedAppLocale): {locale: SupportedAppLocale; catalog: I18nCatalogByNamespace} {
	return {
		locale,
		catalog: {
			common: getBundledRendererCatalog(locale),
		},
	};
}

async function loadAndApplyLocale(settings: AppSettings): Promise<void> {
	const effectiveLocale = resolveEffectiveLocale(settings.language, cachedSystemLocale);
	setRendererI18nLocale(toCatalogPayload(effectiveLocale));
}

export function primeRendererI18n(): void {
	initRendererI18n(toCatalogPayload('en-US'));
}

export async function bootstrapRendererI18n(): Promise<void> {
	try {
		const [settings, systemLocale] = await Promise.all([
			ipcClient.getAppSettings().catch(() => DEFAULT_APP_SETTINGS),
			ipcClient.getSystemLocale().catch(() => 'en-US'),
		]);
		cachedSystemLocale = String(systemLocale || 'en-US');
		const effectiveLocale = resolveEffectiveLocale(settings.language ?? DEFAULT_APP_SETTINGS.language, cachedSystemLocale);
		setRendererI18nLocale(toCatalogPayload(effectiveLocale));
		ipcClient.onAppSettingsUpdated((nextSettings) => {
			void loadAndApplyLocale(nextSettings);
		});
	} catch {
		setRendererI18nLocale(toCatalogPayload('en-US'));
	}
}
