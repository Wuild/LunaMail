import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PRELOAD_PATH = path.join(ROOT, 'src/preload/index.ts');
const USE_ACCOUNTS_PATH = path.join(ROOT, 'src/renderer/hooks/ipc/useAccounts.ts');
const USE_AUTO_UPDATE_STATE_PATH = path.join(ROOT, 'src/renderer/hooks/ipc/useAutoUpdateState.ts');
const MAIN_WINDOW_APP_PATH = path.join(ROOT, 'src/renderer/MainWindowApp.tsx');

function read(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
}

test('preload exposes account and update event subscriptions', () => {
    const preload = read(PRELOAD_PATH);
    const requiredApiMethods = [
        'onAccountAdded',
        'onAccountUpdated',
        'onAccountDeleted',
        'onUnreadCountUpdated',
        'onAutoUpdateStatus',
    ];

    for (const method of requiredApiMethods) {
        assert.equal(preload.includes(`${method}: (callback:`), true, `Missing preload API method: ${method}`);
    }
});

test('renderer hooks subscribe to expected account/update events', () => {
    const useAccounts = read(USE_ACCOUNTS_PATH);
    const useAutoUpdateState = read(USE_AUTO_UPDATE_STATE_PATH);

    assert.equal(useAccounts.includes('useIpcEvent(ipcClient.onAccountAdded'), true);
    assert.equal(useAccounts.includes('useIpcEvent(ipcClient.onAccountUpdated'), true);
    assert.equal(useAccounts.includes('useIpcEvent(ipcClient.onAccountDeleted'), true);
    assert.equal(useAccounts.includes('useIpcEvent(ipcClient.onUnreadCountUpdated'), true);
    assert.equal(useAutoUpdateState.includes('useIpcEvent(ipcClient.onAutoUpdateStatus'), true);
});

test('main window uses shared account/update hooks for indicators', () => {
    const source = read(MAIN_WINDOW_APP_PATH);
    assert.equal(
        source.includes('const {accounts, selectedAccountId, setSelectedAccountId, totalUnreadCount} = useAccounts();'),
        true,
    );
    assert.equal(
        source.includes('const {appVersion, autoUpdatePhase, autoUpdateMessage} = useAutoUpdateState();'),
        true,
    );
});
