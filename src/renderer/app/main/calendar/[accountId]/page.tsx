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
} from '@llamamail/ui/icon';
import {useNavigate, useParams} from 'react-router-dom';
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
import type {CalendarEventItem, PublicAccount, SyncStatusEvent} from '@preload';
import {getAccountAvatarColorsForAccount, getAccountMonogram} from '@renderer/lib/accountAvatar';
import {formatSystemDateTime} from '@renderer/lib/dateTime';
import {clampToViewport} from '@renderer/lib/format';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {useAccount, useAccountDirectory} from '@renderer/hooks/ipc/useAccounts';
import {useSystemLocale} from '@renderer/hooks/ipc/useSystemLocale';
import {ipcClient} from '@renderer/lib/ipcClient';
import {emitReconnectRequired, isReconnectRequiredMessage} from '@renderer/lib/reconnectPrompt';
import {Button} from '@llamamail/ui/button';
import {FormDateTimeInput, FormInput, FormTextarea} from '@llamamail/ui/form';
import {Modal, ModalHeader, ModalTitle} from '@llamamail/ui/modal';
import {ContextMenu, ContextMenuItem} from '@llamamail/ui/contextmenu';
import {ScrollArea} from '@llamamail/ui/scroll-area';
import {
	statusAutoSyncFailed,
	statusNoAccountSelected,
	statusSyncFailed,
	statusSyncing,
	toErrorMessage,
} from '@renderer/lib/statusText';
import {cn} from '@llamamail/ui/utils';
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
import {composeLocalDateTimeValue, splitLocalDateTimeValue} from '@llamamail/ui/libs/localeInput';
import {
	hasAccountOrderChanged,
	normalizeAccountOrder,
	sortAccountsByOrder,
} from '../../email/mailAccountOrder';
import {useI18n} from '@llamamail/app/i18n/renderer';

type CalendarPageProps = {
	accountId: number | null;
	accounts: PublicAccount[];
	onSelectAccount: (accountId: number | null) => void;
};

const CALENDAR_ACCOUNT_ORDER_STORAGE_KEY = 'llamamail.calendar.accountOrder.v1';

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
	const calendarId = String(metadata?.calendarId || '')
		.trim()
		.toLowerCase();
	const calendarSummary = String(metadata?.calendarSummary || '')
		.trim()
		.toLowerCase();
	if (calendarId.includes('weeknum')) return true;
	if (calendarSummary.includes('week number')) return true;
	if (calendarSummary === 'week numbers') return true;
	return false;
}

function isGoogleSharedEvent(event: CalendarEventItem, selectedAccountEmail: string | null): boolean {
	if (event.source !== 'google-api') return false;
	const metadata = parseGoogleEventMetadata(event);
	const organizerEmail =
		String(metadata?.organizerEmail || '')
			.trim()
			.toLowerCase() || null;
	if (!organizerEmail) return false;
	if (!selectedAccountEmail) return true;
	return organizerEmail !== selectedAccountEmail;
}

function hashOwnerKey(value: string): number {
	let hash = 0;
	for (let i = 0; i < value.length; i += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

function parseAccountSortableId(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	if (!value.startsWith('account-')) return null;
	const parsed = Number(value.slice('account-'.length));
	return Number.isFinite(parsed) ? parsed : null;
}

function SortableAccountRow({
	accountId,
	children,
}: {
	accountId: number;
	children: (dragProps: {
		attributes: Record<string, unknown>;
		listeners: Record<string, unknown>;
		setActivatorRef: (node: HTMLElement | null) => void;
	}) => React.ReactNode;
}) {
	const {attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging} = useSortable({
		id: `account-${accountId}`,
		data: {accountId},
	});
	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition: transition ?? 'transform 180ms cubic-bezier(0.2, 0.65, 0.3, 1)',
				opacity: isDragging ? 0.2 : 1,
			}}
		>
			{children({
				attributes: attributes as unknown as Record<string, unknown>,
				listeners: (listeners ?? {}) as Record<string, unknown>,
				setActivatorRef: setActivatorNodeRef,
			})}
		</div>
	);
}

