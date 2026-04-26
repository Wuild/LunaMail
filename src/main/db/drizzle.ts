import Database from 'better-sqlite3';
import {createRequire} from 'node:module';
import path from 'path';
import os from 'os';
import {drizzle} from 'drizzle-orm/better-sqlite3';
import {createAppLogger} from '@main/debug/debugLog';

// Create or reuse a singleton DB connection + Drizzle client
let _db: any = null;
let _drizzle: ReturnType<typeof drizzle> | null = null;
let _sqlitePathOverride: string | null = null;

const require = createRequire(import.meta.url);
const logger = createAppLogger('db');

export function setSqlitePathOverride(pathValue: string | null): void {
	_sqlitePathOverride = normalizeDbPath(pathValue);
}

export function getSqlitePath(): string {
	if (_sqlitePathOverride) return _sqlitePathOverride;
	const envPath = resolveEnvDbPath();
	if (envPath) return envPath;
	try {
		const electron = require('electron') as {app?: {getPath: (name: string) => string}};
		const userData = electron?.app?.getPath?.('userData');
		if (userData) return path.join(userData, 'llamamail.db');
	} catch {
		// Worker/non-electron context fallback.
	}
	return path.join(process.cwd(), 'llamamail.db');
}

function resolveEnvDbPath(): string | null {
	return normalizeDbPath(process.env.LLAMA_DB_PATH || process.env.LUNAMAIL_DB_PATH || null);
}

function normalizeDbPath(pathValue: string | null | undefined): string | null {
	const trimmed = String(pathValue || '').trim();
	if (!trimmed) return null;
	if (trimmed.startsWith('~/')) {
		return path.join(os.homedir(), trimmed.slice(2));
	}
	return path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed);
}

export function getDb() {
	if (!_db) {
		const sqlitePath = getSqlitePath();
		logger.info('Opening SQLite database path=%s', sqlitePath);
		_db = new Database(sqlitePath);
	}
	return _db;
}

export function getDrizzle() {
	if (!_drizzle) {
		_drizzle = drizzle(getDb());
	}
	return _drizzle;
}
