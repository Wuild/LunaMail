export function parsePositiveInt(value: unknown, fieldName: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return parsed;
}

export function parseOptionalPositiveInt(value: unknown, fieldName: string): number | null {
    if (value === null || value === undefined || value === '') return null;
    return parsePositiveInt(value, fieldName);
}

export function parseOptionalText(value: unknown, fieldName: string, maxLength = 1024): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') {
        throw new Error(`Invalid ${fieldName}`);
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > maxLength) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return trimmed;
}

export function parseRequiredText(value: unknown, fieldName: string, maxLength = 1024): string {
    const parsed = parseOptionalText(value, fieldName, maxLength);
    if (!parsed) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return parsed;
}

export function parseOptionalObject(value: unknown, fieldName: string): Record<string, unknown> | null {
    if (value === null || value === undefined) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return value as Record<string, unknown>;
}

export function parseRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
    const parsed = parseOptionalObject(value, fieldName);
    if (!parsed) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return parsed;
}

export function parseOptionalLimit(value: unknown, fallback: number, min: number, max: number): number {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
}
