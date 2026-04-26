import {loadI18nCatalog} from './catalog';
import {
	type I18nCatalogByNamespace,
	type TranslationParams,
	translateCatalog,
	type SupportedAppLocale,
	resolveSupportedLocale,
} from './types';

let activeLocale: SupportedAppLocale = 'en-US';
let activeCatalog: I18nCatalogByNamespace = {};

export async function initMainI18n(locale?: string | null): Promise<SupportedAppLocale> {
	const loaded = await loadI18nCatalog(locale);
	activeLocale = loaded.locale;
	activeCatalog = loaded.catalog;
	return activeLocale;
}

export async function setMainI18nLocale(locale?: string | null): Promise<SupportedAppLocale> {
	const loaded = await loadI18nCatalog(locale);
	activeLocale = loaded.locale;
	activeCatalog = loaded.catalog;
	return activeLocale;
}

export function getMainI18nLocale(): SupportedAppLocale {
	return activeLocale;
}

export async function getI18nCatalogPayload(locale?: string | null): Promise<{
	locale: SupportedAppLocale;
	catalog: I18nCatalogByNamespace;
}> {
	return await loadI18nCatalog(resolveSupportedLocale(locale));
}

export function __(key: string, params?: TranslationParams): string {
	return translateCatalog(activeCatalog, key, params);
}
