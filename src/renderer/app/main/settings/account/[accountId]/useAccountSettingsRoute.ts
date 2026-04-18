import {useQuery} from '@tanstack/react-query';
import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAccount, useAccounts} from '@renderer/hooks/ipc/useAccounts';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {ipcClient} from '@renderer/lib/ipcClient';
import {useMailFoldersStore} from '@renderer/store/mailFoldersStore';
import type {PublicCloudAccount, UpdateAccountPayload} from '@/preload';
import type {AccountEditor, AccountPanelSection} from '@renderer/app/main/settings/settingsTypes';
import {
	createDefaultMailFilterDraft,
	type MailFilterDraft,
	type MailFilterModalState,
	mapMailFilterToDraft,
} from '@renderer/app/main/settings/mailFilterHelpers';

const EMPTY_FOLDERS: any[] = [];

export type UseAccountSettingsRouteResult = {
	editor: AccountEditor | null;
	setEditor: React.Dispatch<React.SetStateAction<AccountEditor | null>>;
	accountSection: AccountPanelSection;
	onAccountSectionNavigate: (section: AccountPanelSection) => void;
	accountSectionSidebarWidth: number;
	onAccountSectionResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
	accountStatus: string | null;
	deletingAccount: boolean;
	savingAccount: boolean;
	onDeleteAccount: () => Promise<void>;
	onSaveAccount: () => Promise<void>;
	linkedCloudDrive: PublicCloudAccount | null;
	canLinkCloudDrive: boolean;
	cloudDriveBusy: boolean;
	onLinkCloudDrive: () => Promise<void>;
	onUnlinkCloudDrive: () => Promise<void>;
	mailFilters: any[];
	mailFilterBusy: boolean;
	runningFilterId: number | null;
	mailFilterModal: MailFilterModalState;
	setMailFilterModal: React.Dispatch<React.SetStateAction<MailFilterModalState>>;
	updateMailFilterDraft: (updater: (prev: MailFilterDraft) => MailFilterDraft) => void;
	onSaveMailFilterModal: () => Promise<void>;
	onOpenCreateMailFilter: () => void;
	onOpenEditMailFilter: (filter: any) => void;
	onRunMailFilter: (filterId?: number) => Promise<void>;
	onDeleteMailFilter: (filterId: number) => Promise<void>;
	accountFolders: any[];
};

