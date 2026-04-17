import {create} from 'zustand';
import type {AddressBookItem, ContactItem} from '@/preload';

type ContactsRuntimeStoreState = {
	contactsByAccountId: Record<number, ContactItem[]>;
	addressBooksByAccountId: Record<number, AddressBookItem[]>;
	setContactsForAccount: (accountId: number, contacts: ContactItem[]) => void;
	upsertContactForAccount: (accountId: number, contact: ContactItem) => void;
	removeContactForAccount: (accountId: number, contactId: number) => void;
	setAddressBooksForAccount: (accountId: number, books: AddressBookItem[]) => void;
};

export const useContactsRuntimeStore = create<ContactsRuntimeStoreState>((set) => ({
	contactsByAccountId: {},
	addressBooksByAccountId: {},
	setContactsForAccount: (accountId, contacts) =>
		set((state) => ({
			contactsByAccountId: {
				...state.contactsByAccountId,
				[accountId]: contacts,
			},
		})),
	upsertContactForAccount: (accountId, contact) =>
		set((state) => {
			const current = state.contactsByAccountId[accountId] ?? [];
			const exists = current.some((item) => item.id === contact.id);
			const next = exists ? current.map((item) => (item.id === contact.id ? contact : item)) : [contact, ...current];
			return {
				contactsByAccountId: {
					...state.contactsByAccountId,
					[accountId]: next,
				},
			};
		}),
	removeContactForAccount: (accountId, contactId) =>
		set((state) => ({
			contactsByAccountId: {
				...state.contactsByAccountId,
				[accountId]: (state.contactsByAccountId[accountId] ?? []).filter((contact) => contact.id !== contactId),
			},
		})),
	setAddressBooksForAccount: (accountId, books) =>
		set((state) => ({
			addressBooksByAccountId: {
				...state.addressBooksByAccountId,
				[accountId]: books,
			},
		})),
}));
