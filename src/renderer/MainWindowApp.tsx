import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
    Bug,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    CircleHelp,
    Cloud,
    Copy,
    Download,
    Mail,
    Minus,
    Pencil,
    Plus,
    RefreshCw,
    Settings,
    Square,
    Trash2,
    Users,
    X,
} from "lucide-react";
import {HashRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams} from "react-router-dom";
import MailPage from "./pages/MailPage";
import AppSettingsPage from "./pages/AppSettingsPage";
import DebugConsolePage from "./pages/DebugConsolePage";
import SupportPage from "./pages/SupportPage";
import SettingsAddAccount from "./pages/SettingsAddAccount";
import CloudFilesPage from "./pages/CloudFilesPage";
import WorkspaceLayout from "./layouts/WorkspaceLayout";
import lunaLogo from "../resources/luna.png";
import type {
    AddressBookItem,
    AppSettings,
    AppStartupState,
    AppStartupStatus,
    AutoUpdateState,
    CalendarEventItem,
    ContactItem,
    PublicAccount,
    SyncStatusEvent,
} from "../preload";
import {getAccountAvatarColors, getAccountMonogram} from "./lib/accountAvatar";
import {formatSystemDateTime} from "./lib/dateTime";
import {useResizableSidebar} from "./hooks/useResizableSidebar";
import {cn} from "./lib/utils";
import NewEmailBadge from "./components/mail/NewEmailBadge";
import {isEditableTarget} from "./lib/dom";

export default function MainWindowApp() {
    return (
        <HashRouter>
            <MainWindowShell/>
        </HashRouter>
    );
}

type TopNavItemId = AppSettings["navRailOrder"][number];
type TopNavItemDef = {
    id: TopNavItemId;
    to: string;
    label: string;
    icon: React.ReactNode;
    badgeCount?: number;
};

const DEFAULT_TOP_NAV_ORDER: TopNavItemId[] = ["email", "contacts", "calendar", "cloud"];

