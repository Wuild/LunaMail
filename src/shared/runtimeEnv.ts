import fs from 'fs';
import path from 'path';

let envLoaded = false;

function parseEnvValue(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return '';
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		const unwrapped = trimmed.slice(1, -1);
		if (trimmed.startsWith('"')) {
			return unwrapped.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
		}
		return unwrapped;
	}
	return trimmed;
}

function parseAndApplyEnv(text: string): void {
	const lines = text.split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!match) continue;
		const key = match[1];
		const rawValue = match[2] || '';
		if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
		process.env[key] = parseEnvValue(rawValue);
	}
}

function candidateEnvFiles(): string[] {
	const out = new Set<string>();
	const explicitFile = String(process.env.LUNAMAIL_ENV_FILE || '').trim();
	if (explicitFile) {
		out.add(path.resolve(explicitFile));
		return Array.from(out);
	}

	const cwd = process.cwd();
	out.add(path.join(cwd, '.env'));
	out.add(path.join(cwd, '.env.local'));

	const resourcesPath = String(process.resourcesPath || '').trim();
	if (resourcesPath) {
		out.add(path.join(resourcesPath, '.env'));
		out.add(path.join(resourcesPath, '.env.local'));
	}

	return Array.from(out);
}

export function loadRuntimeEnvOnce(): void {
	if (envLoaded) return;
	envLoaded = true;

	for (const filePath of candidateEnvFiles()) {
		try {
			if (!fs.existsSync(filePath)) continue;
			const text = fs.readFileSync(filePath, 'utf8');
			parseAndApplyEnv(text);
		} catch {
			// Ignore malformed or unreadable env files and continue startup.
		}
	}
}

