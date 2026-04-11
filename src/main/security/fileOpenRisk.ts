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
    '.desktop',
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
    '.pl',
    '.py',
    '.pkg',
    '.ps1',
    '.ps1xml',
    '.psc1',
    '.psc2',
    '.reg',
    '.rpm',
    '.scr',
    '.service',
    '.sh',
    '.run',
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
    'application/x-desktop',
    'application/x-dosexec',
    'application/x-executable',
    'application/x-msdos-program',
    'application/x-msdownload',
    'application/x-msi',
    'application/x-redhat-package-manager',
    'application/x-rpm',
    'application/x-sh',
    'application/x-shellscript',
    'text/x-python',
    'text/x-perl',
    'text/x-php',
    'text/javascript',
    'text/x-shellscript',
]);

export function isRiskyFileOpenTarget(filename: string, mimeType?: string | null, content?: Buffer): boolean {
    const normalizedName = String(filename || '')
        .trim()
        .toLowerCase();
    const ext = path.extname(normalizedName);
    if (ext && RISKY_FILE_EXTENSIONS.has(ext)) {
        return true;
    }
    const normalizedMime = String(mimeType || '')
        .trim()
        .toLowerCase();
    if (!normalizedMime) return false;
    if (RISKY_MIME_TYPES.has(normalizedMime)) {
        return true;
    }
    if (normalizedMime.includes('x-msdownload') || normalizedMime.includes('x-dosexec')) {
        return true;
    }
    if (!content || content.length === 0) return false;
    if (isExecutableMagic(content)) return true;
    if (hasScriptShebang(content)) return true;
    return false;
}

export async function confirmRiskyFileOpen(
    parentWindow: BrowserWindow | undefined,
    filename: string,
    sourceLabel: 'attachment' | 'cloud file',
): Promise<boolean> {
    return confirmFileOpen(parentWindow, filename, sourceLabel, true);
}

export async function confirmFileOpen(
    parentWindow: BrowserWindow | undefined,
    filename: string,
    sourceLabel: 'attachment' | 'cloud file',
    isRisky: boolean,
): Promise<boolean> {
    const dialogOptions: MessageBoxOptions = {
        type: 'warning',
        title: isRisky ? 'Potentially unsafe file' : 'Open file from message?',
        message: `Open ${sourceLabel}?`,
        detail: isRisky
            ? `This file type can run code on your system:\n\n${filename}\n\nOnly open files from trusted senders/sources.`
            : `This file will be opened with your system default application:\n\n${filename}`,
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

function isExecutableMagic(content: Buffer): boolean {
    if (content.length >= 4) {
        if (content[0] === 0x7f && content[1] === 0x45 && content[2] === 0x4c && content[3] === 0x46) {
            return true; // ELF
        }
    }
    if (content.length >= 2) {
        if (content[0] === 0x4d && content[1] === 0x5a) {
            return true; // PE/EXE
        }
    }
    return false;
}

function hasScriptShebang(content: Buffer): boolean {
    const head = content
        .subarray(0, Math.min(256, content.length))
        .toString('utf8')
        .replace(/^\uFEFF/, '');
    if (!head.startsWith('#!')) return false;
    const firstLine = head.split(/\r?\n/, 1)[0].toLowerCase();
    return (
        firstLine.includes('/sh') ||
        firstLine.includes('/bash') ||
        firstLine.includes('/zsh') ||
        firstLine.includes('/ksh') ||
        firstLine.includes('/dash') ||
        firstLine.includes('/python') ||
        firstLine.includes('/perl') ||
        firstLine.includes('/ruby') ||
        firstLine.includes('/node') ||
        firstLine.includes('/php')
    );
}
