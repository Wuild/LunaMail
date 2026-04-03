import React, {useEffect, useState} from 'react';
import type {AppSettings} from '../../preload';
import {cn} from '../lib/utils';

const defaultSettings: AppSettings = {
    language: 'system',
    theme: 'system',
    minimizeToTray: true,
    syncIntervalMinutes: 2,
};

export default function AppSettingsPage() {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    useEffect(() => {
        window.electronAPI.getAppSettings().then((next) => {
            setSettings(next);
        }).catch(() => undefined);
        const off = window.electronAPI.onAppSettingsUpdated?.((next) => {
            setSettings(next);
        });
        return () => {
            if (typeof off === 'function') off();
        };
    }, []);

    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const applyTheme = (next: AppSettings) => {
            const useDark = next.theme === 'dark' || (next.theme === 'system' && media.matches);
            document.documentElement.classList.toggle('dark', useDark);
            document.body.classList.toggle('dark', useDark);
        };
        applyTheme(settings);
        const onChange = () => applyTheme(settings);
        media.addEventListener('change', onChange);
        return () => {
            media.removeEventListener('change', onChange);
        };
    }, [settings]);

    async function onSave() {
        if (saving) return;
        setSaving(true);
        setStatus('Saving...');
        try {
            const saved = await window.electronAPI.updateAppSettings(settings);
            setSettings(saved);
            setStatus('Settings saved.');
            window.close();
        } catch (e: any) {
            setStatus(`Save failed: ${e?.message || String(e)}`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
            <div className="flex h-full flex-col">
                <header
                    className="border-b border-slate-200 bg-white px-5 py-4 dark:border-[#3a3d44] dark:bg-[#1f2125]">
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">App Settings</h1>
                </header>

                <main className="min-h-0 flex-1 overflow-auto p-5">
                    <div
                        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                        <div className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Theme</span>
                            <div
                                className="inline-flex w-full overflow-hidden rounded-md border border-slate-300 dark:border-[#3a3d44]">
                                {[
                                    {value: 'light', label: 'Light'},
                                    {value: 'dark', label: 'Dark'},
                                    {value: 'system', label: 'System'},
                                ].map((option) => {
                                    const active = settings.theme === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            className={cn(
                                                'h-10 flex-1 border-r border-slate-300 text-sm transition-colors last:border-r-0 dark:border-[#3a3d44]',
                                                active
                                                    ? 'bg-sky-600 text-white dark:bg-[#5865f2]'
                                                    : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]',
                                            )}
                                            onClick={() => setSettings((prev) => ({
                                                ...prev,
                                                theme: option.value as AppSettings['theme']
                                            }))}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Language</span>
                            <select
                                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2] dark:focus:ring-[#5865f2]/30"
                                value={settings.language}
                                onChange={(e) => setSettings((prev) => ({
                                    ...prev,
                                    language: e.target.value as AppSettings['language']
                                }))}
                            >
                                <option value="system">System default</option>
                                <option value="en-US">English (US)</option>
                                <option value="sv-SE">Swedish</option>
                            </select>
                        </label>

                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Auto sync interval (minutes)</span>
                            <select
                                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2] dark:focus:ring-[#5865f2]/30"
                                value={settings.syncIntervalMinutes}
                                onChange={(e) => setSettings((prev) => ({
                                    ...prev,
                                    syncIntervalMinutes: Number(e.target.value || 2)
                                }))}
                            >
                                {[1, 2, 5, 10, 15, 30, 60].map((m) => (
                                    <option key={m} value={m}>
                                        Every {m} minute{m > 1 ? 's' : ''}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label
                            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm dark:border-[#3a3d44]">
                            <span className="text-slate-700 dark:text-slate-200">Minimize to tray</span>
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-sky-600 dark:accent-[#5865f2]"
                                checked={settings.minimizeToTray}
                                onChange={(e) => setSettings((prev) => ({...prev, minimizeToTray: e.target.checked}))}
                            />
                        </label>
                    </div>
                </main>

                <footer
                    className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3 dark:border-[#3a3d44] dark:bg-[#1f2125]">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{status || ' '}</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                            onClick={() => window.close()}
                        >
                            Close
                        </button>
                        <button
                            type="button"
                            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                            onClick={() => void onSave()}
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
