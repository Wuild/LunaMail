import {parentPort, workerData} from "node:worker_threads";
import {setSqlitePathOverride} from "../db/drizzle.js";
import {syncAccountMailboxWithCredentials, type SyncSummary} from "../mail/sync.js";

type WorkerCredentials = {
    id: number;
    imap_host: string;
    imap_port: number;
    imap_secure: number;
    user: string;
    password: string;
};

type WorkerInput = {
    dbPath: string;
    credentials: WorkerCredentials;
};

type WorkerMessage = { type: "result"; summary: SyncSummary } | { type: "error"; error: string };

let cancelled = false;

parentPort?.on("message", (payload: unknown) => {
    if (payload && typeof payload === "object" && (payload as { type?: string }).type === "cancel") {
        cancelled = true;
    }
});

async function run(): Promise<void> {
    const payload = workerData as WorkerInput;
    if (!payload?.dbPath) throw new Error("Missing worker dbPath");
    if (!payload?.credentials?.id) throw new Error("Missing worker credentials");

    setSqlitePathOverride(payload.dbPath);
    const summary = await syncAccountMailboxWithCredentials(payload.credentials, {
        isCancelled: () => cancelled,
    });
    const message: WorkerMessage = {type: "result", summary};
    parentPort?.postMessage(message);
}

void run().catch((error: unknown) => {
    const message: WorkerMessage = {
        type: "error",
        error: (error as any)?.message || String(error),
    };
    parentPort?.postMessage(message);
});
