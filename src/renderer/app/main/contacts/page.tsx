import {Navigate} from 'react-router-dom';
import type {PublicAccount} from '@preload';
import {sortAccountsByOrder} from '../email/mailAccountOrder';
import ContactsAccountPage from './[accountId]/page';

type ContactsRootPageProps = {
	accountId: number | null;
	accounts: PublicAccount[];
	onSelectAccount: (accountId: number | null) => void;
};

const CONTACTS_ACCOUNT_ORDER_STORAGE_KEY = 'llamamail.contacts.accountOrder.v1';

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

export default function ContactsRootPage(props: ContactsRootPageProps) {
	const orderedAccounts = sortAccountsByOrder(
		props.accounts,
		readPersistedAccountOrder(CONTACTS_ACCOUNT_ORDER_STORAGE_KEY),
	);
	const firstAccountId = orderedAccounts[0]?.id ?? null;
	if (!firstAccountId) return <ContactsAccountPage {...props} />;
	return <Navigate to={`/contacts/${firstAccountId}`} replace />;
}

