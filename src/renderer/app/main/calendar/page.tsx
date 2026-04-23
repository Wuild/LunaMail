import {Navigate} from 'react-router-dom';
import type {PublicAccount} from '@preload';
import {sortAccountsByOrder} from '../email/mailAccountOrder';
import CalendarAccountPage from './[accountId]/page';

type CalendarRootPageProps = {
	accountId: number | null;
	accounts: PublicAccount[];
	onSelectAccount: (accountId: number | null) => void;
};

const CALENDAR_ACCOUNT_ORDER_STORAGE_KEY = 'llamamail.calendar.accountOrder.v1';

function readPersistedAccountOrder(storageKey: string): number[] {
	if (typeof window === 'undefined') return [];
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

export default function CalendarRootPage(props: CalendarRootPageProps) {
	const orderedAccounts = sortAccountsByOrder(
		props.accounts,
		readPersistedAccountOrder(CALENDAR_ACCOUNT_ORDER_STORAGE_KEY),
	);
	const firstAccountId = orderedAccounts[0]?.id ?? null;
	if (!firstAccountId) return <CalendarAccountPage {...props} />;
	return <Navigate to={`/calendar/${firstAccountId}`} replace />;
}

