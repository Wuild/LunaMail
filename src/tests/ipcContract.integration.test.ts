import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PRELOAD_PATH = path.join(ROOT, 'src/preload/index.ts');
const MAIN_IPC_DIR = path.join(ROOT, 'src/main/ipc');

function collectFiles(dirPath: string, out: string[]): void {
    const entries = fs.readdirSync(dirPath, {withFileTypes: true});
    for (const entry of entries) {
        const abs = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            collectFiles(abs, out);
            continue;
        }
        if (entry.isFile() && abs.endsWith('.ts')) {
            out.push(abs);
        }
    }
}

function extractInvokeChannels(source: string): Set<string> {
    const channels = new Set<string>();
    const regex = /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g;
    let match = regex.exec(source);
    while (match) {
        channels.add(match[1]);
        match = regex.exec(source);
    }
    return channels;
}

function extractHandleChannels(source: string): Set<string> {
    const channels = new Set<string>();
    const regex = /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g;
    let match = regex.exec(source);
    while (match) {
        channels.add(match[1]);
        match = regex.exec(source);
    }
    return channels;
}

test('critical preload invoke channels are registered in main IPC handlers', () => {
    const preloadSource = fs.readFileSync(PRELOAD_PATH, 'utf8');
    const preloadInvokeChannels = extractInvokeChannels(preloadSource);

    const mainIpcFiles: string[] = [];
    collectFiles(MAIN_IPC_DIR, mainIpcFiles);
    const mainHandleChannels = new Set<string>();
    for (const filePath of mainIpcFiles) {
        const source = fs.readFileSync(filePath, 'utf8');
        for (const channel of extractHandleChannels(source)) {
            mainHandleChannels.add(channel);
        }
    }

    const criticalChannels = [
        'get-accounts',
        'add-account',
        'update-account',
        'delete-account',
        'get-folders',
        'get-folder-messages',
        'get-message',
        'get-message-body',
        'set-message-read',
        'set-message-flagged',
        'set-message-tag',
        'move-message',
        'delete-message',
        'send-email',
        'save-draft',
        'update-app-settings',
        'get-auto-update-state',
        'check-for-updates',
    ];

    for (const channel of criticalChannels) {
        assert.equal(preloadInvokeChannels.has(channel), true, `Missing preload invoke channel: ${channel}`);
        assert.equal(mainHandleChannels.has(channel), true, `Missing main ipcMain.handle channel: ${channel}`);
    }

    const missingFromMain = [...preloadInvokeChannels].filter((channel) => !mainHandleChannels.has(channel));
    assert.deepEqual(
        missingFromMain,
        [],
        `Preload invoke channels missing main handlers: ${missingFromMain.join(', ')}`,
    );
});
