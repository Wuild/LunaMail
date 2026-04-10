import {Button} from './components/ui/button';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    AlertTriangle,
    Bug,
    CalendarDays,
    CircleHelp,
    Cloud,
    Copy,
    Download,
    Mail,
    Minus,
    Settings,
    Square,
    Users,
    X
} from 'lucide-react';
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    DragOverlay,
    type DragStartEvent,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {arrayMove, SortableContext, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {HashRouter, useLocation, useNavigate} from 'react-router-dom';
import llamaLogo from '../resources/llamatray.png';
import {DEFAULT_APP_SETTINGS} from '../shared/defaults';
import {APP_NAME} from '../shared/appConfig';
import NavRailItem from './components/navigation/NavRailItem';
import {useAccounts} from './hooks/ipc/useAccounts';
import {useAutoUpdateState} from './hooks/ipc/useAutoUpdateState';
import {useWindowControlsState} from './hooks/ipc/useWindowControlsState';
import {useAppSettings} from './hooks/ipc/useAppSettings';
import {useIpcEvent} from './hooks/ipc/useIpcEvent';
import {ipcClient} from './lib/ipcClient';
import type {AppSettings, GlobalErrorEvent} from '../shared/ipcTypes';
import type {SendEmailBackgroundStatusEvent, SyncStatusEvent} from '../preload';
import {ContextMenu, ContextMenuItem} from './components/ui/ContextMenu';
import MainWindowRoutes from './routes/MainWindowRoutes';

type TopNavItemId = AppSettings['navRailOrder'][number];
type TopNavItemDef = {
    id: TopNavItemId;
    to: string;
    label: string;
    icon: React.ReactNode;
    badgeCount?: number;
};

type SystemFailureToast = {
    id: string;
    title: string;
    message: string;
    key: string;
    timestampMs: number;
    accountId?: number;
};

type MainNavContextItemId = TopNavItemId | 'settings' | 'debug' | 'help';
type MainNavContextMenuState = {
    id: MainNavContextItemId;
    label: string;
    to: string;
    x: number;
    y: number;
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

function toTopNavSortableId(id: TopNavItemId): string {
    return `topnav-${id}`;
}

function parseTopNavSortableId(id: string): TopNavItemId | null {
    if (!id.startsWith('topnav-')) return null;
    const value = id.slice('topnav-'.length);
    return isTopNavItemId(value) ? value : null;
}

type SortableTopNavItemProps = {
    item: TopNavItemDef;
    onContextMenu: (event: React.MouseEvent<HTMLDivElement>, item: TopNavItemDef) => void;
};

function SortableTopNavItem({
                                item,
                                onContextMenu,
                            }: SortableTopNavItemProps) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
        id: toTopNavSortableId(item.id),
        data: {kind: 'topnav', id: item.id, label: item.label},
    });
    return (
        <div
            ref={setNodeRef}
            onContextMenu={(event) => onContextMenu(event, item)}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.2 : 1,
            }}
            {...attributes}
            {...listeners}
        >
            <NavRailItem to={item.to} icon={item.icon} label={item.label} badgeCount={item.badgeCount}/>
        </div>
    );
}

