import fs from 'node:fs/promises';
import path from 'node:path';
import {
	DEFAULT_APP_LOCALE,
	I18N_DEFAULT_NAMESPACE,
	I18N_NAMESPACES,
	type I18nCatalogByNamespace,
	type I18nNamespace,
	resolveSupportedLocale,
	type SupportedAppLocale,
} from './types';

const catalogCache = new Map<string, I18nCatalogByNamespace>();

function getLocaleDirectoryCandidates(): string[] {
	const candidates: string[] = [];
	const moduleDirectory = path.dirname(new URL(import.meta.url).pathname);
	candidates.push(path.resolve(moduleDirectory, '../../../../../locales'));
	candidates.push(path.resolve(moduleDirectory, '../../../../locales'));
	candidates.push(path.resolve(moduleDirectory, '../../../locales'));
	const envPath = String(process.env.LLAMAMAIL_LOCALES_DIR || '').trim();
	if (envPath) candidates.push(envPath);
	const npmInitCwd = String(process.env.INIT_CWD || '').trim();
	if (npmInitCwd) candidates.push(path.resolve(npmInitCwd, 'locales'));
	candidates.push(path.resolve(process.cwd(), 'locales'));
	if (process.resourcesPath) {
		candidates.push(path.resolve(process.resourcesPath, 'locales'));
		candidates.push(path.resolve(process.resourcesPath, 'app', 'locales'));
		candidates.push(path.resolve(process.resourcesPath, 'app.asar', 'locales'));
		candidates.push(path.resolve(process.resourcesPath, 'app.asar.unpacked', 'locales'));
	}
	const entryScript = String(process.argv[1] || '').trim();
	if (entryScript) {
		const entryDir = path.dirname(path.resolve(entryScript));
		candidates.push(path.resolve(entryDir, '../locales'));
		candidates.push(path.resolve(entryDir, '../../locales'));
		candidates.push(path.resolve(entryDir, '../../../locales'));
	}
	return [...new Set(candidates)];
}

async function isValidLocalesDirectory(candidate: string): Promise<boolean> {
	const fallbackDirectory = path.resolve(candidate, DEFAULT_APP_LOCALE);
	try {
		const entries = await fs.readdir(fallbackDirectory);
		const normalized = new Set(entries.map((entry) => entry.toLowerCase()));
		if (!normalized.has('app-shell.json')) return false;
		if (!normalized.has('mail.json')) return false;
		return entries.some((entry) => entry.toLowerCase().endsWith('.json'));
	} catch {
		return false;
	}
}

async function resolveLocalesDirectory(): Promise<string> {
	const candidates = getLocaleDirectoryCandidates();
	for (const candidate of candidates) {
		if (await isValidLocalesDirectory(candidate)) return candidate;
	}
	return path.resolve(process.cwd(), 'locales');
}

async function readNamespaceCatalog(
	localesDir: string,
	locale: SupportedAppLocale,
	namespace: I18nNamespace,
): Promise<Record<string, unknown>> {
	if (namespace === I18N_DEFAULT_NAMESPACE) {
		return await readMergedLocaleDirectoryCatalog(localesDir, locale);
	}
	const fallbackPath = path.resolve(localesDir, DEFAULT_APP_LOCALE, `${namespace}.json`);
	const localePath = path.resolve(localesDir, locale, `${namespace}.json`);
	const candidates = locale === DEFAULT_APP_LOCALE ? [fallbackPath] : [localePath, fallbackPath];
	for (const targetPath of candidates) {
		try {
			const raw = await fs.readFile(targetPath, 'utf8');
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			// try next candidate
		}
	}
	return {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeCatalogObjects(
	base: Record<string, unknown>,
	override: Record<string, unknown>,
): Record<string, unknown> {
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

async function readLocaleDirectoryCatalog(directory: string): Promise<Record<string, unknown>> {
	let entries: string[] = [];
	try {
		entries = await fs.readdir(directory);
	} catch {
		return {};
	}
	const jsonFiles = entries
		.filter((entry) => entry.toLowerCase().endsWith('.json'))
		.sort((a, b) => a.localeCompare(b, 'en-US'));
	let merged: Record<string, unknown> = {};
	for (const fileName of jsonFiles) {
		const targetPath = path.resolve(directory, fileName);
		try {
			const raw = await fs.readFile(targetPath, 'utf8');
			const parsed = JSON.parse(raw);
			if (isPlainObject(parsed)) {
				merged = mergeCatalogObjects(merged, parsed);
			}
		} catch {
			// ignore invalid or unreadable locale file
		}
	}
	return merged;
}

async function readMergedLocaleDirectoryCatalog(
	localesDir: string,
	locale: SupportedAppLocale,
): Promise<Record<string, unknown>> {
	const fallbackDir = path.resolve(localesDir, DEFAULT_APP_LOCALE);
	const localeDir = path.resolve(localesDir, locale);
	const fallbackCatalog = await readLocaleDirectoryCatalog(fallbackDir);
	if (locale === DEFAULT_APP_LOCALE) return fallbackCatalog;
	const localeCatalog = await readLocaleDirectoryCatalog(localeDir);
	return mergeCatalogObjects(fallbackCatalog, localeCatalog);
}

async function buildCatalog(locale: SupportedAppLocale): Promise<I18nCatalogByNamespace> {
	const localesDir = await resolveLocalesDirectory();
	const result: I18nCatalogByNamespace = {};
	for (const namespace of I18N_NAMESPACES) {
		result[namespace] = await readNamespaceCatalog(localesDir, locale, namespace);
	}
	return result;
}

export async function loadI18nCatalog(locale?: string | null): Promise<{
	locale: SupportedAppLocale;
	catalog: I18nCatalogByNamespace;
}> {
	const resolvedLocale = resolveSupportedLocale(locale);
	const cached = catalogCache.get(resolvedLocale);
	if (cached) {
		return {locale: resolvedLocale, catalog: cached};
	}
	const built = await buildCatalog(resolvedLocale);
	catalogCache.set(resolvedLocale, built);
	return {locale: resolvedLocale, catalog: built};
}
