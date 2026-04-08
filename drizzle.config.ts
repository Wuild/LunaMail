import type {Config} from "drizzle-kit";

export default {
    schema: "./src/main/db/schema.ts",
    out: "./drizzle",
    dialect: "sqlite",
    driver: "better-sqlite",
    dbCredentials: {
        // For migrations during development; Electron will use userData path at runtime
        url: "./lunamail.dev.db",
    },
    strict: true,
    verbose: true,
} satisfies Config;
