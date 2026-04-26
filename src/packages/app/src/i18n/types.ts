import type {AppLanguage} from '../ipcTypes';

export const DEFAULT_APP_LOCALE = 'en-US';
export const I18N_DEFAULT_NAMESPACE = 'common';
export const I18N_NAMESPACES = [I18N_DEFAULT_NAMESPACE] as const;
export const SUPPORTED_APP_LOCALES = ['en-US', 'sv-SE'] as const;

export type SupportedAppLocale = (typeof SUPPORTED_APP_LOCALES)[number];
export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

export type I18nCatalog = Record<string, unknown>;
export type I18nCatalogByNamespace = Partial<Record<I18nNamespace, I18nCatalog>>;

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export function resolveSupportedLocale(locale?: string | null): SupportedAppLocale {
	const normalized = String(locale || '')
		.trim()
		.toLowerCase();
	if (normalized === 'en' || normalized === 'en-us') return 'en-US';
	if (normalized === 'sv' || normalized === 'sv-se') return 'sv-SE';
	return DEFAULT_APP_LOCALE;
}

export function resolveEffectiveLocale(language: AppLanguage, systemLocale?: string | null): SupportedAppLocale {
	if (language !== 'system') return resolveSupportedLocale(language);
	return resolveSupportedLocale(systemLocale);
}

function resolveMessageNode(catalog: I18nCatalog, key: string): unknown {
	const segments = String(key || '')
		.split('.')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
	let cursor: unknown = catalog;
	for (const segment of segments) {
		if (!cursor || typeof cursor !== 'object') return null;
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	return cursor;
}

function interpolateTemplate(template: string, params?: TranslationParams): string {
	if (!params) return template;
	return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, name) => {
		const value = params[name];
		if (value === null || value === undefined) return '';
		return String(value);
	});
}

export function translateCatalog(
	catalogByNamespace: I18nCatalogByNamespace | null | undefined,
	key: string,
	params?: TranslationParams,
): string {
	const catalog = catalogByNamespace?.[I18N_DEFAULT_NAMESPACE];
	if (!catalog || typeof catalog !== 'object') return key;
	const node = resolveMessageNode(catalog, key);
	if (typeof node !== 'string') return key;
	return interpolateTemplate(node, params);
}