export function useAccountSettingsRoute(
	accountId: number,
	section: AccountPanelSection,
): UseAccountSettingsRouteResult {
	const navigate = useNavigate();
	const {accounts} = useAccounts();
	const accountHandle = useAccount(accountId);
	const runtimeAccountFolders = useMailFoldersStore((state) => state.accountFoldersById[accountId] ?? EMPTY_FOLDERS);
	const selectedAccount = accounts.find((account) => account.id === accountId) ?? null;
	const [editor, setEditor] = useState<AccountEditor | null>(null);
	const [accountSection, setAccountSection] = useState<AccountPanelSection>(section);
	const [savingAccount, setSavingAccount] = useState(false);
	const [deletingAccount, setDeletingAccount] = useState(false);
	const [accountStatus, setAccountStatus] = useState<string | null>(null);
	const [mailFilterBusy, setMailFilterBusy] = useState(false);
	const [cloudDriveBusy, setCloudDriveBusy] = useState(false);
	const [cloudAccounts, setCloudAccounts] = useState<PublicCloudAccount[]>([]);
	const [runningFilterId, setRunningFilterId] = useState<number | null>(null);
	const [mailFilterModal, setMailFilterModal] = useState<MailFilterModalState>(null);
	const {sidebarWidth: accountSectionSidebarWidth, onResizeStart: onAccountSectionResizeStart} = useResizableSidebar({
		defaultWidth: 240,
		minWidth: 180,
		maxWidth: 420,
		storageKey: 'llamamail.settings.account.sections.width',
	});

	const accountFoldersQuery = useQuery({
		queryKey: ['folders', 'account-settings', accountId],
		queryFn: () => ipcClient.getFolders(accountId),
		enabled: Number.isFinite(accountId) && accountId > 0,
		initialData: [],
	});
	const mailFiltersQuery = useQuery({
		queryKey: ['mail-filters', accountId],
		queryFn: () => ipcClient.getMailFilters(accountId),
		enabled: Number.isFinite(accountId) && accountId > 0,
		initialData: [],
	});
	const accountFoldersFromQuery = accountFoldersQuery.data;
	const accountFolders = accountFoldersFromQuery.length > 0 ? accountFoldersFromQuery : runtimeAccountFolders;
	const mailFilters = mailFiltersQuery.data;

	useEffect(() => {
		setAccountSection(section);
	}, [section]);

	useEffect(() => {
		if (!selectedAccount) {
			setEditor(null);
			return;
		}
		setEditor({
			id: selectedAccount.id,
			email: selectedAccount.email,
			provider: selectedAccount.provider,
			display_name: selectedAccount.display_name,
			reply_to: selectedAccount.reply_to,
			organization: selectedAccount.organization,
			signature_text: selectedAccount.signature_text,
			signature_is_html: selectedAccount.signature_is_html,
			signature_file_path: selectedAccount.signature_file_path,
			attach_vcard: selectedAccount.attach_vcard,
			user: selectedAccount.user,
			imap_host: selectedAccount.imap_host,
			imap_port: selectedAccount.imap_port,
			imap_secure: selectedAccount.imap_secure,
			pop3_host: selectedAccount.pop3_host,
			pop3_port: selectedAccount.pop3_port,
			pop3_secure: selectedAccount.pop3_secure,
			smtp_host: selectedAccount.smtp_host,
			smtp_port: selectedAccount.smtp_port,
			smtp_secure: selectedAccount.smtp_secure,
			sync_emails: selectedAccount.sync_emails,
			sync_contacts: selectedAccount.sync_contacts,
			sync_calendar: selectedAccount.sync_calendar,
			password: '',
		});
	}, [selectedAccount]);

	useEffect(() => {
		if (!selectedAccount) {
			setMailFilterModal(null);
		}
	}, [selectedAccount]);

	useEffect(() => {
		let active = true;
		const load = async () => {
			const rows = await ipcClient.getCloudAccounts();
			if (!active) return;
			setCloudAccounts(rows);
		};
		void load().catch(() => undefined);
		const offCloudAccountsUpdated = ipcClient.onCloudAccountsUpdated((rows) => {
			if (!active) return;
			setCloudAccounts(rows);
		});
		return () => {
			active = false;
			if (typeof offCloudAccountsUpdated === 'function') offCloudAccountsUpdated();
		};
	}, []);

	const linkedCloudDrive = useMemo(() => resolveLinkedCloudDrive(selectedAccount, cloudAccounts), [cloudAccounts, selectedAccount]);
	const canLinkCloudDrive = useMemo(
		() => canAccountManageCloudDrive(selectedAccount) && !linkedCloudDrive,
		[linkedCloudDrive, selectedAccount],
	);

	const onAccountSectionNavigate = (nextSection: AccountPanelSection): void => {
		setAccountSection(nextSection);
		navigate(`/settings/account/${accountId}/${nextSection}`);
	};

	async function onSaveAccount() {
		if (!editor || savingAccount) return;
		const hasAnyModuleEnabled = !!editor.sync_emails || !!editor.sync_contacts || !!editor.sync_calendar;
		if (!hasAnyModuleEnabled) {
			setAccountStatus('Select at least one sync module (email, contacts, or calendar).');
			return;
		}
		setSavingAccount(true);
		setAccountStatus('Saving account...');
		try {
			const normalized: UpdateAccountPayload = {
				...editor,
				email: editor.email.trim(),
				user: editor.user.trim(),
				provider: editor.provider?.trim() || null,
				display_name: editor.display_name?.trim() || null,
				reply_to: editor.reply_to?.trim() || null,
				organization: editor.organization?.trim() || null,
				signature_text: editor.signature_text ?? null,
				signature_is_html: 1,
				signature_file_path: editor.signature_file_path?.trim() || null,
				attach_vcard: editor.attach_vcard ? 1 : 0,
				imap_host: editor.imap_host.trim(),
				smtp_host: editor.smtp_host.trim(),
				pop3_host: editor.pop3_host?.trim() || null,
				password: editor.password?.trim() || null,
				sync_emails: editor.sync_emails ? 1 : 0,
				sync_contacts: editor.sync_contacts ? 1 : 0,
				sync_calendar: editor.sync_calendar ? 1 : 0,
			};
			await ipcClient.updateAccount(editor.id, normalized);
			setAccountStatus('Account settings saved.');
			setEditor((prev) => (prev ? {...prev, password: ''} : prev));
		} catch (e: any) {
			setAccountStatus(`Save failed: ${e?.message || String(e)}`);
		} finally {
			setSavingAccount(false);
		}
	}

	async function onDeleteAccount() {
		if (!editor || deletingAccount) return;
		const confirmed = window.confirm(
			`Delete account "${editor.email}"?\n\nThis removes all synced local data for this account.`,
		);
		if (!confirmed) return;
		setDeletingAccount(true);
		setAccountStatus('Deleting account...');
		try {
			await ipcClient.deleteAccount(editor.id);
			setAccountStatus('Account deleted.');
			navigate('/settings/application', {replace: true});
		} catch (e: any) {
			setAccountStatus(`Delete failed: ${e?.message || String(e)}`);
		} finally {
			setDeletingAccount(false);
		}
	}

	async function onUnlinkCloudDrive() {
		if (!editor || cloudDriveBusy) return;
		if (!linkedCloudDrive) {
			setAccountStatus('No linked cloud drive found for this account.');
			return;
		}
		const confirmed = window.confirm(
			`Disconnect cloud drive "${linkedCloudDrive.name}" from account "${editor.email}"?`,
		);
		if (!confirmed) return;
		setCloudDriveBusy(true);
		setAccountStatus('Disconnecting cloud drive...');
		try {
			const result = await ipcClient.unlinkAccountCloudDrive(editor.id);
			if (!result.removed) {
				setAccountStatus('No linked cloud drive to disconnect.');
				return;
			}
			setAccountStatus('Cloud drive disconnected for this account.');
		} catch (e: any) {
			setAccountStatus(`Cloud drive disconnect failed: ${e?.message || String(e)}`);
		} finally {
			setCloudDriveBusy(false);
		}
	}

	async function onLinkCloudDrive() {
		if (!editor || cloudDriveBusy) return;
		if (!canAccountManageCloudDrive(selectedAccount)) {
			setAccountStatus('Cloud drive linking is supported for OAuth Google/Microsoft accounts only.');
			return;
		}
		if (linkedCloudDrive) {
			setAccountStatus('Cloud drive is already linked for this account.');
			return;
		}
		setCloudDriveBusy(true);
		setAccountStatus('Connecting cloud drive...');
		try {
			const result = await ipcClient.linkAccountCloudDrive(editor.id);
			if (result.linked) {
				setAccountStatus('Cloud drive linked for this account.');
				return;
			}
			if (result.reason === 'already-linked') {
				setAccountStatus('Cloud drive is already linked for this account.');
				return;
			}
			if (result.reason === 'provider-not-supported') {
				setAccountStatus('Cloud drive linking is not supported for this provider.');
				return;
			}
			setAccountStatus('Cloud drive linking did not complete.');
		} catch (e: any) {
			setAccountStatus(`Cloud drive link failed: ${e?.message || String(e)}`);
		} finally {
			setCloudDriveBusy(false);
		}
	}

	function onOpenCreateMailFilter() {
		void (async () => {
			if (accountFolders.length === 0 && accountId > 0) {
				try {
					await accountHandle.mail.refreshFolders();
					await accountFoldersQuery.refetch();
				} catch {
					// non-fatal: modal can still open and show empty-state option
				}
			}
			const freshFolders = accountFoldersQuery.data?.length
				? accountFoldersQuery.data
				: accountHandle.mail.folders.length
					? accountHandle.mail.folders
					: runtimeAccountFolders;
			const defaultFolderPath = freshFolders[0]?.path ?? '';
			setMailFilterModal({
				mode: 'create',
				draft: {
					...createDefaultMailFilterDraft(mailFilters.length + 1),
					actions: [{type: 'move_to_folder', value: defaultFolderPath}],
				},
			});
		})();
	}

	function onOpenEditMailFilter(filter: any) {
		void (async () => {
			if (accountFolders.length === 0 && accountId > 0) {
				try {
					await accountHandle.mail.refreshFolders();
					await accountFoldersQuery.refetch();
				} catch {
					// non-fatal
				}
			}
			setMailFilterModal({
				mode: 'edit',
				draft: mapMailFilterToDraft(filter),
			});
		})();
	}

	function updateMailFilterDraft(updater: (prev: MailFilterDraft) => MailFilterDraft) {
		setMailFilterModal((prev) => {
			if (!prev) return prev;
			return {...prev, draft: updater(prev.draft)};
		});
	}

	async function onSaveMailFilterModal() {
		if (!mailFilterModal || mailFilterBusy) return;
		const targetAccountId = selectedAccount?.id ?? editor?.id ?? accountId;
		if (!targetAccountId || !Number.isFinite(targetAccountId) || targetAccountId <= 0) {
			setAccountStatus('No valid account selected for this filter.');
			return;
		}
		const {mode, draft} = mailFilterModal;
		const name = draft.name.trim();
		if (!name) {
			setAccountStatus('Filter name is required.');
			return;
		}
		if (draft.match_mode !== 'all_messages' && draft.conditions.length === 0) {
			setAccountStatus('Add at least one condition, or use "Match all messages".');
			return;
		}
		if (draft.actions.length === 0) {
			setAccountStatus('Add at least one action.');
			return;
		}
		const invalidMoveAction = draft.actions.some(
			(action) => action.type === 'move_to_folder' && !action.value.trim(),
		);
		if (invalidMoveAction) {
			setAccountStatus('Select a folder for every "Move to folder" action.');
			return;
		}

		setMailFilterBusy(true);
		setAccountStatus(mode === 'create' ? 'Creating filter...' : 'Saving filter...');
		try {
			await ipcClient.saveMailFilter(targetAccountId, {
				id: draft.id ?? undefined,
				name,
				enabled: draft.enabled ? 1 : 0,
				run_on_incoming: draft.run_on_incoming ? 1 : 0,
				match_mode: draft.match_mode,
				stop_processing: draft.stop_processing ? 1 : 0,
				conditions: draft.conditions.map((condition) => ({
					field: condition.field,
					operator: condition.operator,
					value: condition.value,
				})),
				actions: draft.actions.map((action) => ({
					type: action.type,
					value: action.value,
				})),
			});
			await mailFiltersQuery.refetch();
			setMailFilterModal(null);
			setAccountStatus(mode === 'create' ? 'Filter created.' : 'Filter saved.');
		} catch (e: any) {
			setAccountStatus(`Filter save failed: ${e?.message || String(e)}`);
		} finally {
			setMailFilterBusy(false);
		}
	}

	async function onDeleteMailFilter(filterId: number) {
		const targetAccountId = selectedAccount?.id ?? editor?.id ?? accountId;
		if (!targetAccountId || mailFilterBusy) return;
		setMailFilterBusy(true);
		setAccountStatus('Deleting filter...');
		try {
			const result = await ipcClient.deleteMailFilter(targetAccountId, filterId);
			if (result.removed) {
				await mailFiltersQuery.refetch();
				setAccountStatus('Filter deleted.');
			} else {
				setAccountStatus('Filter was already removed.');
			}
		} catch (e: any) {
			setAccountStatus(`Filter delete failed: ${e?.message || String(e)}`);
		} finally {
			setMailFilterBusy(false);
		}
	}

	async function onRunMailFilter(filterId?: number) {
		const targetAccountId = selectedAccount?.id ?? editor?.id ?? accountId;
		if (!targetAccountId) return;
		if (mailFilterModal) {
			setAccountStatus('Save the open filter first before running filters.');
			return;
		}
		if (typeof filterId === 'number' && (!Number.isFinite(filterId) || filterId <= 0)) {
			setAccountStatus('Save this filter before running it.');
			return;
		}
		setRunningFilterId(filterId ?? -1);
		setAccountStatus('Running filter...');
		try {
			const result = await ipcClient.runMailFilters(targetAccountId, {filterId});
			setAccountStatus(
				`Run complete. Processed ${result.processed}, matched ${result.matched}, actions ${result.actionsApplied}, errors ${result.errors}.`,
			);
		} catch (e: any) {
			setAccountStatus(`Filter run failed: ${e?.message || String(e)}`);
		} finally {
			setRunningFilterId(null);
		}
	}

	return {
		editor,
		setEditor,
		accountSection,
		onAccountSectionNavigate,
		accountSectionSidebarWidth,
		onAccountSectionResizeStart,
		accountStatus,
		deletingAccount,
		savingAccount,
		onDeleteAccount,
		onSaveAccount,
		linkedCloudDrive,
		canLinkCloudDrive,
		cloudDriveBusy,
		onLinkCloudDrive,
		onUnlinkCloudDrive,
		mailFilters,
		mailFilterBusy,
		runningFilterId,
		mailFilterModal,
		setMailFilterModal,
		updateMailFilterDraft,
		onSaveMailFilterModal,
		onOpenCreateMailFilter,
		onOpenEditMailFilter,
		onRunMailFilter,
		onDeleteMailFilter,
		accountFolders,
	};
}

