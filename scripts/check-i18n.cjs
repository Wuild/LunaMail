#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const fg = require('fast-glob');

const ROOT = process.cwd();
const LOCALE_ROOT = path.join(ROOT, 'locales', 'en-US');
const SOURCE_GLOBS = ['src/**/*.{ts,tsx,js,jsx,cjs,mjs}'];

function flattenLocaleObject(value, prefix = '', out = new Set()) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
	for (const [key, child] of Object.entries(value)) {
		const nextKey = prefix ? `${prefix}.${key}` : key;
		if (child && typeof child === 'object' && !Array.isArray(child)) {
			flattenLocaleObject(child, nextKey, out);
		} else {
			out.add(nextKey);
		}
	}
	return out;
}

function collectLocaleKeys() {
	if (!fs.existsSync(LOCALE_ROOT)) {
		throw new Error(`Locale root not found: ${LOCALE_ROOT}`);
	}
	const localeFiles = fg.sync(['**/*.json'], {cwd: LOCALE_ROOT, absolute: true, dot: false});
	if (localeFiles.length === 0) {
		throw new Error(`No locale files found under: ${LOCALE_ROOT}`);
	}
	const keys = new Set();
	for (const filePath of localeFiles) {
		const raw = fs.readFileSync(filePath, 'utf8');
		const parsed = JSON.parse(raw);
		flattenLocaleObject(parsed, '', keys);
	}
	return keys;
}

function collectI18nKeyUsages() {
	const sourceFiles = fg.sync(SOURCE_GLOBS, {
		cwd: ROOT,
		absolute: true,
		dot: false,
		ignore: ['**/*.d.ts', '**/node_modules/**', '**/build/**', '**/dist/**'],
	});

	const usages = [];
	const usageRegex = /(?<![\w$])(t|__)\(\s*(['"`])([^'"`]+)\2/g;

	for (const filePath of sourceFiles) {
		const content = fs.readFileSync(filePath, 'utf8');
		let match;
		while ((match = usageRegex.exec(content)) !== null) {
			const key = String(match[3] || '').trim();
			if (!key) continue;
			if (key.includes('${')) continue;
			const untilMatch = content.slice(0, match.index);
			const line = untilMatch.split('\n').length;
			usages.push({
				filePath,
				line,
				fn: match[1],
				key,
			});
		}
	}

	return usages;
}

function run() {
	const localeKeys = collectLocaleKeys();
	const usages = collectI18nKeyUsages();

	const missing = [];
	for (const usage of usages) {
		if (!localeKeys.has(usage.key)) {
			missing.push(usage);
		}
	}

	if (missing.length === 0) {
		console.log(`check:i18n passed (${usages.length} key usages, ${localeKeys.size} locale keys).`);
		return;
	}

	console.error(`check:i18n failed: ${missing.length} missing locale key reference(s).\n`);
	for (const item of missing) {
		const relPath = path.relative(ROOT, item.filePath);
		console.error(`- ${relPath}:${item.line} ${item.fn}('${item.key}')`);
	}

	process.exitCode = 1;
}

run();