function isTopNavItemId(value: unknown): value is TopNavItemId {
    return value === "email" || value === "cloud" || value === "contacts" || value === "calendar";
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

function reorderTopNavItems(order: TopNavItemId[], sourceId: TopNavItemId, insertionIndex: number): TopNavItemId[] {
    const sourceIndex = order.indexOf(sourceId);
    if (sourceIndex < 0) return order;
    const next = [...order];
    next.splice(sourceIndex, 1);
    const clampedInsertionIndex = Math.max(0, Math.min(order.length, insertionIndex));
    const adjustedInsertionIndex =
        sourceIndex < clampedInsertionIndex ? clampedInsertionIndex - 1 : clampedInsertionIndex;
    next.splice(adjustedInsertionIndex, 0, sourceId);
    return next;
}

function MainWindowShell() {
    const location = useLocation();
    const navigate = useNavigate();
    const [accounts, setAccounts] = useState<PublicAccount[]>([]);
    const [accountsLoaded, setAccountsLoaded] = useState(false);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [totalUnreadCount, setTotalUnreadCount] = useState(0);
    const [isMaximized, setIsMaximized] = useState(false);
    const [appVersion, setAppVersion] = useState("unknown");
    const [autoUpdatePhase, setAutoUpdatePhase] = useState<AutoUpdateState["phase"]>("idle");
    const [autoUpdateMessage, setAutoUpdateMessage] = useState<string | null>(null);
    const [startupStatus, setStartupStatus] = useState<AppStartupStatus>("loading");
    const [startupMessage, setStartupMessage] = useState<string | null>("Preparing startup...");
    const [showAddAccountModal, setShowAddAccountModal] = useState(false);
    const [useNativeTitleBar, setUseNativeTitleBar] = useState(false);
    const [developerMode, setDeveloperMode] = useState(false);
    const [topNavOrder, setTopNavOrder] = useState<TopNavItemId[]>(DEFAULT_TOP_NAV_ORDER);
    const [draggingTopNavItemId, setDraggingTopNavItemId] = useState<TopNavItemId | null>(null);
    const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);
    const dragStartOrderRef = useRef<TopNavItemId[] | null>(null);

    useEffect(() => {
        let active = true;
        const loadAccounts = async () => {
            const rows = await window.electronAPI.getAccounts();
            if (!active) return;
            setAccounts(rows);
            setAccountsLoaded(true);
            setSelectedAccountId((prev) => {
                if (prev && rows.some((account) => account.id === prev)) return prev;
                return rows[0]?.id ?? null;
            });
        };
        void loadAccounts();
        void window.electronAPI
            .getUnreadCount()
            .then((count) => {
                if (!active) return;
                setTotalUnreadCount(Math.max(0, Number(count) || 0));
            })
            .catch(() => undefined);
        const offAdded = window.electronAPI.onAccountAdded?.(() => {
            void loadAccounts();
        });
        const offUpdated = window.electronAPI.onAccountUpdated?.((updated) => {
            setAccounts((prev) => prev.map((account) => (account.id === updated.id ? updated : account)));
        });
        const offDeleted = window.electronAPI.onAccountDeleted?.((deleted) => {
            setAccounts((prev) => prev.filter((account) => account.id !== deleted.id));
            setSelectedAccountId((prev) => (prev === deleted.id ? null : prev));
        });
        const offUnread = window.electronAPI.onUnreadCountUpdated?.((count) => {
            setTotalUnreadCount(Math.max(0, Number(count) || 0));
        });
        return () => {
            active = false;
            if (typeof offAdded === "function") offAdded();
            if (typeof offUpdated === "function") offUpdated();
            if (typeof offDeleted === "function") offDeleted();
            if (typeof offUnread === "function") offUnread();
        };
    }, []);

    useEffect(() => {
        const offOpenAdd = window.electronAPI.onOpenAddAccountModal?.(() => {
            setShowAddAccountModal(true);
        });
        return () => {
            if (typeof offOpenAdd === "function") offOpenAdd();
        };
    }, []);

    useEffect(() => {
        if (!accountsLoaded || startupStatus !== "ready") return;
        if (accounts.length === 0) {
            setShowAddAccountModal(true);
            return;
        }
        setShowAddAccountModal(false);
    }, [accountsLoaded, accounts.length, startupStatus]);

    const pageTitle = useMemo(() => {
        if (startupStatus !== "ready") return "Starting up";
        const path = location.pathname || "/";
        if (path.startsWith("/contacts")) return "Contacts";
        if (path.startsWith("/calendar")) return "Calendar";
        if (path.startsWith("/cloud")) return "Cloud";
        if (path.startsWith("/settings")) return "Settings";
        if (path.startsWith("/debug")) return "Debug";
        if (path.startsWith("/help")) return "Help";
        return "Mail";
    }, [location.pathname, startupStatus]);

    useEffect(() => {
        document.title = pageTitle;
    }, [pageTitle]);

    useEffect(() => {
        let active = true;
        void window.electronAPI
            .isWindowMaximized()
            .then((value) => {
                if (!active) return;
                setIsMaximized(Boolean(value));
            })
            .catch(() => undefined);
        const onResize = () => {
            void window.electronAPI
                .isWindowMaximized()
                .then((value) => {
                    if (!active) return;
                    setIsMaximized(Boolean(value));
                })
                .catch(() => undefined);
        };
        window.addEventListener("resize", onResize);
        return () => {
            active = false;
            window.removeEventListener("resize", onResize);
        };
    }, []);

    useEffect(() => {
        let active = true;
        void window.electronAPI
            .getAppStartupStatus()
            .then((state) => {
                if (!active) return;
                setStartupStatus(state.status);
                setStartupMessage(state.message ?? null);
            })
            .catch(() => undefined);
        const offStartup = window.electronAPI.onAppStartupStatus?.((state) => {
            if (!active) return;
            setStartupStatus(state.status);
            setStartupMessage(state.message ?? null);
        });
        return () => {
            active = false;
            if (typeof offStartup === "function") offStartup();
        };
    }, []);

    useEffect(() => {
        let active = true;
        void window.electronAPI
            .getAutoUpdateState()
            .then((state) => {
                if (!active) return;
                setAppVersion(state.currentVersion || "unknown");
                setAutoUpdatePhase(state.phase);
                setAutoUpdateMessage(state.message ?? null);
            })
            .catch(() => undefined);
        const offUpdate = window.electronAPI.onAutoUpdateStatus?.((state) => {
            if (!active) return;
            setAppVersion(state.currentVersion || "unknown");
            setAutoUpdatePhase(state.phase);
            setAutoUpdateMessage(state.message ?? null);
        });
        return () => {
            active = false;
            if (typeof offUpdate === "function") offUpdate();
        };
    }, []);

    const hasUpdateIndicator =
        autoUpdatePhase === "available" || autoUpdatePhase === "downloading" || autoUpdatePhase === "downloaded";
    const updateIndicatorTitle =
        autoUpdateMessage ||
        (autoUpdatePhase === "downloaded"
            ? "Update downloaded. Open settings to install."
            : autoUpdatePhase === "downloading"
                ? "Update downloading. Open settings for details."
                : "Update available. Open settings for details.");
    const showUpdateBanner = hasUpdateIndicator && startupStatus === "ready";
    const updateBannerText =
        autoUpdateMessage ||
        (autoUpdatePhase === "downloaded"
            ? "An update has been downloaded and is ready to install."
            : autoUpdatePhase === "downloading"
                ? "A new update is downloading in the background."
                : "A new update is available.");

    useEffect(() => {
        let active = true;
        void window.electronAPI
            .getAppSettings()
            .then((settings: AppSettings) => {
                if (!active) return;
                setDeveloperMode(Boolean(settings.developerMode));
                setUseNativeTitleBar(Boolean(settings.useNativeTitleBar));
                setTopNavOrder(normalizeTopNavOrder(settings.navRailOrder));
            })
            .catch(() => undefined);
        const offSettings = window.electronAPI.onAppSettingsUpdated?.((settings: AppSettings) => {
            setDeveloperMode(Boolean(settings.developerMode));
            setUseNativeTitleBar(Boolean(settings.useNativeTitleBar));
            setTopNavOrder(normalizeTopNavOrder(settings.navRailOrder));
        });
        return () => {
            active = false;
            if (typeof offSettings === "function") offSettings();
        };
    }, []);

    const topNavItemsById = useMemo<Record<TopNavItemId, TopNavItemDef>>(
        () => ({
            email: {
                id: "email",
                to: "/email",
                label: "Mail",
                icon: <Mail size={18}/>,
                badgeCount: totalUnreadCount,
            },
            cloud: {
                id: "cloud",
                to: "/cloud",
                label: "Cloud",
                icon: <Cloud size={18}/>,
            },
            contacts: {
                id: "contacts",
                to: "/contacts",
                label: "Contacts",
                icon: <Users size={18}/>,
            },
            calendar: {
                id: "calendar",
                to: "/calendar",
                label: "Calendar",
                icon: <CalendarDays size={18}/>,
            },
        }),
        [totalUnreadCount]
    );

    const orderedTopNavItems = useMemo(
        () => topNavOrder.map((id) => topNavItemsById[id]).filter(Boolean),
        [topNavItemsById, topNavOrder]
    );

    const persistTopNavOrder = useCallback((nextOrder: TopNavItemId[]) => {
        void window.electronAPI.updateAppSettings({navRailOrder: nextOrder}).catch(() => undefined);
    }, []);

    const onTopNavDragStart = useCallback(
        (itemId: TopNavItemId, event: React.DragEvent<HTMLAnchorElement>) => {
            setDraggingTopNavItemId(itemId);
            dragStartOrderRef.current = topNavOrder;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", itemId);
        },
        [topNavOrder]
    );

    const onTopNavDragOver = useCallback(
        (targetItemId: TopNavItemId, event: React.DragEvent<HTMLAnchorElement>) => {
            if (!draggingTopNavItemId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            const rect = event.currentTarget.getBoundingClientRect();
            const targetIndex = topNavOrder.indexOf(targetItemId);
            if (targetIndex < 0) return;
            const nextInsertionIndex = event.clientY >= rect.top + rect.height / 2 ? targetIndex + 1 : targetIndex;
            setDropIndicatorIndex(nextInsertionIndex);
            setTopNavOrder((prev) => {
                const next = reorderTopNavItems(prev, draggingTopNavItemId, nextInsertionIndex);
                if (next.join("|") === prev.join("|")) return prev;
                return next;
            });
        },
        [draggingTopNavItemId, topNavOrder]
    );

    const onTopNavDrop = useCallback((_targetItemId: TopNavItemId, event: React.DragEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        setDropIndicatorIndex(null);
    }, []);

    const onTopNavDragEnd = useCallback(() => {
        const startOrder = dragStartOrderRef.current;
        if (startOrder && startOrder.join("|") !== topNavOrder.join("|")) {
            persistTopNavOrder(topNavOrder);
        }
        setDraggingTopNavItemId(null);
        setDropIndicatorIndex(null);
        dragStartOrderRef.current = null;
    }, [persistTopNavOrder, topNavOrder]);

    return (
        <div
            className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 dark:bg-[#2f3136]"
            onContextMenuCapture={(event) => {
                if (!isEditableTarget(event.target as HTMLElement | null)) return;
                event.stopPropagation();
            }}
        >
            {!useNativeTitleBar && (
                <header
                    className="relative flex h-9 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-2 text-slate-100 dark:border-[#08090c] dark:bg-[#0b0c10]"
                    style={{WebkitAppRegion: "drag"} as React.CSSProperties}
                    onDoubleClick={() => {
                        void window.electronAPI
                            .toggleMaximizeWindow()
                            .then((res) => setIsMaximized(!!res?.isMaximized))
                            .catch(() => undefined);
                    }}
                >
                    <div className="pointer-events-none flex items-center justify-start">
                        <div className="flex items-center gap-2 text-xs font-medium text-white/80">
                            <img src={lunaLogo} alt="" className="h-4 w-4 rounded-sm object-contain" draggable={false}/>
                            <span>LunaMail</span>
                            <span
                                className="text-[10px] font-semibold uppercase tracking-wide text-white/55">v{appVersion}</span>
                        </div>
                    </div>
                    <div
                        className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center justify-center">
                        <span className="text-xs font-semibold uppercase tracking-wide text-white/80">{pageTitle}</span>
                    </div>
                    <div
                        className="flex w-24 shrink-0 items-center justify-end gap-1"
                        style={{WebkitAppRegion: "no-drag"} as React.CSSProperties}
                    >
                        {hasUpdateIndicator && (
                            <button
                                type="button"
                                className="relative inline-flex h-7 w-7 items-center justify-center rounded text-amber-300/95 hover:bg-white/15 hover:text-amber-200"
                                onClick={() => navigate("/settings/application")}
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
                            onClick={() => void window.electronAPI.minimizeWindow()}
                            title="Minimize"
                            aria-label="Minimize"
                        >
                            <Minus size={14}/>
                        </button>
                        <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white"
                            onClick={() =>
                                void window.electronAPI
                                    .toggleMaximizeWindow()
                                    .then((res) => setIsMaximized(!!res?.isMaximized))
                                    .catch(() => undefined)
                            }
                            title={isMaximized ? "Restore" : "Maximize"}
                            aria-label={isMaximized ? "Restore" : "Maximize"}
                        >
                            {isMaximized ? <Copy size={13}/> : <Square size={13}/>}
                        </button>
                        <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-red-600 hover:text-white"
                            onClick={() => void window.electronAPI.closeWindow()}
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
                            onClick={() => navigate("/settings/application")}
                        >
                            Open update settings
                        </button>
                    </div>
                </div>
            )}

            {startupStatus !== "ready" || !accountsLoaded ? (
                <StartupLoadingScreen
                    startupStatus={startupStatus}
                    startupMessage={startupMessage}
                    autoUpdatePhase={autoUpdatePhase}
                    autoUpdateMessage={autoUpdateMessage}
                />
            ) : accounts.length === 0 ? (
                <FirstAccountOnboarding/>
            ) : (
                <div className="flex min-h-0 flex-1 overflow-hidden">
                    <aside
                        className="flex h-full w-16 shrink-0 flex-col items-center justify-between bg-slate-800 py-3 dark:bg-[#111216]">
                        <div className="flex flex-col items-center gap-2">
                            {orderedTopNavItems.map((item, index) => (
                                <NavRailItem
                                    key={item.id}
                                    to={item.to}
                                    icon={item.icon}
                                    label={item.label}
                                    badgeCount={item.badgeCount ?? 0}
                                    draggable
                                    onDragStart={(event) => onTopNavDragStart(item.id, event)}
                                    onDragOver={(event) => onTopNavDragOver(item.id, event)}
                                    onDrop={(event) => onTopNavDrop(item.id, event)}
                                    onDragEnd={onTopNavDragEnd}
                                    dragActive={draggingTopNavItemId === item.id}
                                    showDropIndicatorBefore={draggingTopNavItemId !== null && dropIndicatorIndex === index}
                                    showDropIndicatorAfter={
                                        draggingTopNavItemId !== null &&
                                        index === orderedTopNavItems.length - 1 &&
                                        dropIndicatorIndex === orderedTopNavItems.length
                                    }
                                />
                            ))}
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <div className="my-0.5 h-px w-8 bg-slate-500/70 dark:bg-slate-400/30" aria-hidden/>
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
            )}
            {developerMode && startupStatus === "ready" && (
                <div
                    className="pointer-events-none fixed bottom-3 right-3 z-[1200] rounded-md border border-slate-300/80 bg-white/95 px-2.5 py-1.5 font-mono text-[11px] text-slate-700 shadow-sm dark:border-[#4a4d55] dark:bg-[#1e1f22]/95 dark:text-slate-200">
                    {`#${location.pathname}${location.search || ""}`}
                </div>
            )}
            {showAddAccountModal && startupStatus === "ready" && accounts.length > 0 && (
                <AddAccountModal
                    useNativeTitleBar={useNativeTitleBar}
                    lockOpen={accounts.length === 0}
                    onClose={() => setShowAddAccountModal(false)}
                />
            )}
        </div>
    );
}

function AddAccountModal({
                             useNativeTitleBar,
                             lockOpen,
                             onClose,
                         }: {
    useNativeTitleBar: boolean;
    lockOpen: boolean;
    onClose: () => void;
}) {
    return (
        <div
            className={cn(
                "absolute inset-x-0 bottom-0 z-[900] bg-slate-900/30 backdrop-blur-[2px] dark:bg-black/34",
                useNativeTitleBar ? "top-0" : "top-9"
            )}
        >
            <div className="mx-auto flex h-full w-full max-w-[1180px] items-center justify-center p-5">
                <div
                    className="h-[min(820px,92vh)] w-full overflow-hidden rounded-lg border border-slate-300/70 bg-white shadow-xl dark:border-[#3b3f48] dark:bg-[#313338]">
                    <SettingsAddAccount embedded onCompleted={onClose} onCancel={lockOpen ? undefined : onClose}/>
                </div>
            </div>
        </div>
    );
}

function FirstAccountOnboarding() {
    return (
        <div className="relative flex min-h-0 flex-1 overflow-hidden bg-slate-900 dark:bg-[#0b0c10]">
            <div
                className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_20%_18%,rgba(148,163,184,0.18),transparent_42%),radial-gradient(circle_at_75%_78%,rgba(71,85,105,0.16),transparent_48%)]"/>
            <div
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.2),transparent_34%,rgba(2,6,23,0.35))]"/>

            <div className="relative flex h-full w-full items-stretch gap-0">
                <div
                    className="hidden w-[340px] shrink-0 border-r border-slate-700/70 bg-slate-900/60 p-7 backdrop-blur-md lg:block dark:border-[#2e3139] dark:bg-[#0f1116]/85">
                    <div
                        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-600/70 bg-slate-800 shadow-sm dark:border-[#3b3f48] dark:bg-[#272a31]">
                        <img src={lunaLogo} alt="" className="h-9 w-9 object-contain opacity-90" draggable={false}/>
                    </div>
                    <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-100">Welcome to LunaMail</h1>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                        Connect your first account to start syncing mail, contacts, and calendar.
                    </p>
                    <p className="mt-5 text-xs uppercase tracking-wide text-slate-400">Account setup</p>
                    <p className="mt-1 text-xs text-slate-400">Autodiscover first, manual fallback if needed.</p>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                    <SettingsAddAccount embedded/>
                </div>
            </div>
        </div>
    );
}

