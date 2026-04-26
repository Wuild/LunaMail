import React, {useEffect, useRef, useState} from 'react';
import {BookPlus, Download, Pencil, Plus, RefreshCw, Settings, Trash2, X} from '@llamamail/ui/icon';
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
import type {AddressBookItem, ContactItem, PublicAccount, SyncStatusEvent} from '@preload';
import {
	getAccountAvatarColors,
	getAccountAvatarColorsForAccount,
	getAccountMonogram,
} from '@renderer/lib/accountAvatar';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {useAccount, useAccountDirectory} from '@renderer/hooks/ipc/useAccounts';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {ipcClient} from '@renderer/lib/ipcClient';
import {emitReconnectRequired, isReconnectRequiredMessage} from '@renderer/lib/reconnectPrompt';
import {Button} from '@llamamail/ui/button';
import {FormInput, FormSelect, FormTextarea} from '@llamamail/ui/form';
import {Modal, ModalHeader, ModalTitle} from '@llamamail/ui/modal';
import {ScrollArea} from '@llamamail/ui/scroll-area';
import {
	statusNoAccountSelected,
	statusSyncPartial,
	statusSyncCompleteDav,
	statusSyncCompleteMessages,
	statusSyncFailed,
	statusSyncing,
	toErrorMessage,
} from '@renderer/lib/statusText';
import {cn} from '@llamamail/ui/utils';
import WorkspaceLayout from '@renderer/layouts/WorkspaceLayout';
import {Card} from '@llamamail/ui/card';
import {
	hasAccountOrderChanged,
	normalizeAccountOrder,
	sortAccountsByOrder,
} from '../../email/mailAccountOrder';
import {Container} from '@llamamail/ui';
import {useI18n} from '@llamamail/app/i18n/renderer';

type ContactsPageProps = {
	accountId: number | null;
	accounts: PublicAccount[];
	onSelectAccount: (accountId: number | null) => void;
};

type ContactMeta = {
	emails: string[];
	phones: string[];
};

const CONTACT_META_PREFIX = '[LUNAMAIL_CONTACT_META_V1]';
const CONTACTS_ACCOUNT_ORDER_STORAGE_KEY = 'llamamail.contacts.accountOrder.v1';

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