function TopNavEndDrop() {
    const {setNodeRef} = useDroppable({
        id: 'topnav-end',
        data: {kind: 'topnav-end'},
    });
    return <div ref={setNodeRef} className="h-12 w-full"/>;
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
    const showRouteOverlay = developerMode && Boolean(appSettings.developerShowRouteOverlay);
    const showSendNotifications = Boolean(appSettings.developerShowSendNotifications);
    const showSystemFailureNotifications = Boolean(appSettings.developerShowSystemFailureNotifications);
    const showDebugNavItem = developerMode && Boolean(appSettings.developerShowDebugNavItem);
    const [globalErrors, setGlobalErrors] = useState<GlobalErrorEvent[]>([]);
    const [restartBusy, setRestartBusy] = useState(false);
    const [topNavOrder, setTopNavOrder] = useState<TopNavItemId[]>(() =>
        normalizeTopNavOrder(appSettings.navRailOrder),
    );
    const [draggingTopNavItemId, setDraggingTopNavItemId] = useState<TopNavItemId | null>(null);
    const [topNavOverlaySize, setTopNavOverlaySize] = useState<{ width: number; height: number } | null>(null);
    const [sendStatus, setSendStatus] = useState<SendEmailBackgroundStatusEvent | null>(null);
    const [systemFailureToasts, setSystemFailureToasts] = useState<SystemFailureToast[]>([]);
    const [mainNavContextMenu, setMainNavContextMenu] = useState<MainNavContextMenuState | null>(null);
    const mainNavContextMenuRef = useRef<HTMLDivElement | null>(null);
    const topNavSensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}));
    const topNavSortableIds = useMemo(() => topNavOrder.map((id) => toTopNavSortableId(id)), [topNavOrder]);

    const pushGlobalError = (entry: GlobalErrorEvent) => {
        setGlobalErrors((prev) => {
            const next = [entry, ...prev.filter((item) => item.id !== entry.id)];
            return next.slice(0, 5);
        });
    };

    const dismissGlobalError = (id: string) => {
        setGlobalErrors((prev) => prev.filter((item) => item.id !== id));
    };

    const pushSystemFailureToast = (notice: { title: string; message: string; key: string; accountId?: number }) => {
        const now = Date.now();
        setSystemFailureToasts((prev) => {
            const duplicate = prev.some(
                (item) => item.key === notice.key && now - item.timestampMs < 5000,
            );
            if (duplicate) return prev;
            const next: SystemFailureToast = {
                id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
                title: notice.title,
                message: notice.message,
                key: notice.key,
                timestampMs: now,
            };
            return [next, ...prev].slice(0, 4);
        });
    };

    const dismissSystemFailureToast = (id: string) => {
        setSystemFailureToasts((prev) => prev.filter((item) => item.id !== id));
    };

    useIpcEvent(ipcClient.onGlobalError, pushGlobalError);
    useIpcEvent(ipcClient.onSendEmailBackgroundStatus, (payload) => {
        if (!showSendNotifications) return;
        setSendStatus(payload);
    });
    useIpcEvent(ipcClient.onAccountSyncStatus, (payload: SyncStatusEvent) => {
        if (!showSystemFailureNotifications) return;
        if (payload.status !== 'error') return;
        const accountName =
            accounts.find((item) => item.id === payload.accountId)?.display_name?.trim() ||
            accounts.find((item) => item.id === payload.accountId)?.email ||
            `Account ${payload.accountId}`;
        const errorText = String(payload.error || 'Unknown sync error').trim();
        const isAuthFailure = /(authentication|auth|password|credential|login|invalid credentials)/i.test(errorText);
        pushSystemFailureToast({
            title: isAuthFailure ? 'Authentication failed' : 'Sync failed',
            message: `${accountName}: ${errorText}`,
            key: `${isAuthFailure ? 'auth' : 'sync'}:${payload.accountId}:${errorText}`,
            accountId: isAuthFailure ? payload.accountId : undefined,
        });
    });

    useEffect(() => {
        if (!showSendNotifications && sendStatus) {
            setSendStatus(null);
        }
    }, [showSendNotifications, sendStatus]);

    useEffect(() => {
        if (!showSystemFailureNotifications && systemFailureToasts.length > 0) {
            setSystemFailureToasts([]);
        }
    }, [showSystemFailureNotifications, systemFailureToasts.length]);

    useEffect(() => {
        if (!mainNavContextMenu) return;
        const onWindowClick = () => setMainNavContextMenu(null);
        const onWindowContextMenu = () => setMainNavContextMenu(null);
        const onEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMainNavContextMenu(null);
        };
        window.addEventListener('click', onWindowClick);
        window.addEventListener('contextmenu', onWindowContextMenu);
        window.addEventListener('keydown', onEscape);
        return () => {
            window.removeEventListener('click', onWindowClick);
            window.removeEventListener('contextmenu', onWindowContextMenu);
            window.removeEventListener('keydown', onEscape);
        };
    }, [mainNavContextMenu]);

    useEffect(() => {
        setMainNavContextMenu(null);
    }, [location.pathname, location.search]);

    useEffect(() => {
        if (!sendStatus) return;
        if (sendStatus.phase !== 'sent' && sendStatus.phase !== 'failed') return;
        const timer = window.setTimeout(() => {
            setSendStatus((prev) => (prev?.jobId === sendStatus.jobId ? null : prev));
        }, 4200);
        return () => window.clearTimeout(timer);
    }, [sendStatus]);

    useEffect(() => {
        if (systemFailureToasts.length === 0) return;
        const timers = systemFailureToasts.map((item) =>
            window.setTimeout(() => {
                dismissSystemFailureToast(item.id);
            }, 6500),
        );
        return () => {
            for (const timer of timers) window.clearTimeout(timer);
        };
    }, [systemFailureToasts]);

    useEffect(() => {
        const timers: number[] = [];
        const onPreview = () => {
            const jobId = `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            const now = () => new Date().toISOString();
            setSendStatus({
                jobId,
                accountId: -1,
                phase: 'queued',
                progress: 12,
                message: 'Queued email for background send...',
                error: null,
                timestamp: now(),
            });
            timers.push(
                window.setTimeout(() => {
                    setSendStatus({
                        jobId,
                        accountId: -1,
                        phase: 'sending',
                        progress: 62,
                        message: 'Sending email...',
                        error: null,
                        timestamp: now(),
                    });
                }, 450),
            );
            timers.push(
                window.setTimeout(() => {
                    setSendStatus({
                        jobId,
                        accountId: -1,
                        phase: 'sent',
                        progress: 100,
                        message: 'Email sent successfully.',
                        error: null,
                        timestamp: now(),
                    });
                }, 1200),
            );
        };
        window.addEventListener('llamamail:preview-send-notification', onPreview);
        const onPreviewSyncFailure = () => {
            pushSystemFailureToast({
                title: 'Sync failed',
                message: 'Demo Account: Mailbox sync failed (timeout while fetching folder state).',
                key: `preview-sync-failure-${Date.now()}`,
            });
        };
        const onPreviewAuthFailure = () => {
            const accountId = accounts[0]?.id ?? 1;
            pushSystemFailureToast({
                title: 'Authentication failed',
                message: 'Demo Account: Invalid credentials. Password or authentication may have changed.',
                key: `preview-auth-failure-${Date.now()}`,
                accountId,
            });
        };
        window.addEventListener('llamamail:preview-sync-failure', onPreviewSyncFailure);
        window.addEventListener('llamamail:preview-auth-failure', onPreviewAuthFailure);
        return () => {
            window.removeEventListener('llamamail:preview-send-notification', onPreview);
            window.removeEventListener('llamamail:preview-sync-failure', onPreviewSyncFailure);
            window.removeEventListener('llamamail:preview-auth-failure', onPreviewAuthFailure);
            for (const timer of timers) window.clearTimeout(timer);
        };
    }, [accounts]);

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
        if (path.startsWith('/onboarding')) return 'Onboarding';
        if (path.startsWith('/contacts')) return 'Contacts';
        if (path.startsWith('/calendar')) return 'Calendar';
        if (path.startsWith('/cloud')) return 'Cloud';
        if (path.startsWith('/settings')) return 'Settings';
        if (path.startsWith('/debug')) return 'Debug';
        if (path.startsWith('/help')) return 'Help';
        return 'Mail';
    }, [location.pathname]);
    const hideMainNavRail = location.pathname.startsWith('/onboarding');

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
    const draggingTopNavItem = useMemo(
        () => (draggingTopNavItemId === null ? null : topNavItems.find((item) => item.id === draggingTopNavItemId) ?? null),
        [topNavItems, draggingTopNavItemId],
    );

    const persistTopNavOrder = (nextOrder: TopNavItemId[]) => {
        setTopNavOrder(nextOrder);
        setAppSettings((prev) => ({...prev, navRailOrder: nextOrder}));
        void ipcClient.updateAppSettings({navRailOrder: nextOrder}).catch(() => undefined);
    };

    const onTopNavDragStart = (event: DragStartEvent) => {
        const id = parseTopNavSortableId(String(event.active.id));
        if (!id) return;
        setDraggingTopNavItemId(id);
        const initialRect = event.active.rect.current.initial;
        if (initialRect) {
            setTopNavOverlaySize({width: initialRect.width, height: initialRect.height});
        } else {
            setTopNavOverlaySize(null);
        }
    };

    const onTopNavDragEnd = (event: DragEndEvent) => {
        const activeId = parseTopNavSortableId(String(event.active.id));
        if (!activeId) {
            setDraggingTopNavItemId(null);
            setTopNavOverlaySize(null);
            return;
        }
        const sourceIndex = topNavOrder.indexOf(activeId);
        if (sourceIndex < 0) {
            setDraggingTopNavItemId(null);
            setTopNavOverlaySize(null);
            return;
        }
        let targetIndex = sourceIndex;
        if (!event.over) {
            targetIndex = Math.max(0, topNavOrder.length - 1);
        } else if (event.over.id === 'topnav-end') {
            targetIndex = Math.max(0, topNavOrder.length - 1);
        } else {
            const overId = parseTopNavSortableId(String(event.over.id));
            if (!overId) {
                setDraggingTopNavItemId(null);
                setTopNavOverlaySize(null);
                return;
            }
            const overIndex = topNavOrder.indexOf(overId);
            if (overIndex >= 0) targetIndex = overIndex;
        }
        if (targetIndex !== sourceIndex) {
            persistTopNavOrder(arrayMove(topNavOrder, sourceIndex, targetIndex));
        }
        setDraggingTopNavItemId(null);
        setTopNavOverlaySize(null);
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
    const pendingRestartItems: string[] = [];
    if (appSettings.pendingHardwareAcceleration !== null) pendingRestartItems.push('Hardware acceleration');
    if (appSettings.pendingUseNativeTitleBar !== null) pendingRestartItems.push('Native titlebar');
    const hasRestartRequiredBanner = pendingRestartItems.length > 0;

    const onRestartNow = () => {
        if (restartBusy) return;
        setRestartBusy(true);
        void ipcClient.restartApp().catch(() => {
            setRestartBusy(false);
        });
    };

    const openMainNavContextMenu = (
        event: React.MouseEvent<HTMLDivElement>,
        item: { id: MainNavContextItemId; label: string; to: string },
    ) => {
        event.preventDefault();
        event.stopPropagation();
        const menuWidth = 220;
        const menuHeight = item.id === 'debug' ? 92 : 56;
        const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
        const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8));
        setMainNavContextMenu({
            id: item.id,
            label: item.label,
            to: item.to,
            x: left,
            y: top,
        });
    };

    return (
        <div className="app-shell flex h-screen w-screen flex-col overflow-hidden">
            {appSettingsFetched && !useNativeTitleBar && (
                <header
                    className="titlebar relative flex h-9 shrink-0 items-center justify-between px-2"
                    style={{WebkitAppRegion: 'drag'} as React.CSSProperties}
                    onDoubleClick={() => {
                        void toggleMaximize();
                    }}
                >
                    <div className="pointer-events-none flex min-w-0 flex-1 items-center justify-start gap-3">
                        <div className="titlebar-title flex shrink-0 items-center gap-2 text-xs font-medium">
                            <img
                                src={llamaLogo}
                                alt=""
                                className="h-7 w-7 object-contain contrast-125 saturate-125"
                                style={{imageRendering: '-webkit-optimize-contrast'}}
                                draggable={false}
                            />
                            <span>{APP_NAME}</span>
                            <span className="titlebar-meta text-[10px] font-semibold uppercase tracking-wide">
								{appVersion}
							</span>
                        </div>
                        <span aria-hidden className="titlebar-divider h-3.5 w-px shrink-0"/>
                        <span
                            className="titlebar-title block min-w-0 flex-1 truncate text-xs font-semibold tracking-wide">
							{pageTitle}
						</span>
                    </div>
                    <div
                        className="flex w-24 shrink-0 items-center justify-end gap-1"
                        style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
                    >
                        {hasUpdateIndicator && (
                            <Button
                                type="button"
                                className="titlebar-button-accent relative inline-flex h-7 w-7 items-center justify-center rounded"
                                onClick={() => navigate('/settings/application')}
                                title={updateIndicatorTitle}
                                aria-label="Open update status"
                            >
                                <Download size={13}/>
                                <span
                                    className="titlebar-button-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"/>
                            </Button>
                        )}
                        <Button
                            type="button"
                            className="titlebar-button inline-flex h-7 w-7 items-center justify-center rounded"
                            onClick={() => void minimize()}
                            title="Minimize"
                            aria-label="Minimize"
                        >
                            <Minus size={14}/>
                        </Button>
                        <Button
                            type="button"
                            className="titlebar-button inline-flex h-7 w-7 items-center justify-center rounded"
                            onClick={() => void toggleMaximize()}
                            title={isMaximized ? 'Restore' : 'Maximize'}
                            aria-label={isMaximized ? 'Restore' : 'Maximize'}
                        >
                            {isMaximized ? <Copy size={13}/> : <Square size={13}/>}
                        </Button>
                        <Button
                            type="button"
                            className="titlebar-button-close inline-flex h-7 w-7 items-center justify-center rounded"
                            onClick={() => void close()}
                            title="Close"
                            aria-label="Close"
                        >
                            <X size={14}/>
                        </Button>
                    </div>
                </header>
            )}
            {showUpdateBanner && (
                <div
                    className="notice-warning shrink-0 border-b px-3 py-2">
                    <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
                        <span className="text-sm font-medium">{updateBannerText}</span>
                        <Button
                            type="button"
                            className="notice-button-warning shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold"
                            onClick={() => navigate('/settings/application')}
                        >
                            Open update settings
                        </Button>
                    </div>
                </div>
            )}
            {globalErrors.length > 0 && (
                <div
                    className="notice-danger shrink-0 border-b px-3 py-2">
                    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2">
                        {globalErrors.map((item) => (
                            <div key={item.id} className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold">{item.message}</div>
                                    <div className="truncate text-xs opacity-80">
                                        {item.source} · {new Date(item.timestamp).toLocaleTimeString()}
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    className="notice-button-danger shrink-0 rounded-md px-2 py-1 text-xs font-semibold"
                                    onClick={() => dismissGlobalError(item.id)}
                                >
                                    Dismiss
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex min-h-0 flex-1 overflow-hidden">
                {!hideMainNavRail && (
                    <aside className="app-navrail flex h-full w-16 shrink-0 flex-col items-center justify-between py-3">
                        <DndContext
                            sensors={topNavSensors}
                            collisionDetection={closestCenter}
                            onDragStart={onTopNavDragStart}
                            onDragEnd={onTopNavDragEnd}
                            onDragCancel={() => {
                                setDraggingTopNavItemId(null);
                                setTopNavOverlaySize(null);
                            }}
                        >
                            <div className="relative flex w-full flex-col items-center">
                                <SortableContext items={topNavSortableIds} strategy={verticalListSortingStrategy}>
                                    <div className="flex flex-col items-center gap-2">
                                        {topNavItems.map((item) => (
                                            <SortableTopNavItem
                                                key={item.id}
                                                item={item}
                                                onContextMenu={(event, navItem) =>
                                                    openMainNavContextMenu(event, {
                                                        id: navItem.id,
                                                        label: navItem.label,
                                                        to: navItem.to,
                                                    })
                                                }
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                                {draggingTopNavItemId !== null && (
                                    <TopNavEndDrop/>
                                )}
                            </div>
                            <DragOverlay dropAnimation={null}>
                                {draggingTopNavItem && (
                                    <div
                                        style={
                                            topNavOverlaySize
                                                ? {width: topNavOverlaySize.width, height: topNavOverlaySize.height}
                                                : undefined
                                        }
                                        className="overlay rounded-lg opacity-85 shadow-xl"
                                    >
                                        <NavRailItem
                                            to={draggingTopNavItem.to}
                                            icon={draggingTopNavItem.icon}
                                            label={draggingTopNavItem.label}
                                            badgeCount={draggingTopNavItem.badgeCount}
                                        />
                                    </div>
                                )}
                            </DragOverlay>
                        </DndContext>
                        <div className="flex w-full flex-col items-center gap-2">
                            <div
                                aria-hidden
                                className="titlebar-divider-fade my-0.5 h-px w-9"
                            />
                            <div
                                onContextMenu={(event) =>
                                    openMainNavContextMenu(event, {
                                        id: 'settings',
                                        label: 'Settings',
                                        to: '/settings/application',
                                    })
                                }
                            >
                                <NavRailItem
                                    to="/settings/application"
                                    icon={<Settings size={16}/>}
                                    label="Settings"
                                    activePathPrefixes={['/settings']}
                                />
                            </div>
                            {showDebugNavItem && (
                                <div
                                    onContextMenu={(event) =>
                                        openMainNavContextMenu(event, {
                                            id: 'debug',
                                            label: 'Debug',
                                            to: '/debug',
                                        })
                                    }
                                >
                                    <NavRailItem to="/debug" icon={<Bug size={16}/>} label="Debug"/>
                                </div>
                            )}
                            <div
                                onContextMenu={(event) =>
                                    openMainNavContextMenu(event, {
                                        id: 'help',
                                        label: 'Help',
                                        to: '/help',
                                    })
                                }
                            >
                                <NavRailItem to="/help" icon={<CircleHelp size={16}/>} label="Help"/>
                            </div>
                        </div>
                    </aside>
                )}

                <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
                    <div className="flex h-full min-h-0 flex-col overflow-hidden">
                        {hasRestartRequiredBanner && (
                            <div
                                className="notice-info shrink-0 border-b px-3 py-2">
                                <div className="flex w-full items-center justify-between gap-3">
									<span className="text-sm font-medium">
										Restart is required to apply: {pendingRestartItems.join(', ')}.
									</span>
                                    <Button
                                        type="button"
                                        className="notice-button-info shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
                                        onClick={onRestartNow}
                                        disabled={restartBusy}
                                    >
                                        {restartBusy ? 'Restarting...' : 'Restart now'}
                                    </Button>
                                </div>
                            </div>
                        )}
                        <div className="min-h-0 flex-1 overflow-hidden">
                            <MainWindowRoutes
                                accountId={selectedAccountId}
                                accounts={accounts}
                                onSelectAccount={setSelectedAccountId}
                                showDebugNavItem={showDebugNavItem}
                            />
                        </div>
                    </div>
                </main>
            </div>
            {showRouteOverlay && (
                <div
                    className={`overlay route-overlay-text pointer-events-none fixed right-3 z-[1200] rounded-md px-2.5 py-1.5 font-mono text-[11px] shadow-sm ${
                        sendStatus ? 'bottom-[5.25rem]' : 'bottom-3'
                    }`}>
                    {`#${location.pathname}${location.search || ''}`}
                </div>
            )}
            {showSendNotifications && sendStatus && (
                <div
                    className="overlay fixed bottom-3 right-3 z-[1190] w-[320px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md shadow-lg backdrop-blur">
                    <div className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <p className="ui-text-primary truncate text-sm font-medium">
                                {sendStatus.phase === 'failed' ? 'Send failed' : 'Sending email'}
                            </p>
                            <span className="ui-text-muted text-[11px]">
                                {Math.max(0, Math.min(100, Math.round(sendStatus.progress)))}%
                            </span>
                        </div>
                        <p className="ui-text-secondary mt-0.5 truncate text-xs">
                            {sendStatus.error ? `${sendStatus.message} ${sendStatus.error}` : sendStatus.message}
                        </p>
                    </div>
                    <div className="progress-track h-1.5 w-full">
                        <div
                            className={`h-full transition-all duration-300 ease-out ${
                                sendStatus.phase === 'failed' ? 'progress-fill-danger' : 'progress-fill-info'
                            }`}
                            style={{width: `${Math.max(0, Math.min(100, sendStatus.progress))}%`}}
                        />
                    </div>
                </div>
            )}
            {showSystemFailureNotifications && systemFailureToasts.length > 0 && (
                <div
                    className={`fixed right-3 z-[1188] flex w-[320px] max-w-[calc(100vw-1.5rem)] flex-col-reverse gap-2 ${
                        sendStatus ? 'bottom-[6.8rem]' : 'bottom-3'
                    }`}
                >
                    {systemFailureToasts.map((toast) => (
                        <div
                            key={toast.id}
                            role={toast.accountId ? 'button' : undefined}
                            tabIndex={toast.accountId ? 0 : -1}
                            onClick={() => {
                                if (!toast.accountId) return;
                                navigate(`/settings/account/${toast.accountId}`);
                            }}
                            onKeyDown={(event) => {
                                if (!toast.accountId) return;
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                event.preventDefault();
                                navigate(`/settings/account/${toast.accountId}`);
                            }}
                            className={`overlay overlay-danger overflow-hidden rounded-md shadow-lg backdrop-blur ${
                                toast.accountId ? 'cursor-pointer' : ''
                            }`}
                        >
                            <div className="px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-danger truncate text-sm font-semibold">
                                        {toast.title}
                                    </p>
                                    <Button
                                        type="button"
                                        className="menu-item inline-flex h-6 w-6 items-center justify-center rounded"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            dismissSystemFailureToast(toast.id);
                                        }}
                                        aria-label="Dismiss sync error notification"
                                    >
                                        <X size={13}/>
                                    </Button>
                                </div>
                                <div className="mt-1 flex items-start gap-2">
                                    <AlertTriangle size={14} className="text-danger mt-0.5 shrink-0"/>
                                    <div className="min-w-0 flex-1">
                                        <p className="ui-text-primary text-xs">{toast.message}</p>
                                        {toast.accountId && (
                                            <p className="text-danger mt-1 text-[11px] font-medium">
                                                Click to open account settings
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="progress-fill-danger h-1.5 w-full"/>
                        </div>
                    ))}
                </div>
            )}
            {mainNavContextMenu && (
                <ContextMenu
                    ref={mainNavContextMenuRef}
                    size="nav"
                    layer="1202"
                    position={{left: mainNavContextMenu.x, top: mainNavContextMenu.y}}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <ContextMenuItem
                        type="button"
                        className="transition-colors"
                        onClick={() => {
                            navigate(mainNavContextMenu.to);
                            setMainNavContextMenu(null);
                        }}
                    >
                        Open {mainNavContextMenu.label}
                    </ContextMenuItem>
                    {mainNavContextMenu.id === 'debug' && (
                        <ContextMenuItem
                            type="button"
                            className="transition-colors"
                            onClick={() => {
                                void ipcClient.openDebugWindow();
                                setMainNavContextMenu(null);
                            }}
                        >
                            Open Debug In New Window
                        </ContextMenuItem>
                    )}
                </ContextMenu>
            )}
        </div>
    );
}
