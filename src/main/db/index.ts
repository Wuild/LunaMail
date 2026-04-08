import {app} from "electron";
import fs from "node:fs";
import path from "path";
import {migrate} from "drizzle-orm/better-sqlite3/migrator";
import {createAppLogger} from "../debug/debugLog.js";
import {getDrizzle, getSqlitePath} from "./drizzle.js";

const logger = createAppLogger("db:migrate");

export function initDb(): void {
  const startedAt = Date.now();
  const sqlitePath = getSqlitePath();
  const migrationsFolder = path.join(app.getAppPath(), "drizzle");
  logger.info("Initializing database sqlitePath=%s", sqlitePath);
  logger.info("Running migrations folder=%s exists=%s", migrationsFolder, fs.existsSync(migrationsFolder));
  try {
    migrate(getDrizzle(), {migrationsFolder});
    logger.info("Migrations completed durationMs=%d", Date.now() - startedAt);
  } catch (error) {
    logger.fatal(
        "Migrations failed durationMs=%d error=%s",
        Date.now() - startedAt,
        (error as Error)?.message ?? String(error)
    );
    throw error;
  }
}