export default function ContactsPage({accountId: selectedAccountId, accounts, onSelectAccount}: ContactsPageProps) {
	const {t} = useI18n();
	const navigate = useNavigate();
	const {accountId: routeAccountIdParam} = useParams<{accountId?: string}>();
	const routeAccountId = React.useMemo(() => {
		const parsed = Number(routeAccountIdParam);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
	}, [routeAccountIdParam]);
	const hasValidRouteAccount = React.useMemo(
		() => routeAccountId !== null && accounts.some((candidate) => candidate.id === routeAccountId),
		[accounts, routeAccountId],
	);
	const effectiveAccountId = hasValidRouteAccount ? routeAccountId : null;
	const [query, setQuery] = useState('');
	const [loading, setLoading] = useState(false);
	const [contacts, setContacts] = useState<ContactItem[]>([]);
	const [addressBooks, setAddressBooks] = useState<AddressBookItem[]>([]);
	const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
	const [newContactName, setNewContactName] = useState('');
	const [newContactEmails, setNewContactEmails] = useState<string[]>(['']);
	const [newContactPhones, setNewContactPhones] = useState<string[]>(['']);
	const [newContactOrganization, setNewContactOrganization] = useState('');
	const [newContactTitle, setNewContactTitle] = useState('');
	const [newContactNote, setNewContactNote] = useState('');
	const [addingContact, setAddingContact] = useState(false);
	const [addContactFormError, setAddContactFormError] = useState<string | null>(null);
	const [addContactFormStatus, setAddContactFormStatus] = useState<string | null>(null);
	const [showAddContactModal, setShowAddContactModal] = useState(false);
	const [showAddAddressBookModal, setShowAddAddressBookModal] = useState(false);
	const [newAddressBookName, setNewAddressBookName] = useState('');
	const [addingAddressBook, setAddingAddressBook] = useState(false);
	const [showExportContactsModal, setShowExportContactsModal] = useState(false);
	const [exportFormat, setExportFormat] = useState<'csv' | 'vcf'>('csv');
	const [exportBookMode, setExportBookMode] = useState<'all' | 'selected'>('selected');
	const [exportingContacts, setExportingContacts] = useState(false);
	const [editingContact, setEditingContact] = useState<ContactItem | null>(null);
	const [editContactName, setEditContactName] = useState('');
	const [editContactEmails, setEditContactEmails] = useState<string[]>(['']);
	const [editContactPhones, setEditContactPhones] = useState<string[]>(['']);
	const [editContactOrganization, setEditContactOrganization] = useState('');
	const [editContactTitle, setEditContactTitle] = useState('');
	const [editContactNote, setEditContactNote] = useState('');
	const [editContactBookId, setEditContactBookId] = useState<number | null>(null);
	const [savingEditContact, setSavingEditContact] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [syncingAccountId, setSyncingAccountId] = useState<number | null>(null);
	const [syncStatusText, setSyncStatusText] = useState<string>(t('contacts_page.status.ready'));
	const [contactError, setContactError] = useState<string | null>(null);
	const [accountOrder, setAccountOrder] = useState<number[]>(() =>
		readPersistedAccountOrder(CONTACTS_ACCOUNT_ORDER_STORAGE_KEY),
	);
	const [draggingAccountId, setDraggingAccountId] = useState<number | null>(null);
	const [dragOverlaySize, setDragOverlaySize] = useState<{width: number; height: number} | null>(null);
	const {sidebarWidth, onResizeStart} = useResizableSidebar();
	const selectedAccount = useAccount(effectiveAccountId);
	const accountDirectory = useAccountDirectory();
	const accountDirectoryRef = useRef(accountDirectory);
	const activeAccountIdRef = useRef<number | null>(effectiveAccountId);
	const loadSequenceRef = useRef(0);
	const syncSequenceRef = useRef(0);
	const autoSyncedAccountIdRef = useRef<number | null>(null);
	const accountSensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 6}}));

	const handleContactsError = React.useCallback(
		(error: unknown, targetAccountId: number | null = effectiveAccountId): string => {
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
		[effectiveAccountId],
	);

	useEffect(() => {
		accountDirectoryRef.current = accountDirectory;
	}, [accountDirectory]);

	useEffect(() => {
		activeAccountIdRef.current = effectiveAccountId;
		loadSequenceRef.current += 1;
		syncSequenceRef.current += 1;
	}, [effectiveAccountId]);

	useEffect(() => {
		setAccountOrder((prev) => {
			const normalized = normalizeAccountOrder(prev, accounts);
			if (!hasAccountOrderChanged(prev, normalized)) return prev;
			return normalized;
		});
	}, [accounts]);

	useEffect(() => {
		writePersistedAccountOrder(CONTACTS_ACCOUNT_ORDER_STORAGE_KEY, accountOrder);
	}, [accountOrder]);

	const orderedAccounts = React.useMemo(() => sortAccountsByOrder(accounts, accountOrder), [accountOrder, accounts]);
	const accountSortableIds = React.useMemo(
		() => orderedAccounts.map((account) => `account-${account.id}`),
		[orderedAccounts],
	);
	const draggingAccount = React.useMemo(
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
			navigate(`/contacts/${firstAccountId}`, {replace: true});
			if (selectedAccountId !== firstAccountId) onSelectAccount(firstAccountId);
			return;
		}
		if (routeAccountId !== null && selectedAccountId !== routeAccountId) {
			onSelectAccount(routeAccountId);
		}
	}, [hasValidRouteAccount, navigate, onSelectAccount, orderedAccounts, routeAccountId, selectedAccountId]);

	const loadContacts = React.useCallback(async (targetAccountId: number, q: string, bookId: number | null) => {
		const trimmedQuery = q.trim();
		const rows = await accountDirectoryRef.current
			.getAccount(targetAccountId)
			.contacts.refresh(trimmedQuery || null, 600, bookId ?? null);
		if (activeAccountIdRef.current !== targetAccountId) return;
		if (!trimmedQuery || rows.length > 0) {
			setContacts(rows);
			return;
		}
		// Fallback for any backend search regression: filter locally from the same book/account scope.
		const unfilteredRows = await accountDirectoryRef.current
			.getAccount(targetAccountId)
			.contacts.refresh(null, 600, bookId ?? null);
		if (activeAccountIdRef.current !== targetAccountId) return;
		const needle = trimmedQuery.toLowerCase();
		setContacts(unfilteredRows.filter((contact) => contactMatchesQuery(contact, needle)));
	}, []);

	useEffect(() => {
		if (!effectiveAccountId) {
			setContacts([]);
			setAddressBooks([]);
			setSelectedBookId(null);
			setShowAddContactModal(false);
			setShowAddAddressBookModal(false);
			setShowExportContactsModal(false);
			setEditingContact(null);
			setSyncing(false);
			setSyncingAccountId(null);
			setSyncStatusText(statusNoAccountSelected());
			setLoading(false);
			return;
		}
		let active = true;
		const loadSequence = ++loadSequenceRef.current;
		const load = async () => {
			setSyncStatusText(t('contacts_page.status.ready'));
			setLoading(true);
			setContactError(null);
			try {
				const targetAccount = accountDirectoryRef.current.getAccount(effectiveAccountId);
				const books = await targetAccount.contacts.refreshAddressBooks();
				if (
					!active ||
					loadSequence !== loadSequenceRef.current ||
					activeAccountIdRef.current !== effectiveAccountId
				)
					return;
				setAddressBooks(books);
				const effectiveBookId =
					selectedBookId && books.some((book) => book.id === selectedBookId) ? selectedBookId : null;
				setSelectedBookId(effectiveBookId);
				const rows = await targetAccount.contacts.refresh(query.trim() || null, 600, effectiveBookId);
				if (
					!active ||
					loadSequence !== loadSequenceRef.current ||
					activeAccountIdRef.current !== effectiveAccountId
				)
					return;
				setContacts(rows);
				setSyncStatusText(t('contacts_page.status.ready'));
			} finally {
				if (active && loadSequence === loadSequenceRef.current) setLoading(false);
			}
		};
		void load();
		return () => {
			active = false;
		};
	}, [effectiveAccountId, query, selectedBookId]);

	useIpcEvent(ipcClient.onAccountSyncStatus, (evt: SyncStatusEvent) => {
		if (!effectiveAccountId || evt.accountId !== effectiveAccountId) return;
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
		const davSummary = evt.summary?.dav;
		if (evt.summary?.partialSuccess) {
			setSyncStatusText(statusSyncPartial(evt.summary?.messages ?? 0, evt.summary?.failedModules));
			return;
		}
		if (davSummary) {
			setSyncStatusText(statusSyncCompleteDav(davSummary.contacts.upserted, davSummary.events.upserted));
			void (async () => {
				const syncSequence = syncSequenceRef.current;
				try {
					const targetAccount = accountDirectoryRef.current.getAccount(effectiveAccountId);
					const books = await targetAccount.contacts.refreshAddressBooks();
					if (syncSequence !== syncSequenceRef.current || activeAccountIdRef.current !== effectiveAccountId) return;
					setAddressBooks(books);
					const effectiveBookId =
						selectedBookId && books.some((book) => book.id === selectedBookId) ? selectedBookId : null;
					setSelectedBookId(effectiveBookId);
					await loadContacts(effectiveAccountId, query, effectiveBookId);
				} catch {
					// ignore background refresh errors; sync status already carries failures
				}
			})();
			return;
		}
		setSyncStatusText(statusSyncCompleteMessages(evt.summary?.messages ?? 0));
	});

	async function onAddContact() {
		if (!effectiveAccountId || addingContact) return;
		const emails = normalizeContactValues(newContactEmails);
		const phones = normalizeContactValues(newContactPhones);
		const email = emails[0] || '';
		if (!email) {
			setAddContactFormError(t('contacts_page.error.enter_valid_email'));
			return;
		}
		setAddingContact(true);
		setAddContactFormError(null);
		setAddContactFormStatus(t('contacts_page.status.saving_contact'));
		setContactError(null);
		try {
			const created = await selectedAccount.contacts.add({
				addressBookId: selectedBookId,
				fullName: newContactName.trim() || null,
				email,
				phone: phones[0] || null,
				organization: newContactOrganization.trim() || null,
				title: newContactTitle.trim() || null,
				note: composeContactNote(newContactNote, emails, phones),
			});
			const isExternalSource = !String(created?.source || '').startsWith('local:');
			const nextBookId = isExternalSource ? null : selectedBookId;
			if (isExternalSource && selectedBookId !== null) {
				setSelectedBookId(null);
			}
			setNewContactName('');
			setNewContactEmails(['']);
			setNewContactPhones(['']);
			setNewContactOrganization('');
			setNewContactTitle('');
			setNewContactNote('');
			setAddContactFormStatus(t('contacts_page.status.contact_saved'));
			setShowAddContactModal(false);
			await loadContacts(effectiveAccountId, query, nextBookId);
			const createdLabel =
				String(created?.full_name || '').trim() ||
				String(created?.email || '').trim() ||
				t('contacts_page.placeholder.contact');
			setSyncStatusText(t('contacts_page.status.contact_added', {name: createdLabel}));
		} catch (error: any) {
			const message = handleContactsError(error, effectiveAccountId);
			setAddContactFormError(message);
			setContactError(message);
			setAddContactFormStatus(null);
		} finally {
			setAddingContact(false);
		}
	}

	async function onDeleteContact(contactId: number) {
		if (!effectiveAccountId) return;
		const target = contacts.find((row) => row.id === contactId);
		const label = target?.full_name?.trim() || target?.email || `#${contactId}`;
		const confirmed = window.confirm(t('contacts_page.confirm.delete_contact', {name: label}));
		if (!confirmed) return;
		setContactError(null);
		try {
			await selectedAccount.contacts.remove(contactId);
			await loadContacts(effectiveAccountId, query, selectedBookId);
		} catch (error: any) {
			setContactError(handleContactsError(error, effectiveAccountId));
		}
	}

	function openEditContact(contact: ContactItem) {
		const parsedNote = parseContactNote(contact.note);
		setEditingContact(contact);
		setEditContactName(contact.full_name || '');
		setEditContactEmails(parsedNote.emails.length ? parsedNote.emails : [contact.email || '']);
		setEditContactPhones(parsedNote.phones.length ? parsedNote.phones : [contact.phone || '']);
		setEditContactOrganization(contact.organization || '');
		setEditContactTitle(contact.title || '');
		setEditContactNote(parsedNote.noteText);
		setEditContactBookId(contact.address_book_id ?? selectedBookId ?? null);
		setContactError(null);
	}

	async function onSaveEditedContact() {
		if (!effectiveAccountId || !editingContact) return;
		const emails = normalizeContactValues(editContactEmails);
		const phones = normalizeContactValues(editContactPhones);
		const email = emails[0] || '';
		if (!email) return;
		setSavingEditContact(true);
		setContactError(null);
		try {
			await selectedAccount.contacts.update(editingContact.id, {
				addressBookId: editContactBookId,
				fullName: editContactName.trim() || null,
				email,
				phone: phones[0] || null,
				organization: editContactOrganization.trim() || null,
				title: editContactTitle.trim() || null,
				note: composeContactNote(editContactNote, emails, phones),
			});
			setEditingContact(null);
			await loadContacts(effectiveAccountId, query, selectedBookId);
		} catch (error: any) {
			setContactError(handleContactsError(error, effectiveAccountId));
		} finally {
			setSavingEditContact(false);
		}
	}

	async function onAddAddressBook() {
		if (!effectiveAccountId || addingAddressBook) return;
		const name = newAddressBookName.trim();
		if (!name) return;
		setAddingAddressBook(true);
		setContactError(null);
		try {
			const added = await selectedAccount.contacts.addAddressBook(name);
			const books = await selectedAccount.contacts.refreshAddressBooks();
			setAddressBooks(books);
			setSelectedBookId(added.id);
			setShowAddAddressBookModal(false);
			setNewAddressBookName('');
			await loadContacts(effectiveAccountId, query, added.id);
			setSyncStatusText(t('contacts_page.status.address_book_created', {name: added.name}));
		} catch (error: any) {
			setContactError(handleContactsError(error, effectiveAccountId));
		} finally {
			setAddingAddressBook(false);
		}
	}

	async function onExportContacts() {
		if (!effectiveAccountId || exportingContacts) return;
		setExportingContacts(true);
		setContactError(null);
		try {
			const result = await selectedAccount.contacts.export({
				format: exportFormat,
				addressBookId: exportBookMode === 'selected' ? selectedBookId : null,
			});
			if (result.canceled) {
				setSyncStatusText(t('contacts_page.status.export_cancelled'));
			} else {
				setSyncStatusText(t('contacts_page.status.exported_contacts', {count: result.count}));
				setShowExportContactsModal(false);
			}
		} catch (error: any) {
			setContactError(handleContactsError(error, effectiveAccountId));
		} finally {
			setExportingContacts(false);
		}
	}

	async function onDeleteSelectedAddressBook() {
		if (!effectiveAccountId || !selectedBookId) return;
		const targetBook = addressBooks.find((book) => book.id === selectedBookId);
		if (!targetBook) return;
		if (targetBook.source !== 'local') {
			setContactError(t('contacts_page.error.delete_local_only'));
			return;
		}
		const shouldDelete = window.confirm(t('contacts_page.confirm.delete_address_book', {name: targetBook.name}));
		if (!shouldDelete) return;
		setContactError(null);
		try {
			await selectedAccount.contacts.deleteAddressBook(selectedBookId);
			const books = await selectedAccount.contacts.refreshAddressBooks();
			setAddressBooks(books);
			const nextBookId = null;
			setSelectedBookId(nextBookId);
			await loadContacts(effectiveAccountId, query, nextBookId);
		} catch (error: any) {
			setContactError(handleContactsError(error, effectiveAccountId));
		}
	}

	async function onManualSync(targetAccountId?: number) {
		const syncAccountId = targetAccountId ?? effectiveAccountId;
		if (!syncAccountId) return;
		const syncSequence = ++syncSequenceRef.current;
		setContactError(null);
		setSyncing(true);
		setSyncingAccountId(syncAccountId);
		setSyncStatusText(statusSyncing());
		try {
			const targetAccount = accountDirectoryRef.current.getAccount(syncAccountId);
			await targetAccount.contacts.sync();
			if (
				syncSequence === syncSequenceRef.current &&
				activeAccountIdRef.current === syncAccountId &&
				effectiveAccountId === syncAccountId
			) {
				const books = await targetAccount.contacts.refreshAddressBooks();
				if (syncSequence !== syncSequenceRef.current || activeAccountIdRef.current !== syncAccountId) return;
				setAddressBooks(books);
				const effectiveBookId =
					selectedBookId && books.some((book) => book.id === selectedBookId) ? selectedBookId : null;
				setSelectedBookId(effectiveBookId);
				await loadContacts(syncAccountId, query, effectiveBookId);
			}
			if (syncSequence !== syncSequenceRef.current || activeAccountIdRef.current !== syncAccountId) return;
			setSyncStatusText(t('contacts_page.status.synced'));
		} catch (error: any) {
			if (syncSequence !== syncSequenceRef.current || activeAccountIdRef.current !== syncAccountId) return;
			const message = handleContactsError(error, effectiveAccountId);
			setSyncStatusText(statusSyncFailed(message));
			setContactError(message);
		} finally {
			if (syncSequence === syncSequenceRef.current) {
				setSyncing(false);
				setSyncingAccountId(null);
			}
		}
	}

	useEffect(() => {
		if (!effectiveAccountId) {
			autoSyncedAccountIdRef.current = null;
			return;
		}
		if (autoSyncedAccountIdRef.current === effectiveAccountId) return;
		autoSyncedAccountIdRef.current = effectiveAccountId;
		void onManualSync(effectiveAccountId);
	}, [effectiveAccountId]);

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

	const accountSidebar = (
		<aside className="sidebar flex h-full min-h-0 shrink-0 flex-col">
			<ScrollArea className="min-h-0 flex-1 px-3 py-3">
				<p className="ui-text-muted px-2 pb-2 text-xs font-semibold uppercase tracking-wide">
					{t('contacts_page.accounts.title')}
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
											effectiveAccountId === account.id ? 'ui-surface-active ui-text-primary' : 'account-item',
										)}
										{...dragProps.attributes}
										{...dragProps.listeners}
									>
										<Button
											type="button"
											onClick={() => {
												onSelectAccount(account.id);
												navigate(`/contacts/${account.id}`);
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
												title={t('contacts_page.accounts.sync_account')}
												aria-label={t('contacts_page.accounts.sync_account')}
												disabled={isSyncingAccount}
											>
												<RefreshCw size={13} className={cn(isSyncingAccount && 'animate-spin')} />
											</Button>
											<Button
												type="button"
												variant="ghost"
												className="ui-surface-hover ui-hover-text-primary rounded p-1 ui-text-muted transition-colors"
												onClick={() => navigate(`/settings/account?accountId=${account.id}`)}
												title={t('contacts_page.accounts.edit_account')}
												aria-label={t('contacts_page.accounts.edit_account')}
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
							{t('contacts_page.accounts.add_account')}
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
	const contactsToolbar = (
		<div className="flex h-10 min-w-0 items-center gap-2">
			<FormSelect
				value={selectedBookId ?? ''}
				onChange={(event) => setSelectedBookId(event.target.value ? Number(event.target.value) : null)}
				className="h-10 min-w-52 shrink-0 rounded-md px-3 text-sm disabled:opacity-60"
				disabled={!effectiveAccountId}
			>
				<option value="">{t('contacts_page.address_book.all')}</option>
				{addressBooks.map((book) => (
					<option key={book.id} value={book.id}>
						{book.name}
					</option>
				))}
			</FormSelect>
			<Button
				type="button"
				variant="outline"
				className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md disabled:opacity-60"
				disabled={!effectiveAccountId}
				onClick={() => setShowAddAddressBookModal(true)}
				title={t('contacts_page.address_book.create')}
				aria-label={t('contacts_page.address_book.create')}
			>
				<BookPlus size={14} />
			</Button>
			<Button
				type="button"
				variant="outline"
				className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md disabled:opacity-60"
				disabled={
					!effectiveAccountId ||
					!selectedBookId ||
					addressBooks.find((book) => book.id === selectedBookId)?.source !== 'local'
				}
				onClick={() => void onDeleteSelectedAddressBook()}
				title={t('contacts_page.address_book.delete')}
				aria-label={t('contacts_page.address_book.delete')}
			>
				<Trash2 size={14} />
			</Button>
			<div className="ml-auto flex items-center gap-2">
				<Button
					type="button"
					variant="default"
					className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-60"
					onClick={() => setShowAddContactModal(true)}
					disabled={!effectiveAccountId}
					title={t('contacts_page.contact.add')}
					aria-label={t('contacts_page.contact.add')}
				>
					<Plus size={14} />
					{t('contacts_page.contact.add')}
				</Button>
				<Button
					type="button"
					variant="outline"
					className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-60"
					onClick={() => setShowExportContactsModal(true)}
					disabled={!effectiveAccountId}
					title={t('contacts_page.export.title')}
					aria-label={t('contacts_page.export.title')}
				>
					<Download size={14} />
					{t('contacts_page.export.action')}
				</Button>
			</div>
		</div>
	);
	const canSaveEditedContact = editingContact ? canModifyContactSource(editingContact.source) : false;
	const isEditingLocalContact = editingContact ? editingContact.source.startsWith('local:') : false;

	return (
		<WorkspaceLayout
			sidebar={accountSidebar}
			sidebarWidth={sidebarWidth}
			onSidebarResizeStart={onResizeStart}
			menubar={contactsToolbar}
			showMenuBar
			statusText={syncing ? statusSyncing() : syncStatusText}
			statusBusy={syncing}
			contentClassName={"p-0"}
		>
			<Container>
				{!effectiveAccountId && <p className="ui-text-muted text-sm">{statusNoAccountSelected()}</p>}
				{effectiveAccountId && (
					<>
						{contactError && <p className="text-danger mb-3 text-sm">{contactError}</p>}
						<div className="mb-3">
							<FormInput
								type="text"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder={t('contacts_page.search.placeholder')}
								disabled={!effectiveAccountId}
							/>
						</div>
						{loading && <p className="ui-text-muted text-sm">{t('contacts_page.search.loading')}</p>}
						{!loading && contacts.length === 0 && (
							<p className="ui-text-muted text-sm">{t('contacts_page.search.no_contacts')}</p>
						)}
						{!loading && contacts.length > 0 && (
							<Card size={'empty'}>
								<ul className="contacts-list">
									{contacts.map((contact) => (
										<li key={contact.id} className="px-4 py-3">
											{(() => {
												const preview = getContactPreview(contact);
												const avatarSeed = preview.primaryEmail || String(contact.id);
												const avatarColors = getAccountAvatarColors(avatarSeed);
												return (
													<div className="flex items-start justify-between gap-3">
														<div className="flex min-w-0 items-start gap-3">
															<span
																className="avatar-ring mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
																style={{
																	backgroundColor: avatarColors.background,
																	color: avatarColors.foreground,
																}}
																aria-hidden
															>
																{getContactInitials(
																	contact.full_name,
																	preview.primaryEmail,
																)}
															</span>
															<div className="min-w-0">
																<Button
																	type="button"
																	variant="ghost"
																	className="h-auto min-h-0 p-0 text-left"
																	onClick={() => openEditContact(contact)}
																	title={t('contacts_page.contact.view')}
																>
																	<p className="ui-text-primary text-sm font-medium">
																		{contact.full_name || t('contacts_page.placeholder.no_name')}
																	</p>
																</Button>
																<p className="ui-text-secondary mt-0.5 text-xs">
																	{preview.primaryEmail}
																	{preview.extraEmails > 0
																		? t('contacts_page.contact.extra_emails', {count: preview.extraEmails})
																		: ''}
																</p>
																{(preview.primaryPhone ||
																	contact.organization ||
																	contact.title) && (
																	<p className="ui-text-muted mt-0.5 text-xs">
																		{[
																			preview.primaryPhone,
																			contact.organization,
																			contact.title,
																		]
																			.filter(Boolean)
																			.join(' • ')}
																	</p>
																)}
															</div>
														</div>
														<div className="flex items-center gap-2">
																<Button
																	type="button"
																	variant="outline"
																	className="rounded-md px-2 py-1 text-xs disabled:opacity-50"
																	onClick={() => openEditContact(contact)}
																	disabled={!canModifyContactSource(contact.source)}
																	title={
																		canModifyContactSource(contact.source)
																			? t('contacts_page.contact.edit')
																			: t('contacts_page.contact.read_only')
																	}
																>
																	<Pencil size={12} className="mr-1 inline-block" />
																	{t('contacts_page.contact.edit')}
																</Button>
															<Button
																type="button"
																variant="danger"
																className="rounded-md px-2 py-1 text-xs disabled:opacity-50"
																onClick={() => void onDeleteContact(contact.id)}
																disabled={!canModifyContactSource(contact.source)}
																	title={
																		canModifyContactSource(contact.source)
																			? t('contacts_page.contact.delete')
																			: t('contacts_page.contact.read_only')
																	}
																>
																	{t('contacts_page.contact.delete')}
																</Button>
														</div>
													</div>
												);
											})()}
										</li>
									))}
								</ul>
							</Card>
						)}
					</>
				)}
			</Container>

			{showAddContactModal && effectiveAccountId && (
				<Modal
					open
					onClose={() => {
						setShowAddContactModal(false);
						setAddContactFormError(null);
						setAddContactFormStatus(null);
					}}
					backdropClassName="z-50"
					contentClassName="max-w-5xl"
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void onAddContact();
						}}
					>
						<ModalHeader className="ui-border-default border-b pb-3">
							<div className="min-w-0 flex-1">
								<ModalTitle className="text-base">{t('contacts_page.modal.add_contact.title')}</ModalTitle>
								<p className="ui-text-muted mt-1 text-xs">
									{t('contacts_page.modal.add_contact.subtitle')}
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-8 w-8 rounded-md"
								onClick={() => {
									setShowAddContactModal(false);
									setAddContactFormError(null);
									setAddContactFormStatus(null);
								}}
								title={t('contacts_page.action.close')}
								aria-label={t('contacts_page.modal.add_contact.close_aria')}
							>
								<X size={14} />
							</Button>
						</ModalHeader>
						<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="space-y-3">
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										{t('contacts_page.field.full_name')}
									</span>
									<FormInput
										type="text"
										value={newContactName}
										onChange={(event) => setNewContactName(event.target.value)}
										placeholder={t('contacts_page.placeholder.full_name')}
									/>
								</label>
								<DynamicContactFieldList
									label={t('contacts_page.field.emails')}
									valueLabel={t('contacts_page.field.email')}
									type="email"
									placeholder={t('contacts_page.placeholder.email')}
									values={newContactEmails}
									onChange={setNewContactEmails}
									addLabel={t('contacts_page.action.add')}
									removeLabel={t('contacts_page.action.remove')}
									requiredFirst
								/>
								<DynamicContactFieldList
									label={t('contacts_page.field.phone_numbers')}
									valueLabel={t('contacts_page.field.phone')}
									type="text"
									placeholder={t('contacts_page.placeholder.phone')}
									values={newContactPhones}
									onChange={setNewContactPhones}
									addLabel={t('contacts_page.action.add')}
									removeLabel={t('contacts_page.action.remove')}
								/>
							</div>
							<div className="space-y-3">
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										{t('contacts_page.field.organization')}
									</span>
									<FormInput
										type="text"
										value={newContactOrganization}
										onChange={(event) => setNewContactOrganization(event.target.value)}
										placeholder={t('contacts_page.placeholder.organization')}
									/>
								</label>
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										{t('contacts_page.field.title')}
									</span>
									<FormInput
										type="text"
										value={newContactTitle}
										onChange={(event) => setNewContactTitle(event.target.value)}
										placeholder={t('contacts_page.placeholder.title')}
									/>
								</label>
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										{t('contacts_page.field.address_book')}
									</span>
									<FormSelect
										value={selectedBookId ?? ''}
										onChange={(event) =>
											setSelectedBookId(event.target.value ? Number(event.target.value) : null)
										}
									>
										<option value="">{t('contacts_page.address_book.none')}</option>
										{addressBooks.map((book) => (
											<option key={book.id} value={book.id}>
												{book.name}
											</option>
										))}
									</FormSelect>
								</label>
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										{t('contacts_page.field.notes')}
									</span>
									<FormTextarea
										value={newContactNote}
										onChange={(event) => setNewContactNote(event.target.value)}
										rows={7}
									/>
								</label>
							</div>
						</div>
						{addContactFormStatus && !addContactFormError && (
							<p className="notice-info mt-4 rounded-lg px-3 py-2 text-sm">{addContactFormStatus}</p>
						)}
						{addContactFormError && (
							<p className="notice-danger mt-4 rounded-lg px-3 py-2 text-sm">{addContactFormError}</p>
						)}
						<div className="mt-4 flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								className="rounded-md px-3 py-2 text-sm"
								onClick={() => {
									setShowAddContactModal(false);
									setAddContactFormError(null);
									setAddContactFormStatus(null);
								}}
								disabled={addingContact}
							>
								{t('contacts_page.action.cancel')}
							</Button>
							<Button
								type="submit"
								variant="default"
								className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
								disabled={addingContact || !normalizeContactValues(newContactEmails).length}
							>
								{addingContact
									? t('contacts_page.status.saving')
									: t('contacts_page.action.save_contact')}
							</Button>
						</div>
					</form>
				</Modal>
			)}

			{editingContact && effectiveAccountId && (
				<Modal
					open
					onClose={() => setEditingContact(null)}
					backdropClassName="z-50"
					contentClassName="max-w-5xl"
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void onSaveEditedContact();
						}}
					>
						<ModalHeader className="ui-border-default border-b pb-3">
							<ModalTitle className="text-base">
								{canSaveEditedContact
									? t('contacts_page.modal.edit_contact.title')
									: t('contacts_page.modal.view_contact.title')}
							</ModalTitle>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-8 w-8 rounded-md"
								onClick={() => setEditingContact(null)}
								title={t('contacts_page.action.close')}
								aria-label={t('contacts_page.modal.edit_contact.close_aria')}
							>
								<X size={14} />
							</Button>
						</ModalHeader>
						<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="space-y-3">
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										{t('contacts_page.field.full_name')}
									</span>
									<FormInput
										type="text"
										value={editContactName}
										onChange={(event) => setEditContactName(event.target.value)}
										placeholder={t('contacts_page.placeholder.full_name')}
									/>
								</label>
								<DynamicContactFieldList
									label={t('contacts_page.field.emails')}
									valueLabel={t('contacts_page.field.email')}
									type="email"
									placeholder={t('contacts_page.placeholder.email')}
									values={editContactEmails}
									onChange={setEditContactEmails}
									addLabel={t('contacts_page.action.add')}
									removeLabel={t('contacts_page.action.remove')}
									requiredFirst
								/>
								<DynamicContactFieldList
									label={t('contacts_page.field.phone_numbers')}
									valueLabel={t('contacts_page.field.phone')}
									type="text"
									values={editContactPhones}
									onChange={setEditContactPhones}
									addLabel={t('contacts_page.action.add')}
									removeLabel={t('contacts_page.action.remove')}
								/>
							</div>
							<div className="space-y-3">
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										{t('contacts_page.field.organization')}
									</span>
									<FormInput
										type="text"
										value={editContactOrganization}
										onChange={(event) => setEditContactOrganization(event.target.value)}
									/>
								</label>
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										{t('contacts_page.field.title')}
									</span>
									<FormInput
										type="text"
										value={editContactTitle}
										onChange={(event) => setEditContactTitle(event.target.value)}
									/>
								</label>
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										{t('contacts_page.field.address_book')}
									</span>
									<FormSelect
										value={editContactBookId ?? ''}
										onChange={(event) =>
											setEditContactBookId(event.target.value ? Number(event.target.value) : null)
										}
										disabled={!isEditingLocalContact}
									>
										<option value="">{t('contacts_page.address_book.none')}</option>
										{addressBooks.map((book) => (
											<option key={book.id} value={book.id}>
												{book.name}
											</option>
										))}
									</FormSelect>
								</label>
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										{t('contacts_page.field.notes')}
									</span>
									<FormTextarea
										value={editContactNote}
										onChange={(event) => setEditContactNote(event.target.value)}
										rows={7}
									/>
								</label>
							</div>
						</div>
						<div className="mt-4 flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								className="rounded-md px-3 py-2 text-sm"
								onClick={() => setEditingContact(null)}
							>
								{t('contacts_page.action.cancel')}
							</Button>
							<Button
								type="submit"
								variant="default"
								className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
								disabled={
									!canSaveEditedContact ||
									savingEditContact ||
									!normalizeContactValues(editContactEmails).length
								}
							>
								{savingEditContact
									? t('contacts_page.status.saving')
									: canSaveEditedContact
										? t('contacts_page.action.save_changes')
										: t('contacts_page.contact.read_only_source')}
							</Button>
						</div>
					</form>
				</Modal>
			)}

			{showAddAddressBookModal && effectiveAccountId && (
				<Modal
					open
					onClose={() => setShowAddAddressBookModal(false)}
					backdropClassName="z-50"
					contentClassName="max-w-md"
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void onAddAddressBook();
						}}
					>
						<ModalHeader className="ui-border-default border-b pb-3">
							<div className="min-w-0 flex-1">
								<ModalTitle className="text-base">{t('contacts_page.modal.create_address_book.title')}</ModalTitle>
								<p className="ui-text-muted mt-1 text-xs">
									{t('contacts_page.modal.create_address_book.subtitle')}
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-8 w-8 rounded-md"
								onClick={() => setShowAddAddressBookModal(false)}
								title={t('contacts_page.action.close')}
								aria-label={t('contacts_page.modal.create_address_book.close_aria')}
							>
								<X size={14} />
							</Button>
						</ModalHeader>
						<label className="mt-4 block text-sm">
							<span className="ui-text-secondary mb-1 block font-medium">
								{t('contacts_page.field.name')}
							</span>
							<FormInput
								type="text"
								value={newAddressBookName}
								onChange={(event) => setNewAddressBookName(event.target.value)}
								placeholder={t('contacts_page.placeholder.address_book_name')}
								required
							/>
						</label>
						<div className="mt-4 flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								className="rounded-md px-3 py-2 text-sm"
								onClick={() => setShowAddAddressBookModal(false)}
							>
								{t('contacts_page.action.cancel')}
							</Button>
							<Button
								type="submit"
								variant="default"
								className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
								disabled={addingAddressBook || !newAddressBookName.trim()}
							>
								{addingAddressBook
									? t('contacts_page.status.creating')
									: t('contacts_page.action.create')}
							</Button>
						</div>
					</form>
				</Modal>
			)}

			{showExportContactsModal && effectiveAccountId && (
				<Modal
					open
					onClose={() => setShowExportContactsModal(false)}
					backdropClassName="z-50"
					contentClassName="max-w-md"
				>
					<ModalHeader className="ui-border-default border-b pb-3">
						<ModalTitle className="text-base">{t('contacts_page.modal.export_contacts.title')}</ModalTitle>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-8 w-8 rounded-md"
							onClick={() => setShowExportContactsModal(false)}
							title={t('contacts_page.action.close')}
							aria-label={t('contacts_page.modal.export_contacts.close_aria')}
						>
							<X size={14} />
						</Button>
					</ModalHeader>
					<div className="mt-4 space-y-3">
						<label className="block text-sm">
							<span className="ui-text-secondary mb-1 block font-medium">
								{t('contacts_page.export.format')}
							</span>
							<FormSelect
								value={exportFormat}
								onChange={(event) => setExportFormat(event.target.value === 'vcf' ? 'vcf' : 'csv')}
							>
								<option value="csv">{t('contacts_page.export.format_csv')}</option>
								<option value="vcf">{t('contacts_page.export.format_vcard')}</option>
							</FormSelect>
						</label>
						<label className="block text-sm">
							<span className="ui-text-secondary mb-1 block font-medium">
								{t('contacts_page.export.scope')}
							</span>
							<FormSelect
								value={exportBookMode}
								onChange={(event) =>
									setExportBookMode(event.target.value === 'all' ? 'all' : 'selected')
								}
							>
								<option value="selected">{t('contacts_page.export.scope_selected')}</option>
								<option value="all">{t('contacts_page.export.scope_all')}</option>
							</FormSelect>
						</label>
					</div>
					<div className="mt-4 flex items-center justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => setShowExportContactsModal(false)}
						>
							{t('contacts_page.action.cancel')}
						</Button>
						<Button
							type="button"
							variant="default"
							className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
							onClick={() => void onExportContacts()}
							disabled={exportingContacts}
						>
							<Download size={14} />
							{exportingContacts ? t('contacts_page.status.exporting') : t('contacts_page.export.action')}
						</Button>
					</div>
				</Modal>
			)}
		</WorkspaceLayout>
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

