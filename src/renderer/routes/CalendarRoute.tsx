import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight, Plus, RefreshCw} from 'lucide-react';
import type {CalendarEventItem, PublicAccount} from '../../preload';
import {getAccountAvatarColors, getAccountMonogram} from '../lib/accountAvatar';
import {formatSystemDateTime} from '../lib/dateTime';
import {clampToViewport} from '../lib/format';
import {useResizableSidebar} from '../hooks/useResizableSidebar';
import {ipcClient} from '../lib/ipcClient';
import {
    statusAutoSyncFailed,
    statusNoAccountSelected,
    statusSyncFailed,
    statusSyncing,
    toErrorMessage,
} from '../lib/statusText';
import {cn} from '../lib/utils';
import WorkspaceLayout from '../layouts/WorkspaceLayout';
import {
    addHours,
    composeLocalDateTime,
    endOfMonth,
    endOfWeekMonday,
    formatEventTime,
    formatLocalDateTimePreview,
    nextRoundedHour,
    startOfMonth,
    startOfWeekMonday,
    toDateInputValue,
    toDateKey,
    toTimeInputValue,
} from '../lib/date/calendar';

type CalendarRouteProps = {
    accountId: number | null;
    accounts: PublicAccount[];
    onSelectAccount: (accountId: number | null) => void;
};

