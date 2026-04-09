import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Activity, TerminalSquare, Trash2, X} from 'lucide-react';
import type {DebugLogEntry} from '../../preload';
import WindowTitleBar from '../components/WindowTitleBar';
import {FormCheckbox} from '../components/ui/FormControls';
import {Button} from '../components/ui/button';
import {useAppTheme} from '../hooks/useAppTheme';
import {useIpcEvent} from '../hooks/ipc/useIpcEvent';
import {ipcClient} from '../lib/ipcClient';

const DEBUG_FILTER_SOURCES_STORAGE_KEY = 'llamamail.debug.filters.sources';
const DEBUG_FILTER_LEVELS_STORAGE_KEY = 'llamamail.debug.filters.levels';

const SOURCE_OPTIONS: Array<{value: DebugLogEntry['source']; label: string}> = [
	{value: 'imap', label: 'IMAP'},
	{value: 'smtp', label: 'SMTP'},
	{value: 'carddav', label: 'CardDav'},
	{value: 'caldav', label: 'CalDav'},
	{value: 'cloud', label: 'Cloud'},
	{value: 'app', label: 'App'},
];

const LEVEL_OPTIONS: Array<{value: DebugLogEntry['level']; label: string}> = [
	{value: 'trace', label: 'Trace'},
	{value: 'debug', label: 'Debug'},
	{value: 'info', label: 'Info'},
	{value: 'warn', label: 'Warn'},
	{value: 'error', label: 'Error'},
	{value: 'fatal', label: 'Fatal'},
];

export default function DebugConsolePage({embedded = false}: {embedded?: boolean}) {
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
		<div className="h-full w-full overflow-hidden bg-slate-100 dark:bg-[#23252b]">
			<div className="flex h-full flex-col">
				{!embedded && <WindowTitleBar title="Debug Console" showMaximize/>}
				<div className="min-h-0 flex-1 overflow-hidden p-3">
					<div className="flex h-full min-h-0 flex-col gap-3">
						<header className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#3a3d44] dark:bg-[#1e1f22]">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="min-w-0">
									<h1 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
										<TerminalSquare size={16}/>
										Debug Console
									</h1>
									<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
										Live runtime events with simple source and level filters.
									</p>
								</div>
								<div className="flex items-center gap-2">
									<label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 dark:border-[#3a3d44] dark:text-slate-300">
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

						<section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#3a3d44] dark:bg-[#1e1f22]">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="flex min-w-0 items-center gap-2">
									<span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
									<span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
								style={{
									backgroundColor: '#0b0f14',
									backgroundImage:
										'radial-gradient(circle at top left, rgba(56, 189, 248, 0.08), transparent 35%), linear-gradient(180deg, #0f141b 0%, #0b0f14 100%)',
									userSelect: 'text',
									WebkitUserSelect: 'text',
								}}
								className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:border-[#3a3d44]"
							>
								<div
									ref={listRef}
									onScroll={onLogScroll}
									onWheel={markUserScrollIntent}
									onMouseDown={markUserScrollIntent}
									onTouchStart={markUserScrollIntent}
									className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-5 text-slate-100 select-text [&_*]:select-text"
								>
								{logs.length === 0 && (
									<div className="flex h-full min-h-[120px] items-center justify-center text-slate-400">
										<Activity size={14} className="mr-2"/>
										No debug events yet.
									</div>
								)}
								{logs.length > 0 && filteredLogs.length === 0 && (
									<div className="flex h-full min-h-[120px] items-center justify-center text-slate-400">
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
										<span className="text-slate-500">[{entry.timestampLabel}]</span>{' '}
										<span className={levelClass(entry.level)}>{entry.level.toUpperCase()}</span>{' '}
										<span className="text-cyan-300">{entry.source}</span>{' '}
										<span className="text-amber-300">{entry.scope}</span>{' '}
										<span className="text-slate-100">{entry.message}</span>
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

function ToolbarToggleButton({label, active, onClick}: {label: string; active: boolean; onClick: () => void}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`h-7 rounded-md border px-2.5 text-xs font-medium transition-colors ${
				active
					? 'border-sky-500 bg-sky-100 text-sky-800 dark:border-[#5865f2] dark:bg-[#5865f2]/25 dark:text-sky-100'
					: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#2f3238]'
			}`}
		>
			{label}
		</button>
	);
}

function levelClass(level: DebugLogEntry['level']): string {
	if (level === 'error' || level === 'fatal') return 'text-rose-400';
	if (level === 'warn') return 'text-amber-400';
	if (level === 'info') return 'text-emerald-400';
	if (level === 'debug') return 'text-sky-400';
	return 'text-violet-300';
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
