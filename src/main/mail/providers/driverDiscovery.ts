import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import type {ProviderDriverRegistration} from './contracts.js';

const DRIVER_FILE_SUFFIX = '.driver.js';

function asProviderDriverRegistration(value: unknown): ProviderDriverRegistration | null {
	if (!value || typeof value !== 'object') return null;
	const candidate = value as Partial<ProviderDriverRegistration>;
	if (typeof candidate.key !== 'string' || !candidate.key.trim()) return null;
	if (typeof candidate.label !== 'string' || !candidate.label.trim()) return null;
	if (typeof candidate.logo !== 'string' || !candidate.logo.trim()) return null;
	if (typeof candidate.createDriver !== 'function') return null;
	if (typeof candidate.createEmailSyncService !== 'function') return null;
	if (typeof candidate.createAncillarySyncService !== 'function') return null;
	return candidate as ProviderDriverRegistration;
}

export async function discoverProviderDriverRegistrations(): Promise<ProviderDriverRegistration[]> {
	const providersDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'drivers');
	const entries = await readdir(providersDir, {withFileTypes: true});
	const driverFiles = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(DRIVER_FILE_SUFFIX))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right));

	const registrations: ProviderDriverRegistration[] = [];
	for (const fileName of driverFiles) {
		const filePath = path.join(providersDir, fileName);
		const moduleUrl = pathToFileURL(filePath).href;
		const loaded = await import(moduleUrl);
		const found = Object.values(loaded).find((value) => asProviderDriverRegistration(value) !== null);
		if (!found) {
			console.warn(`[provider-drivers] Skipping ${fileName}: no valid ProviderDriverRegistration export found.`);
			continue;
		}
		registrations.push(found as ProviderDriverRegistration);
	}

	return registrations;
}
