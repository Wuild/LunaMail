import {useQuery} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAccount, useAccounts} from '@renderer/hooks/ipc/useAccounts';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {ipcClient} from '@renderer/lib/ipcClient';
import {useMailFoldersStore} from '@renderer/store/mailFoldersStore';
import type {UpdateAccountPayload} from '@preload';
import type {AccountEditor, AccountPanelSection} from '@renderer/app/main/settings/settingsTypes';
import {
	createDefaultMailFilterDraft,
	type MailFilterDraft,
	type MailFilterModalState,
	mapMailFilterToDraft,
} from '@renderer/app/main/settings/mailFilterHelpers';
import {useI18n} from '@llamamail/app/i18n/renderer';

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
	const {t} = useI18n();
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
			auth_method: selectedAccount.auth_method,
			oauth_provider: selectedAccount.oauth_provider,
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
			contacts_sync_interval_minutes: selectedAccount.contacts_sync_interval_minutes,
			calendar_sync_interval_minutes: selectedAccount.calendar_sync_interval_minutes,
			email_list_sort: selectedAccount.email_list_sort,
			email_sync_interval_minutes: selectedAccount.email_sync_interval_minutes,
			email_sync_lookback_months: selectedAccount.email_sync_lookback_months,
			imap_user: selectedAccount.imap_user,
			smtp_user: selectedAccount.smtp_user,
			carddav_user: selectedAccount.carddav_user,
			caldav_user: selectedAccount.caldav_user,
			imap_password: '',
			smtp_password: '',
			carddav_password: '',
			caldav_password: '',
			password: '',
		});
	}, [selectedAccount]);

	useEffect(() => {
		if (!selectedAccount) {
			setMailFilterModal(null);
		}
	}, [selectedAccount]);

	const onAccountSectionNavigate = (nextSection: AccountPanelSection): void => {
		setAccountSection(nextSection);
		navigate(`/settings/account/${accountId}/${nextSection}`);
	};

	async function onSaveAccount() {
		if (!editor || savingAccount) return;
		const hasAnyModuleEnabled = !!editor.sync_emails || !!editor.sync_contacts || !!editor.sync_calendar;
		if (!hasAnyModuleEnabled) {
			setAccountStatus(t('settings.account_route.status.select_sync_module'));
			return;
		}
		setSavingAccount(true);
		setAccountStatus(t('settings.account_route.status.saving_account'));
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
				imap_user: editor.imap_user?.trim() || null,
				smtp_user: editor.smtp_user?.trim() || null,
				carddav_user: editor.carddav_user?.trim() || null,
				caldav_user: editor.caldav_user?.trim() || null,
				imap_password: editor.imap_password?.trim() || null,
				smtp_password: editor.smtp_password?.trim() || null,
				carddav_password: editor.carddav_password?.trim() || null,
				caldav_password: editor.caldav_password?.trim() || null,
				sync_emails: editor.sync_emails ? 1 : 0,
				sync_contacts: editor.sync_contacts ? 1 : 0,
				sync_calendar: editor.sync_calendar ? 1 : 0,
			};
			await ipcClient.updateAccount(editor.id, normalized);
			setAccountStatus(t('settings.account_route.status.account_saved'));
			setEditor((prev) =>
				prev
					? {
							...prev,
							password: '',
							imap_password: '',
							smtp_password: '',
							carddav_password: '',
							caldav_password: '',
						}
					: prev,
			);
		} catch (e: any) {
			setAccountStatus(t('settings.account_route.status.save_failed', {error: e?.message || String(e)}));
		} finally {
			setSavingAccount(false);
		}
	}

	async function onDeleteAccount() {
		if (!editor || deletingAccount) return;
		const confirmed = window.confirm(t('settings.account_route.confirm.delete_account', {email: editor.email}));
		if (!confirmed) return;
		setDeletingAccount(true);
		setAccountStatus(t('settings.account_route.status.deleting_account'));
		try {
			await ipcClient.deleteAccount(editor.id);
			setAccountStatus(t('settings.account_route.status.account_deleted'));
			navigate('/settings/application', {replace: true});
		} catch (e: any) {
			setAccountStatus(t('settings.account_route.status.delete_failed', {error: e?.message || String(e)}));
		} finally {
			setDeletingAccount(false);
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
			setAccountStatus(t('settings.account_route.status.no_valid_account_for_filter'));
			return;
		}
		const {mode, draft} = mailFilterModal;
		const name = draft.name.trim();
		if (!name) {
			setAccountStatus(t('settings.account_route.status.filter_name_required'));
			return;
		}
		if (draft.match_mode !== 'all_messages' && draft.conditions.length === 0) {
			setAccountStatus(t('settings.account_route.status.add_condition_or_match_all'));
			return;
		}
		if (draft.actions.length === 0) {
			setAccountStatus(t('settings.account_route.status.add_action'));
			return;
		}
		const invalidMoveAction = draft.actions.some(
			(action) => action.type === 'move_to_folder' && !action.value.trim(),
		);
		if (invalidMoveAction) {
			setAccountStatus(t('settings.account_route.status.select_move_folder'));
			return;
		}

		setMailFilterBusy(true);
		setAccountStatus(
			mode === 'create'
				? t('settings.account_route.status.creating_filter')
				: t('settings.account_route.status.saving_filter'),
		);
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
			setAccountStatus(
				mode === 'create'
					? t('settings.account_route.status.filter_created')
					: t('settings.account_route.status.filter_saved'),
			);
		} catch (e: any) {
			setAccountStatus(t('settings.account_route.status.filter_save_failed', {error: e?.message || String(e)}));
		} finally {
			setMailFilterBusy(false);
		}
	}

	async function onDeleteMailFilter(filterId: number) {
		const targetAccountId = selectedAccount?.id ?? editor?.id ?? accountId;
		if (!targetAccountId || mailFilterBusy) return;
		setMailFilterBusy(true);
		setAccountStatus(t('settings.account_route.status.deleting_filter'));
		try {
			const result = await ipcClient.deleteMailFilter(targetAccountId, filterId);
			if (result.removed) {
				await mailFiltersQuery.refetch();
				setAccountStatus(t('settings.account_route.status.filter_deleted'));
			} else {
				setAccountStatus(t('settings.account_route.status.filter_already_removed'));
			}
		} catch (e: any) {
			setAccountStatus(t('settings.account_route.status.filter_delete_failed', {error: e?.message || String(e)}));
		} finally {
			setMailFilterBusy(false);
		}
	}

	async function onRunMailFilter(filterId?: number) {
		const targetAccountId = selectedAccount?.id ?? editor?.id ?? accountId;
		if (!targetAccountId) return;
		if (mailFilterModal) {
			setAccountStatus(t('settings.account_route.status.save_open_filter_first'));
			return;
		}
		if (typeof filterId === 'number' && (!Number.isFinite(filterId) || filterId <= 0)) {
			setAccountStatus(t('settings.account_route.status.save_filter_before_run'));
			return;
		}
		setRunningFilterId(filterId ?? -1);
		setAccountStatus(t('settings.account_route.status.running_filter'));
		try {
			const result = await ipcClient.runMailFilters(targetAccountId, {filterId});
			setAccountStatus(
				t('settings.account_route.status.run_complete', {
					processed: result.processed,
					matched: result.matched,
					actions: result.actionsApplied,
					errors: result.errors,
				}),
			);
		} catch (e: any) {
			setAccountStatus(t('settings.account_route.status.filter_run_failed', {error: e?.message || String(e)}));
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
