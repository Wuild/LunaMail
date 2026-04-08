import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Bug, CalendarDays, CircleHelp, Cloud, Copy, Download, Mail, Minus, Settings, Square, Users, X} from 'lucide-react';
import {HashRouter, Navigate, Route, Routes, useLocation, useNavigate} from 'react-router-dom';
import MailPage from './pages/MailPage';
import DebugConsolePage from './pages/DebugConsolePage';
import SupportPage from './pages/SupportPage';
import lunaLogo from '../resources/luna.png';
import {DEFAULT_APP_SETTINGS} from '../shared/defaults';
import SettingsRoute from './routes/SettingsRoute';
import NavRailItem from './components/navigation/NavRailItem';
import ContactsRoute from './routes/ContactsRoute';
import CalendarRoute from './routes/CalendarRoute';
import {useAccounts} from './hooks/ipc/useAccounts';
import {useAutoUpdateState} from './hooks/ipc/useAutoUpdateState';
import {useWindowControlsState} from './hooks/ipc/useWindowControlsState';
import {useAppSettings} from './hooks/ipc/useAppSettings';
import {useIpcEvent} from './hooks/ipc/useIpcEvent';
import {ipcClient} from './lib/ipcClient';
import type {AppSettings, GlobalErrorEvent} from '../shared/ipcTypes';
import CloudFilesPage from './pages/CloudFilesPage';

type TopNavItemId = AppSettings['navRailOrder'][number];
type TopNavItemDef = {
	id: TopNavItemId;
	to: string;
	label: string;
	icon: React.ReactNode;
	badgeCount?: number;
};

const DEFAULT_TOP_NAV_ORDER: TopNavItemId[] = ['email', 'contacts', 'calendar', 'cloud'];

function isTopNavItemId(value: unknown): value is TopNavItemId {
	return value === 'email' || value === 'contacts' || value === 'calendar' || value === 'cloud';
}

function normalizeTopNavOrder(input: unknown): TopNavItemId[] {
	const source = Array.isArray(input) ? input : [];
	const normalized: TopNavItemId[] = [];
	for (const item of source) {
		if (!isTopNavItemId(item)) continue;
		if (normalized.includes(item)) continue;
		normalized.push(item);
	}
	for (const item of DEFAULT_TOP_NAV_ORDER) {
		if (!normalized.includes(item)) normalized.push(item);
	}
	return normalized;
}

function reorderTopNavItems(
	order: TopNavItemId[],
	sourceId: TopNavItemId,
	insertionIndex: number,
): TopNavItemId[] {
	const sourceIndex = order.indexOf(sourceId);
	if (sourceIndex < 0) return order;
	const next = [...order];
	next.splice(sourceIndex, 1);
	const clampedInsertionIndex = Math.max(0, Math.min(order.length, insertionIndex));
	const adjustedInsertionIndex = sourceIndex < clampedInsertionIndex ? clampedInsertionIndex - 1 : clampedInsertionIndex;
	next.splice(adjustedInsertionIndex, 0, sourceId);
	return next;
}

export default function MainWindowApp() {
	return (
		<HashRouter>
			<MainWindowShell/>
		</HashRouter>
	);
}

