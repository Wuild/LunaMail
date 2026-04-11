import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Bug, CalendarDays, CircleHelp, Cloud, Mail, Settings, Users} from 'lucide-react';
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
import {useNavigate} from 'react-router-dom';
import type {AppSettings} from '@/shared/ipcTypes';
import {DEFAULT_APP_SETTINGS} from '@/shared/defaults';
import {useAccounts} from '@renderer/hooks/ipc/useAccounts';
import {useAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {ipcClient} from '@renderer/lib/ipcClient';
import NavRailItem from './NavRailItem';
import {ContextMenu, ContextMenuItem} from '@renderer/components/ui/ContextMenu';

type TopNavItemId = AppSettings['navRailOrder'][number];
type TopNavItemDef = {
    id: TopNavItemId;
    to: string;
    label: string;
    icon: React.ReactNode;
    badgeCount?: number;
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

function SortableTopNavItem({item, onContextMenu}: SortableTopNavItemProps) {
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

export default function MainNavRail() {
    const navigate = useNavigate();
    const {totalUnreadCount} = useAccounts();
    const {appSettings, setAppSettings} = useAppSettings(DEFAULT_APP_SETTINGS);
    const developerMode = Boolean(appSettings.developerMode);
    const showDebugNavItem = developerMode && Boolean(appSettings.developerShowDebugNavItem);
    const [topNavOrder, setTopNavOrder] = useState<TopNavItemId[]>(() =>
        normalizeTopNavOrder(appSettings.navRailOrder),
    );
    const [draggingTopNavItemId, setDraggingTopNavItemId] = useState<TopNavItemId | null>(null);
    const [topNavOverlaySize, setTopNavOverlaySize] = useState<{ width: number; height: number } | null>(null);
    const [mainNavContextMenu, setMainNavContextMenu] = useState<MainNavContextMenuState | null>(null);
    const mainNavContextMenuRef = useRef<HTMLDivElement | null>(null);
    const topNavSensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}));
    const topNavSortableIds = useMemo(() => topNavOrder.map((id) => toTopNavSortableId(id)), [topNavOrder]);

    useEffect(() => {
        setTopNavOrder(normalizeTopNavOrder(appSettings.navRailOrder));
    }, [appSettings.navRailOrder]);

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
        () =>
            draggingTopNavItemId === null
                ? null
                : (topNavItems.find((item) => item.id === draggingTopNavItemId) ?? null),
        [topNavItems, draggingTopNavItemId],
    );

    const persistTopNavOrder = useCallback(
        (nextOrder: TopNavItemId[]) => {
            setTopNavOrder(nextOrder);
            setAppSettings((prev) => ({...prev, navRailOrder: nextOrder}));
            void ipcClient.updateAppSettings({navRailOrder: nextOrder}).catch(() => undefined);
        },
        [setAppSettings],
    );

    const onTopNavDragStart = useCallback((event: DragStartEvent) => {
        const id = parseTopNavSortableId(String(event.active.id));
        if (!id) return;
        setDraggingTopNavItemId(id);
        const initialRect = event.active.rect.current.initial;
        if (initialRect) {
            setTopNavOverlaySize({width: initialRect.width, height: initialRect.height});
        } else {
            setTopNavOverlaySize(null);
        }
    }, []);

    const onTopNavDragEnd = useCallback(
        (event: DragEndEvent) => {
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
            if (!event.over || event.over.id === 'topnav-end') {
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
        },
        [persistTopNavOrder, topNavOrder],
    );

    const openMainNavContextMenu = useCallback(
        (event: React.MouseEvent<HTMLDivElement>, item: { id: MainNavContextItemId; label: string; to: string }) => {
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
        },
        [],
    );

    return (
        <>
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
                        {draggingTopNavItemId !== null && <TopNavEndDrop/>}
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
                    <div aria-hidden className="titlebar-divider-fade my-0.5 h-px w-9"/>
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
            {mainNavContextMenu && (
                <ContextMenu
                    ref={mainNavContextMenuRef}
                    size="nav"
                    layer="1202"
                    position={{left: mainNavContextMenu.x, top: mainNavContextMenu.y}}
                    onRequestClose={() => setMainNavContextMenu(null)}
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
        </>
    );
}
