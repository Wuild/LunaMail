import React from 'react';
import WindowTitleBar from '../components/WindowTitleBar';
import {useAppTheme} from '../hooks/useAppTheme';

const shortcuts = [
    {action: 'Compose new email', keys: 'Ctrl/Cmd + N'},
    {action: 'Reply', keys: 'Ctrl/Cmd + R'},
    {action: 'Reply all', keys: 'Ctrl/Cmd + Shift + R'},
    {action: 'Forward', keys: 'Ctrl/Cmd + Shift + F'},
    {action: 'Sync account', keys: 'Ctrl/Cmd + Shift + S'},
    {action: 'Close child window', keys: 'Escape'},
];

export default function SupportPage({embedded = false}: { embedded?: boolean }) {
    useAppTheme();

    return (
        <div className="h-full w-full overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
            <div className="flex h-full flex-col">
                {!embedded && <WindowTitleBar title="Support"/>}
                <header
                    className="border-b border-slate-200 bg-white px-5 py-4 dark:border-[#3a3d44] dark:bg-[#1f2125]">
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Support</h1>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Keyboard shortcuts and quick help</p>
                </header>

                <main className="min-h-0 flex-1 overflow-auto p-5">
                    <div
                        className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-[#3a3d44] dark:bg-[#2b2d31]/70">
                        <section
                            className="rounded-xl border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                        <div
                            className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-[#3a3d44] dark:text-slate-100">
                            Keyboard Shortcuts
                        </div>
                        <div className="divide-y divide-slate-200 dark:divide-[#3a3d44]">
                            {shortcuts.map((shortcut) => (
                                <div key={shortcut.action}
                                     className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                                    <span className="text-slate-700 dark:text-slate-200">{shortcut.action}</span>
                                    <kbd
                                        className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700 dark:border-[#4a4d55] dark:bg-[#1f2125] dark:text-slate-200">
                                        {shortcut.keys}
                                    </kbd>
                                </div>
                            ))}
                        </div>
                        </section>

                        <section
                            className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Anti-spoof check tips</h2>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
                                <li>Open Message Details in preview to inspect full sender address and Message-ID.</li>
                                <li>Be careful when display name email and actual sender email are different.</li>
                                <li>Do not trust links from suspicious sender domains.</li>
                            </ul>
                        </section>
                    </div>
                </main>

                {!embedded && (
                    <footer
                        className="flex items-center justify-end border-t border-slate-200 bg-white px-5 py-3 dark:border-[#3a3d44] dark:bg-[#1f2125]">
                        <button
                            type="button"
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                            onClick={() => window.close()}
                        >
                            Close
                        </button>
                    </footer>
                )}
            </div>
        </div>
    );
}
