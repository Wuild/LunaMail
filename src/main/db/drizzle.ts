import Database from 'better-sqlite3';
import path from 'path';
import {app} from 'electron';
import {drizzle} from 'drizzle-orm/better-sqlite3';

// Create or reuse a singleton DB connection + Drizzle client
let _db: any = null;
let _drizzle: ReturnType<typeof drizzle> | null = null;

export function getSqlitePath(): string {
    return path.join(app.getPath('userData'), 'lunamail.db');
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