function contactMatchesQuery(contact: ContactItem, needle: string): boolean {
	if (!needle) return true;
	const haystacks = [
		contact.full_name || '',
		contact.email || '',
		contact.phone || '',
		contact.organization || '',
		contact.title || '',
		contact.note || '',
	];
	return haystacks.some((value) => value.toLowerCase().includes(needle));
}

function normalizeContactValues(values: string[]): string[] {
	return values.map((value) => value.trim()).filter(Boolean);
}

function parseContactNote(note: string | null | undefined): {noteText: string; emails: string[]; phones: string[]} {
	const raw = String(note || '');
	const markerIndex = raw.lastIndexOf(CONTACT_META_PREFIX);
	if (markerIndex < 0) {
		return {noteText: raw.trim(), emails: [], phones: []};
	}
	const noteText = raw.slice(0, markerIndex).trimEnd();
	const metaRaw = raw.slice(markerIndex + CONTACT_META_PREFIX.length).trim();
	try {
		const parsed = JSON.parse(metaRaw) as ContactMeta;
		return {
			noteText: noteText.trim(),
			emails: Array.isArray(parsed.emails) ? normalizeContactValues(parsed.emails) : [],
			phones: Array.isArray(parsed.phones) ? normalizeContactValues(parsed.phones) : [],
		};
	} catch {
		return {noteText: raw.trim(), emails: [], phones: []};
	}
}

