export function isSslMode(value: number | null | undefined): boolean {
    return Number(value) === 1;
}

export function resolveImapSecurity(value: number | null | undefined): {
    secure: boolean;
    doSTARTTLS: boolean;
} {
    const secure = isSslMode(value);
    return {
        secure,
        doSTARTTLS: !secure,
    };
}

export function resolveSmtpSecurity(value: number | null | undefined): {
    secure: boolean;
    requireTLS: boolean;
} {
    const secure = isSslMode(value);
    return {
        secure,
        requireTLS: !secure,
    };
}