function StartupLoadingScreen({
                                  startupStatus,
                                  startupMessage,
                                  autoUpdatePhase,
                                  autoUpdateMessage,
                              }: {
    startupStatus: AppStartupState["status"];
    startupMessage: string | null;
    autoUpdatePhase: AutoUpdateState["phase"];
    autoUpdateMessage: string | null;
}) {
    const phaseText =
        startupMessage ||
        (startupStatus === "warming"
            ? "Warming up mailbox cache..."
            : autoUpdatePhase === "checking"
                ? "Checking for updates..."
                : autoUpdatePhase === "downloading"
                    ? "Downloading update..."
                    : autoUpdatePhase === "downloaded"
                        ? "Installing update..."
                        : "Preparing your mail workspace...");
    const phaseFromUpdater = startupStatus === "loading" ? autoUpdateMessage : null;
    const progress = resolveStartupProgress(startupStatus, autoUpdatePhase);

    return (
        <div
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-slate-900 dark:bg-[#0b0c10]">
            <div
                className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_20%_18%,rgba(148,163,184,0.18),transparent_42%),radial-gradient(circle_at_75%_78%,rgba(71,85,105,0.16),transparent_48%)]"/>
            <div
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.2),transparent_34%,rgba(2,6,23,0.35))]"/>
            <div
                className="relative mx-5 w-full max-w-[560px] rounded-2xl border border-slate-700/70 bg-slate-800/65 px-8 py-9 shadow-xl backdrop-blur-md dark:border-[#2e3139] dark:bg-[#16181d]/82">
                <div
                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-600/70 bg-slate-800 shadow-sm dark:border-[#3b3f48] dark:bg-[#272a31]">
                    <img src={lunaLogo} alt="" className="h-11 w-11 object-contain opacity-90" draggable={false}/>
                </div>
                <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight text-slate-100">LunaMail</h1>
                <div className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-300">
          <span
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-500 border-t-slate-200"
              aria-hidden
          />
                    <p>{phaseText}</p>
                </div>
                {phaseFromUpdater && <p className="mt-1 text-center text-xs text-slate-400">{phaseFromUpdater}</p>}
                <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-slate-700/70 dark:bg-[#2d3138]">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-slate-400 via-slate-300 to-slate-400 transition-[width] duration-500"
                        style={{width: `${progress}%`}}
                    />
                </div>
                <div className="mt-2 text-right text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {progress}%
                </div>
            </div>
        </div>
    );
}

function resolveStartupProgress(status: AppStartupStatus, phase: AutoUpdateState["phase"]): number {
    if (status === "warming") return 94;
    if (phase === "checking") return 30;
    if (phase === "available") return 50;
    if (phase === "downloading") return 75;
    if (phase === "downloaded") return 92;
    if (phase === "not-available" || phase === "disabled") return 82;
    if (phase === "error") return 70;
    return 20;
}

function SettingsRoute() {
    const {tab, accountId} = useParams<{ tab?: string; accountId?: string }>();
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const normalizedTab = String(tab || "").toLowerCase();
    if (location.pathname.startsWith("/settings/account/")) {
        const directAccountId = Number(accountId);
        if (!Number.isFinite(directAccountId) || directAccountId <= 0) {
            return <Navigate to="/settings/application" replace/>;
        }
        return (
            <AppSettingsPage
                embedded
                targetAccountId={directAccountId}
                initialPanel="app"
                openUpdaterToken={query.get("openUpdater")}
            />
        );
    }
    const validTabs = new Set(["application", "layout", "developer", "account"]);
    if (!validTabs.has(normalizedTab)) {
        return <Navigate to="/settings/application" replace/>;
    }
    const rawTarget = Number(query.get("accountId"));
    const targetAccountId = normalizedTab === "account" && Number.isFinite(rawTarget) ? rawTarget : null;
    if (normalizedTab === "account" && targetAccountId === null) {
        return <Navigate to="/settings/application" replace/>;
    }
    const panel = normalizedTab === "developer" ? "developer" : normalizedTab === "layout" ? "layout" : "app";
    const openUpdaterToken = query.get("openUpdater");
    return (
        <AppSettingsPage
            embedded
            targetAccountId={targetAccountId}
            initialPanel={panel}
            openUpdaterToken={openUpdaterToken}
        />
    );
}

function NavRailItem({
                         to,
                         icon,
                         label,
                         badgeCount = 0,
                         draggable = false,
                         onDragStart,
                         onDragOver,
                         onDrop,
                         onDragEnd,
                         dragActive = false,
                         showDropIndicatorBefore = false,
                         showDropIndicatorAfter = false,
                     }: {
    to: string;
    icon: React.ReactNode;
    label: string;
    badgeCount?: number;
    draggable?: boolean;
    onDragStart?: (event: React.DragEvent<HTMLAnchorElement>) => void;
    onDragOver?: (event: React.DragEvent<HTMLAnchorElement>) => void;
    onDrop?: (event: React.DragEvent<HTMLAnchorElement>) => void;
    onDragEnd?: () => void;
    dragActive?: boolean;
    showDropIndicatorBefore?: boolean;
    showDropIndicatorAfter?: boolean;
}) {
    return (
        <NavLink
            to={to}
            title={label}
            aria-label={label}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            className={({isActive}) =>
                cn(
                    "relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 transition-all hover:bg-white/10 hover:text-white",
                    draggable && "cursor-pointer",
                    dragActive && "scale-95 opacity-70",
                    isActive && "bg-white/15 text-white"
                )
            }
        >
            {showDropIndicatorBefore && (
                <span
                    className="pointer-events-none absolute -top-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-sky-300 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]"
                    aria-hidden
                />
            )}
            {showDropIndicatorAfter && (
                <span
                    className="pointer-events-none absolute -bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-sky-300 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]"
                    aria-hidden
                />
            )}
            <span className="relative inline-flex">
        {icon}
                <NewEmailBadge
                    count={badgeCount}
                    className="absolute -right-2.5 -top-2 min-h-5 min-w-5 px-1 text-[10px]"
                    title={`${badgeCount} unread`}
                />
      </span>
        </NavLink>
    );
}

