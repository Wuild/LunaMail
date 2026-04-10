import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Activity, TerminalSquare, Trash2, X} from 'lucide-react';
import type {DebugLogEntry} from '@/preload';
import {Navigate} from 'react-router-dom';
import {FormCheckbox} from '@renderer/components/ui/FormControls';
import {Button} from '@renderer/components/ui/button';
import {useAppTheme} from '@renderer/hooks/useAppTheme';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {ipcClient} from '@renderer/lib/ipcClient';

const DEBUG_FILTER_SOURCES_STORAGE_KEY = 'llamamail.debug.filters.sources';
const DEBUG_FILTER_LEVELS_STORAGE_KEY = 'llamamail.debug.filters.levels';

const SOURCE_OPTIONS: Array<{ value: DebugLogEntry['source']; label: string }> = [
    {value: 'imap', label: 'IMAP'},
    {value: 'smtp', label: 'SMTP'},
    {value: 'carddav', label: 'CardDav'},
    {value: 'caldav', label: 'CalDav'},
    {value: 'cloud', label: 'Cloud'},
    {value: 'app', label: 'App'},
];

const LEVEL_OPTIONS: Array<{ value: DebugLogEntry['level']; label: string }> = [
    {value: 'trace', label: 'Trace'},
    {value: 'debug', label: 'Debug'},
    {value: 'info', label: 'Info'},
    {value: 'warn', label: 'Warn'},
    {value: 'error', label: 'Error'},
    {value: 'fatal', label: 'Fatal'},
];

type DebugPageProps = {
    showDebugNavItem: boolean;
    embedded?: boolean;
};

