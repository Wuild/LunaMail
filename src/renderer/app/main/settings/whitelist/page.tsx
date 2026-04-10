import {useState} from 'react';
import type {AppSettings} from '@/preload';
import {useAppSettings as useIpcAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {ipcClient} from '@renderer/lib/ipcClient';
import {DEFAULT_APP_SETTINGS} from '@/shared/defaults';
import {normalizeAllowlistEntry} from '@renderer/features/mail/remoteContent';
import {Button} from '@renderer/components/ui/button';
import {FormCheckbox, FormInput} from '@renderer/components/ui/FormControls';

export default function SettingsWhitelistPage() {
    const {appSettings: settings, setAppSettings: setSettings} = useIpcAppSettings(DEFAULT_APP_SETTINGS);
    const [status, setStatus] = useState<string | null>(null);
    const [remoteAllowlistInput, setRemoteAllowlistInput] = useState('');

    async function applySettingsPatch(patch: Partial<AppSettings>): Promise<boolean> {
        setSettings((prev) => ({...prev, ...patch}));
        setStatus('Saving...');
        try {
            const saved = await ipcClient.updateAppSettings(patch);
            setSettings(saved);
            setStatus('Settings saved.');
            return true;
        } catch (e: any) {
            const latest = await ipcClient.getAppSettings().catch(() => null);
            if (latest) setSettings(latest);
            setStatus(`Save failed: ${e?.message || String(e)}`);
            return false;
        }
    }

    async function onAddRemoteAllowlistEntry(): Promise<void> {
        const normalized = normalizeAllowlistEntry(remoteAllowlistInput);
        if (!normalized) {
            setStatus('Enter a valid sender email or domain.');
            return;
        }
        const merged = [...new Set([...(settings.remoteContentAllowlist || []), normalized])];
        setRemoteAllowlistInput('');
        await applySettingsPatch({remoteContentAllowlist: merged});
    }

    async function onRemoveRemoteAllowlistEntry(entry: string): Promise<void> {
        const next = (settings.remoteContentAllowlist || []).filter((item) => item !== entry);
        await applySettingsPatch({remoteContentAllowlist: next});
    }

    return (
        <div className="mx-auto h-full min-h-0 w-full max-w-5xl space-y-4">
            <div className="panel space-y-3 rounded-xl p-4">
                <h2 className="ui-text-primary text-base font-semibold">Remote Content Whitelist</h2>
                <p className="ui-text-muted text-sm">
                    Control remote image loading and sender/domain exceptions used while viewing emails.
                </p>
                <label
                    className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Block remote content in emails</span>
                        <p className="ui-text-muted mt-1 text-xs">
                            Protects privacy by blocking external images and trackers until explicitly allowed.
                        </p>
                    </div>
                    <FormCheckbox
                        checked={settings.blockRemoteContent}
                        onChange={(event) => void applySettingsPatch({blockRemoteContent: event.target.checked})}
                    />
                </label>
                <div className="pt-1">
                    <span className="ui-text-muted mb-1 block text-xs font-medium uppercase tracking-wide">
                        Allowlist senders/domains
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                        <FormInput
                            type="text"
                            value={remoteAllowlistInput}
                            onChange={(event) => setRemoteAllowlistInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ',') {
                                    event.preventDefault();
                                    void onAddRemoteAllowlistEntry();
                                }
                            }}
                            placeholder="example.com or sender@example.com"
                            className="h-9 min-w-[260px] flex-1"
                        />
                        <Button
                            type="button"
                            onClick={() => void onAddRemoteAllowlistEntry()}
                            className="button-primary rounded-md px-3 py-2 text-xs font-medium"
                        >
                            Add
                        </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(settings.remoteContentAllowlist || []).length === 0 && (
                            <p className="ui-text-muted text-xs">No allowlist entries yet.</p>
                        )}
                        {(settings.remoteContentAllowlist || []).map((entry) => (
                            <Button
                                key={entry}
                                type="button"
                                className="button-secondary inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs"
                                onClick={() => void onRemoveRemoteAllowlistEntry(entry)}
                                title="Remove from allowlist"
                            >
                                <span>{entry}</span>
                                <span aria-hidden>×</span>
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
            {status && <div className="app-footer rounded-md px-3 py-2 text-xs ui-text-muted">{status}</div>}
        </div>
    );
}
