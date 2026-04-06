import Database from 'better-sqlite3';
import {createRequire} from 'node:module';
import path from 'path';
import {drizzle} from 'drizzle-orm/better-sqlite3';

// Create or reuse a singleton DB connection + Drizzle client
let _db: any = null;
let _drizzle: ReturnType<typeof drizzle> | null = null;
let _sqlitePathOverride: string | null = process.env.LUNAMAIL_DB_PATH || null;

const require = createRequire(import.meta.url);

export function setSqlitePathOverride(pathValue: string | null): void {
    _sqlitePathOverride = pathValue && pathValue.trim() ? pathValue.trim() : null;
}

export function getSqlitePath(): string {
    if (_sqlitePathOverride) return _sqlitePathOverride;
    try {
        const electron = require('electron') as { app?: { getPath: (name: string) => string } };
        const userData = electron?.app?.getPath?.('userData');
        if (userData) return path.join(userData, 'lunamail.db');
    } catch {
        // Worker/non-electron context fallback.
    }
    return path.join(process.cwd(), 'lunamail.db');
}

export function getDb() {
    if (!_db) {
        _db = new Database(getSqlitePath());
    }
    return _db;
}

export function getDrizzle() {
    if (!_drizzle) {
        _drizzle = drizzle(getDb());
    }
    return _drizzle;
}