function SortableAccountEndDrop() {
	const {setNodeRef} = useDroppable({
		id: 'account-end',
		data: {kind: 'account-end'},
	});
	return <div ref={setNodeRef} className="h-24 w-full" />;
}

export default function CalendarPage({accountId: selectedAccountId, accounts, onSelectAccount}: CalendarPageProps) {
	const {t} = useI18n();
	const CALENDAR_VIEW_STORAGE_KEY = 'llamamail.calendar.view.mode';
	const CALENDAR_HIDE_SHARED_EVENTS_STORAGE_KEY = 'llamamail.calendar.hideSharedEvents.v1';
	const CALENDAR_EVENT_FETCH_LIMIT_WEEK = 1200;
	const CALENDAR_EVENT_FETCH_LIMIT_MONTH = 2500;
	const WEEK_HOUR_ROW_HEIGHT = 56;
	const WEEK_GRID_COLUMNS = 'grid-cols-[88px_repeat(7,minmax(0,1fr))]';
	const MONTH_GRID_COLUMNS = 'grid-cols-[42px_repeat(7,minmax(0,1fr))]';
	const navigate = useNavigate();
	const {accountId: routeAccountIdParam} = useParams<{accountId?: string}>();
	const routeAccountId = useMemo(() => {
		const parsed = Number(routeAccountIdParam);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
	}, [routeAccountIdParam]);
	const hasValidRouteAccount = useMemo(
		() => routeAccountId !== null && accounts.some((candidate) => candidate.id === routeAccountId),
		[accounts, routeAccountId],
	);
	const accountId = hasValidRouteAccount ? routeAccountId : selectedAccountId;
	const DAY_CONTEXT_MENU_WIDTH = 224;
	const DAY_CONTEXT_MENU_HEIGHT = 92;
	const [loading, setLoading] = useState(false);
	const [savingEvent, setSavingEvent] = useState(false);
	const [deletingEvent, setDeletingEvent] = useState(false);
	const [savingEditEvent, setSavingEditEvent] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [syncingAccountId, setSyncingAccountId] = useState<number | null>(null);
	const [syncStatusText, setSyncStatusText] = useState(t('calendar_page.status.ready'));
	const [events, setEvents] = useState<CalendarEventItem[]>([]);
	const [hideSharedEvents, setHideSharedEvents] = useState<boolean>(() => {
		try {
			return window.localStorage.getItem(CALENDAR_HIDE_SHARED_EVENTS_STORAGE_KEY) === '1';
		} catch {
			return false;
		}
	});
	const [accountOrder, setAccountOrder] = useState<number[]>(() =>
		readPersistedAccountOrder(CALENDAR_ACCOUNT_ORDER_STORAGE_KEY),
	);
	const [draggingAccountId, setDraggingAccountId] = useState<number | null>(null);
	const [dragOverlaySize, setDragOverlaySize] = useState<{width: number; height: number} | null>(null);
	const selectedAccountEmail = useMemo(
		() =>
			String(accounts.find((account) => account.id === accountId)?.email || '')
				.trim()
				.toLowerCase() || null,
		[accountId, accounts],
	);
	const isReadOnlySharedEvent = useCallback(
		(event: CalendarEventItem | null | undefined): boolean => {
			if (!event) return false;
			return isGoogleSharedEvent(event, selectedAccountEmail);
		},
		[selectedAccountEmail],
	);
	const visibleEvents = useMemo(
		() =>
			events.filter((event) => {
				if (isGoogleWeekNumbersEvent(event)) return false;
				if (hideSharedEvents && isGoogleSharedEvent(event, selectedAccountEmail)) return false;
				return true;
			}),
		[events, hideSharedEvents, selectedAccountEmail],
	);
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
	const queuedSyncSourceByAccountRef = useRef<Map<number, 'auto' | 'manual'>>(new Map());
	const activeAccountIdRef = useRef<number | null>(accountId);
	const loadSequenceRef = useRef(0);
	const syncSequenceRef = useRef(0);
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
	const accountSensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 6}}));
	const selectedAccount = useAccount(accountId);
	const accountDirectory = useAccountDirectory();
	const orderedAccounts = useMemo(() => sortAccountsByOrder(accounts, accountOrder), [accountOrder, accounts]);
	const handleCalendarError = useCallback(
		(error: unknown, targetAccountId: number | null = accountId): string => {
			const message = toErrorMessage(error);
			if (targetAccountId && isReconnectRequiredMessage(message)) {
				emitReconnectRequired({
					kind: 'mail',
					accountId: targetAccountId,
					reason: message,
				});
			}
			return message;
		},
		[accountId],
	);
	const accountSortableIds = useMemo(
		() => orderedAccounts.map((account) => `account-${account.id}`),
		[orderedAccounts],
	);
	const draggingAccount = useMemo(
		() =>
			draggingAccountId === null ? null : (orderedAccounts.find((account) => account.id === draggingAccountId) ?? null),
		[draggingAccountId, orderedAccounts],
	);

	useEffect(() => {
		const firstAccountId = orderedAccounts[0]?.id ?? null;
		if (firstAccountId === null) {
			if (selectedAccountId !== null) onSelectAccount(null);
			return;
		}
		if (!hasValidRouteAccount) {
			navigate(`/calendar/${firstAccountId}`, {replace: true});
			if (selectedAccountId !== firstAccountId) onSelectAccount(firstAccountId);
			return;
		}
		if (routeAccountId !== null && selectedAccountId !== routeAccountId) {
			onSelectAccount(routeAccountId);
		}
	}, [hasValidRouteAccount, navigate, onSelectAccount, orderedAccounts, routeAccountId, selectedAccountId]);

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
		activeAccountIdRef.current = accountId;
		loadSequenceRef.current += 1;
		syncSequenceRef.current += 1;
	}, [accountId]);

	useEffect(() => {
		setAccountOrder((prev) => {
			const normalized = normalizeAccountOrder(prev, accounts);
			if (!hasAccountOrderChanged(prev, normalized)) return prev;
			return normalized;
		});
	}, [accounts]);

	useEffect(() => {
		writePersistedAccountOrder(CALENDAR_ACCOUNT_ORDER_STORAGE_KEY, accountOrder);
	}, [accountOrder]);

	useEffect(() => {
		try {
			window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, calendarViewMode);
		} catch {
			// ignore persistence failure
		}
	}, [calendarViewMode]);

	useEffect(() => {
		try {
			window.localStorage.setItem(CALENDAR_HIDE_SHARED_EVENTS_STORAGE_KEY, hideSharedEvents ? '1' : '0');
		} catch {
			// ignore persistence failure
		}
	}, [hideSharedEvents]);

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
			const targetAccountId = targetAccount.id ?? null;
			const range = getVisibleCalendarRange();
			const rows = await targetAccount.calendar.refresh(
				range.startIso,
				range.endIso,
				calendarViewMode === 'week' ? CALENDAR_EVENT_FETCH_LIMIT_WEEK : CALENDAR_EVENT_FETCH_LIMIT_MONTH,
			);
			if (targetAccountId && activeAccountIdRef.current !== targetAccountId) return;
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
		if (inFlightSyncAccountsRef.current.has(targetAccountId)) {
			const existing = queuedSyncSourceByAccountRef.current.get(targetAccountId);
			queuedSyncSourceByAccountRef.current.set(
				targetAccountId,
				existing === 'manual' || source === 'manual' ? 'manual' : 'auto',
			);
			return;
		}
		inFlightSyncAccountsRef.current.add(targetAccountId);
		const syncSequence = syncSequenceRef.current;
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
				if (syncSequence !== syncSequenceRef.current || activeAccountIdRef.current !== targetAccountId) return;
				if (targetAccountId === accountId) {
					await refreshVisibleEvents(targetAccount);
				}
				setSyncStatusText(t('calendar_page.status.synced'));
			})
			.catch((error: any) => {
				if (syncSequence !== syncSequenceRef.current || activeAccountIdRef.current !== targetAccountId) return;
				setCalendarError(handleCalendarError(error, targetAccountId));
				setSyncStatusText(source === 'auto' ? statusAutoSyncFailed(error) : statusSyncFailed(error));
			})
			.finally(() => {
				inFlightSyncAccountsRef.current.delete(targetAccountId);
				if (syncSequence === syncSequenceRef.current) {
					setSyncing(false);
					setSyncingAccountId((current) => (current === targetAccountId ? null : current));
				}
				const queuedSource = queuedSyncSourceByAccountRef.current.get(targetAccountId);
				if (queuedSource) {
					queuedSyncSourceByAccountRef.current.delete(targetAccountId);
					queueBackgroundSync(targetAccountId, queuedSource);
				}
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
		const loadSequence = ++loadSequenceRef.current;
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
				if (!active || loadSequence !== loadSequenceRef.current || activeAccountIdRef.current !== accountId) return;
				startTransition(() => {
					setEvents(rows);
				});
			} catch (error: any) {
				if (!active || loadSequence !== loadSequenceRef.current || activeAccountIdRef.current !== accountId) return;
				setCalendarError(handleCalendarError(error, accountId));
			} finally {
				if (active && loadSequence === loadSequenceRef.current) setLoading(false);
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

	useEffect(() => {
		if (!accountId) return;
		queueBackgroundSync(accountId, 'auto');
	}, [accountId, calendarViewMode, calendarBounds.gridStart, calendarBounds.gridEnd]);

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
		setSyncStatusText(t('calendar_page.status.synced'));
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
				setCalendarError(t('calendar_page.error.invalid_start_end'));
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
			setCalendarError(handleCalendarError(error, accountId));
		} finally {
			setSavingEvent(false);
		}
	}

	function openEditEventModal(event: CalendarEventItem) {
		if (isReadOnlySharedEvent(event)) {
			setCalendarError(t('calendar_page.error.shared_read_only'));
			return;
		}
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
		const current = events.find((event) => event.id === editEventId) ?? null;
		if (isReadOnlySharedEvent(current)) {
			setCalendarError(t('calendar_page.error.shared_read_only'));
			return;
		}
		setCalendarError(null);
		setSavingEditEvent(true);
		try {
			const startDate = composeLocalDateTime(editEventStartDate, editEventStartTime);
			const endDate = composeLocalDateTime(editEventEndDate, editEventEndTime);
			if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
				setCalendarError(t('calendar_page.error.invalid_start_end'));
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
			setCalendarError(handleCalendarError(error, accountId));
		} finally {
			setSavingEditEvent(false);
		}
	}

	async function onDeleteEvent() {
		if (!eventToDelete) return;
		if (isReadOnlySharedEvent(eventToDelete)) {
			setCalendarError(t('calendar_page.error.shared_read_only'));
			setEventToDelete(null);
			return;
		}
		setCalendarError(null);
		setDeletingEvent(true);
		try {
			const targetId = eventToDelete.id;
			await selectedAccount.calendar.remove(targetId);
			setEvents((prev) => prev.filter((event) => event.id !== targetId));
			setSelectedEvent((prev) => (prev && prev.id === targetId ? null : prev));
			setEventToDelete(null);
		} catch (error: any) {
			setCalendarError(handleCalendarError(error, accountId));
		} finally {
			setDeletingEvent(false);
		}
	}

	async function onManualSync(targetAccountId?: number) {
		const effectiveAccountId = targetAccountId ?? accountId;
		if (!effectiveAccountId) return;
		queueBackgroundSync(effectiveAccountId, 'manual');
	}

	function onAccountDragStart(event: DragStartEvent): void {
		const activeId = parseAccountSortableId(event.active.id);
		if (!activeId) return;
		setDraggingAccountId(activeId);
		const rect = event.active.rect.current.initial;
		if (rect) {
			setDragOverlaySize({width: rect.width, height: rect.height});
		}
	}

	function onAccountDragEnd(event: DragEndEvent): void {
		const activeId = parseAccountSortableId(event.active.id);
		if (!activeId) {
			setDraggingAccountId(null);
			setDragOverlaySize(null);
			return;
		}
		const currentIds = orderedAccounts.map((account) => account.id);
		const from = currentIds.indexOf(activeId);
		if (from < 0) {
			setDraggingAccountId(null);
			setDragOverlaySize(null);
			return;
		}
		let to = from;
		if (event.over?.id === 'account-end') {
			to = currentIds.length - 1;
		} else {
			const overId = parseAccountSortableId(event.over?.id);
			if (overId) {
				const overIndex = currentIds.indexOf(overId);
				if (overIndex >= 0) to = overIndex;
			}
		}
		if (to !== from) {
			setAccountOrder(arrayMove(currentIds, from, to));
		}
		setDraggingAccountId(null);
		setDragOverlaySize(null);
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
			<ScrollArea className="min-h-0 flex-1 px-3 py-3">
				<p className="ui-text-muted px-2 pb-2 text-xs font-semibold uppercase tracking-wide">
					{t('calendar_page.accounts.title')}
				</p>
				<DndContext
					sensors={accountSensors}
					collisionDetection={closestCenter}
					autoScroll={false}
					onDragStart={onAccountDragStart}
					onDragEnd={onAccountDragEnd}
					onDragCancel={() => {
						setDraggingAccountId(null);
						setDragOverlaySize(null);
					}}
				>
					<SortableContext items={accountSortableIds} strategy={verticalListSortingStrategy}>
						<div className="space-y-1">
							{orderedAccounts.map((account) => {
						const isSyncingAccount = syncing && syncingAccountId === account.id;
						const avatarColors = getAccountAvatarColorsForAccount(account);
						return (
							<SortableAccountRow key={account.id} accountId={account.id}>
								{(dragProps) => (
									<div
										ref={dragProps.setActivatorRef}
										className={cn(
											'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
											accountId === account.id ? 'ui-surface-active ui-text-primary' : 'account-item',
										)}
										{...dragProps.attributes}
										{...dragProps.listeners}
									>
										<Button
											type="button"
											onClick={() => {
												onSelectAccount(account.id);
												navigate(`/calendar/${account.id}`);
											}}
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
												title={t('calendar_page.accounts.sync_account')}
												aria-label={t('calendar_page.accounts.sync_account')}
												disabled={isSyncingAccount}
											>
												<RefreshCw size={13} className={cn(isSyncingAccount && 'animate-spin')} />
											</Button>
											<Button
												type="button"
												variant="ghost"
												className="ui-surface-hover ui-hover-text-primary rounded p-1 ui-text-muted transition-colors"
												onClick={() => navigate(`/settings/account?accountId=${account.id}`)}
												title={t('calendar_page.accounts.edit_account')}
												aria-label={t('calendar_page.accounts.edit_account')}
											>
												<Settings size={13} />
											</Button>
										</div>
									</div>
								)}
							</SortableAccountRow>
						);
					})}
					{accounts.length === 0 && (
						<Button
							type="button"
							variant="secondary"
							className="w-full justify-center rounded-md px-3 py-2 text-sm"
							onClick={() => navigate('/add-account')}
						>
							{t('calendar_page.accounts.add_account')}
						</Button>
					)}
							{draggingAccountId !== null && <SortableAccountEndDrop />}
						</div>
					</SortableContext>
					<DragOverlay dropAnimation={null}>
						{draggingAccount ? (
							<div
								className="panel rounded-lg opacity-85 shadow-xl"
								style={{
									width: dragOverlaySize?.width,
									minHeight: dragOverlaySize?.height,
									boxSizing: 'border-box',
								}}
							>
								<div className="flex items-center gap-2 px-3 py-2">
									<span className="avatar-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold">
										{getAccountMonogram(draggingAccount)}
									</span>
									<span className="min-w-0 flex-1">
										<span className="ui-text-primary block truncate text-sm font-semibold">
											{draggingAccount.display_name?.trim() || draggingAccount.email}
										</span>
										{draggingAccount.display_name?.trim() && (
											<span className="ui-text-muted block truncate text-[11px]">
												{draggingAccount.email}
											</span>
										)}
									</span>
								</div>
							</div>
						) : null}
					</DragOverlay>
				</DndContext>
			</ScrollArea>
		</aside>
	);
	const selectedDayEvents = selectedDayForModal ? (eventsByDay.get(selectedDayForModal) ?? []) : [];
	const getEventVisuals = useCallback(
		(
			event: CalendarEventItem,
		): {ownerLabel: string | null; ownerShortLabel: string | null; pillStyle?: React.CSSProperties} => {
			const metadata = parseGoogleEventMetadata(event);
			const organizerEmail =
				String(metadata?.organizerEmail || '')
					.trim()
					.toLowerCase() || null;
			const organizerName = String(metadata?.organizerName || '').trim() || null;
			const ownerLabel =
				organizerName && organizerEmail
					? `${organizerName} (${organizerEmail})`
					: organizerName || organizerEmail || null;
			const ownerShortLabel = organizerName || (organizerEmail ? organizerEmail.split('@')[0] : null);
			const isSharedOrganizer =
				Boolean(organizerEmail) && (!selectedAccountEmail || organizerEmail !== selectedAccountEmail);
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
					aria-label={
						calendarViewMode === 'month'
							? t('calendar_page.toolbar.previous_month')
							: t('calendar_page.toolbar.previous_week')
					}
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
					aria-label={
						calendarViewMode === 'month'
							? t('calendar_page.toolbar.next_month')
							: t('calendar_page.toolbar.next_week')
					}
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
				{t('calendar_page.toolbar.today')}
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
					{t('calendar_page.toolbar.month')}
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
					{t('calendar_page.toolbar.week')}
				</Button>
			</div>
			<Button
				type="button"
				variant={hideSharedEvents ? 'secondary' : 'outline'}
				className="inline-flex h-10 items-center rounded-md px-3 text-sm"
				onClick={() => setHideSharedEvents((current) => !current)}
				title={
					hideSharedEvents
						? t('calendar_page.toolbar.show_shared_events')
						: t('calendar_page.toolbar.hide_shared_events')
				}
				aria-pressed={hideSharedEvents}
			>
				{hideSharedEvents
					? t('calendar_page.toolbar.shared_hidden')
					: t('calendar_page.toolbar.hide_shared')}
			</Button>
			<Button
				type="button"
				disabled={!accountId}
				variant="default"
				className="ml-auto inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-60"
				onClick={() => setShowAddEventModal(true)}
				title={t('calendar_page.toolbar.add_event')}
				aria-label={t('calendar_page.toolbar.add_event')}
			>
				<Plus size={14} />
				{t('calendar_page.toolbar.add_event')}
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
				statusText={syncing ? statusSyncing() : syncStatusText}
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
											{[
												t('calendar_page.weekday.mon'),
												t('calendar_page.weekday.tue'),
												t('calendar_page.weekday.wed'),
												t('calendar_page.weekday.thu'),
												t('calendar_page.weekday.fri'),
												t('calendar_page.weekday.sat'),
												t('calendar_page.weekday.sun'),
											].map((day) => (
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
																						? `${event.summary || t('calendar_page.placeholder.no_title')} — ${visuals.ownerLabel}`
																						: event.summary || t('calendar_page.placeholder.no_title')
																				}
																			>
																				{formatEventTime(event.starts_at)}{' '}
																				{event.summary || t('calendar_page.placeholder.no_title')}
																				{visuals.ownerShortLabel
																					? ` · ${visuals.ownerShortLabel}`
																					: ''}
																			</Button>
																		);
																	})}
																	{dayEvents.length > 3 && (
																		<p className="ui-text-muted px-1 text-xs">
																			{t('calendar_page.more_events', {count: dayEvents.length - 3})}
																		</p>
																	)}
																</div>
															</div>
														);
													})}
												</div>
											))}
										</div>
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
												{t('calendar_page.label.time')}
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
																				? `${layout.event.summary || t('calendar_page.placeholder.no_title')} — ${visuals.ownerLabel}`
																				: layout.event.summary || t('calendar_page.placeholder.no_title')
																		}
																	>
																		<span className="block truncate font-medium">
																			{layout.event.summary || t('calendar_page.placeholder.no_title')}
																		</span>
																		<span className="block truncate opacity-80">
																			{formatEventTime(layout.event.starts_at)} -{' '}
																			{formatEventTime(layout.event.ends_at)}
																			{visuals.ownerShortLabel
																				? ` · ${visuals.ownerShortLabel}`
																				: ''}
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
						{t('calendar_page.context.view_all_events', {
							count: (eventsByDay.get(dayContextMenu.dayKey) ?? []).length,
						})}
					</ContextMenuItem>
					<ContextMenuItem
						type="button"
						onClick={() => {
							openNewEventForDay(dayContextMenu.dayKey);
							setDayContextMenu(null);
						}}
					>
						{t('calendar_page.context.new_event_on_day')}
					</ContextMenuItem>
				</ContextMenu>
			)}

			{selectedEvent && (
				<Modal open onClose={() => setSelectedEvent(null)} backdropClassName="z-50" contentClassName="max-w-lg">
					<h3 className="ui-text-primary text-base font-semibold">
						{selectedEvent.summary || t('calendar_page.placeholder.no_title')}
					</h3>
					<p className="ui-text-secondary mt-2 text-sm">
						{formatSystemDateTime(selectedEvent.starts_at, systemLocale)} -{' '}
						{formatSystemDateTime(selectedEvent.ends_at, systemLocale)}
					</p>
					{getEventVisuals(selectedEvent).ownerLabel && (
						<p className="ui-text-secondary mt-2 text-sm">
							{t('calendar_page.label.owner')}: {getEventVisuals(selectedEvent).ownerLabel}
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
					{isReadOnlySharedEvent(selectedEvent) && (
						<p className="ui-text-muted mt-3 text-xs">{t('calendar_page.shared_read_only_hint')}</p>
					)}
					<div className="mt-4 flex justify-end gap-2">
						{!isReadOnlySharedEvent(selectedEvent) && (
							<>
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
									{t('calendar_page.action.edit')}
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
									{t('calendar_page.action.delete')}
								</Button>
							</>
						)}
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => setSelectedEvent(null)}
						>
							{t('calendar_page.action.close')}
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
					<h3 className="ui-text-primary text-base font-semibold">
						{t('calendar_page.day_modal.events_on', {day: selectedDayForModal})}
					</h3>
					<div className="mt-3">
						{selectedDayEvents.length === 0 && (
							<p className="ui-text-muted text-sm">{t('calendar_page.day_modal.no_events')}</p>
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
												{formatEventTime(event.starts_at)} {event.summary || t('calendar_page.placeholder.no_title')}
											</p>
											{event.location && (
												<p className="ui-text-muted mt-0.5 text-xs">{event.location}</p>
											)}
											{getEventVisuals(event).ownerLabel && (
												<p className="ui-text-muted mt-0.5 text-xs">
													{t('calendar_page.label.owner')}: {getEventVisuals(event).ownerLabel}
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
							{t('calendar_page.context.new_event_on_day')}
						</Button>
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => setSelectedDayForModal(null)}
						>
							{t('calendar_page.action.close')}
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
							<ModalTitle className="text-base">{t('calendar_page.modal.edit_event.title')}</ModalTitle>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-8 w-8 rounded-md"
								onClick={() => setShowEditEventModal(false)}
								title={t('calendar_page.action.close')}
								aria-label={t('calendar_page.modal.edit_event.close_aria')}
							>
								<X size={14} />
							</Button>
						</ModalHeader>
						<div className="mt-4 grid gap-3 md:grid-cols-2">
							<label className="block text-sm md:col-span-2">
								<span className="ui-text-secondary mb-1 block font-medium">{t('calendar_page.field.title')}</span>
								<FormInput
									type="text"
									value={editEventTitle}
									onChange={(event) => setEditEventTitle(event.target.value)}
									placeholder={t('calendar_page.placeholder.team_sync')}
								/>
							</label>
							<div className="block text-sm">
								<span className="ui-text-secondary mb-1 block font-medium">{t('calendar_page.field.start')}</span>
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
								<span className="ui-text-secondary mb-1 block font-medium">{t('calendar_page.field.end')}</span>
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
								<span className="ui-text-secondary mb-1 block font-medium">{t('calendar_page.field.location')}</span>
								<FormInput
									type="text"
									value={editEventLocation}
									onChange={(event) => setEditEventLocation(event.target.value)}
									placeholder={t('calendar_page.placeholder.conference_room')}
								/>
							</label>
							<label className="block text-sm md:col-span-2">
								<span className="ui-text-secondary mb-1 block font-medium">{t('calendar_page.field.description')}</span>
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
								{t('calendar_page.action.cancel')}
							</Button>
							<Button
								type="submit"
								variant="default"
								className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
								disabled={savingEditEvent}
							>
								{savingEditEvent ? t('calendar_page.status.saving') : t('calendar_page.action.save_changes')}
							</Button>
						</div>
					</form>
				</Modal>
			)}

			{eventToDelete && (
				<Modal open onClose={() => setEventToDelete(null)} backdropClassName="z-50" contentClassName="max-w-md">
					<h3 className="ui-text-primary text-base font-semibold">{t('calendar_page.delete_modal.title')}</h3>
					<p className="ui-text-secondary mt-2 text-sm">
						{t('calendar_page.delete_modal.message', {
							title: eventToDelete.summary || t('calendar_page.placeholder.no_title'),
						})}
					</p>
					<div className="mt-4 flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => setEventToDelete(null)}
						>
							{t('calendar_page.action.cancel')}
						</Button>
						<Button
							type="button"
							className="button button-danger rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
							onClick={() => void onDeleteEvent()}
							disabled={deletingEvent}
						>
							{deletingEvent ? t('calendar_page.status.deleting') : t('calendar_page.action.delete')}
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
							<ModalTitle className="text-base">{t('calendar_page.modal.add_event.title')}</ModalTitle>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-8 w-8 rounded-md"
								onClick={() => setShowAddEventModal(false)}
								title={t('calendar_page.action.close')}
								aria-label={t('calendar_page.modal.add_event.close_aria')}
							>
								<X size={14} />
							</Button>
						</ModalHeader>
						<div className="mt-4 grid gap-3 md:grid-cols-2">
							<label className="block text-sm md:col-span-2">
								<span className="ui-text-secondary mb-1 block font-medium">{t('calendar_page.field.title')}</span>
								<FormInput
									type="text"
									value={eventTitle}
									onChange={(event) => setEventTitle(event.target.value)}
									placeholder={t('calendar_page.placeholder.team_sync')}
								/>
							</label>
							<div className="block text-sm">
								<span className="ui-text-secondary mb-1 block font-medium">{t('calendar_page.field.start')}</span>
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
								<span className="ui-text-secondary mb-1 block font-medium">{t('calendar_page.field.end')}</span>
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
								<span className="ui-text-secondary mb-1 block font-medium">{t('calendar_page.field.location')}</span>
								<FormInput
									type="text"
									value={eventLocation}
									onChange={(event) => setEventLocation(event.target.value)}
									placeholder={t('calendar_page.placeholder.conference_room')}
								/>
							</label>
							<label className="block text-sm md:col-span-2">
								<span className="ui-text-secondary mb-1 block font-medium">{t('calendar_page.field.description')}</span>
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
								{t('calendar_page.action.cancel')}
							</Button>
							<Button
								type="submit"
								variant="default"
								className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
								disabled={savingEvent}
							>
								{savingEvent ? t('calendar_page.status.saving') : t('calendar_page.action.save_event')}
							</Button>
						</div>
					</form>
				</Modal>
			)}
		</>
	);
}

function readPersistedAccountOrder(storageKey: string): number[] {
	try {
		const raw = window.localStorage.getItem(storageKey);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const next = parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value));
		return Array.from(new Set(next));
	} catch {
		return [];
	}
}

function writePersistedAccountOrder(storageKey: string, order: number[]): void {
	try {
		window.localStorage.setItem(storageKey, JSON.stringify(order));
	} catch {
		// Ignore storage write errors.
	}
}

function getIsoWeekNumber(date: Date): number {
	const tempDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNumber = tempDate.getUTCDay() || 7;
	tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNumber);
	const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
	return Math.ceil(((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