function composeContactNote(noteText: string, emails: string[], phones: string[]): string | null {
	const normalizedNote = noteText.trim();
	const normalizedEmails = normalizeContactValues(emails);
	const normalizedPhones = normalizeContactValues(phones);
	const meta: ContactMeta = {emails: normalizedEmails, phones: normalizedPhones};
	const hasMeta = normalizedEmails.length > 1 || normalizedPhones.length > 1;
	if (!hasMeta) {
		return normalizedNote || null;
	}
	const serializedMeta = `${CONTACT_META_PREFIX}\n${JSON.stringify(meta)}`;
	if (!normalizedNote) return serializedMeta;
	return `${normalizedNote}\n\n${serializedMeta}`;
}

function getContactPreview(contact: ContactItem): {
	primaryEmail: string;
	extraEmails: number;
	primaryPhone: string;
} {
	const parsedNote = parseContactNote(contact.note);
	const emailList = parsedNote.emails.length ? parsedNote.emails : [contact.email].filter(Boolean);
	const phoneList = parsedNote.phones.length ? parsedNote.phones : [contact.phone].filter(Boolean);
	return {
		primaryEmail: emailList[0] || contact.email || '',
		extraEmails: Math.max(0, emailList.length - 1),
		primaryPhone: phoneList[0] || contact.phone || '',
	};
}

