import type {IpcMain, IpcMainInvokeEvent} from 'electron';

let trustedSenderGuardInstalled = false;

export function installTrustedSenderGuard(ipcMain: IpcMain): void {
    if (trustedSenderGuardInstalled) return;
    trustedSenderGuardInstalled = true;

    const originalHandle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = ((channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => any) => {
        const wrapped = async (event: IpcMainInvokeEvent, ...args: any[]) => {
            assertTrustedSender(event, channel);
            return await listener(event, ...args);
        };
        return originalHandle(channel, wrapped);
    }) as IpcMain['handle'];
}

function assertTrustedSender(event: IpcMainInvokeEvent, channel: string): void {
    const senderUrl = String(event.senderFrame?.url || event.sender.getURL() || '').trim();
    if (isTrustedSenderUrl(senderUrl)) return;
    throw new Error(`Blocked IPC call on "${channel}" from untrusted sender URL: ${senderUrl || '<empty>'}`);
}

function isTrustedSenderUrl(url: string): boolean {
    if (!url) return false;
    if (url.startsWith('file://')) return true;
    try {
        const parsed = new URL(url);
        const isDevHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
        const isDevPort = parsed.port === '5174';
        const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
        const isWindowEntrypoint = parsed.pathname === '/window.html' || parsed.pathname.endsWith('/window.html');
        return isHttp && isDevHost && isDevPort && isWindowEntrypoint;
    } catch {
        return false;
    }
}