export default function CalendarRoute({accountId, accounts, onSelectAccount}: CalendarRouteProps) {
    const DAY_CONTEXT_MENU_WIDTH = 224;
    const DAY_CONTEXT_MENU_HEIGHT = 92;
    const [loading, setLoading] = useState(false);
    const [savingEvent, setSavingEvent] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatusText, setSyncStatusText] = useState('Calendar ready');
    const [events, setEvents] = useState<CalendarEventItem[]>([]);
    const [systemLocale, setSystemLocale] = useState<string>('en-US');
    const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
    const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null);
    const [selectedDayForModal, setSelectedDayForModal] = useState<string | null>(null);
    const [dayContextMenu, setDayContextMenu] = useState<{ x: number; y: number; dayKey: string } | null>(null);
    const dayContextMenuRef = useRef<HTMLDivElement | null>(null);
    const [showAddEventModal, setShowAddEventModal] = useState(false);
    const [calendarError, setCalendarError] = useState<string | null>(null);
    const [eventTitle, setEventTitle] = useState('');
    const [eventLocation, setEventLocation] = useState('');
    const [eventDescription, setEventDescription] = useState('');
    const [eventStartDate, setEventStartDate] = useState(() => toDateInputValue(nextRoundedHour()));
    const [eventStartTime, setEventStartTime] = useState(() => toTimeInputValue(nextRoundedHour()));
    const [eventEndDate, setEventEndDate] = useState(() => toDateInputValue(addHours(nextRoundedHour(), 1)));
    const [eventEndTime, setEventEndTime] = useState(() => toTimeInputValue(addHours(nextRoundedHour(), 1)));
    const {sidebarWidth, onResizeStart} = useResizableSidebar();

    useEffect(() => {
        void ipcClient
            .getSystemLocale()
            .then((locale) => {
                setSystemLocale(locale || 'en-US');
            })
            .catch(() => {
                setSystemLocale('en-US');
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
        const normalized = String(systemLocale || '').trim();
        return normalized || 'en-US';
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
        if (!accountId) {
            setEvents([]);
            setLoading(false);
            setSyncing(false);
            setSyncStatusText(statusNoAccountSelected());
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
                const rows = await ipcClient.getCalendarEvents(accountId, start.toISOString(), end.toISOString(), 5000);
                if (!active) return;
                setEvents(rows);
            } catch (error: any) {
                if (!active) return;
                setCalendarError(toErrorMessage(error));
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
        setSyncStatusText(statusSyncing());
        setCalendarError(null);
        void ipcClient
            .syncDav(accountId)
            .then(async () => {
                if (!active) return;
                const start = new Date(calendarBounds.gridStart);
                start.setHours(0, 0, 0, 0);
                const end = new Date(calendarBounds.gridEnd);
                end.setHours(23, 59, 59, 999);
                const rows = await ipcClient.getCalendarEvents(accountId, start.toISOString(), end.toISOString(), 5000);
                if (!active) return;
                setEvents(rows);
                setSyncing(false);
                setSyncStatusText('Calendar synced');
            })
            .catch((error: any) => {
                if (!active) return;
                setSyncing(false);
                setCalendarError(toErrorMessage(error));
                setSyncStatusText(statusAutoSyncFailed(error));
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
            bucket.sort((a, b) => (Date.parse(a.starts_at || '') || 0) - (Date.parse(b.starts_at || '') || 0));
        }
        return byDay;
    }, [events]);

    const openDayContextMenu = useCallback((x: number, y: number, dayKey: string) => {
        const clampedX = clampToViewport(x, DAY_CONTEXT_MENU_WIDTH, window.innerWidth);
        const clampedY = clampToViewport(y, DAY_CONTEXT_MENU_HEIGHT, window.innerHeight);
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
            const dayCell = target?.closest('[data-calendar-day-key]') as HTMLElement | null;
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

        window.addEventListener('pointerdown', closeOnOutsidePointer);
        window.addEventListener('contextmenu', handleContextMenuWhileOpen);
        window.addEventListener('resize', closeDayContextMenu);
        window.addEventListener('scroll', closeDayContextMenu, true);
        return () => {
            window.removeEventListener('pointerdown', closeOnOutsidePointer);
            window.removeEventListener('contextmenu', handleContextMenuWhileOpen);
            window.removeEventListener('resize', closeDayContextMenu);
            window.removeEventListener('scroll', closeDayContextMenu, true);
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
                throw new Error('Please provide a valid start and end date/time.');
            }
            const created = await ipcClient.addCalendarEvent(accountId, {
                summary: eventTitle.trim() || null,
                location: eventLocation.trim() || null,
                description: eventDescription.trim() || null,
                startsAt: startDate.toISOString(),
                endsAt: endDate.toISOString(),
            });
            setEvents((prev) =>
                [...prev, created].sort(
                    (a, b) => (Date.parse(a.starts_at || '') || 0) - (Date.parse(b.starts_at || '') || 0),
                ),
            );
            setShowAddEventModal(false);
            setEventTitle('');
            setEventLocation('');
            setEventDescription('');
            const rounded = nextRoundedHour();
            const roundedEnd = addHours(rounded, 1);
            setEventStartDate(toDateInputValue(rounded));
            setEventStartTime(toTimeInputValue(rounded));
            setEventEndDate(toDateInputValue(roundedEnd));
            setEventEndTime(toTimeInputValue(roundedEnd));
        } catch (error: any) {
            setCalendarError(toErrorMessage(error));
        } finally {
            setSavingEvent(false);
        }
    }

    async function onManualSync() {
        if (!accountId || syncing) return;
        setSyncing(true);
        setSyncStatusText(statusSyncing());
        setCalendarError(null);
        try {
            await ipcClient.syncDav(accountId);
            const start = new Date(calendarBounds.gridStart);
            start.setHours(0, 0, 0, 0);
            const end = new Date(calendarBounds.gridEnd);
            end.setHours(23, 59, 59, 999);
            const rows = await ipcClient.getCalendarEvents(accountId, start.toISOString(), end.toISOString(), 5000);
            setEvents(rows);
            setSyncStatusText('Calendar synced');
        } catch (error: any) {
            setCalendarError(toErrorMessage(error));
            setSyncStatusText(statusSyncFailed(error));
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
                        const avatarColors = getAccountAvatarColors(
                            account.email || account.display_name || String(account.id),
                        );
                        return (
                            <button
                                key={account.id}
                                type="button"
                                onClick={() => onSelectAccount(account.id)}
                                className={cn(
                                    'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                    accountId === account.id
                                        ? 'bg-sky-100 text-sky-900 dark:bg-[#3d4153] dark:text-slate-100'
                                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]',
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
										<span className="block truncate">
											{account.display_name?.trim() || account.email}
										</span>
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
                        <RefreshCw size={14} className={cn(syncing && 'animate-spin')}/>
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
                    {visibleMonth.toLocaleDateString(systemLocale, {month: 'long', year: 'numeric'})}
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
                statusText={
                    syncing && syncStatusText.toLowerCase().includes('ready') ? statusSyncing() : syncStatusText
                }
                statusBusy={syncing || loading}
            >
                <div className="mx-auto max-w-7xl">
                    {calendarError && <p className="mb-3 text-sm text-red-600 dark:text-red-300">{calendarError}</p>}
                    {!accountId && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">{statusNoAccountSelected()}</p>
                    )}
                    {accountId && (
                        <div
                            className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-[#3a3d44]">
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
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
                                                'min-h-36 border-r border-b border-slate-200 p-2 last:border-r-0 dark:border-[#3a3d44]',
                                                !isCurrentMonth && 'bg-slate-50 dark:bg-[#26292f]',
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
                                                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                                                        isToday
                                                            ? 'bg-sky-600 text-white dark:bg-[#5865f2]'
                                                            : 'text-slate-700 dark:text-slate-200',
                                                        !isCurrentMonth && 'text-slate-400 dark:text-slate-500',
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
                                                        title={event.summary || '(No title)'}
                                                    >
                                                        {formatEventTime(event.starts_at)}{' '}
                                                        {event.summary || '(No title)'}
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
                            {selectedEvent.summary || '(No title)'}
                        </h3>
                        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                            {formatSystemDateTime(selectedEvent.starts_at, systemLocale)} -{' '}
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
                                                    {formatEventTime(event.starts_at)} {event.summary || '(No title)'}
                                                </p>
                                                {event.location && (
                                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                        {event.location}
                                                    </p>
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
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Title
									</span>
                                    <input
                                        type="text"
                                        value={eventTitle}
                                        onChange={(event) => setEventTitle(event.target.value)}
                                        placeholder="Team sync"
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <div className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Start
									</span>
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
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										End
									</span>
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
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Location
									</span>
                                    <input
                                        type="text"
                                        value={eventLocation}
                                        onChange={(event) => setEventLocation(event.target.value)}
                                        placeholder="Conference Room"
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                </label>
                                <label className="block text-sm md:col-span-2">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Description
									</span>
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
                                    {savingEvent ? 'Saving...' : 'Save Event'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