function getContactInitials(fullName: string | null, email: string | null): string {
	const name = String(fullName || '').trim();
	if (name) {
		const parts = name.split(/\s+/).filter(Boolean);
		if (parts.length >= 2) {
			return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
		}
		return (parts[0].slice(0, 2) || '?').toUpperCase();
	}
	const emailValue = String(email || '').trim();
	if (emailValue) {
		const local = emailValue.split('@')[0] || '';
		return (local.slice(0, 2) || '?').toUpperCase();
	}
	return '?';
}

function canModifyContactSource(source: string): boolean {
	return (
		source.startsWith('local:') ||
		source === 'carddav' ||
		source === 'google-api' ||
		source === 'microsoft-graph'
	);
}

function DynamicContactFieldList({
	label,
	valueLabel,
	values,
	onChange,
	type,
	placeholder,
	addLabel,
	removeLabel,
	requiredFirst = false,
}: {
	label: string;
	valueLabel: string;
	values: string[];
	onChange: (next: string[]) => void;
	type: 'text' | 'email';
	placeholder?: string;
	addLabel: string;
	removeLabel: string;
	requiredFirst?: boolean;
}) {
	const safeValues = values.length ? values : [''];
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="ui-text-secondary text-sm font-medium">{label}</span>
				<Button
					type="button"
					variant="outline"
					className="rounded-md px-2 py-1 text-xs"
					onClick={() => onChange([...safeValues, ''])}
				>
					{addLabel} {valueLabel.toLowerCase()}
				</Button>
			</div>
			<div className="space-y-2">
				{safeValues.map((value, index) => (
					<div key={`${valueLabel}-${index}`} className="relative w-full">
						<FormInput
							type={type}
							value={value}
							onChange={(event) => {
								const next = [...safeValues];
								next[index] = event.target.value;
								onChange(next);
							}}
							placeholder={placeholder}
							required={requiredFirst && index === 0}
							className="w-full pr-12"
						/>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 disabled:opacity-40"
							disabled={safeValues.length === 1}
							onClick={() => onChange(safeValues.filter((_, valueIndex) => valueIndex !== index))}
							title={`${removeLabel} ${valueLabel.toLowerCase()}`}
							aria-label={`${removeLabel} ${valueLabel.toLowerCase()}`}
						>
							<X size={14} />
						</Button>
					</div>
				))}
			</div>
		</div>
	);
}
