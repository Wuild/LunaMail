import fs from 'fs';
import path from 'path';
import {app} from 'electron';
import {migrate} from 'drizzle-orm/better-sqlite3/migrator';
import {createAppLogger} from '@main/debug/debugLog';
import {getDb, getDrizzle, getSqlitePath} from './drizzle';

const logger = createAppLogger('db:init');

function logDrizzleConsole(message: string): void {
	const line = `[drizzle] ${message}`;
	logger.info(line);
	console.log(line);
}

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
	ensureBaselineTables(db, migrationsFolder);
	logDrizzleConsole(`SQLite path: ${getSqlitePath()}`);
	logDrizzleConsole(`Migrations folder: ${migrationsFolder}`);
	logDrizzleConsole('Starting migrations');
	try {
		migrate(getDrizzle(), {migrationsFolder});
		logDrizzleConsole('Migrations complete');
	} catch (error: any) {
		const message = String(error?.message || error || '');
		const causeMessage = String(error?.cause?.message || '');
		const combinedMessage = `${message}\n${causeMessage}`;
		if (
			/duplicate column name/i.test(combinedMessage) ||
			/already exists/i.test(combinedMessage) ||
			/The supplied SQL string contains more than one statement/i.test(combinedMessage)
		) {
			logger.warn('Ignoring non-fatal migration error: %s', combinedMessage);
			console.warn(`[drizzle] Non-fatal migration warning: ${combinedMessage}`);
		} else {
			console.error('[drizzle] Migration failed:', error);
			throw error;
		}
	}
	ensureBaselineTables(db, migrationsFolder);
	ensureAccountsModuleColumns(db);
	logDrizzleConsole(`Applied migration rows: ${readMigrationRowCount(db)}`);
}

function ensureAccountsModuleColumns(db: any): void {
	if (!tableExists(db, 'accounts')) {
		logger.warn('Skipping accounts module column repair because accounts table does not exist');
		return;
	}
	const existing = getTableColumns(db, 'accounts');
	const missing: Array<{name: string; sqlType: string; defaultValue: string}> = [];
	if (!existing.has('sync_emails')) {
		missing.push({name: 'sync_emails', sqlType: 'integer', defaultValue: '1'});
	}
	if (!existing.has('sync_contacts')) {
		missing.push({name: 'sync_contacts', sqlType: 'integer', defaultValue: '1'});
	}
	if (!existing.has('sync_calendar')) {
		missing.push({name: 'sync_calendar', sqlType: 'integer', defaultValue: '1'});
	}
	if (!existing.has('contacts_sync_interval_minutes')) {
		missing.push({name: 'contacts_sync_interval_minutes', sqlType: 'integer', defaultValue: '15'});
	}
	if (!existing.has('calendar_sync_interval_minutes')) {
		missing.push({name: 'calendar_sync_interval_minutes', sqlType: 'integer', defaultValue: '15'});
	}
	if (!existing.has('email_sync_interval_minutes')) {
		missing.push({name: 'email_sync_interval_minutes', sqlType: 'integer', defaultValue: '15'});
	}
	if (!existing.has('email_sync_lookback_months')) {
		missing.push({name: 'email_sync_lookback_months', sqlType: 'integer', defaultValue: '1'});
	}
	if (!existing.has('email_list_sort')) {
		missing.push({
			name: 'email_list_sort',
			sqlType: 'text',
			defaultValue: "'unread_then_arrived_desc'",
		});
	}
	if (!existing.has('imap_user')) {
		missing.push({
			name: 'imap_user',
			sqlType: 'text',
			defaultValue: "''",
		});
	}
	if (!existing.has('smtp_user')) {
		missing.push({
			name: 'smtp_user',
			sqlType: 'text',
			defaultValue: "''",
		});
	}
	if (!existing.has('carddav_user')) {
		missing.push({
			name: 'carddav_user',
			sqlType: 'text',
			defaultValue: "''",
		});
	}
	if (!existing.has('caldav_user')) {
		missing.push({
			name: 'caldav_user',
			sqlType: 'text',
			defaultValue: "''",
		});
	}
	for (const column of missing) {
		db.prepare(
			`ALTER TABLE accounts ADD COLUMN ${column.name} ${column.sqlType} DEFAULT ${column.defaultValue} NOT NULL`,
		).run();
		logger.info('Added missing accounts column %s', column.name);
	}
}

function ensureBaselineTables(db: any, migrationsFolder: string): void {
	if (tableExists(db, 'accounts')) return;
	const baselinePath = path.join(migrationsFolder, '0000_baseline.sql');
	if (!fs.existsSync(baselinePath)) {
		throw new Error(
			`Database bootstrap failed: accounts table is missing and baseline migration was not found at ${baselinePath}`,
		);
	}
	const baselineSql = fs.readFileSync(baselinePath, 'utf8');
	if (!baselineSql.trim()) {
		throw new Error(`Database bootstrap failed: baseline migration file is empty at ${baselinePath}`);
	}
	logger.warn('Accounts table missing after migrations; applying baseline SQL bootstrap');
	db.exec(baselineSql);
	if (!tableExists(db, 'accounts')) {
		throw new Error('Database bootstrap failed: accounts table is still missing after baseline SQL execution');
	}
	logger.info('Baseline SQL bootstrap completed successfully');
}

function tableExists(db: any, tableName: string): boolean {
	const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1").get(tableName) as
		| {name?: string}
		| undefined;
	return Boolean(row?.name);
}

function readMigrationRowCount(db: any): number {
	try {
		const row = db.prepare('SELECT COUNT(*) as count FROM __drizzle_migrations').get() as
			| {count?: number}
			| undefined;
		return Number(row?.count ?? 0);
	} catch {
		return 0;
	}
}

function getTableColumns(db: any, tableName: string): Set<string> {
	const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{name?: string}>;
	return new Set(
		rows
			.map((row) =>
				String(row?.name || '')
					.trim()
					.toLowerCase(),
			)
			.filter(Boolean),
	);
}
