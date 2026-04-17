import React, {startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Pencil,
	Plus,
	RefreshCw,
	Settings,
	Trash2,
	X,
} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import type {CalendarEventItem, PublicAccount, SyncStatusEvent} from '@/preload';
import {getAccountAvatarColorsForAccount, getAccountMonogram} from '@renderer/lib/accountAvatar';
import {formatSystemDateTime} from '@renderer/lib/dateTime';
import {clampToViewport} from '@renderer/lib/format';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {useAccount, useAccountDirectory} from '@renderer/hooks/ipc/useAccounts';
import {useSystemLocale} from '@renderer/hooks/ipc/useSystemLocale';
import {ipcClient} from '@renderer/lib/ipcClient';
import {Button} from '@renderer/components/ui/button';
import {FormDateTimeInput, FormInput, FormTextarea} from '@renderer/components/ui/FormControls';
import {Modal, ModalHeader, ModalTitle} from '@renderer/components/ui/Modal';
import {ContextMenu, ContextMenuItem} from '@renderer/components/ui/ContextMenu';
import {
	statusAutoSyncFailed,
	statusNoAccountSelected,
	statusSyncFailed,
	statusSyncing,
	toErrorMessage,
} from '@renderer/lib/statusText';
import {cn} from '@renderer/lib/utils';
import WorkspaceLayout from '@renderer/layouts/WorkspaceLayout';
import {
	addHours,
	composeLocalDateTime,
	endOfMonth,
	endOfWeekMonday,
	formatEventTime,
	nextRoundedHour,
	startOfMonth,
	startOfWeekMonday,
	toDateInputValue,
	toDateKey,
	toTimeInputValue,
} from '@renderer/lib/date/calendar';
import {composeLocalDateTimeValue, splitLocalDateTimeValue} from '@renderer/lib/date/localeInput';

type CalendarPageProps = {
	accountId: number | null;
	accounts: PublicAccount[];
	onSelectAccount: (accountId: number | null) => void;
};

type GoogleEventMetadata = {
	provider: 'google-api';
	calendarId?: string | null;
	calendarSummary?: string | null;
	organizerEmail?: string | null;
	organizerName?: string | null;
};

function parseGoogleEventMetadata(event: CalendarEventItem): GoogleEventMetadata | null {
	if (event.source !== 'google-api') return null;
	const raw = String(event.raw_ics || '').trim();
	if (!raw.startsWith('{')) return null;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (String(parsed.provider || '').trim() !== 'google-api') return null;
		return {
			provider: 'google-api',
			calendarId: String(parsed.calendarId || '').trim() || null,
			calendarSummary: String(parsed.calendarSummary || '').trim() || null,
			organizerEmail: String(parsed.organizerEmail || '').trim() || null,
			organizerName: String(parsed.organizerName || '').trim() || null,
		};
	} catch {
		return null;
	}
}

function isGoogleWeekNumbersEvent(event: CalendarEventItem): boolean {
	if (event.source !== 'google-api') return false;
	const metadata = parseGoogleEventMetadata(event);
	const calendarId = String(metadata?.calendarId || '').trim().toLowerCase();
	const calendarSummary = String(metadata?.calendarSummary || '').trim().toLowerCase();
	if (calendarId.includes('weeknum')) return true;
	if (calendarSummary.includes('week number')) return true;
	if (calendarSummary === 'week numbers') return true;
	return false;
}