function resolveLinkedCloudDrive(
	account:
		| {
				email: string;
				provider?: string | null;
				oauth_provider?: string | null;
				auth_method?: string | null;
		  }
		| null,
	cloudAccounts: PublicCloudAccount[],
): PublicCloudAccount | null {
	if (!account) return null;
	const cloudProvider = resolveCloudProvider(account.provider, account.oauth_provider);
	if (!cloudProvider) return null;
	const linkedEmail = String(account.email || '')
		.trim()
		.toLowerCase();
	const providerAccounts = cloudAccounts.filter((cloudAccount) => cloudAccount.provider === cloudProvider);
	if (providerAccounts.length === 0) return null;
	return (
		providerAccounts.find((cloudAccount) => {
			const user = String(cloudAccount.user || '')
				.trim()
				.toLowerCase();
			return Boolean(linkedEmail) && user === linkedEmail;
		}) ?? providerAccounts[0]
	);
}

function canAccountManageCloudDrive(
	account:
		| {
				provider?: string | null;
				oauth_provider?: string | null;
				auth_method?: string | null;
		  }
		| null,
): boolean {
	if (!account) return false;
	if (String(account.auth_method || '').trim().toLowerCase() !== 'oauth2') return false;
	return resolveCloudProvider(account.provider, account.oauth_provider) !== null;
}

function resolveCloudProvider(
	provider: string | null | undefined,
	oauthProvider: string | null | undefined,
): 'google-drive' | 'onedrive' | null {
	const normalizedProvider = String(provider || '')
		.trim()
		.toLowerCase();
	const normalizedOauthProvider = String(oauthProvider || '')
		.trim()
		.toLowerCase();
	if (normalizedProvider === 'google' || normalizedOauthProvider === 'google') return 'google-drive';
	if (normalizedProvider === 'microsoft' || normalizedOauthProvider === 'microsoft') return 'onedrive';
	return null;
}
