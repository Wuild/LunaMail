import {format} from 'node:util';

export type DebugLogSource = 'imap' | 'smtp' | 'carddav' | 'caldav' | 'cloud' | 'app';
export type DebugLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface DebugLogEntry {
    id: number;
    timestamp: string;
    source: DebugLogSource;
    level: DebugLogLevel;
    scope: string;
    message: string;
}

type DebugListener = (entry: DebugLogEntry) => void;

const MAX_DEBUG_LOGS = 2000;
const listeners = new Set<DebugListener>();
const entries: DebugLogEntry[] = [];
let nextEntryId = 1;

export function pushDebugLog(entry: Omit<DebugLogEntry, 'id' | 'timestamp'>): DebugLogEntry {
    const normalized: DebugLogEntry = {
        id: nextEntryId++,
        timestamp: new Date().toISOString(),
        source: entry.source,
        level: entry.level,
        scope: entry.scope || 'mail',
        message: sanitizeDebugText(entry.message || ''),
    };
    entries.push(normalized);
    if (entries.length > MAX_DEBUG_LOGS) {
        entries.splice(0, entries.length - MAX_DEBUG_LOGS);
    }
    for (const listener of listeners) {
        try {
            listener(normalized);
        } catch {
            // ignore listener failures
        }
    }
    return normalized;
}

export function getDebugLogs(limit = 500): DebugLogEntry[] {
    const normalizedLimit = Math.max(1, Math.min(2000, Number(limit) || 500));
    return entries.slice(-normalizedLimit);
}

export function clearDebugLogs(): void {
    entries.length = 0;
}

export function onDebugLog(listener: DebugListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

interface StructuredLogger {
    trace: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    fatal: (...args: unknown[]) => void;
    child: (bindings?: Record<string, unknown>) => StructuredLogger;
}

export function createMailDebugLogger(source: DebugLogSource, scope: string): StructuredLogger {
    return buildStructuredLogger(source, scope, null);
}

export function createAppLogger(scope: string): StructuredLogger {
    return createMailDebugLogger('app', scope);
}

function buildStructuredLogger(
    source: DebugLogSource,
    scope: string,
    bindings: Record<string, unknown> | null,
): StructuredLogger {
    const write = (level: DebugLogLevel, args: unknown[]) => {
        const text = formatLogArgs(args);
        const withBindings = bindings && Object.keys(bindings).length > 0 ? `${text} ${safeJson(bindings)}` : text;
        pushDebugLog({
            source,
            level,
            scope,
            message: withBindings,
        });
    };

    return {
        trace: (...args: unknown[]) => write('trace', args),
        debug: (...args: unknown[]) => write('debug', args),
        info: (...args: unknown[]) => write('info', args),
        warn: (...args: unknown[]) => write('warn', args),
        error: (...args: unknown[]) => write('error', args),
        fatal: (...args: unknown[]) => write('fatal', args),
        child: (childBindings?: Record<string, unknown>) =>
            buildStructuredLogger(source, scope, {
                ...(bindings ?? {}),
                ...(childBindings ?? {}),
            }),
    };
}

function formatLogArgs(args: unknown[]): string {
    if (args.length === 0) return '';
    if (args.length === 1) {
        const first = args[0];
        if (typeof first === 'string') return first;
        return safeJson(first);
    }
    if (typeof args[0] === 'string') {
        return format(...(args as Parameters<typeof format>));
    }
    return args.map((arg) => (typeof arg === 'string' ? arg : safeJson(arg))).join(' ');
}

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function sanitizeDebugText(input: string): string {
    return input
        .replace(/(pass(word)?["'\s:=]+)([^\s"',]+)/gi, '$1***')
        .replace(/("pass(word)?"\s*:\s*")([^"]+)"/gi, '$1***"')
        .replace(/(AUTH(?:ENTICATE)?\s+(?:PLAIN|LOGIN|XOAUTH2)\s+)([A-Za-z0-9+/=]+)/gi, '$1[REDACTED]');
}