function hashOwnerKey(value: string): number {
	let hash = 0;
	for (let i = 0; i < value.length; i += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

export default function CalendarPage({accountId, accounts, onSelectAccount}: CalendarPageProps) {
	const CALENDAR_VIEW_STORAGE_KEY = 'llamamail.calendar.view.mode';
	const CALENDAR_EVENT_FETCH_LIMIT_WEEK = 1200;
	const CALENDAR_EVENT_FETCH_LIMIT_MONTH = 2500;
	const WEEK_HOUR_ROW_HEIGHT = 56;
	const WEEK_GRID_COLUMNS = 'grid-cols-[88px_repeat(7,minmax(0,1fr))]';
	const MONTH_GRID_COLUMNS = 'grid-cols-[42px_repeat(7,minmax(0,1fr))]';
	const navigate = useNavigate();
	const DAY_CONTEXT_MENU_WIDTH = 224;
	const DAY_CONTEXT_MENU_HEIGHT = 92;
	const [loading, setLoading] = useState(false);
	const [savingEvent, setSavingEvent] = useState(false);
	const [deletingEvent, setDeletingEvent] = useState(false);
	const [savingEditEvent, setSavingEditEvent] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [syncingAccountId, setSyncingAccountId] = useState<number | null>(null);
	const [syncStatusText, setSyncStatusText] = useState('Calendar ready');
	const [events, setEvents] = useState<CalendarEventItem[]>([]);
	const visibleEvents = useMemo(() => events.filter((event) => !isGoogleWeekNumbersEvent(event)), [events]);
	const deferredEvents = useDeferredValue(visibleEvents);
	const [now, setNow] = useState<Date>(() => new Date());
	const {systemLocale} = useSystemLocale();
	const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week'>(() => {
		try {
			const raw = window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
			return raw === 'month' ? 'month' : 'week';
		} catch {
			return 'week';
		}
	});
	const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
		const today = new Date();
		try {
			const raw = window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
			return raw === 'month' ? startOfMonth(today) : today;
		} catch {
			return today;
		}
	});
	const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null);
	const [selectedDayForModal, setSelectedDayForModal] = useState<string | null>(null);
	const [showEditEventModal, setShowEditEventModal] = useState(false);
	const [eventToDelete, setEventToDelete] = useState<CalendarEventItem | null>(null);
	const [dayContextMenu, setDayContextMenu] = useState<{x: number; y: number; dayKey: string} | null>(null);
	const dayContextMenuRef = useRef<HTMLDivElement | null>(null);
	const calendarBoundsRef = useRef<{gridStart: Date; gridEnd: Date} | null>(null);
	const calendarBodyScrollRef = useRef<HTMLDivElement | null>(null);
	const lastWeekAutoScrollKeyRef = useRef<string | null>(null);
	const inFlightSyncAccountsRef = useRef<Set<number>>(new Set());
	const [showAddEventModal, setShowAddEventModal] = useState(false);
	const [calendarError, setCalendarError] = useState<string | null>(null);
	const [eventTitle, setEventTitle] = useState('');
	const [eventLocation, setEventLocation] = useState('');
	const [eventDescription, setEventDescription] = useState('');
	const [eventStartDate, setEventStartDate] = useState(() => toDateInputValue(nextRoundedHour()));
	const [eventStartTime, setEventStartTime] = useState(() => toTimeInputValue(nextRoundedHour()));
	const [eventEndDate, setEventEndDate] = useState(() => toDateInputValue(addHours(nextRoundedHour(), 1)));
	const [eventEndTime, setEventEndTime] = useState(() => toTimeInputValue(addHours(nextRoundedHour(), 1)));
	const [editEventId, setEditEventId] = useState<number | null>(null);
	const [editEventTitle, setEditEventTitle] = useState('');
	const [editEventLocation, setEditEventLocation] = useState('');
	const [editEventDescription, setEditEventDescription] = useState('');
	const [editEventStartDate, setEditEventStartDate] = useState(() => toDateInputValue(nextRoundedHour()));
	const [editEventStartTime, setEditEventStartTime] = useState(() => toTimeInputValue(nextRoundedHour()));
	const [editEventEndDate, setEditEventEndDate] = useState(() => toDateInputValue(addHours(nextRoundedHour(), 1)));
	const [editEventEndTime, setEditEventEndTime] = useState(() => toTimeInputValue(addHours(nextRoundedHour(), 1)));
	const [weekDragSelection, setWeekDragSelection] = useState<{
		dayKey: string;
		startHour: number;
		endHour: number;
	} | null>(null);
	const {sidebarWidth, onResizeStart} = useResizableSidebar();
	const selectedAccount = useAccount(accountId);
	const accountDirectory = useAccountDirectory();

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

	const calendarDays = useMemo(() => {
		const days: Date[] = [];
		const cursor = new Date(calendarBounds.gridStart);
		while (cursor <= calendarBounds.gridEnd) {
			days.push(new Date(cursor));
			cursor.setDate(cursor.getDate() + 1);
		}
		return days;
	}, [calendarBounds]);

	const weekBounds = useMemo(() => {
		const weekStart = startOfWeekMonday(visibleMonth);
		const weekEnd = endOfWeekMonday(visibleMonth);
		return {weekStart, weekEnd};
	}, [visibleMonth]);

	const weekDays = useMemo(() => {
		const days: Date[] = [];
		const cursor = new Date(weekBounds.weekStart);
		while (cursor <= weekBounds.weekEnd) {
			days.push(new Date(cursor));
			cursor.setDate(cursor.getDate() + 1);
		}
		return days;
	}, [weekBounds]);

	const weekRangeLabel = useMemo(() => {
		const start = weekBounds.weekStart;
		const end = weekBounds.weekEnd;
		const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
		if (sameMonth) {
			return `${start.toLocaleDateString(systemLocale, {month: 'short'})} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`;
		}
		return `${start.toLocaleDateString(systemLocale, {
			month: 'short',
			day: 'numeric',
		})} - ${end.toLocaleDateString(systemLocale, {month: 'short', day: 'numeric'})}, ${end.getFullYear()}`;
	}, [systemLocale, weekBounds]);

	const weekHours = useMemo(() => Array.from({length: 24}, (_, hour) => hour), []);
	const calendarWeeks = useMemo(() => {
		const out: Date[][] = [];
		for (let i = 0; i < calendarDays.length; i += 7) {
			out.push(calendarDays.slice(i, i + 7));
		}
		return out;
	}, [calendarDays]);

	useEffect(() => {
		calendarBoundsRef.current = {
			gridStart: calendarBounds.gridStart,
			gridEnd: calendarBounds.gridEnd,
		};
	}, [calendarBounds]);

	useEffect(() => {
		try {
			window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, calendarViewMode);
		} catch {
			// ignore persistence failure
		}
	}, [calendarViewMode]);

	const getVisibleCalendarRange = useCallback(() => {
		const bounds = calendarBoundsRef.current ?? {
			gridStart: calendarBounds.gridStart,
			gridEnd: calendarBounds.gridEnd,
		};
		const start = new Date(bounds.gridStart);
		start.setHours(0, 0, 0, 0);
		const end = new Date(bounds.gridEnd);
		end.setHours(23, 59, 59, 999);
		return {
			startIso: start.toISOString(),
			endIso: end.toISOString(),
		};
	}, [calendarBounds.gridEnd, calendarBounds.gridStart]);

	const refreshVisibleEvents = useCallback(
		async (targetAccount = selectedAccount): Promise<void> => {
			const range = getVisibleCalendarRange();
			const rows = await targetAccount.calendar.refresh(
				range.startIso,
				range.endIso,
				calendarViewMode === 'week' ? CALENDAR_EVENT_FETCH_LIMIT_WEEK : CALENDAR_EVENT_FETCH_LIMIT_MONTH,
			);
			startTransition(() => {
				setEvents(rows);
			});
		},
		[
			CALENDAR_EVENT_FETCH_LIMIT_MONTH,
			CALENDAR_EVENT_FETCH_LIMIT_WEEK,
			calendarViewMode,
			getVisibleCalendarRange,
			selectedAccount,
		],
	);

	function queueBackgroundSync(targetAccountId: number, source: 'auto' | 'manual'): void {
		if (inFlightSyncAccountsRef.current.has(targetAccountId)) return;
		inFlightSyncAccountsRef.current.add(targetAccountId);
		setSyncing(true);
		setSyncingAccountId(targetAccountId);
		setSyncStatusText(statusSyncing());
		setCalendarError(null);

		const targetAccount = accountDirectory.getAccount(targetAccountId);
		void targetAccount.calendar
			.sync({
				calendarRange: getVisibleCalendarRange(),
			})
			.then(async () => {
				if (targetAccountId === accountId) {
					await refreshVisibleEvents(targetAccount);
				}
				setSyncStatusText('Calendar synced');
			})
			.catch((error: any) => {
				setCalendarError(toErrorMessage(error));
				setSyncStatusText(source === 'auto' ? statusAutoSyncFailed(error) : statusSyncFailed(error));
			})
			.finally(() => {
				inFlightSyncAccountsRef.current.delete(targetAccountId);
				setSyncing(false);
				setSyncingAccountId((current) => (current === targetAccountId ? null : current));
			});
	}

	useEffect(() => {
		if (calendarViewMode !== 'week') return;
		setVisibleMonth(new Date());
	}, [calendarViewMode]);

	useEffect(() => {
		const tick = () => setNow(new Date());
		tick();
		const interval = window.setInterval(tick, 30_000);
		return () => window.clearInterval(interval);
	}, []);

	useEffect(() => {
		if (!accountId) {
			setEvents([]);
			setLoading(false);
			setSyncing(false);
			setSyncingAccountId(null);
			setSyncStatusText(statusNoAccountSelected());
			return;
		}
		let active = true;
		const load = async () => {
			setLoading(true);
			setCalendarError(null);
			try {
				const range = getVisibleCalendarRange();
				const targetAccount = accountDirectory.getAccount(accountId);
				const rows = await targetAccount.calendar.refresh(
					range.startIso,
					range.endIso,
					calendarViewMode === 'week' ? CALENDAR_EVENT_FETCH_LIMIT_WEEK : CALENDAR_EVENT_FETCH_LIMIT_MONTH,
				);
				if (!active) return;
				startTransition(() => {
					setEvents(rows);
				});
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
	}, [
		CALENDAR_EVENT_FETCH_LIMIT_MONTH,
		CALENDAR_EVENT_FETCH_LIMIT_WEEK,
		accountDirectory,
		accountId,
		calendarViewMode,
		getVisibleCalendarRange,
	]);

	useIpcEvent(ipcClient.onAccountSyncStatus, (evt: SyncStatusEvent) => {
		if (!accountId || evt.accountId !== accountId) return;
		if (evt.status === 'syncing') {
			setSyncing(true);
			setSyncingAccountId(evt.accountId);
			setSyncStatusText(statusSyncing());
			return;
		}
		if (evt.status === 'error') {
			setSyncing(false);
			setSyncingAccountId(null);
			setSyncStatusText(statusSyncFailed(evt.syncError?.message ?? evt.error));
			return;
		}
		setSyncing(false);
		setSyncingAccountId(null);
		setSyncStatusText('Calendar synced');
		void refreshVisibleEvents();
	});

	const eventsByDay = useMemo(() => {
		const byDay = new Map<string, CalendarEventItem[]>();
		for (const event of deferredEvents) {
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
	}, [deferredEvents]);

	const weekEventsByDay = useMemo(() => {
		const out = new Map<string, Array<{event: CalendarEventItem; topPx: number; heightPx: number}>>();
		for (const day of weekDays) {
			const dayKey = toDateKey(day);
			const dayStart = new Date(day);
			dayStart.setHours(0, 0, 0, 0);
			const dayEnd = new Date(dayStart);
			dayEnd.setDate(dayEnd.getDate() + 1);
			const rows: Array<{event: CalendarEventItem; topPx: number; heightPx: number}> = [];

			for (const event of deferredEvents) {
				const startsAt = event.starts_at ? new Date(event.starts_at) : null;
				const endsAt = event.ends_at ? new Date(event.ends_at) : null;
				if (!startsAt || Number.isNaN(startsAt.getTime())) continue;
				const safeEnd =
					endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : new Date(startsAt.getTime() + 3600000);
				if (safeEnd <= dayStart || startsAt >= dayEnd) continue;

				const segmentStart = startsAt > dayStart ? startsAt : dayStart;
				const segmentEnd = safeEnd < dayEnd ? safeEnd : dayEnd;
				const topPx = ((segmentStart.getTime() - dayStart.getTime()) / 3600000) * WEEK_HOUR_ROW_HEIGHT;
				const rawHeightPx = ((segmentEnd.getTime() - segmentStart.getTime()) / 3600000) * WEEK_HOUR_ROW_HEIGHT;
				rows.push({
					event,
					topPx,
					heightPx: Math.max(18, rawHeightPx),
				});
			}

			rows.sort((a, b) => a.topPx - b.topPx);
			out.set(dayKey, rows);
		}
		return out;
	}, [deferredEvents, weekDays, WEEK_HOUR_ROW_HEIGHT]);

	const weekContainsNow = useMemo(() => {
		const todayKey = toDateKey(now);
		return weekDays.some((day) => toDateKey(day) === todayKey);
	}, [now, weekDays]);

	const weekNowTopPx = useMemo(() => {
		const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
		return (minutes / 60) * WEEK_HOUR_ROW_HEIGHT;
	}, [now, WEEK_HOUR_ROW_HEIGHT]);

	useEffect(() => {
		if (calendarViewMode === 'week') {
			lastWeekAutoScrollKeyRef.current = null;
		}
	}, [calendarViewMode]);

	useEffect(() => {
		if (calendarViewMode !== 'week') return;
		if (!weekContainsNow) return;
		const weekKey = `${toDateKey(weekBounds.weekStart)}:${accountId ?? 'none'}`;
		if (lastWeekAutoScrollKeyRef.current === weekKey) return;
		const container = calendarBodyScrollRef.current;
		if (!container) return;
		const contentHeight = WEEK_HOUR_ROW_HEIGHT * 24;
		const viewportHeight = container.clientHeight;
		const maxScroll = Math.max(0, contentHeight - viewportHeight);
		container.scrollTop = Math.max(0, Math.min(maxScroll, weekNowTopPx - viewportHeight * 0.35));
		lastWeekAutoScrollKeyRef.current = weekKey;
	}, [accountId, calendarViewMode, weekBounds.weekStart, weekContainsNow, weekNowTopPx, WEEK_HOUR_ROW_HEIGHT]);

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
				setCalendarError('Please provide a valid start and end date/time.');
				return;
			}
			const created = await selectedAccount.calendar.add({
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

	function openEditEventModal(event: CalendarEventItem) {
		const start = event.starts_at ? new Date(event.starts_at) : nextRoundedHour();
		const end = event.ends_at ? new Date(event.ends_at) : addHours(start, 1);
		const safeStart = Number.isNaN(start.getTime()) ? nextRoundedHour() : start;
		const safeEnd = Number.isNaN(end.getTime()) ? addHours(safeStart, 1) : end;
		setEditEventId(event.id);
		setEditEventTitle(event.summary || '');
		setEditEventLocation(event.location || '');
		setEditEventDescription(event.description || '');
		setEditEventStartDate(toDateInputValue(safeStart));
		setEditEventStartTime(toTimeInputValue(safeStart));
		setEditEventEndDate(toDateInputValue(safeEnd));
		setEditEventEndTime(toTimeInputValue(safeEnd));
		setShowEditEventModal(true);
	}

	async function onUpdateEvent() {
		if (!editEventId) return;
		setCalendarError(null);
		setSavingEditEvent(true);
		try {
			const startDate = composeLocalDateTime(editEventStartDate, editEventStartTime);
			const endDate = composeLocalDateTime(editEventEndDate, editEventEndTime);
			if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
				setCalendarError('Please provide a valid start and end date/time.');
				return;
			}
			const updated = await selectedAccount.calendar.update(editEventId, {
				summary: editEventTitle.trim() || null,
				location: editEventLocation.trim() || null,
				description: editEventDescription.trim() || null,
				startsAt: startDate.toISOString(),
				endsAt: endDate.toISOString(),
			});
			setEvents((prev) =>
				prev
					.map((row) => (row.id === updated.id ? updated : row))
					.sort((a, b) => (Date.parse(a.starts_at || '') || 0) - (Date.parse(b.starts_at || '') || 0)),
			);
			setSelectedEvent((prev) => (prev && prev.id === updated.id ? updated : prev));
			setShowEditEventModal(false);
			setEditEventId(null);
		} catch (error: any) {
			setCalendarError(toErrorMessage(error));
		} finally {
			setSavingEditEvent(false);
		}
	}

	async function onDeleteEvent() {
		if (!eventToDelete) return;
		setCalendarError(null);
		setDeletingEvent(true);
		try {
			const targetId = eventToDelete.id;
			await selectedAccount.calendar.remove(targetId);
			setEvents((prev) => prev.filter((event) => event.id !== targetId));
			setSelectedEvent((prev) => (prev && prev.id === targetId ? null : prev));
			setEventToDelete(null);
		} catch (error: any) {
			setCalendarError(toErrorMessage(error));
		} finally {
			setDeletingEvent(false);
		}
	}

	async function onManualSync(targetAccountId?: number) {
		const effectiveAccountId = targetAccountId ?? accountId;
		if (!effectiveAccountId) return;
		queueBackgroundSync(effectiveAccountId, 'manual');
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

	const openNewEventForTimeRange = useCallback((dayKey: string, startHour: number, endHourExclusive: number) => {
		const day = new Date(`${dayKey}T00:00:00`);
		if (Number.isNaN(day.getTime())) return;
		const safeStart = Math.max(0, Math.min(23, startHour));
		const safeEndExclusive = Math.max(safeStart + 1, Math.min(24, endHourExclusive));
		const start = new Date(day);
		start.setHours(safeStart, 0, 0, 0);
		const end = new Date(day);
		end.setHours(safeEndExclusive, 0, 0, 0);
		setEventStartDate(toDateInputValue(start));
		setEventStartTime(toTimeInputValue(start));
		setEventEndDate(toDateInputValue(end));
		setEventEndTime(toTimeInputValue(end));
		setShowAddEventModal(true);
	}, []);

	const finalizeWeekDragSelection = useCallback(
		(
			selection: {
				dayKey: string;
				startHour: number;
				endHour: number;
			} | null,
		) => {
			if (!selection) return;
			const startHour = Math.min(selection.startHour, selection.endHour);
			const endHourExclusive = Math.max(selection.startHour, selection.endHour) + 1;
			openNewEventForTimeRange(selection.dayKey, startHour, endHourExclusive);
			setWeekDragSelection(null);
		},
		[openNewEventForTimeRange],
	);

	useEffect(() => {
		if (!weekDragSelection) return;
		const onWindowMouseUp = () => finalizeWeekDragSelection(weekDragSelection);
		window.addEventListener('mouseup', onWindowMouseUp);
		return () => window.removeEventListener('mouseup', onWindowMouseUp);
	}, [finalizeWeekDragSelection, weekDragSelection]);

	const accountSidebar = (
		<aside className="sidebar flex h-full min-h-0 shrink-0 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto p-3">
				<p className="ui-text-muted px-2 pb-2 text-xs font-semibold uppercase tracking-wide">Accounts</p>
				<div className="space-y-1">
					{accounts.map((account) => {
						const isSyncingAccount = syncing && syncingAccountId === account.id;
						const avatarColors = getAccountAvatarColorsForAccount(account);
						return (
							<div
								key={account.id}
								className={cn(
									'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
									accountId === account.id ? 'ui-surface-active ui-text-primary' : 'account-item',
								)}
							>
								<Button
									type="button"
									onClick={() => onSelectAccount(account.id)}
									className="flex min-w-0 flex-1 items-center gap-2 text-left"
								>
									<span
										className="avatar-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
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
											<span className="ui-text-muted block truncate text-[11px] font-normal">
												{account.email}
											</span>
										)}
									</span>
								</Button>
								<div
									className={cn(
										'flex items-center gap-1 transition-opacity',
										isSyncingAccount ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
									)}
								>
									<Button
										type="button"
										variant="ghost"
										className="ui-surface-hover ui-hover-text-primary rounded p-1 ui-text-muted transition-colors"
										onClick={() => void onManualSync(account.id)}
										title="Sync account"
										aria-label="Sync account"
										disabled={isSyncingAccount}
									>
										<RefreshCw size={13} className={cn(isSyncingAccount && 'animate-spin')} />
									</Button>
									<Button
										type="button"
										variant="ghost"
										className="ui-surface-hover ui-hover-text-primary rounded p-1 ui-text-muted transition-colors"
										onClick={() => navigate(`/settings/account?accountId=${account.id}`)}
										title="Edit account"
										aria-label="Edit account"
									>
										<Settings size={13} />
									</Button>
								</div>
							</div>
						);
					})}
					{accounts.length === 0 && <p className="ui-text-muted px-2 py-2 text-sm">No accounts available.</p>}
				</div>
			</div>
		</aside>
	);
	const selectedDayEvents = selectedDayForModal ? (eventsByDay.get(selectedDayForModal) ?? []) : [];
	const selectedAccountEmail = String(selectedAccount.account?.email || '').trim().toLowerCase() || null;
	const getEventVisuals = useCallback(
		(event: CalendarEventItem): {ownerLabel: string | null; ownerShortLabel: string | null; pillStyle?: React.CSSProperties} => {
			const metadata = parseGoogleEventMetadata(event);
			const organizerEmail = String(metadata?.organizerEmail || '').trim().toLowerCase() || null;
			const organizerName = String(metadata?.organizerName || '').trim() || null;
			const ownerLabel =
				organizerName && organizerEmail
					? `${organizerName} (${organizerEmail})`
					: organizerName || organizerEmail || null;
			const ownerShortLabel = organizerName || (organizerEmail ? organizerEmail.split('@')[0] : null);
			const isSharedOrganizer =
				Boolean(organizerEmail) &&
				(!selectedAccountEmail || organizerEmail !== selectedAccountEmail);
			if (!isSharedOrganizer || !organizerEmail) {
				return {ownerLabel, ownerShortLabel, pillStyle: undefined};
			}
			const hue = hashOwnerKey(organizerEmail) % 360;
			return {
				ownerLabel,
				ownerShortLabel,
				pillStyle: {
					borderLeft: `3px solid hsl(${hue} 68% 50%)`,
					backgroundColor: `color-mix(in srgb, hsl(${hue} 72% 50%) 15%, var(--panel-surface))`,
					color: `color-mix(in srgb, hsl(${hue} 70% 34%) 80%, var(--content-text))`,
				},
			};
		},
		[selectedAccountEmail],
	);

	const calendarToolbar = (
		<div className="flex h-10 min-w-0 items-center gap-2">
			<div className="flex items-center rounded-md border ui-border-default ui-surface-card">
				<Button
					type="button"
					variant="ghost"
					className="inline-flex h-10 w-10 items-center justify-center"
					onClick={() =>
						setVisibleMonth((prev) =>
							calendarViewMode === 'month'
								? new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
								: new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7),
						)
					}
					aria-label={calendarViewMode === 'month' ? 'Previous month' : 'Previous week'}
				>
					<ChevronLeft size={16} />
				</Button>
				<div className="ui-text-primary min-w-44 px-2 text-center text-sm font-medium">
					{calendarViewMode === 'month'
						? visibleMonth.toLocaleDateString(systemLocale, {month: 'long', year: 'numeric'})
						: weekRangeLabel}
				</div>
				<Button
					type="button"
					variant="ghost"
					className="inline-flex h-10 w-10 items-center justify-center"
					onClick={() =>
						setVisibleMonth((prev) =>
							calendarViewMode === 'month'
								? new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
								: new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7),
						)
					}
					aria-label={calendarViewMode === 'month' ? 'Next month' : 'Next week'}
				>
					<ChevronRight size={16} />
				</Button>
			</div>
			<Button
				type="button"
				variant="outline"
				className="inline-flex h-10 items-center rounded-md px-3 text-sm"
				onClick={() => setVisibleMonth(calendarViewMode === 'month' ? startOfMonth(new Date()) : new Date())}
			>
				Today
			</Button>
			<div className="inline-flex items-center overflow-hidden rounded-md border ui-border-default ui-surface-card">
				<Button
					type="button"
					className={cn(
						'px-3 py-2 text-xs font-medium',
						calendarViewMode === 'month'
							? 'ui-surface-active ui-text-primary'
							: 'ui-text-secondary ui-surface-hover',
					)}
					onClick={() => setCalendarViewMode('month')}
				>
					Month
				</Button>
				<Button
					type="button"
					className={cn(
						'inline-flex items-center gap-1 px-3 py-2 text-xs font-medium',
						calendarViewMode === 'week'
							? 'ui-surface-active ui-text-primary'
							: 'ui-text-secondary ui-surface-hover',
					)}
					onClick={() => setCalendarViewMode('week')}
				>
					<CalendarDays size={12} />
					Week
				</Button>
			</div>
			<Button
				type="button"
				disabled={!accountId}
				variant="default"
				className="ml-auto inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-60"
				onClick={() => setShowAddEventModal(true)}
				title="Add event"
				aria-label="Add event"
			>
				<Plus size={14} />
				Add event
			</Button>
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
				contentClassName="p-0 overflow-hidden"
				statusText={
					syncing && syncStatusText.toLowerCase().includes('ready') ? statusSyncing() : syncStatusText
				}
				statusBusy={syncing || loading}
			>
				<div className="flex h-full min-h-full min-w-0 flex-col">
					{calendarError && (
						<div className="notice-danger shrink-0 border-b px-4 py-2 text-sm">{calendarError}</div>
					)}
					{!accountId && <div className="ui-text-muted p-5 text-sm">{statusNoAccountSelected()}</div>}
					{accountId && (
							<div className="min-h-0 flex flex-1 overflow-hidden">
								<div
									ref={calendarBodyScrollRef}
									className="ui-surface-content min-h-full min-w-0 flex-1 overflow-auto"
							>
								{calendarViewMode === 'month' && (
									<div className="min-h-full ui-surface-card flex flex-col">
										<div
											className={cn(
												'surface-muted sticky top-0 z-20 grid border-b ui-border-default',
												MONTH_GRID_COLUMNS,
											)}
										>
											<div className="border-r ui-border-default px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wide ui-text-muted"></div>
											{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
												<div
													key={day}
													className="border-r ui-border-default px-2 py-2 text-[11px] font-semibold uppercase tracking-wide ui-text-secondary last:border-r-0"
												>
													{day}
												</div>
											))}
										</div>
										<div
											className="flex-1"
											style={{
												display: 'grid',
												gridTemplateRows: `repeat(${calendarWeeks.length}, minmax(0, 1fr))`,
											}}
										>
											{calendarWeeks.map((week) => (
												<div
													key={`week-${toDateKey(week[0] || new Date())}`}
													className={cn('grid min-h-0', MONTH_GRID_COLUMNS)}
												>
													<div className="surface-muted border-r border-b ui-border-default px-1 py-2 text-center text-[11px] font-medium ui-text-muted">
														{getIsoWeekNumber(week[0] || new Date())}
													</div>
													{week.map((day) => {
														const key = toDateKey(day);
														const dayEvents = eventsByDay.get(key) ?? [];
														const isCurrentMonth =
															day.getMonth() === calendarBounds.monthStart.getMonth();
														const isToday = key === toDateKey(new Date());
														return (
															<div
																key={key}
																data-calendar-day-key={key}
																className={cn(
																	'group min-h-0 border-r border-b ui-border-default p-2 transition-colors ui-surface-hover last:border-r-0',
																	!isCurrentMonth && 'surface-muted opacity-80',
																)}
																onContextMenu={(event) => {
																	event.preventDefault();
																	event.stopPropagation();
																	openDayContextMenu(
																		event.clientX,
																		event.clientY,
																		key,
																	);
																}}
																onClick={(event) => {
																	const target = event.target as HTMLElement | null;
																	if (target?.closest('button')) return;
																	openNewEventForDay(key);
																}}
															>
																<div className="mb-1 flex items-center justify-between">
																	<span
																		className={cn(
																			'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
																			isToday
																				? 'chip-primary font-semibold shadow-sm'
																				: 'ui-text-secondary',
																			!isCurrentMonth && 'ui-text-muted',
																		)}
																	>
																		{day.getDate()}
																	</span>
																</div>
																<div className="max-h-[calc(100%-1.75rem)] space-y-1 overflow-y-auto">
																	{dayEvents.slice(0, 3).map((event) => {
																		const visuals = getEventVisuals(event);
																		return (
																			<Button
																				key={event.id}
																				type="button"
																				className="event-pill block w-full truncate rounded px-2 py-1 text-left text-xs"
																				style={visuals.pillStyle}
																				onClick={() => setSelectedEvent(event)}
																				title={
																					visuals.ownerLabel
																						? `${event.summary || '(No title)'} — ${visuals.ownerLabel}`
																						: (event.summary || '(No title)')
																				}
																			>
																				{formatEventTime(event.starts_at)} {event.summary || '(No title)'}
																				{visuals.ownerShortLabel ? ` · ${visuals.ownerShortLabel}` : ''}
																			</Button>
																		);
																	})}
																	{dayEvents.length > 3 && (
																		<p className="ui-text-muted px-1 text-xs">
																			+{dayEvents.length - 3} more
																		</p>
																	)}
																</div>
															</div>
														);
													})}
												</div>
											))}
										</div>
										{loading && (
											<div className="border-t ui-border-default px-3 py-2 text-sm ui-text-muted">
												Loading events...
											</div>
										)}
									</div>
								)}
								{calendarViewMode === 'week' && (
									<div className="min-h-full ui-surface-card">
										<div
											className={cn(
												'surface-muted sticky top-0 z-20 grid border-b ui-border-default',
												WEEK_GRID_COLUMNS,
											)}
										>
											<div className="border-r ui-border-default px-2 py-2 text-xs font-semibold ui-text-secondary">
												Time
											</div>
											{weekDays.map((day) => {
												const key = toDateKey(day);
												const isToday = key === toDateKey(new Date());
												return (
													<div
														key={key}
														className={cn(
															'cursor-pointer border-r ui-border-default px-2 py-2 text-center text-xs font-semibold transition-colors ui-surface-hover',
															isToday ? 'chip-info' : 'ui-text-secondary',
														)}
														onClick={() => openNewEventForDay(key)}
													>
														{day.toLocaleDateString(systemLocale, {
															weekday: 'short',
															month: 'short',
															day: 'numeric',
														})}
													</div>
												);
											})}
										</div>
										<div className="min-h-full">
											<div
												className={cn('relative grid', WEEK_GRID_COLUMNS)}
												style={{height: WEEK_HOUR_ROW_HEIGHT * 24}}
											>
												{weekContainsNow && (
													<>
														<div
															className="border-danger pointer-events-none absolute left-22 right-0 z-20 border-t-2"
															style={{top: weekNowTopPx}}
														/>
														<div
															className="text-danger pointer-events-none absolute left-0 z-20 w-22 -translate-y-1/2 pr-2 text-right text-[10px] font-semibold"
															style={{top: weekNowTopPx}}
														>
															{now.toLocaleTimeString(systemLocale, {
																hour: 'numeric',
																minute: '2-digit',
															})}
														</div>
													</>
												)}
												<div className="border-r ui-border-default">
													{weekHours.map((hour) => (
														<div
															key={hour}
															className="surface-muted relative border-b ui-border-default px-2 py-2 text-xs ui-text-secondary"
															style={{height: WEEK_HOUR_ROW_HEIGHT}}
														>
															{new Date(2000, 0, 1, hour).toLocaleTimeString(
																systemLocale,
																{
																	hour: 'numeric',
																	minute: '2-digit',
																},
															)}
														</div>
													))}
												</div>
												{weekDays.map((day) => {
													const dayKey = toDateKey(day);
													const dayLayouts = weekEventsByDay.get(dayKey) ?? [];
													return (
														<div
															key={dayKey}
															data-calendar-day-key={dayKey}
															className="relative border-r ui-border-default"
															style={{height: WEEK_HOUR_ROW_HEIGHT * 24}}
															onContextMenu={(event) => {
																event.preventDefault();
																event.stopPropagation();
																openDayContextMenu(
																	event.clientX,
																	event.clientY,
																	dayKey,
																);
															}}
														>
															{weekHours.map((hour) => (
																<div
																	key={`${dayKey}-row-${hour}`}
																	className={cn(
																		'cursor-pointer border-b ui-border-default transition-colors ui-surface-hover',
																		weekDragSelection &&
																			weekDragSelection.dayKey === dayKey &&
																			hour >=
																				Math.min(
																					weekDragSelection.startHour,
																					weekDragSelection.endHour,
																				) &&
																			hour <=
																				Math.max(
																					weekDragSelection.startHour,
																					weekDragSelection.endHour,
																				) &&
																			'event-selection',
																	)}
																	style={{height: WEEK_HOUR_ROW_HEIGHT}}
																	onMouseDown={(event) => {
																		event.preventDefault();
																		setWeekDragSelection({
																			dayKey,
																			startHour: hour,
																			endHour: hour,
																		});
																	}}
																	onMouseEnter={() => {
																		setWeekDragSelection((prev) => {
																			if (!prev) return prev;
																			if (prev.dayKey !== dayKey) return prev;
																			if (prev.endHour === hour) return prev;
																			return {...prev, endHour: hour};
																		});
																	}}
																	onMouseUp={(event) => {
																		event.preventDefault();
																		finalizeWeekDragSelection(weekDragSelection);
																	}}
																/>
															))}
															{dayLayouts.map((layout, idx) => {
																const visuals = getEventVisuals(layout.event);
																return (
																	<Button
																		key={`${layout.event.id}-${idx}`}
																		type="button"
																		className="event-pill absolute left-1 right-1 z-10 overflow-hidden rounded px-2 py-1 text-left text-xs"
																		style={{
																			top: layout.topPx + 1,
																			height: Math.max(18, layout.heightPx - 2),
																			...(visuals.pillStyle || {}),
																		}}
																		onClick={() => setSelectedEvent(layout.event)}
																		title={
																			visuals.ownerLabel
																				? `${layout.event.summary || '(No title)'} — ${visuals.ownerLabel}`
																				: (layout.event.summary || '(No title)')
																		}
																	>
																		<span className="block truncate font-medium">
																			{layout.event.summary || '(No title)'}
																		</span>
																		<span className="block truncate opacity-80">
																			{formatEventTime(layout.event.starts_at)} -{' '}
																			{formatEventTime(layout.event.ends_at)}
																			{visuals.ownerShortLabel ? ` · ${visuals.ownerShortLabel}` : ''}
																		</span>
																	</Button>
																);
															})}
														</div>
													);
												})}
											</div>
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</WorkspaceLayout>

			{dayContextMenu && (
				<ContextMenu
					ref={dayContextMenuRef}
					size="lg"
					layer="50"
					position={{left: dayContextMenu.x, top: dayContextMenu.y}}
					onRequestClose={() => setDayContextMenu(null)}
					onContextMenu={(event) => event.preventDefault()}
				>
					<ContextMenuItem
						type="button"
						onClick={() => {
							setSelectedDayForModal(dayContextMenu.dayKey);
							setDayContextMenu(null);
						}}
					>
						View all events ({(eventsByDay.get(dayContextMenu.dayKey) ?? []).length})
					</ContextMenuItem>
					<ContextMenuItem
						type="button"
						onClick={() => {
							openNewEventForDay(dayContextMenu.dayKey);
							setDayContextMenu(null);
						}}
					>
						New event on this day
					</ContextMenuItem>
				</ContextMenu>
			)}

			{selectedEvent && (
				<Modal open onClose={() => setSelectedEvent(null)} backdropClassName="z-50" contentClassName="max-w-lg">
					<h3 className="ui-text-primary text-base font-semibold">{selectedEvent.summary || '(No title)'}</h3>
					<p className="ui-text-secondary mt-2 text-sm">
						{formatSystemDateTime(selectedEvent.starts_at, systemLocale)} -{' '}
						{formatSystemDateTime(selectedEvent.ends_at, systemLocale)}
					</p>
					{getEventVisuals(selectedEvent).ownerLabel && (
						<p className="ui-text-secondary mt-2 text-sm">
							Owner: {getEventVisuals(selectedEvent).ownerLabel}
						</p>
					)}
					{selectedEvent.location && (
						<p className="ui-text-secondary mt-2 text-sm">{selectedEvent.location}</p>
					)}
					{selectedEvent.description && (
						<p className="ui-text-secondary mt-3 whitespace-pre-wrap text-sm">
							{selectedEvent.description}
						</p>
					)}
					<div className="mt-4 flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm"
							onClick={() => {
								openEditEventModal(selectedEvent);
								setSelectedEvent(null);
							}}
						>
							<Pencil size={14} />
							Edit
						</Button>
						<Button
							type="button"
							className="notice-button-danger inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm"
							onClick={() => {
								setEventToDelete(selectedEvent);
								setSelectedEvent(null);
							}}
						>
							<Trash2 size={14} />
							Delete
						</Button>
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => setSelectedEvent(null)}
						>
							Close
						</Button>
					</div>
				</Modal>
			)}

			{selectedDayForModal && (
				<Modal
					open
					onClose={() => setSelectedDayForModal(null)}
					backdropClassName="z-50"
					contentClassName="max-w-2xl"
				>
					<h3 className="ui-text-primary text-base font-semibold">Events on {selectedDayForModal}</h3>
					<div className="mt-3">
						{selectedDayEvents.length === 0 && (
							<p className="ui-text-muted text-sm">No events on this day.</p>
						)}
						{selectedDayEvents.length > 0 && (
							<ul className="space-y-2">
								{selectedDayEvents.map((event) => (
									<li key={event.id}>
										<Button
											type="button"
											className="ui-surface-hover w-full rounded border ui-border-default px-3 py-2 text-left"
											style={getEventVisuals(event).pillStyle}
											onClick={() => {
												setSelectedEvent(event);
												setSelectedDayForModal(null);
											}}
										>
											<p className="ui-text-primary text-sm font-medium">
												{formatEventTime(event.starts_at)} {event.summary || '(No title)'}
											</p>
											{event.location && (
												<p className="ui-text-muted mt-0.5 text-xs">{event.location}</p>
											)}
											{getEventVisuals(event).ownerLabel && (
												<p className="ui-text-muted mt-0.5 text-xs">
													Owner: {getEventVisuals(event).ownerLabel}
												</p>
											)}
										</Button>
									</li>
								))}
							</ul>
						)}
					</div>
					<div className="mt-4 flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => {
								openNewEventForDay(selectedDayForModal);
								setSelectedDayForModal(null);
							}}
						>
							New event on this day
						</Button>
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => setSelectedDayForModal(null)}
						>
							Close
						</Button>
					</div>
				</Modal>
			)}

			{showEditEventModal && editEventId && (
				<Modal
					open
					onClose={() => setShowEditEventModal(false)}
					backdropClassName="z-50"
					contentClassName="max-w-xl"
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void onUpdateEvent();
						}}
					>
						<ModalHeader className="ui-border-default border-b pb-3">
							<ModalTitle className="text-base">Edit Event</ModalTitle>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-8 w-8 rounded-md"
								onClick={() => setShowEditEventModal(false)}
								title="Close"
								aria-label="Close edit event modal"
							>
								<X size={14} />
							</Button>
						</ModalHeader>
						<div className="mt-4 grid gap-3 md:grid-cols-2">
							<label className="block text-sm md:col-span-2">
								<span className="ui-text-secondary mb-1 block font-medium">Title</span>
								<FormInput
									type="text"
									value={editEventTitle}
									onChange={(event) => setEditEventTitle(event.target.value)}
									placeholder="Team sync"
								/>
							</label>
							<div className="block text-sm">
								<span className="ui-text-secondary mb-1 block font-medium">Start</span>
								<div className="w-full">
									<FormDateTimeInput
										value={composeLocalDateTimeValue(editEventStartDate, editEventStartTime)}
										onChange={(event) => {
											const next = splitLocalDateTimeValue(event.target.value);
											setEditEventStartDate(next.date);
											setEditEventStartTime(next.time);
										}}
										locale={systemLocale}
										className="w-full"
										required
									/>
								</div>
							</div>
							<div className="block text-sm">
								<span className="ui-text-secondary mb-1 block font-medium">End</span>
								<div className="w-full">
									<FormDateTimeInput
										value={composeLocalDateTimeValue(editEventEndDate, editEventEndTime)}
										onChange={(event) => {
											const next = splitLocalDateTimeValue(event.target.value);
											setEditEventEndDate(next.date);
											setEditEventEndTime(next.time);
										}}
										locale={systemLocale}
										className="w-full"
										required
									/>
								</div>
							</div>
							<label className="block text-sm md:col-span-2">
								<span className="ui-text-secondary mb-1 block font-medium">Location</span>
								<FormInput
									type="text"
									value={editEventLocation}
									onChange={(event) => setEditEventLocation(event.target.value)}
									placeholder="Conference Room"
								/>
							</label>
							<label className="block text-sm md:col-span-2">
								<span className="ui-text-secondary mb-1 block font-medium">Description</span>
								<FormTextarea
									value={editEventDescription}
									onChange={(event) => setEditEventDescription(event.target.value)}
									rows={4}
								/>
							</label>
						</div>
						<div className="mt-4 flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								className="rounded-md px-3 py-2 text-sm"
								onClick={() => setShowEditEventModal(false)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="default"
								className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
								disabled={savingEditEvent}
							>
								{savingEditEvent ? 'Saving...' : 'Save Changes'}
							</Button>
						</div>
					</form>
				</Modal>
			)}

			{eventToDelete && (
				<Modal open onClose={() => setEventToDelete(null)} backdropClassName="z-50" contentClassName="max-w-md">
					<h3 className="ui-text-primary text-base font-semibold">Delete event?</h3>
					<p className="ui-text-secondary mt-2 text-sm">
						This will remove "{eventToDelete.summary || '(No title)'}" from your calendar.
					</p>
					<div className="mt-4 flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => setEventToDelete(null)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							className="button button-danger rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
							onClick={() => void onDeleteEvent()}
							disabled={deletingEvent}
						>
							{deletingEvent ? 'Deleting...' : 'Delete'}
						</Button>
					</div>
				</Modal>
			)}

			{showAddEventModal && accountId && (
				<Modal
					open
					onClose={() => setShowAddEventModal(false)}
					backdropClassName="z-50"
					contentClassName="max-w-xl"
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void onCreateEvent();
						}}
					>
						<ModalHeader className="ui-border-default border-b pb-3">
							<ModalTitle className="text-base">Add Event</ModalTitle>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-8 w-8 rounded-md"
								onClick={() => setShowAddEventModal(false)}
								title="Close"
								aria-label="Close add event modal"
							>
								<X size={14} />
							</Button>
						</ModalHeader>
						<div className="mt-4 grid gap-3 md:grid-cols-2">
							<label className="block text-sm md:col-span-2">
								<span className="ui-text-secondary mb-1 block font-medium">Title</span>
								<FormInput
									type="text"
									value={eventTitle}
									onChange={(event) => setEventTitle(event.target.value)}
									placeholder="Team sync"
								/>
							</label>
							<div className="block text-sm">
								<span className="ui-text-secondary mb-1 block font-medium">Start</span>
								<div className="w-full">
									<FormDateTimeInput
										value={composeLocalDateTimeValue(eventStartDate, eventStartTime)}
										onChange={(event) => {
											const next = splitLocalDateTimeValue(event.target.value);
											setEventStartDate(next.date);
											setEventStartTime(next.time);
										}}
										locale={systemLocale}
										className="w-full"
										required
									/>
								</div>
							</div>
							<div className="block text-sm">
								<span className="ui-text-secondary mb-1 block font-medium">End</span>
								<div className="w-full">
									<FormDateTimeInput
										value={composeLocalDateTimeValue(eventEndDate, eventEndTime)}
										onChange={(event) => {
											const next = splitLocalDateTimeValue(event.target.value);
											setEventEndDate(next.date);
											setEventEndTime(next.time);
										}}
										locale={systemLocale}
										className="w-full"
										required
									/>
								</div>
							</div>
							<label className="block text-sm md:col-span-2">
								<span className="ui-text-secondary mb-1 block font-medium">Location</span>
								<FormInput
									type="text"
									value={eventLocation}
									onChange={(event) => setEventLocation(event.target.value)}
									placeholder="Conference Room"
								/>
							</label>
							<label className="block text-sm md:col-span-2">
								<span className="ui-text-secondary mb-1 block font-medium">Description</span>
								<FormTextarea
									value={eventDescription}
									onChange={(event) => setEventDescription(event.target.value)}
									rows={4}
								/>
							</label>
						</div>
						<div className="mt-4 flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								className="rounded-md px-3 py-2 text-sm"
								onClick={() => setShowAddEventModal(false)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="default"
								className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
								disabled={savingEvent}
							>
								{savingEvent ? 'Saving...' : 'Save Event'}
							</Button>
						</div>
					</form>
				</Modal>
			)}
		</>
	);
}

function getIsoWeekNumber(date: Date): number {
	const tempDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNumber = tempDate.getUTCDay() || 7;
	tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNumber);
	const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
	return Math.ceil(((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
