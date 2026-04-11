import type {BrowserWindow, MessageBoxOptions} from 'electron';
import {dialog} from 'electron';
import path from 'node:path';

const RISKY_FILE_EXTENSIONS = new Set([
    '.apk',
    '.appimage',
    '.bat',
    '.cmd',
    '.com',
    '.cpl',
    '.deb',
    '.dmg',
    '.exe',
    '.gadget',
    '.hta',
    '.jar',
    '.js',
    '.jse',
    '.lnk',
    '.mjs',
    '.msi',
    '.msp',
    '.msu',
    '.pif',
    '.pkg',
    '.ps1',
    '.ps1xml',
    '.psc1',
    '.psc2',
    '.reg',
    '.rpm',
    '.scr',
    '.sh',
    '.vb',
    '.vbe',
    '.vbs',
    '.ws',
    '.wsc',
    '.wsf',
    '.wsh',
]);

const RISKY_MIME_TYPES = new Set([
    'application/java-archive',
    'application/vnd.android.package-archive',
    'application/vnd.microsoft.portable-executable',
    'application/x-apple-diskimage',
    'application/x-bat',
    'application/x-csh',
    'application/x-debian-package',
    'application/x-dosexec',
    'application/x-executable',
    'application/x-msdos-program',
    'application/x-msdownload',
    'application/x-msi',
    'application/x-redhat-package-manager',
    'application/x-rpm',
    'application/x-sh',
    'application/x-shellscript',
    'text/javascript',
    'text/x-shellscript',
]);

export function isRiskyFileOpenTarget(filename: string, mimeType?: string | null): boolean {
    const normalizedName = String(filename || '').trim().toLowerCase();
    const ext = path.extname(normalizedName);
    if (ext && RISKY_FILE_EXTENSIONS.has(ext)) {
        return true;
    }
    const normalizedMime = String(mimeType || '').trim().toLowerCase();
    if (!normalizedMime) return false;
    if (RISKY_MIME_TYPES.has(normalizedMime)) {
        return true;
    }
    return normalizedMime.includes('x-msdownload') || normalizedMime.includes('x-dosexec');
}

export async function confirmRiskyFileOpen(
    parentWindow: BrowserWindow | undefined,
    filename: string,
    sourceLabel: 'attachment' | 'cloud file',
): Promise<boolean> {
    const dialogOptions: MessageBoxOptions = {
        type: 'warning',
        title: 'Potentially unsafe file',
        message: `Open ${sourceLabel}?`,
        detail:
            `This file type can run code on your system:\n\n${filename}\n\n` +
            'Only open files from trusted senders/sources.',
        buttons: ['Open anyway', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
    };
    const result = parentWindow
        ? await dialog.showMessageBox(parentWindow, dialogOptions)
        : await dialog.showMessageBox(dialogOptions);
    return result.response === 0;
}