function ContactsRoute({
                           accountId,
                           accounts,
                           onSelectAccount,
                       }: {
    accountId: number | null;
    accounts: PublicAccount[];
    onSelectAccount: (accountId: number | null) => void;
}) {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [contacts, setContacts] = useState<ContactItem[]>([]);
    const [addressBooks, setAddressBooks] = useState<AddressBookItem[]>([]);
    const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
    const [newContactName, setNewContactName] = useState("");
    const [newContactEmail, setNewContactEmail] = useState("");
    const [newContactPhone, setNewContactPhone] = useState("");
    const [newContactOrganization, setNewContactOrganization] = useState("");
    const [newContactTitle, setNewContactTitle] = useState("");
    const [newContactNote, setNewContactNote] = useState("");
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [showExportContactsModal, setShowExportContactsModal] = useState(false);
    const [exportFormat, setExportFormat] = useState<"csv" | "vcf">("csv");
    const [exportBookMode, setExportBookMode] = useState<"all" | "selected">("selected");
    const [exportingContacts, setExportingContacts] = useState(false);
    const [editingContact, setEditingContact] = useState<ContactItem | null>(null);
    const [editContactName, setEditContactName] = useState("");
    const [editContactEmail, setEditContactEmail] = useState("");
    const [editContactPhone, setEditContactPhone] = useState("");
    const [editContactOrganization, setEditContactOrganization] = useState("");
    const [editContactTitle, setEditContactTitle] = useState("");
    const [editContactNote, setEditContactNote] = useState("");
    const [editContactBookId, setEditContactBookId] = useState<number | null>(null);
    const [savingEditContact, setSavingEditContact] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatusText, setSyncStatusText] = useState<string>("Contacts ready");
    const [contactError, setContactError] = useState<string | null>(null);
    const {sidebarWidth, onResizeStart} = useResizableSidebar();
    const queryRef = useRef(query);
    const selectedBookIdRef = useRef<number | null>(selectedBookId);

    const loadContacts = React.useCallback(async (targetAccountId: number, q: string, bookId: number | null) => {
        const rows = await window.electronAPI.getContacts(targetAccountId, q.trim() || null, 600, bookId ?? null);
        setContacts(rows);
    }, []);

    useEffect(() => {
        queryRef.current = query;
    }, [query]);

    useEffect(() => {
        selectedBookIdRef.current = selectedBookId;
    }, [selectedBookId]);

    useEffect(() => {
        if (!accountId) {
            setContacts([]);
            setAddressBooks([]);
            setSelectedBookId(null);
            setShowAddContactModal(false);
            setShowExportContactsModal(false);
            setEditingContact(null);
            setSyncing(false);
            setSyncStatusText("No account selected.");
            setLoading(false);
            return;
        }
        setSyncStatusText("Contacts ready");
        let active = true;
        const load = async () => {
            setLoading(true);
            setContactError(null);
            try {
                const books = await window.electronAPI.getAddressBooks(accountId);
                if (!active) return;
                setAddressBooks(books);
                const effectiveBookId =
                    selectedBookId && books.some((book) => book.id === selectedBookId) ? selectedBookId : (books[0]?.id ?? null);
                setSelectedBookId(effectiveBookId);
                const rows = await window.electronAPI.getContacts(accountId, query.trim() || null, 600, effectiveBookId);
                if (!active) return;
                setContacts(rows);
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        return () => {
            active = false;
        };
    }, [accountId, query, selectedBookId]);

    useEffect(() => {
        const offSync = window.electronAPI.onAccountSyncStatus?.((evt: SyncStatusEvent) => {
            if (!accountId || evt.accountId !== accountId) return;
            if (evt.status === "syncing") {
                setSyncing(true);
                setSyncStatusText("Syncing...");
                return;
            }
            if (evt.status === "error") {
                setSyncing(false);
                setSyncStatusText(`Sync failed: ${evt.error ?? "unknown error"}`);
                return;
            }
            setSyncing(false);
            const davSummary = evt.summary?.dav;
            if (davSummary) {
                setSyncStatusText(
                    `Sync complete: ${davSummary.contacts.upserted} contacts, ${davSummary.events.upserted} events`
                );
                return;
            }
            setSyncStatusText(`Sync complete: ${evt.summary?.messages ?? 0} messages`);
        });
        return () => {
            if (typeof offSync === "function") offSync();
        };
    }, [accountId]);

    useEffect(() => {
        if (!accountId) return;
        let active = true;
        setSyncing(true);
        setSyncStatusText("Syncing...");
        setContactError(null);
        void window.electronAPI
            .syncDav(accountId)
            .then(async () => {
                if (!active) return;
                const books = await window.electronAPI.getAddressBooks(accountId);
                if (!active) return;
                setAddressBooks(books);
                const latestSelectedBookId = selectedBookIdRef.current;
                const effectiveBookId =
                    latestSelectedBookId && books.some((book) => book.id === latestSelectedBookId)
                        ? latestSelectedBookId
                        : (books[0]?.id ?? null);
                setSelectedBookId(effectiveBookId);
                await loadContacts(accountId, queryRef.current, effectiveBookId);
                if (!active) return;
                setSyncing(false);
                setSyncStatusText("Contacts synced");
            })
            .catch((error: any) => {
                if (!active) return;
                setSyncing(false);
                setContactError(error?.message || String(error));
                setSyncStatusText(`Auto-sync failed: ${error?.message || String(error)}`);
            });
        return () => {
            active = false;
        };
    }, [accountId, loadContacts]);

    async function onAddContact() {
        if (!accountId) return;
        const email = newContactEmail.trim();
        if (!email) return;
        setContactError(null);
        try {
            await window.electronAPI.addContact(accountId, {
                addressBookId: selectedBookId,
                fullName: newContactName.trim() || null,
                email,
                phone: newContactPhone.trim() || null,
                organization: newContactOrganization.trim() || null,
                title: newContactTitle.trim() || null,
                note: newContactNote.trim() || null,
            });
            setNewContactName("");
            setNewContactEmail("");
            setNewContactPhone("");
            setNewContactOrganization("");
            setNewContactTitle("");
            setNewContactNote("");
            setShowAddContactModal(false);
            await loadContacts(accountId, query, selectedBookId);
        } catch (error: any) {
            setContactError(error?.message || String(error));
        }
    }

    async function onDeleteContact(contactId: number) {
        if (!accountId) return;
        setContactError(null);
        try {
            await window.electronAPI.deleteContact(contactId);
            await loadContacts(accountId, query, selectedBookId);
        } catch (error: any) {
            setContactError(error?.message || String(error));
        }
    }

    function openEditContact(contact: ContactItem) {
        setEditingContact(contact);
        setEditContactName(contact.full_name || "");
        setEditContactEmail(contact.email || "");
        setEditContactPhone(contact.phone || "");
        setEditContactOrganization(contact.organization || "");
        setEditContactTitle(contact.title || "");
        setEditContactNote(contact.note || "");
        setEditContactBookId(contact.address_book_id ?? selectedBookId ?? null);
        setContactError(null);
    }

    async function onSaveEditedContact() {
        if (!accountId || !editingContact) return;
        const email = editContactEmail.trim();
        if (!email) return;
        setSavingEditContact(true);
        setContactError(null);
        try {
            await window.electronAPI.updateContact(editingContact.id, {
                addressBookId: editContactBookId,
                fullName: editContactName.trim() || null,
                email,
                phone: editContactPhone.trim() || null,
                organization: editContactOrganization.trim() || null,
                title: editContactTitle.trim() || null,
                note: editContactNote.trim() || null,
            });
            setEditingContact(null);
            await loadContacts(accountId, query, selectedBookId);
        } catch (error: any) {
            setContactError(error?.message || String(error));
        } finally {
            setSavingEditContact(false);
        }
    }

    async function onExportContacts() {
        if (!accountId || exportingContacts) return;
        setExportingContacts(true);
        setContactError(null);
        try {
            const result = await window.electronAPI.exportContacts(accountId, {
                format: exportFormat,
                addressBookId: exportBookMode === "selected" ? selectedBookId : null,
            });
            if (result.canceled) {
                setSyncStatusText("Export cancelled");
            } else {
                setSyncStatusText(`Exported ${result.count} contacts`);
                setShowExportContactsModal(false);
            }
        } catch (error: any) {
            setContactError(error?.message || String(error));
        } finally {
            setExportingContacts(false);
        }
    }

    async function onDeleteSelectedAddressBook() {
        if (!accountId || !selectedBookId) return;
        const targetBook = addressBooks.find((book) => book.id === selectedBookId);
        if (!targetBook) return;
        if (targetBook.source !== "local") {
            setContactError("Only local address books can be deleted.");
            return;
        }
        const deleteAddressBookFn = (window.electronAPI as any).deleteAddressBook;
        if (typeof deleteAddressBookFn !== "function") {
            setContactError("Delete address book is unavailable in this session. Please restart LunaMail once.");
            return;
        }
        const shouldDelete = window.confirm(`Delete address book "${targetBook.name}"?`);
        if (!shouldDelete) return;
        setContactError(null);
        try {
            await deleteAddressBookFn(accountId, selectedBookId);
            const books = await window.electronAPI.getAddressBooks(accountId);
            setAddressBooks(books);
            const nextBookId = books[0]?.id ?? null;
            setSelectedBookId(nextBookId);
            await loadContacts(accountId, query, nextBookId);
        } catch (error: any) {
            setContactError(error?.message || String(error));
        }
    }

    async function onManualSync() {
        if (!accountId || syncing) return;
        setContactError(null);
        setSyncing(true);
        setSyncStatusText("Syncing...");
        try {
            await window.electronAPI.syncAccount(accountId);
            const books = await window.electronAPI.getAddressBooks(accountId);
            setAddressBooks(books);
            const effectiveBookId =
                selectedBookId && books.some((book) => book.id === selectedBookId) ? selectedBookId : (books[0]?.id ?? null);
            setSelectedBookId(effectiveBookId);
            await loadContacts(accountId, query, effectiveBookId);
        } catch (error: any) {
            setSyncing(false);
            const message = error?.message || String(error);
            setSyncStatusText(`Sync failed: ${message}`);
            setContactError(message);
        }
    }

    const accountSidebar = (
        <aside
            className="flex h-full min-h-0 shrink-0 flex-col justify-between border-r border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Accounts
                </p>
                <div className="space-y-1">
                    {accounts.map((account) => {
                        const avatarColors = getAccountAvatarColors(account.email || account.display_name || String(account.id));
                        return (
                            <button
                                key={account.id}
                                type="button"
                                onClick={() => onSelectAccount(account.id)}
                                className={cn(
                                    "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                                    accountId === account.id
                                        ? "bg-sky-100 text-sky-900 dark:bg-[#3d4153] dark:text-slate-100"
                                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]"
                                )}
                            >
                                <div className="flex min-w-0 items-center gap-2">
                  <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ring-1 ring-black/10 dark:ring-white/10"
                      style={{
                          backgroundColor: avatarColors.background,
                          color: avatarColors.foreground,
                      }}
                  >
                    {getAccountMonogram(account)}
                  </span>
                                    <span className="min-w-0 flex-1">
                    <span className="block truncate">{account.display_name?.trim() || account.email}</span>
                                        {account.display_name?.trim() && (
                                            <span
                                                className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        {account.email}
                      </span>
                                        )}
                  </span>
                                </div>
                            </button>
                        );
                    })}
                    {accounts.length === 0 && (
                        <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">No accounts available.</p>
                    )}
                </div>
            </div>
            <div className="shrink-0 border-t border-slate-200 px-2 py-3 dark:border-[#3a3d44]">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={syncing}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]"
                        onClick={() => void onManualSync()}
                        title="Sync now"
                        aria-label="Sync now"
                    >
                        <RefreshCw size={14} className={cn(syncing && "animate-spin")}/>
                    </button>
                </div>
            </div>
        </aside>
    );
    const contactsToolbar = (
        <div className="flex h-10 min-w-0 items-center gap-2">
            <select
                value={selectedBookId ?? ""}
                onChange={(event) => setSelectedBookId(event.target.value ? Number(event.target.value) : null)}
                className="h-10 min-w-52 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                disabled={!accountId}
            >
                {addressBooks.map((book) => (
                    <option key={book.id} value={book.id}>
                        {book.name}
                    </option>
                ))}
            </select>
            <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]"
                disabled={
                    !accountId || !selectedBookId || addressBooks.find((book) => book.id === selectedBookId)?.source !== "local"
                }
                onClick={() => void onDeleteSelectedAddressBook()}
                title="Delete address book"
                aria-label="Delete address book"
            >
                <Trash2 size={14}/>
            </button>
            <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search contacts..."
                className="h-10 min-w-0 w-full max-w-xl rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                disabled={!accountId}
            />
            <button
                type="button"
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-md bg-sky-600 px-3 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-60 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                onClick={() => setShowAddContactModal(true)}
                disabled={!accountId}
                title="Add contact"
                aria-label="Add contact"
            >
                <Plus size={14}/>
                Add contact
            </button>
            <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]"
                onClick={() => setShowExportContactsModal(true)}
                disabled={!accountId}
                title="Export contacts"
                aria-label="Export contacts"
            >
                <Download size={14}/>
                Export
            </button>
        </div>
    );

    return (
        <WorkspaceLayout
            sidebar={accountSidebar}
            sidebarWidth={sidebarWidth}
            onSidebarResizeStart={onResizeStart}
            menubar={contactsToolbar}
            showMenuBar
            statusText={syncing && syncStatusText.toLowerCase().includes("ready") ? "Syncing..." : syncStatusText}
            statusBusy={syncing}
        >
            <div className="mx-auto max-w-5xl">
                {!accountId && <p className="text-sm text-slate-500 dark:text-slate-400">No account selected.</p>}
                {accountId && (
                    <>
                        {contactError && <p className="mb-3 text-sm text-red-600 dark:text-red-300">{contactError}</p>}
                        {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading contacts...</p>}
                        {!loading && contacts.length === 0 && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No contacts found.</p>
                        )}
                        {!loading && contacts.length > 0 && (
                            <div
                                className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                <ul className="divide-y divide-slate-200 dark:divide-[#3a3d44]">
                                    {contacts.map((contact) => (
                                        <li key={contact.id} className="px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                        {contact.full_name || "(No name)"}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{contact.email}</p>
                                                    {(contact.phone || contact.organization || contact.title) && (
                                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                            {[contact.phone, contact.organization, contact.title].filter(Boolean).join(" • ")}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                        onClick={() => openEditContact(contact)}
                                                        disabled={!contact.source.startsWith("local:")}
                                                        title={
                                                            contact.source.startsWith("local:") ? "Edit contact" : "Only local contacts can be edited"
                                                        }
                                                    >
                                                        <Pencil size={12} className="mr-1 inline-block"/>
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700/50 dark:text-red-300 dark:hover:bg-red-900/30"
                                                        onClick={() => void onDeleteContact(contact.id)}
                                                        disabled={!contact.source.startsWith("local:")}
                                                        title={
                                                            contact.source.startsWith("local:")
                                                                ? "Delete contact"
                                                                : "Only local contacts can be deleted"
                                                        }
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </div>

            {showAddContactModal && accountId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setShowAddContactModal(false)}
                >
                    <div
                        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void onAddContact();
                            }}
                        >
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add Contact</h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Create a contact for the selected account.
                            </p>
                            <div className="mt-4 space-y-3">
                                <label className="block text-sm">
                                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Full name</span>
                                    <input
                                        type="text"
                                        value={newContactName}
                                        onChange={(event) => setNewContactName(event.target.value)}
                                        placeholder="Jane Doe"
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Email</span>
                                    <input
                                        type="email"
                                        value={newContactEmail}
                                        onChange={(event) => setNewContactEmail(event.target.value)}
                                        placeholder="jane@domain.com"
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        required
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Phone</span>
                                    <input
                                        type="text"
                                        value={newContactPhone}
                                        onChange={(event) => setNewContactPhone(event.target.value)}
                                        placeholder="+46 70 123 45 67"
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Organization</span>
                                    <input
                                        type="text"
                                        value={newContactOrganization}
                                        onChange={(event) => setNewContactOrganization(event.target.value)}
                                        placeholder="Acme Inc."
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Title</span>
                                    <input
                                        type="text"
                                        value={newContactTitle}
                                        onChange={(event) => setNewContactTitle(event.target.value)}
                                        placeholder="Sales Manager"
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Notes</span>
                                    <textarea
                                        value={newContactNote}
                                        onChange={(event) => setNewContactNote(event.target.value)}
                                        rows={3}
                                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                            </div>
                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                    onClick={() => setShowAddContactModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                    disabled={!newContactEmail.trim()}
                                >
                                    Save Contact
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingContact && accountId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setEditingContact(null)}
                >
                    <div
                        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void onSaveEditedContact();
                            }}
                        >
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Edit Contact</h3>
                            <div className="mt-4 space-y-3">
                                <label className="block text-sm">
                                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Full name</span>
                                    <input
                                        type="text"
                                        value={editContactName}
                                        onChange={(event) => setEditContactName(event.target.value)}
                                        placeholder="Jane Doe"
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Email</span>
                                    <input
                                        type="email"
                                        value={editContactEmail}
                                        onChange={(event) => setEditContactEmail(event.target.value)}
                                        placeholder="jane@domain.com"
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        required
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Phone</span>
                                    <input
                                        type="text"
                                        value={editContactPhone}
                                        onChange={(event) => setEditContactPhone(event.target.value)}
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Organization</span>
                                    <input
                                        type="text"
                                        value={editContactOrganization}
                                        onChange={(event) => setEditContactOrganization(event.target.value)}
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Title</span>
                                    <input
                                        type="text"
                                        value={editContactTitle}
                                        onChange={(event) => setEditContactTitle(event.target.value)}
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Notes</span>
                                    <textarea
                                        value={editContactNote}
                                        onChange={(event) => setEditContactNote(event.target.value)}
                                        rows={3}
                                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Address book</span>
                                    <select
                                        value={editContactBookId ?? ""}
                                        onChange={(event) => setEditContactBookId(event.target.value ? Number(event.target.value) : null)}
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    >
                                        {addressBooks.map((book) => (
                                            <option key={book.id} value={book.id}>
                                                {book.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                    onClick={() => setEditingContact(null)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                    disabled={savingEditContact || !editContactEmail.trim()}
                                >
                                    {savingEditContact ? "Saving..." : "Save changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showExportContactsModal && accountId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setShowExportContactsModal(false)}
                >
                    <div
                        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Export Contacts</h3>
                        <div className="mt-4 space-y-3">
                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Format</span>
                                <select
                                    value={exportFormat}
                                    onChange={(event) => setExportFormat(event.target.value === "vcf" ? "vcf" : "csv")}
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                >
                                    <option value="csv">CSV (.csv)</option>
                                    <option value="vcf">vCard (.vcf)</option>
                                </select>
                            </label>
                            <label className="block text-sm">
                                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Scope</span>
                                <select
                                    value={exportBookMode}
                                    onChange={(event) => setExportBookMode(event.target.value === "all" ? "all" : "selected")}
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                >
                                    <option value="selected">Current book</option>
                                    <option value="all">All books</option>
                                </select>
                            </label>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => setShowExportContactsModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                onClick={() => void onExportContacts()}
                                disabled={exportingContacts}
                            >
                                <Download size={14}/>
                                {exportingContacts ? "Exporting..." : "Export"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </WorkspaceLayout>
    );
}

function CalendarRoute({
                           accountId,
                           accounts,
                           onSelectAccount,
                       }: {
    accountId: number | null;
    accounts: PublicAccount[];
    onSelectAccount: (accountId: number | null) => void;
}) {
    const DAY_CONTEXT_MENU_WIDTH = 224;
    const DAY_CONTEXT_MENU_HEIGHT = 92;
    const DAY_CONTEXT_MENU_MARGIN = 8;
    const [loading, setLoading] = useState(false);
    const [savingEvent, setSavingEvent] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatusText, setSyncStatusText] = useState("Calendar ready");
    const [events, setEvents] = useState<CalendarEventItem[]>([]);
    const [systemLocale, setSystemLocale] = useState<string>("en-US");
    const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
    const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null);
    const [selectedDayForModal, setSelectedDayForModal] = useState<string | null>(null);
    const [dayContextMenu, setDayContextMenu] = useState<{ x: number; y: number; dayKey: string } | null>(null);
    const dayContextMenuRef = useRef<HTMLDivElement | null>(null);
    const [showAddEventModal, setShowAddEventModal] = useState(false);
    const [calendarError, setCalendarError] = useState<string | null>(null);
    const [eventTitle, setEventTitle] = useState("");
    const [eventLocation, setEventLocation] = useState("");
    const [eventDescription, setEventDescription] = useState("");
    const [eventStartDate, setEventStartDate] = useState(() => toDateInputValue(nextRoundedHour()));
    const [eventStartTime, setEventStartTime] = useState(() => toTimeInputValue(nextRoundedHour()));
    const [eventEndDate, setEventEndDate] = useState(() => toDateInputValue(addHours(nextRoundedHour(), 1)));
    const [eventEndTime, setEventEndTime] = useState(() => toTimeInputValue(addHours(nextRoundedHour(), 1)));
    const {sidebarWidth, onResizeStart} = useResizableSidebar();
    const calendarBoundsRef = useRef<{ gridStart: Date; gridEnd: Date } | null>(null);

    useEffect(() => {
        void window.electronAPI
            .getSystemLocale()
            .then((locale) => {
                setSystemLocale(locale || "en-US");
            })
            .catch(() => {
                setSystemLocale("en-US");
            });
    }, []);

    const calendarBounds = useMemo(() => {
        const monthStart = startOfMonth(visibleMonth);
        const monthEnd = endOfMonth(visibleMonth);
        return {
            monthStart,
            monthEnd,
            gridStart: startOfWeekMonday(monthStart),
            gridEnd: endOfWeekMonday(monthEnd),
        };
    }, [visibleMonth]);

    const inputLocale = useMemo(() => {
        const normalized = String(systemLocale || "").trim();
        return normalized || "en-US";
    }, [systemLocale]);

    const calendarDays = useMemo(() => {
        const days: Date[] = [];
        const cursor = new Date(calendarBounds.gridStart);
        while (cursor <= calendarBounds.gridEnd) {
            days.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
        return days;
    }, [calendarBounds]);

    useEffect(() => {
        calendarBoundsRef.current = {
            gridStart: calendarBounds.gridStart,
            gridEnd: calendarBounds.gridEnd,
        };
    }, [calendarBounds]);

    useEffect(() => {
        if (!accountId) {
            setEvents([]);
            setLoading(false);
            setSyncing(false);
            setSyncStatusText("No account selected.");
            return;
        }
        let active = true;
        const load = async () => {
            setLoading(true);
            setCalendarError(null);
            try {
                const start = new Date(calendarBounds.gridStart);
                start.setHours(0, 0, 0, 0);
                const end = new Date(calendarBounds.gridEnd);
                end.setHours(23, 59, 59, 999);
                const rows = await window.electronAPI.getCalendarEvents(
                    accountId,
                    start.toISOString(),
                    end.toISOString(),
                    5000
                );
                if (!active) return;
                setEvents(rows);
            } catch (error: any) {
                if (!active) return;
                setCalendarError(error?.message || String(error));
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        return () => {
            active = false;
        };
    }, [accountId, calendarBounds]);

    useEffect(() => {
        if (!accountId) return;
        let active = true;
        setSyncing(true);
        setSyncStatusText("Syncing...");
        setCalendarError(null);
        void window.electronAPI
            .syncDav(accountId)
            .then(async () => {
                if (!active) return;
                const latestBounds = calendarBoundsRef.current;
                if (!latestBounds) return;
                const start = new Date(latestBounds.gridStart);
                start.setHours(0, 0, 0, 0);
                const end = new Date(latestBounds.gridEnd);
                end.setHours(23, 59, 59, 999);
                const rows = await window.electronAPI.getCalendarEvents(
                    accountId,
                    start.toISOString(),
                    end.toISOString(),
                    5000
                );
                if (!active) return;
                setEvents(rows);
                setSyncing(false);
                setSyncStatusText("Calendar synced");
            })
            .catch((error: any) => {
                if (!active) return;
                setSyncing(false);
                setCalendarError(error?.message || String(error));
                setSyncStatusText(`Auto-sync failed: ${error?.message || String(error)}`);
            });
        return () => {
            active = false;
        };
    }, [accountId]);

    const eventsByDay = useMemo(() => {
        const byDay = new Map<string, CalendarEventItem[]>();
        for (const event of events) {
            const startsAt = event.starts_at ? new Date(event.starts_at) : null;
            if (!startsAt || Number.isNaN(startsAt.getTime())) continue;
            const key = toDateKey(startsAt);
            const bucket = byDay.get(key);
            if (!bucket) byDay.set(key, [event]);
            else bucket.push(event);
        }
        for (const bucket of byDay.values()) {
            bucket.sort((a, b) => (Date.parse(a.starts_at || "") || 0) - (Date.parse(b.starts_at || "") || 0));
        }
        return byDay;
    }, [events]);

    const openDayContextMenu = useCallback((x: number, y: number, dayKey: string) => {
        const maxX = Math.max(
            DAY_CONTEXT_MENU_MARGIN,
            window.innerWidth - DAY_CONTEXT_MENU_WIDTH - DAY_CONTEXT_MENU_MARGIN
        );
        const maxY = Math.max(
            DAY_CONTEXT_MENU_MARGIN,
            window.innerHeight - DAY_CONTEXT_MENU_HEIGHT - DAY_CONTEXT_MENU_MARGIN
        );
        const clampedX = Math.min(Math.max(DAY_CONTEXT_MENU_MARGIN, x), maxX);
        const clampedY = Math.min(Math.max(DAY_CONTEXT_MENU_MARGIN, y), maxY);
        setDayContextMenu({x: clampedX, y: clampedY, dayKey});
    }, []);

    useEffect(() => {
        if (!dayContextMenu) return;

        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && dayContextMenuRef.current?.contains(target)) return;
            setDayContextMenu(null);
        };

        const handleContextMenuWhileOpen = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            const dayCell = target?.closest("[data-calendar-day-key]") as HTMLElement | null;
            if (dayCell?.dataset.calendarDayKey) {
                event.preventDefault();
                openDayContextMenu(event.clientX, event.clientY, dayCell.dataset.calendarDayKey);
                return;
            }
            if (target && dayContextMenuRef.current?.contains(target)) {
                event.preventDefault();
                return;
            }
            event.preventDefault();
            setDayContextMenu(null);
        };

        const closeDayContextMenu = () => {
            setDayContextMenu(null);
        };

        window.addEventListener("pointerdown", closeOnOutsidePointer);
        window.addEventListener("contextmenu", handleContextMenuWhileOpen);
        window.addEventListener("resize", closeDayContextMenu);
        window.addEventListener("scroll", closeDayContextMenu, true);
        return () => {
            window.removeEventListener("pointerdown", closeOnOutsidePointer);
            window.removeEventListener("contextmenu", handleContextMenuWhileOpen);
            window.removeEventListener("resize", closeDayContextMenu);
            window.removeEventListener("scroll", closeDayContextMenu, true);
        };
    }, [dayContextMenu, openDayContextMenu]);

    async function onCreateEvent() {
        if (!accountId) return;
        setCalendarError(null);
        setSavingEvent(true);
        try {
            const startDate = composeLocalDateTime(eventStartDate, eventStartTime);
            const endDate = composeLocalDateTime(eventEndDate, eventEndTime);
            if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
                throw new Error("Please provide a valid start and end date/time.");
            }
            const created = await window.electronAPI.addCalendarEvent(accountId, {
                summary: eventTitle.trim() || null,
                location: eventLocation.trim() || null,
                description: eventDescription.trim() || null,
                startsAt: startDate.toISOString(),
                endsAt: endDate.toISOString(),
            });
            setEvents((prev) =>
                [...prev, created].sort((a, b) => (Date.parse(a.starts_at || "") || 0) - (Date.parse(b.starts_at || "") || 0))
            );
            setShowAddEventModal(false);
            setEventTitle("");
            setEventLocation("");
            setEventDescription("");
            const rounded = nextRoundedHour();
            const roundedEnd = addHours(rounded, 1);
            setEventStartDate(toDateInputValue(rounded));
            setEventStartTime(toTimeInputValue(rounded));
            setEventEndDate(toDateInputValue(roundedEnd));
            setEventEndTime(toTimeInputValue(roundedEnd));
        } catch (error: any) {
            setCalendarError(error?.message || String(error));
        } finally {
            setSavingEvent(false);
        }
    }

    async function onManualSync() {
        if (!accountId || syncing) return;
        setSyncing(true);
        setSyncStatusText("Syncing...");
        setCalendarError(null);
        try {
            await window.electronAPI.syncDav(accountId);
            const start = new Date(calendarBounds.gridStart);
            start.setHours(0, 0, 0, 0);
            const end = new Date(calendarBounds.gridEnd);
            end.setHours(23, 59, 59, 999);
            const rows = await window.electronAPI.getCalendarEvents(accountId, start.toISOString(), end.toISOString(), 5000);
            setEvents(rows);
            setSyncStatusText("Calendar synced");
        } catch (error: any) {
            setCalendarError(error?.message || String(error));
            setSyncStatusText(`Sync failed: ${error?.message || String(error)}`);
        } finally {
            setSyncing(false);
        }
    }

    function openNewEventForDay(dayKey: string) {
        const day = new Date(`${dayKey}T00:00:00`);
        if (Number.isNaN(day.getTime())) return;
        const start = new Date(day);
        start.setHours(9, 0, 0, 0);
        const end = new Date(start);
        end.setHours(end.getHours() + 1);
        setEventStartDate(toDateInputValue(start));
        setEventStartTime(toTimeInputValue(start));
        setEventEndDate(toDateInputValue(end));
        setEventEndTime(toTimeInputValue(end));
        setShowAddEventModal(true);
    }

    const accountSidebar = (
        <aside
            className="flex h-full min-h-0 shrink-0 flex-col justify-between border-r border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Accounts
                </p>
                <div className="space-y-1">
                    {accounts.map((account) => {
                        const avatarColors = getAccountAvatarColors(account.email || account.display_name || String(account.id));
                        return (
                            <button
                                key={account.id}
                                type="button"
                                onClick={() => onSelectAccount(account.id)}
                                className={cn(
                                    "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                                    accountId === account.id
                                        ? "bg-sky-100 text-sky-900 dark:bg-[#3d4153] dark:text-slate-100"
                                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]"
                                )}
                            >
                                <div className="flex min-w-0 items-center gap-2">
                  <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ring-1 ring-black/10 dark:ring-white/10"
                      style={{
                          backgroundColor: avatarColors.background,
                          color: avatarColors.foreground,
                      }}
                  >
                    {getAccountMonogram(account)}
                  </span>
                                    <span className="min-w-0 flex-1">
                    <span className="block truncate">{account.display_name?.trim() || account.email}</span>
                                        {account.display_name?.trim() && (
                                            <span
                                                className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        {account.email}
                      </span>
                                        )}
                  </span>
                                </div>
                            </button>
                        );
                    })}
                    {accounts.length === 0 && (
                        <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">No accounts available.</p>
                    )}
                </div>
            </div>
            <div className="shrink-0 border-t border-slate-200 px-2 py-3 dark:border-[#3a3d44]">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={!accountId || syncing}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]"
                        onClick={() => void onManualSync()}
                        title="Sync now"
                        aria-label="Sync now"
                    >
                        <RefreshCw size={14} className={cn(syncing && "animate-spin")}/>
                    </button>
                </div>
            </div>
        </aside>
    );
    const selectedDayEvents = selectedDayForModal ? (eventsByDay.get(selectedDayForModal) ?? []) : [];
    const calendarToolbar = (
        <div className="flex h-10 min-w-0 items-center gap-2">
            <div
                className="flex items-center rounded-md border border-slate-300 bg-white dark:border-[#3a3d44] dark:bg-[#1e1f22]">
                <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]"
                    onClick={() => setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    aria-label="Previous month"
                >
                    <ChevronLeft size={16}/>
                </button>
                <div className="min-w-44 px-2 text-center text-sm font-medium text-slate-800 dark:text-slate-100">
                    {visibleMonth.toLocaleDateString(systemLocale, {month: "long", year: "numeric"})}
                </div>
                <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]"
                    onClick={() => setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    aria-label="Next month"
                >
                    <ChevronRight size={16}/>
                </button>
            </div>
            <button
                type="button"
                disabled={!accountId}
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-md bg-sky-600 px-3 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-60 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                onClick={() => setShowAddEventModal(true)}
                title="Add event"
                aria-label="Add event"
            >
                <Plus size={14}/>
                Add event
            </button>
        </div>
    );

    return (
        <>
            <WorkspaceLayout
                sidebar={accountSidebar}
                sidebarWidth={sidebarWidth}
                onSidebarResizeStart={onResizeStart}
                menubar={calendarToolbar}
                showMenuBar
                statusText={syncing && syncStatusText.toLowerCase().includes("ready") ? "Syncing..." : syncStatusText}
                statusBusy={syncing || loading}
            >
                <div className="mx-auto max-w-7xl">
                    {calendarError && <p className="mb-3 text-sm text-red-600 dark:text-red-300">{calendarError}</p>}
                    {!accountId && <p className="text-sm text-slate-500 dark:text-slate-400">No account selected.</p>}
                    {accountId && (
                        <div
                            className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-[#3a3d44]">
                                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                                    <div
                                        key={day}
                                        className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                                    >
                                        {day}
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7">
                                {calendarDays.map((day) => {
                                    const key = toDateKey(day);
                                    const dayEvents = eventsByDay.get(key) ?? [];
                                    const isCurrentMonth = day.getMonth() === calendarBounds.monthStart.getMonth();
                                    const isToday = key === toDateKey(new Date());
                                    return (
                                        <div
                                            key={key}
                                            data-calendar-day-key={key}
                                            className={cn(
                                                "min-h-36 border-r border-b border-slate-200 p-2 last:border-r-0 dark:border-[#3a3d44]",
                                                !isCurrentMonth && "bg-slate-50 dark:bg-[#26292f]"
                                            )}
                                            onContextMenu={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                openDayContextMenu(event.clientX, event.clientY, key);
                                            }}
                                        >
                                            <div className="mb-2 flex items-center justify-between">
                        <span
                            className={cn(
                                "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                                isToday ? "bg-sky-600 text-white dark:bg-[#5865f2]" : "text-slate-700 dark:text-slate-200",
                                !isCurrentMonth && "text-slate-400 dark:text-slate-500"
                            )}
                        >
                          {day.getDate()}
                        </span>
                                            </div>
                                            <div className="space-y-1">
                                                {dayEvents.slice(0, 3).map((event) => (
                                                    <button
                                                        key={event.id}
                                                        type="button"
                                                        className="block w-full truncate rounded bg-sky-100 px-2 py-1 text-left text-xs text-sky-800 hover:bg-sky-200 dark:bg-[#3d4153] dark:text-slate-100 dark:hover:bg-[#4b5064]"
                                                        onClick={() => setSelectedEvent(event)}
                                                        title={event.summary || "(No title)"}
                                                    >
                                                        {formatEventTime(event.starts_at)} {event.summary || "(No title)"}
                                                    </button>
                                                ))}
                                                {dayEvents.length > 3 && (
                                                    <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
                                                        +{dayEvents.length - 3} more
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {loading && (
                                <div
                                    className="border-t border-slate-200 px-3 py-2 text-sm text-slate-500 dark:border-[#3a3d44] dark:text-slate-400">
                                    Loading events...
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </WorkspaceLayout>

            {dayContextMenu && (
                <div
                    ref={dayContextMenuRef}
                    className="fixed z-50 min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                    style={{left: dayContextMenu.x, top: dayContextMenu.y}}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <button
                        type="button"
                        className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]"
                        onClick={() => {
                            setSelectedDayForModal(dayContextMenu.dayKey);
                            setDayContextMenu(null);
                        }}
                    >
                        View all events ({(eventsByDay.get(dayContextMenu.dayKey) ?? []).length})
                    </button>
                    <button
                        type="button"
                        className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]"
                        onClick={() => {
                            openNewEventForDay(dayContextMenu.dayKey);
                            setDayContextMenu(null);
                        }}
                    >
                        New event on this day
                    </button>
                </div>
            )}

            {selectedEvent && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setSelectedEvent(null)}
                >
                    <div
                        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {selectedEvent.summary || "(No title)"}
                        </h3>
                        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                            {formatSystemDateTime(selectedEvent.starts_at, systemLocale)} -{" "}
                            {formatSystemDateTime(selectedEvent.ends_at, systemLocale)}
                        </p>
                        {selectedEvent.location && (
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{selectedEvent.location}</p>
                        )}
                        {selectedEvent.description && (
                            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                                {selectedEvent.description}
                            </p>
                        )}
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => setSelectedEvent(null)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedDayForModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setSelectedDayForModal(null)}
                >
                    <div
                        className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            Events on {selectedDayForModal}
                        </h3>
                        <div className="mt-3">
                            {selectedDayEvents.length === 0 && (
                                <p className="text-sm text-slate-500 dark:text-slate-400">No events on this day.</p>
                            )}
                            {selectedDayEvents.length > 0 && (
                                <ul className="space-y-2">
                                    {selectedDayEvents.map((event) => (
                                        <li key={event.id}>
                                            <button
                                                type="button"
                                                className="w-full rounded border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 dark:border-[#3a3d44] dark:hover:bg-[#35373c]"
                                                onClick={() => {
                                                    setSelectedEvent(event);
                                                    setSelectedDayForModal(null);
                                                }}
                                            >
                                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                    {formatEventTime(event.starts_at)} {event.summary || "(No title)"}
                                                </p>
                                                {event.location && (
                                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{event.location}</p>
                                                )}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => {
                                    openNewEventForDay(selectedDayForModal);
                                    setSelectedDayForModal(null);
                                }}
                            >
                                New event on this day
                            </button>
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => setSelectedDayForModal(null)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddEventModal && accountId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setShowAddEventModal(false)}
                >
                    <div
                        className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void onCreateEvent();
                            }}
                        >
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add Event</h3>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <label className="block text-sm md:col-span-2">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Title</span>
                                    <input
                                        type="text"
                                        value={eventTitle}
                                        onChange={(event) => setEventTitle(event.target.value)}
                                        placeholder="Team sync"
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <div className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Start</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="date"
                                            lang={inputLocale}
                                            value={eventStartDate}
                                            onChange={(event) => setEventStartDate(event.target.value)}
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                            required
                                        />
                                        <input
                                            type="time"
                                            lang={inputLocale}
                                            value={eventStartTime}
                                            onChange={(event) => setEventStartTime(event.target.value)}
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                            required
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {formatLocalDateTimePreview(eventStartDate, eventStartTime, systemLocale)}
                                    </p>
                                </div>
                                <div className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">End</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="date"
                                            lang={inputLocale}
                                            value={eventEndDate}
                                            onChange={(event) => setEventEndDate(event.target.value)}
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                            required
                                        />
                                        <input
                                            type="time"
                                            lang={inputLocale}
                                            value={eventEndTime}
                                            onChange={(event) => setEventEndTime(event.target.value)}
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                            required
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {formatLocalDateTimePreview(eventEndDate, eventEndTime, systemLocale)}
                                    </p>
                                </div>
                                <label className="block text-sm md:col-span-2">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Location</span>
                                    <input
                                        type="text"
                                        value={eventLocation}
                                        onChange={(event) => setEventLocation(event.target.value)}
                                        placeholder="Conference Room"
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm md:col-span-2">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Description</span>
                                    <textarea
                                        value={eventDescription}
                                        onChange={(event) => setEventDescription(event.target.value)}
                                        rows={4}
                                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                            </div>
                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                    onClick={() => setShowAddEventModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                    disabled={savingEvent}
                                >
                                    {savingEvent ? "Saving..." : "Save Event"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeekMonday(date: Date): Date {
    const out = new Date(date);
    const day = out.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    out.setDate(out.getDate() + diff);
    out.setHours(0, 0, 0, 0);
    return out;
}

function endOfWeekMonday(date: Date): Date {
    const out = startOfWeekMonday(date);
    out.setDate(out.getDate() + 6);
    out.setHours(23, 59, 59, 999);
    return out;
}

function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function nextRoundedHour(): Date {
    const now = new Date();
    const rounded = new Date(now);
    rounded.setMinutes(0, 0, 0);
    rounded.setHours(rounded.getHours() + 1);
    return rounded;
}

function addHours(date: Date, hours: number): Date {
    const out = new Date(date);
    out.setHours(out.getHours() + hours);
    return out;
}

function toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function toTimeInputValue(date: Date): string {
    const hour = `${date.getHours()}`.padStart(2, "0");
    const minute = `${date.getMinutes()}`.padStart(2, "0");
    return `${hour}:${minute}`;
}

function composeLocalDateTime(dateValue: string, timeValue: string): Date | null {
    const date = String(dateValue || "").trim();
    const time = String(timeValue || "").trim();
    if (!date || !time) return null;
    const composed = new Date(`${date}T${time}`);
    return Number.isNaN(composed.getTime()) ? null : composed;
}

function formatLocalDateTimePreview(dateValue: string, timeValue: string, locale: string): string {
    const composed = composeLocalDateTime(dateValue, timeValue);
    if (!composed) return "Invalid date/time";
    return formatSystemDateTime(composed.toISOString(), locale);
}

function formatEventTime(iso: string | null): string {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const hour = `${date.getHours()}`.padStart(2, "0");
    const minute = `${date.getMinutes()}`.padStart(2, "0");
    return `${hour}:${minute}`;
}