export default function DebugPage({showDebugNavItem, embedded = true}: DebugPageProps) {
    if (!showDebugNavItem) {
        return <Navigate to="/settings/developer" replace/>;
    }

    useAppTheme();
    const [logs, setLogs] = useState<DebugLogEntry[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const [selectedSources, setSelectedSources] = useState<DebugLogEntry['source'][]>(
        () =>
            readStoredFilterValues<DebugLogEntry['source']>(
                DEBUG_FILTER_SOURCES_STORAGE_KEY,
                SOURCE_OPTIONS.map((option) => option.value),
            ),
    );
    const [selectedLevels, setSelectedLevels] = useState<DebugLogEntry['level'][]>(
        () =>
            readStoredFilterValues<DebugLogEntry['level']>(
                DEBUG_FILTER_LEVELS_STORAGE_KEY,
                LEVEL_OPTIONS.map((option) => option.value),
            ),
    );
    const listRef = useRef<HTMLDivElement | null>(null);
    const autoScrollManuallyDisabledRef = useRef(false);
    const suppressAutoScrollToggleRef = useRef(false);
    const userScrollIntentRef = useRef(false);
    const userScrollIntentTimerRef = useRef<number | null>(null);

    useEffect(() => {
        let active = true;
        ipcClient
            .getDebugLogs(1000)
            .then((initial) => {
                if (!active) return;
                setLogs(initial);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    useIpcEvent(ipcClient.onDebugLog, (entry) => {
        setLogs((prev) => {
            const next = [...prev, entry];
            if (next.length > 2000) return next.slice(next.length - 2000);
            return next;
        });
    });

    useEffect(() => {
        if (!autoScroll) return;
        const list = listRef.current;
        if (!list) return;
        suppressAutoScrollToggleRef.current = true;
        list.scrollTop = list.scrollHeight;
        requestAnimationFrame(() => {
            suppressAutoScrollToggleRef.current = false;
        });
    }, [logs, autoScroll]);

    useEffect(() => {
        if (!autoScroll) return;
        autoScrollManuallyDisabledRef.current = false;
    }, [autoScroll]);

    useEffect(
        () => () => {
            if (userScrollIntentTimerRef.current !== null) {
                window.clearTimeout(userScrollIntentTimerRef.current);
                userScrollIntentTimerRef.current = null;
            }
        },
        [],
    );

    useEffect(() => {
        writeStoredFilterValues(DEBUG_FILTER_SOURCES_STORAGE_KEY, selectedSources);
    }, [selectedSources]);

    useEffect(() => {
        writeStoredFilterValues(DEBUG_FILTER_LEVELS_STORAGE_KEY, selectedLevels);
    }, [selectedLevels]);

    const renderedLogs = useMemo(
        () =>
            logs.map((entry) => ({
                ...entry,
                timestampLabel: formatLocalLogTime(entry.timestamp),
            })),
        [logs],
    );
    const filteredLogs = useMemo(() => {
        const selectedSourceSet = new Set(selectedSources);
        const selectedLevelSet = new Set(selectedLevels);
        return renderedLogs.filter((entry) => {
            if (selectedSourceSet.size === 0 && selectedLevelSet.size === 0) return false;
            if (selectedSourceSet.size > 0 && !selectedSourceSet.has(entry.source)) return false;
            if (selectedLevelSet.size > 0 && !selectedLevelSet.has(entry.level)) return false;
            return true;
        });
    }, [renderedLogs, selectedSources, selectedLevels]);
    const selectedSourceSet = useMemo(() => new Set(selectedSources), [selectedSources]);
    const selectedLevelSet = useMemo(() => new Set(selectedLevels), [selectedLevels]);

    function onClear(): void {
        void ipcClient
            .clearDebugLogs()
            .then(() => {
                setLogs([]);
            })
            .catch(() => undefined);
    }

    function onToggleSource(source: DebugLogEntry['source']): void {
        setSelectedSources((prev) => {
            if (prev.includes(source)) return prev.filter((item) => item !== source);
            return [...prev, source];
        });
    }

    function onToggleLevel(level: DebugLogEntry['level']): void {
        setSelectedLevels((prev) => {
            if (prev.includes(level)) return prev.filter((item) => item !== level);
            return [...prev, level];
        });
    }

    function onLogScroll(event: React.UIEvent<HTMLDivElement>): void {
        if (suppressAutoScrollToggleRef.current) return;
        const node = event.currentTarget;
        const threshold = 24;
        const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
        const atBottom = distanceFromBottom <= threshold;
        if (!atBottom && autoScroll && userScrollIntentRef.current) {
            autoScrollManuallyDisabledRef.current = true;
            setAutoScroll(false);
            return;
        }
        if (atBottom && !autoScroll && autoScrollManuallyDisabledRef.current) {
            autoScrollManuallyDisabledRef.current = false;
            setAutoScroll(true);
        }
    }

    function markUserScrollIntent(): void {
        userScrollIntentRef.current = true;
        if (userScrollIntentTimerRef.current !== null) {
            window.clearTimeout(userScrollIntentTimerRef.current);
        }
        userScrollIntentTimerRef.current = window.setTimeout(() => {
            userScrollIntentRef.current = false;
            userScrollIntentTimerRef.current = null;
        }, 250);
    }

    return (
        <div className="debug-page-surface h-full w-full overflow-hidden">
            <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1 overflow-hidden p-3">
                    <div className="flex h-full min-h-0 flex-col gap-3">
                        <header className="debug-card rounded-xl p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h1 className="ui-text-primary flex items-center gap-2 text-base font-semibold">
                                        <TerminalSquare size={16}/>
                                        Debug Console
                                    </h1>
                                    <p className="debug-muted mt-1 text-xs">
                                        Live runtime events with simple source and level filters.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label
                                        className="debug-card debug-muted inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs">
                                        <FormCheckbox
                                            checked={autoScroll}
                                            onChange={(event) => {
                                                autoScrollManuallyDisabledRef.current = !event.target.checked;
                                                setAutoScroll(event.target.checked);
                                            }}
                                        />
                                        Auto-scroll
                                    </label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        leftIcon={<Trash2 size={14}/>}
                                        onClick={onClear}
                                    >
                                        Clear
                                    </Button>
                                    {!embedded && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            leftIcon={<X size={14}/>}
                                            onClick={() => window.close()}
                                        >
                                            Close
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </header>

                        <section className="debug-card rounded-xl p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
									<span
                                        className="debug-muted shrink-0 text-[11px] font-semibold uppercase tracking-wide">
										Sources
									</span>
                                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                                        {SOURCE_OPTIONS.map((option) => {
                                            const active = selectedSourceSet.has(option.value);
                                            return (
                                                <ToolbarToggleButton
                                                    key={option.value}
                                                    label={option.label}
                                                    active={active}
                                                    onClick={() => onToggleSource(option.value)}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="flex min-w-0 items-center justify-end gap-2">
									<span
                                        className="debug-muted shrink-0 text-[11px] font-semibold uppercase tracking-wide">
										Levels
									</span>
                                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                                        {LEVEL_OPTIONS.map((option) => {
                                            const active = selectedLevelSet.has(option.value);
                                            return (
                                                <ToolbarToggleButton
                                                    key={option.value}
                                                    label={option.label}
                                                    active={active}
                                                    onClick={() => onToggleLevel(option.value)}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <main className="min-h-0 flex-1">
                            <div
                                className="debug-log-shell flex h-full min-h-0 flex-col overflow-hidden rounded-xl select-text"
                            >
                                <div
                                    ref={listRef}
                                    onScroll={onLogScroll}
                                    onWheel={markUserScrollIntent}
                                    onMouseDown={markUserScrollIntent}
                                    onTouchStart={markUserScrollIntent}
                                    className="debug-log-text min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-5 select-text [&_*]:select-text"
                                >
                                    {logs.length === 0 && (
                                        <div
                                            className="debug-log-empty flex h-full min-h-[120px] items-center justify-center">
                                            <Activity size={14} className="mr-2"/>
                                            No debug events yet.
                                        </div>
                                    )}
                                    {logs.length > 0 && filteredLogs.length === 0 && (
                                        <div
                                            className="debug-log-empty flex h-full min-h-[120px] items-center justify-center">
                                            <Activity size={14} className="mr-2"/>
                                            No events match current filters.
                                        </div>
                                    )}
                                    {filteredLogs.map((entry, index) => (
                                        <div
                                            key={`${entry.id}:${entry.timestamp}:${index}`}
                                            style={{overflowWrap: 'anywhere', wordBreak: 'break-word'}}
                                            className="whitespace-pre-wrap break-words"
                                        >
                                            <span className="debug-log-timestamp">[{entry.timestampLabel}]</span>{' '}
                                            <span
                                                className={levelClass(entry.level)}>{entry.level.toUpperCase()}</span>{' '}
                                            <span className="debug-log-source">{entry.source}</span>{' '}
                                            <span className="debug-log-scope">{entry.scope}</span>{' '}
                                            <span>{entry.message}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </main>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ToolbarToggleButton({label, active, onClick}: { label: string; active: boolean; onClick: () => void }) {
    return (
        <Button
            type="button"
            onClick={onClick}
            className={`debug-toggle h-7 rounded-md px-2.5 text-xs font-medium ${active ? 'is-active' : ''}`}
        >
            {label}
        </Button>
    );
}

function levelClass(level: DebugLogEntry['level']): string {
    if (level === 'error' || level === 'fatal') return 'debug-level-error';
    if (level === 'warn') return 'debug-level-warn';
    if (level === 'info') return 'debug-level-info';
    if (level === 'debug') return 'debug-level-debug';
    return 'debug-level-trace';
}

function formatLocalLogTime(timestamp: string): string {
    const value = new Date(timestamp);
    if (Number.isNaN(value.getTime())) return timestamp;
    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
    }).format(value);
}

function readStoredFilterValues<T extends string>(storageKey: string, allowedValues: T[]): T[] {
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return [...allowedValues];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [...allowedValues];
        const allowedSet = new Set<T>(allowedValues);
        const unique: T[] = [];
        for (const item of parsed) {
            if (typeof item !== 'string') continue;
            const value = item as T;
            if (!allowedSet.has(value)) continue;
            if (unique.includes(value)) continue;
            unique.push(value);
        }
        return unique;
    } catch {
        return [...allowedValues];
    }
}

function writeStoredFilterValues<T extends string>(storageKey: string, values: T[]): void {
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
        // ignore localStorage write failures
    }
}
