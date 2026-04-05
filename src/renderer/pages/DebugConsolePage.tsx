import React, {useEffect, useMemo, useRef, useState} from 'react';
import type {DebugLogEntry} from '../../preload';
import WindowTitleBar from '../components/WindowTitleBar';
import {useAppTheme} from '../hooks/useAppTheme';

const SOURCE_OPTIONS: Array<{ value: DebugLogEntry['source']; label: string }> = [
    {value: 'imap', label: 'IMAP'},
    {value: 'smtp', label: 'SMTP'},
    {value: 'carddav', label: 'CardDav'},
    {value: 'caldav', label: 'CalDav'},
    {value: 'app', label: 'App'},
];

export default function DebugConsolePage({embedded = false}: { embedded?: boolean }) {
    useAppTheme();
    const [logs, setLogs] = useState<DebugLogEntry[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const [selectedSources, setSelectedSources] = useState<DebugLogEntry['source'][]>(
        SOURCE_OPTIONS.map((option) => option.value),
    );
    const listRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let active = true;
        window.electronAPI.getDebugLogs(1000).then((initial) => {
            if (!active) return;
            setLogs(initial);
        }).catch(() => undefined);

        const off = window.electronAPI.onDebugLog?.((entry) => {
            setLogs((prev) => {
                const next = [...prev, entry];
                if (next.length > 2000) return next.slice(next.length - 2000);
                return next;
            });
        });
        return () => {
            active = false;
            if (typeof off === 'function') off();
        };
    }, []);

    useEffect(() => {
        if (!autoScroll) return;
        const list = listRef.current;
        if (!list) return;
        list.scrollTop = list.scrollHeight;
    }, [logs, autoScroll]);

    const renderedLogs = useMemo(
        () => logs.map((entry) => ({
            ...entry,
            timestampLabel: new Date(entry.timestamp).toLocaleTimeString(),
        })),
        [logs],
    );
    const filteredLogs = useMemo(() => {
        const selected = new Set(selectedSources);
        return renderedLogs.filter((entry) => selected.has(entry.source));
    }, [renderedLogs, selectedSources]);

    function onClear(): void {
        void window.electronAPI.clearDebugLogs().then(() => {
            setLogs([]);
        }).catch(() => undefined);
    }

    function onToggleSource(source: DebugLogEntry['source']): void {
        setSelectedSources((prev) => {
            if (prev.includes(source)) {
                if (prev.length === 1) return prev;
                return prev.filter((item) => item !== source);
            }
            return [...prev, source];
        });
    }

    return (
        <div className="h-full w-full overflow-hidden bg-slate-100 dark:bg-[#23252b]">
            <div className="flex h-full flex-col">
                {!embedded && <WindowTitleBar title="Debug Console"/>}
                <header
                    className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-[#3a3d44] dark:bg-[#1a1c21]">
                    <div>
                        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Debug Console</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Live logs with source filters (IMAP, SMTP, CardDav, CalDav, App)
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={autoScroll}
                                onChange={(event) => setAutoScroll(event.target.checked)}
                            />
                            Auto-scroll
                        </label>
                        <button
                            type="button"
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#2f3238]"
                            onClick={onClear}
                        >
                            Clear
                        </button>
                        {!embedded && (
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#2f3238]"
                                onClick={() => window.close()}
                            >
                                Close
                            </button>
                        )}
                    </div>
                </header>
                <div
                    className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-[#3a3d44] dark:bg-[#1a1c21]">
                    {SOURCE_OPTIONS.map((option) => {
                        const checked = selectedSources.includes(option.value);
                        return (
                            <label
                                key={option.value}
                                className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-[#3a3d44] dark:text-slate-200"
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggleSource(option.value)}
                                />
                                {option.label}
                            </label>
                        );
                    })}
                </div>
                <main className="min-h-0 flex-1 p-3">
                    <div
                        ref={listRef}
                        className="h-full overflow-auto rounded-lg border border-slate-200 bg-[#0d1117] p-3 font-mono text-xs leading-5 text-slate-100 select-text [&_*]:select-text dark:border-[#3a3d44]"
                    >
                        {logs.length === 0 && (
                            <div className="text-slate-400">No debug events yet.</div>
                        )}
                        {logs.length > 0 && filteredLogs.length === 0 && (
                            <div className="text-slate-400">No events match current source filters.</div>
                        )}
                        {filteredLogs.map((entry) => (
                            <div key={entry.id} className="whitespace-pre-wrap break-words">
                                <span className="text-slate-400">[{entry.timestampLabel}]</span>{' '}
                                <span className={levelClass(entry.level)}>{entry.level.toUpperCase()}</span>{' '}
                                <span className="text-cyan-300">{entry.source}</span>{' '}
                                <span className="text-amber-300">{entry.scope}</span>{' '}
                                <span className="text-slate-100">{entry.message}</span>
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
}

function levelClass(level: DebugLogEntry['level']): string {
    if (level === 'error' || level === 'fatal') return 'text-rose-400';
    if (level === 'warn') return 'text-amber-400';
    if (level === 'info') return 'text-emerald-400';
    if (level === 'debug') return 'text-sky-400';
    return 'text-violet-300';
}
