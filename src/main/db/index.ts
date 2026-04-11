import fs from 'fs';
import path from 'path';
import {app} from 'electron';
import {migrate} from 'drizzle-orm/better-sqlite3/migrator';
import {createAppLogger} from '@main/debug/debugLog.js';
import {getDb, getDrizzle} from './drizzle.js';

const logger = createAppLogger('db:init');

function resolveMigrationsFolder(): string {
	const appPath = app.getAppPath();
    const candidates = [path.join(appPath, 'drizzle'), path.join(process.cwd(), 'drizzle')];
	for (const folder of candidates) {
		if (!fs.existsSync(folder)) continue;
		return folder;
	}
	return candidates[0];
}

export function initDb(): void {
	const db = getDb();
	db.pragma('foreign_keys = ON');
	db.pragma('journal_mode = WAL');

	const migrationsFolder = resolveMigrationsFolder();
	logger.info('Running Drizzle migrations folder=%s', migrationsFolder);
	migrate(getDrizzle(), {migrationsFolder});
	logger.info('Drizzle migrations complete');
}
