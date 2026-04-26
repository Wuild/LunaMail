import type {I18nCatalog, SupportedAppLocale} from '@llamamail/app/i18n/types';
import enAppShell from '../../../locales/en-US/app-shell.json';
import enSettings from '../../../locales/en-US/settings.json';
import enOnboarding from '../../../locales/en-US/onboarding.json';
import enMail from '../../../locales/en-US/mail.json';
import enContactsCalendar from '../../../locales/en-US/contacts-calendar.json';
import enCloud from '../../../locales/en-US/cloud.json';
import enBackend from '../../../locales/en-US/backend.json';
import svAppShell from '../../../locales/sv-SE/app-shell.json';
import svSettings from '../../../locales/sv-SE/settings.json';
import svOnboarding from '../../../locales/sv-SE/onboarding.json';
import svMail from '../../../locales/sv-SE/mail.json';
import svContactsCalendar from '../../../locales/sv-SE/contacts-calendar.json';
import svCloud from '../../../locales/sv-SE/cloud.json';
import svBackend from '../../../locales/sv-SE/backend.json';

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeCatalogObjects(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {...base};
	for (const [key, value] of Object.entries(override)) {
		const existing = out[key];
		if (isPlainObject(existing) && isPlainObject(value)) {
			out[key] = mergeCatalogObjects(existing, value);
			continue;
		}
		out[key] = value;
	}
	return out;
}

const EN_US_FILES: ReadonlyArray<Record<string, unknown>> = [
	enAppShell,
	enSettings,
	enOnboarding,
	enMail,
	enContactsCalendar,
	enCloud,
	enBackend,
];

const SV_SE_FILES: ReadonlyArray<Record<string, unknown>> = [
	svAppShell,
	svSettings,
	svOnboarding,
	svMail,
	svContactsCalendar,
	svCloud,
	svBackend,
];

function mergeCatalogFiles(files: ReadonlyArray<Record<string, unknown>>): I18nCatalog {
	let merged: Record<string, unknown> = {};
	for (const file of files) {
		merged = mergeCatalogObjects(merged, file);
	}
	return merged;
}

const EN_US_CATALOG = mergeCatalogFiles(EN_US_FILES);
const SV_SE_CATALOG = mergeCatalogObjects(EN_US_CATALOG, mergeCatalogFiles(SV_SE_FILES));

export function getBundledRendererCatalog(locale: SupportedAppLocale): I18nCatalog {
	if (locale === 'sv-SE') return SV_SE_CATALOG;
	return EN_US_CATALOG;
}
