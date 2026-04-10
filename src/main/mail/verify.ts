import {ImapFlow} from 'imapflow';
import nodemailer from 'nodemailer';
import tls from 'tls';
import net from 'net';
import {createMailDebugLogger} from '@main/debug/debugLog.js';

export interface VerifyPayload {
    type: 'imap' | 'pop3' | 'smtp';
    host: string;
    port: number;
    secure: boolean; // TLS from start
    user: string;
    password: string;
}

export interface VerifyResult {
    ok: boolean;
    error?: string;
    details?: any;
}

export async function verifyConnection(p: VerifyPayload): Promise<VerifyResult> {
    try {
        switch (p.type) {
            case 'imap':
                await verifyImap(p);
                return {ok: true};
            case 'smtp':
                await verifySmtp(p);
                return {ok: true};
            case 'pop3':
                await verifyPop3(p);
                return {ok: true};
            default:
                return {ok: false, error: `Unsupported type: ${String((p as any).type)}`};
        }
    } catch (e: any) {
        return {ok: false, error: formatVerifyError(e)};
    }
}

async function verifyImap(p: VerifyPayload): Promise<void> {
    const client = new ImapFlow({
        host: p.host,
        port: p.port,
        secure: p.secure,
        doSTARTTLS: !p.secure,
        auth: {user: p.user, pass: p.password},
        logger: createMailDebugLogger('imap', `verify:${p.host}:${p.port}`),
    });
    try {
        await client.connect();
        // simple NOOP by opening INBOX status
        await client.mailboxOpen('INBOX', {readOnly: true}).catch(() => undefined);
    } finally {
        try {
            await client.logout();
        } catch {
            /* ignore */
        }
    }
}

async function verifySmtp(p: VerifyPayload): Promise<void> {
    const transporter = nodemailer.createTransport({
        host: p.host,
        port: p.port,
        secure: p.secure, // true for 465, false for 587/25
        requireTLS: !p.secure,
        auth: {user: p.user, pass: p.password},
        logger: createMailDebugLogger('smtp', `verify:${p.host}:${p.port}`),
        debug: true,
    });
    await transporter.verify();
}

async function verifyPop3(p: VerifyPayload): Promise<void> {
    // Minimal POP3 check: connect, read greeting, send USER/PASS, expect +OK
    const command = (socket: net.Socket | tls.TLSSocket, cmd: string) =>
        new Promise<void>((resolve, reject) => {
            const onData = (data: Buffer) => {
                const str = data.toString();
                if (str.startsWith('+OK')) {
                    socket.removeListener('data', onData);
                    resolve();
                } else if (str.startsWith('-ERR')) {
                    socket.removeListener('data', onData);
                    reject(new Error(str.trim()));
                }
            };
            socket.on('data', onData);
            socket.write(cmd + '\r\n');
        });

    await new Promise<void>((resolve, reject) => {
        const sock = p.secure
            ? tls.connect({host: p.host, port: p.port}, onReady)
            : net.connect({host: p.host, port: p.port}, onReady);

        let greeted = false;
        sock.setTimeout(15000, () => {
            sock.destroy();
            reject(new Error('POP3 timeout'));
        });

        function onReady() {
            // Wait for greeting first
            sock.once('data', async (data: Buffer) => {
                const s = data.toString();
                if (!s.startsWith('+OK')) {
                    sock.destroy();
                    return reject(new Error('POP3 no +OK greeting'));
                }
                try {
                    await command(sock as any, `USER ${p.user}`);
                    await command(sock as any, `PASS ${p.password}`);
                    // Quit politely
                    sock.write('QUIT\r\n');
                    greeted = true;
                    sock.end();
                    resolve();
                } catch (e) {
                    sock.destroy();
                    reject(e as Error);
                }
            });
        }

        sock.on('error', (err) => reject(err));
        sock.on('close', () => {
            if (!greeted) {
                // closed before auth
            }
        });
    });
}

function formatVerifyError(err: any): string {
    const code = err?.code ? String(err.code) : '';
    const responseCode = typeof err?.responseCode === 'number' ? err.responseCode : undefined;
    const message = err?.message ? String(err.message) : '';
    const responseText = err?.responseText ? String(err.responseText) : '';
    const serverResponse = err?.serverResponse ? String(err.serverResponse) : '';
    const command = err?.command ? String(err.command) : '';

    const merged = [message, responseText, serverResponse, code, command].filter(Boolean).join(' | ');

    // Map common auth failures to a clear UI message.
    if (isCredentialFailure({merged, message, responseText, serverResponse, responseCode})) {
        return 'Wrong username or password.';
    }

    // Replace unhelpful generic failures with more context if available.
    if (/^command failed$/i.test(message) || /^command failed$/i.test(merged)) {
        if (responseText) return responseText;
        if (serverResponse) return serverResponse;
        if (code) return `Connection failed (${code}).`;
        return 'Connection failed while talking to the mail server.';
    }

    if (responseText) return responseText;
    if (serverResponse) return serverResponse;
    if (message) return message;
    if (code) return `Connection failed (${code}).`;
    return 'Connection failed.';
}

function isCredentialFailure(input: {
    merged: string;
    message: string;
    responseText: string;
    serverResponse: string;
    responseCode?: number;
}): boolean {
    const merged = input.merged.toLowerCase();
    const message = input.message.toLowerCase();
    const responseText = input.responseText.toLowerCase();
    const serverResponse = input.serverResponse.toLowerCase();
    const smtpCode = input.responseCode;

    if (smtpCode === 535 || smtpCode === 534) return true;

    const definitelyNotCredentials =
        /(timeout|timed out|enotfound|econnrefused|ehostunreach|certificate|ssl|tls|self[- ]signed|unsupported|mechanism|network|dns)/i.test(
            merged,
        );
    if (definitelyNotCredentials) return false;

    const authIndicators = [
        /wrong username or password/i,
        /invalid credentials?/i,
        /authentication failed/i,
        /login failed/i,
        /auth failed/i,
        /username and password not accepted/i,
        /\b535\b/,
        /bad credentials/i,
        /invalid login/i,
    ];
    return authIndicators.some(
        (pattern) =>
            pattern.test(message) || pattern.test(responseText) || pattern.test(serverResponse) || pattern.test(merged),
    );
}