function MainWindowShell() {
	const location = useLocation();
	const navigate = useNavigate();
	const {accounts, selectedAccountId, setSelectedAccountId, totalUnreadCount} = useAccounts();
	const {isMaximized, toggleMaximize, minimize, close} = useWindowControlsState();
	const {appVersion, autoUpdatePhase, autoUpdateMessage} = useAutoUpdateState();
	const {appSettings, setAppSettings, isFetched: appSettingsFetched} = useAppSettings(DEFAULT_APP_SETTINGS);
	const developerMode = Boolean(appSettings.developerMode);
	const [globalErrors, setGlobalErrors] = useState<GlobalErrorEvent[]>([]);
	const [topNavOrder, setTopNavOrder] = useState<TopNavItemId[]>(() =>
		normalizeTopNavOrder(appSettings.navRailOrder),
	);
	const [draggingTopNavItemId, setDraggingTopNavItemId] = useState<TopNavItemId | null>(null);
	const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);
	const dragStartOrderRef = useRef<TopNavItemId[] | null>(null);

	const pushGlobalError = (entry: GlobalErrorEvent) => {
		setGlobalErrors((prev) => {
			const next = [entry, ...prev.filter((item) => item.id !== entry.id)];
			return next.slice(0, 5);
		});
	};

	const dismissGlobalError = (id: string) => {
		setGlobalErrors((prev) => prev.filter((item) => item.id !== id));
	};

	useIpcEvent(ipcClient.onGlobalError, pushGlobalError);

	useEffect(() => {
		const onWindowError = (event: ErrorEvent) => {
			pushGlobalError({
				id: `renderer-window-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				source: 'renderer-window',
				message: event.message || 'Unexpected renderer error',
				detail: event.error?.stack || `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`,
				timestamp: new Date().toISOString(),
				fatal: false,
			});
		};
		const onUnhandledRejection = (event: PromiseRejectionEvent) => {
			const reason = event.reason;
			const message = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled promise rejection');
			pushGlobalError({
				id: `renderer-rejection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				source: 'renderer-window',
				message,
				detail: reason instanceof Error ? reason.stack : null,
				timestamp: new Date().toISOString(),
				fatal: false,
			});
		};
		window.addEventListener('error', onWindowError);
		window.addEventListener('unhandledrejection', onUnhandledRejection);
		return () => {
			window.removeEventListener('error', onWindowError);
			window.removeEventListener('unhandledrejection', onUnhandledRejection);
		};
	}, []);

	useEffect(() => {
		if (globalErrors.length === 0) return;
		const timer = window.setTimeout(() => {
			const oldest = globalErrors[globalErrors.length - 1];
			if (oldest) {
				dismissGlobalError(oldest.id);
			}
		}, 15000);
		return () => {
			window.clearTimeout(timer);
		};
	}, [globalErrors]);

	const pageTitle = useMemo(() => {
		const path = location.pathname || '/';
		if (path.startsWith('/contacts')) return 'Contacts';
		if (path.startsWith('/calendar')) return 'Calendar';
		if (path.startsWith('/cloud')) return 'Cloud';
		if (path.startsWith('/settings')) return 'Settings';
		if (path.startsWith('/debug')) return 'Debug';
		if (path.startsWith('/help')) return 'Help';
		return 'Mail';
	}, [location.pathname]);

	useEffect(() => {
		setTopNavOrder(normalizeTopNavOrder(appSettings.navRailOrder));
	}, [appSettings.navRailOrder]);

	const topNavItems = useMemo<TopNavItemDef[]>(() => {
		const all: Record<TopNavItemId, TopNavItemDef> = {
			email: {id: 'email', to: '/email', label: 'Mail', icon: <Mail size={18}/>, badgeCount: totalUnreadCount},
			contacts: {id: 'contacts', to: '/contacts', label: 'Contacts', icon: <Users size={18}/>},
			calendar: {id: 'calendar', to: '/calendar', label: 'Calendar', icon: <CalendarDays size={18}/>},
			cloud: {id: 'cloud', to: '/cloud', label: 'Cloud', icon: <Cloud size={18}/>},
		};
		return topNavOrder.map((id) => all[id]).filter(Boolean);
	}, [topNavOrder, totalUnreadCount]);

	const persistTopNavOrder = (nextOrder: TopNavItemId[]) => {
		setTopNavOrder(nextOrder);
		setAppSettings((prev) => ({...prev, navRailOrder: nextOrder}));
		void ipcClient.updateAppSettings({navRailOrder: nextOrder}).catch(() => undefined);
	};

	const onTopNavDragStart = (event: React.DragEvent<HTMLDivElement>, itemId: TopNavItemId) => {
		dragStartOrderRef.current = topNavOrder;
		setDraggingTopNavItemId(itemId);
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', itemId);
	};

	const onTopNavDragEnter = (event: React.DragEvent<HTMLDivElement>, insertionIndex: number) => {
		if (!draggingTopNavItemId) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		setDropIndicatorIndex(insertionIndex);
	};

	const onTopNavDrop = (event: React.DragEvent<HTMLDivElement>, insertionIndex: number) => {
		event.preventDefault();
		const draggedId = draggingTopNavItemId;
		if (!draggedId) return;
		const next = reorderTopNavItems(topNavOrder, draggedId, insertionIndex);
		setDropIndicatorIndex(null);
		setDraggingTopNavItemId(null);
		if (next.join('|') === topNavOrder.join('|')) return;
		persistTopNavOrder(next);
	};

	const onTopNavDragEnd = () => {
		setDraggingTopNavItemId(null);
		setDropIndicatorIndex(null);
		dragStartOrderRef.current = null;
	};

	useEffect(() => {
		document.title = pageTitle;
	}, [pageTitle]);

	const hasUpdateIndicator =
		autoUpdatePhase === 'available' || autoUpdatePhase === 'downloading' || autoUpdatePhase === 'downloaded';
	const updateIndicatorTitle =
		autoUpdateMessage ||
		(autoUpdatePhase === 'downloaded'
			? 'Update downloaded. Open settings to install.'
			: autoUpdatePhase === 'downloading'
				? 'Update downloading. Open settings for details.'
				: 'Update available. Open settings for details.');
	const showUpdateBanner = hasUpdateIndicator;
	const updateBannerText =
		autoUpdateMessage ||
		(autoUpdatePhase === 'downloaded'
			? 'An update has been downloaded and is ready to install.'
			: autoUpdatePhase === 'downloading'
				? 'A new update is downloading in the background.'
				: 'A new update is available.');
	const useNativeTitleBar = Boolean(appSettings.useNativeTitleBar);

	return (
		<div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
			{appSettingsFetched && !useNativeTitleBar && (
				<header
					className="relative flex h-9 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-2 text-slate-100 dark:border-[#08090c] dark:bg-[#0b0c10]"
					style={{WebkitAppRegion: 'drag'} as React.CSSProperties}
					onDoubleClick={() => {
						void toggleMaximize();
					}}
				>
					<div className="pointer-events-none flex min-w-0 flex-1 items-center justify-start gap-3">
						<div className="flex shrink-0 items-center gap-2 text-xs font-medium text-white/80">
							<img src={lunaLogo} alt="" className="h-4 w-4 rounded-sm object-contain" draggable={false}/>
							<span>LunaMail</span>
							<span className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
								{appVersion}
							</span>
						</div>
						<span aria-hidden className="h-3.5 w-px shrink-0 bg-white/25"/>
						<span className="block min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-white/80">
							{pageTitle}
						</span>
					</div>
					<div
						className="flex w-24 shrink-0 items-center justify-end gap-1"
						style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
					>
						{hasUpdateIndicator && (
							<button
								type="button"
								className="relative inline-flex h-7 w-7 items-center justify-center rounded text-amber-300/95 hover:bg-white/15 hover:text-amber-200"
								onClick={() => navigate('/settings/application')}
								title={updateIndicatorTitle}
								aria-label="Open update status"
							>
								<Download size={13}/>
								<span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400"/>
							</button>
						)}
						<button
							type="button"
							className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white"
							onClick={() => void minimize()}
							title="Minimize"
							aria-label="Minimize"
						>
							<Minus size={14}/>
						</button>
						<button
							type="button"
							className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white"
							onClick={() => void toggleMaximize()}
							title={isMaximized ? 'Restore' : 'Maximize'}
							aria-label={isMaximized ? 'Restore' : 'Maximize'}
						>
							{isMaximized ? <Copy size={13}/> : <Square size={13}/>}
						</button>
						<button
							type="button"
							className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-red-600 hover:text-white"
							onClick={() => void close()}
							title="Close"
							aria-label="Close"
						>
							<X size={14}/>
						</button>
					</div>
				</header>
			)}
			{showUpdateBanner && (
				<div
					className="shrink-0 border-b border-amber-300 bg-amber-100 px-3 py-2 text-amber-900 dark:border-amber-700/70 dark:bg-amber-900/40 dark:text-amber-100">
					<div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
						<span className="text-sm font-medium">{updateBannerText}</span>
						<button
							type="button"
							className="shrink-0 rounded-md border border-amber-500/60 bg-amber-200/70 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200 dark:border-amber-500/70 dark:bg-amber-700/40 dark:text-amber-100 dark:hover:bg-amber-700/60"
							onClick={() => navigate('/settings/application')}
						>
							Open update settings
						</button>
					</div>
				</div>
			)}
			{globalErrors.length > 0 && (
				<div
					className="shrink-0 border-b border-red-300 bg-red-100 px-3 py-2 text-red-900 dark:border-red-700/70 dark:bg-red-900/35 dark:text-red-100">
					<div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2">
						{globalErrors.map((item) => (
							<div key={item.id} className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="truncate text-sm font-semibold">{item.message}</div>
									<div className="truncate text-xs opacity-80">
										{item.source} · {new Date(item.timestamp).toLocaleTimeString()}
									</div>
								</div>
								<button
									type="button"
									className="shrink-0 rounded-md border border-red-500/60 bg-red-200/80 px-2 py-1 text-xs font-semibold text-red-900 hover:bg-red-200 dark:border-red-500/70 dark:bg-red-700/40 dark:text-red-100 dark:hover:bg-red-700/60"
									onClick={() => dismissGlobalError(item.id)}
								>
									Dismiss
								</button>
							</div>
						))}
					</div>
				</div>
			)}

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<aside
					className="flex h-full w-16 shrink-0 flex-col items-center justify-between bg-slate-800 py-3 dark:bg-[#111216]">
					<div className="flex flex-col items-center gap-2">
						{topNavItems.map((item, index) => {
							const showDropIndicatorBefore = dropIndicatorIndex === index;
							const showDropIndicatorAfter = dropIndicatorIndex === index + 1;
							return (
								<div
									key={item.id}
									className="relative"
									draggable
									onDragStart={(event) => onTopNavDragStart(event, item.id)}
									onDragEnter={(event) => onTopNavDragEnter(event, index)}
									onDragOver={(event) => onTopNavDragEnter(event, index)}
									onDrop={(event) => onTopNavDrop(event, index)}
									onDragEnd={onTopNavDragEnd}
								>
									{showDropIndicatorBefore && (
										<span
											className="pointer-events-none absolute -top-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-sky-300 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]"
											aria-hidden
										/>
									)}
									<NavRailItem to={item.to} icon={item.icon} label={item.label} badgeCount={item.badgeCount}/>
									{showDropIndicatorAfter && (
										<span
											className="pointer-events-none absolute -bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-sky-300 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]"
											aria-hidden
										/>
									)}
								</div>
							);
						})}
					</div>
					<div className="flex w-full flex-col items-center gap-2">
						<div
							aria-hidden
							className="my-0.5 h-px w-9 bg-gradient-to-r from-transparent via-white/30 to-transparent dark:via-white/20"
						/>
						<NavRailItem to="/settings/application" icon={<Settings size={16}/>} label="Settings"/>
						<NavRailItem to="/debug" icon={<Bug size={16}/>} label="Debug"/>
						<NavRailItem to="/help" icon={<CircleHelp size={16}/>} label="Help"/>
					</div>
				</aside>

				<main className="min-h-0 min-w-0 flex-1 overflow-hidden">
					<Routes>
						<Route path="/" element={<Navigate to="/email" replace/>}/>
						<Route path="/email" element={<MailPage/>}/>
						<Route path="/email/:accountId" element={<MailPage/>}/>
						<Route path="/email/:accountId/:folderId" element={<MailPage/>}/>
						<Route path="/email/:accountId/:folderId/:emailId" element={<MailPage/>}/>
						<Route path="/mail/*" element={<Navigate to="/email" replace/>}/>
						<Route path="/cloud" element={<CloudFilesPage/>}/>
						<Route
							path="/contacts"
							element={
								<ContactsRoute
									accountId={selectedAccountId}
									accounts={accounts}
									onSelectAccount={setSelectedAccountId}
								/>
							}
						/>
						<Route
							path="/calendar"
							element={
								<CalendarRoute
									accountId={selectedAccountId}
									accounts={accounts}
									onSelectAccount={setSelectedAccountId}
								/>
							}
						/>
						<Route path="/settings" element={<Navigate to="/settings/application" replace/>}/>
						<Route path="/settings/:tab" element={<SettingsRoute/>}/>
						<Route path="/settings/account/:accountId" element={<SettingsRoute/>}/>
						<Route path="/debug" element={<DebugConsolePage embedded/>}/>
						<Route path="/help" element={<SupportPage embedded/>}/>
					</Routes>
				</main>
			</div>
			{developerMode && (
				<div
					className="pointer-events-none fixed bottom-3 right-3 z-[1200] rounded-md border border-slate-300/80 bg-white/95 px-2.5 py-1.5 font-mono text-[11px] text-slate-700 shadow-sm dark:border-[#4a4d55] dark:bg-[#1e1f22]/95 dark:text-slate-200">
					{`#${location.pathname}${location.search || ''}`}
				</div>
			)}
		</div>
	);
}
