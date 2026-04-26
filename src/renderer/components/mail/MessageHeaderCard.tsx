import {ContextMenu, ContextMenuItem, ContextMenuSeparator} from '@llamamail/ui/contextmenu';
import {Button} from '@llamamail/ui/button';
import {formatSystemDateTime} from '@renderer/lib/dateTime';
import {clampToViewport} from '@renderer/lib/format';
import {ipcClient} from '@renderer/lib/ipcClient';
import {ChevronDown, Filter, MailCheck, MailOpen, Paperclip, Star, Tag, UserPlus} from '@llamamail/ui/icon';
import {useEffect, useMemo, useRef, useState} from 'react';
import {useI18n} from '@llamamail/app/i18n/renderer';

type MessageHeaderModel = {
	account_id?: number | null;
	subject: string | null;
	from_name: string | null;
	from_address: string | null;
	to_address: string | null;
	date: string | null;
	is_read: number | boolean;
	is_flagged: number | boolean;
	message_id: string | null;
	in_reply_to: string | null;
	references_text: string | null;
	size: number | null;
	tag?: string | null;
};

type MessageHeaderCardProps = {
	message: MessageHeaderModel;
	folderLabel: string;
	attachmentsCount: number;
	showMessageDetails: boolean;
	onToggleMessageDetails: () => void;
	spoofHints?: string[];
	dateLocale?: string;
	tagLabel?: string | null;
	avatarSrc?: string | null;
	onQuickActionStatus?: (message: string) => void;
	onOpenCustomFilter?: (payload: {accountId: number; senderEmail: string; senderName: string | null}) => void;
};

export function MessageHeaderCard({
	message,
	folderLabel,
	attachmentsCount,
	showMessageDetails,
	onToggleMessageDetails,
	spoofHints = [],
	dateLocale,
	tagLabel,
	avatarSrc,
	onQuickActionStatus,
	onOpenCustomFilter,
}: MessageHeaderCardProps) {
	const {t} = useI18n();
	const senderName = String(message.from_name || '').trim();
	const senderEmail = useMemo(() => {
		const raw = String(message.from_address || '').trim();
		if (!raw) return '';
		const match = raw.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
		return String(match?.[1] || raw).trim();
	}, [message.from_address]);
	const recipientRaw = String(message.to_address || '').trim();
	const normalizedFolderLabel = String(folderLabel || '')
		.trim()
		.toLowerCase();
	const isOutgoingMessageContext =
		/^<draft\./i.test(String(message.message_id || '')) ||
		normalizedFolderLabel.includes('draft') ||
		normalizedFolderLabel.includes('sent');
	const recipientPrimary = recipientRaw || t('mail_components.header.no_recipients');
	const accountId = Number(message.account_id);
	const hasAccountId = Number.isInteger(accountId) && accountId > 0;
	const senderPrimary = isOutgoingMessageContext
		? recipientPrimary
		: senderName || senderEmail || t('mail_components.header.unknown_sender');
	const senderSecondary =
		isOutgoingMessageContext ? null : senderName && senderEmail ? senderEmail : null;
	const [senderMenu, setSenderMenu] = useState<{x: number; y: number} | null>(null);
	const [actionBusy, setActionBusy] = useState(false);
	const [senderIsContact, setSenderIsContact] = useState<boolean>(false);
	const [inlineStatus, setInlineStatus] = useState<{tone: 'success' | 'error'; text: string} | null>(null);
	const senderButtonRef = useRef<HTMLButtonElement | null>(null);

	const canRunSenderActions = hasAccountId && senderEmail.length > 0 && !isOutgoingMessageContext;

	function reportStatus(messageText: string, tone: 'success' | 'error' = 'success') {
		if (onQuickActionStatus) {
			onQuickActionStatus(messageText);
			return;
		}
		setInlineStatus({tone, text: messageText});
	}

	useEffect(() => {
		if (!inlineStatus) return;
		const timer = window.setTimeout(() => {
			setInlineStatus(null);
		}, 3500);
		return () => {
			window.clearTimeout(timer);
		};
	}, [inlineStatus]);

	useEffect(() => {
		if (!senderMenu) return;
		const onEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setSenderMenu(null);
			}
		};
		const closeMenu = () => setSenderMenu(null);
		window.addEventListener('resize', closeMenu);
		window.addEventListener('scroll', closeMenu, true);
		window.addEventListener('keydown', onEscape);
		return () => {
			window.removeEventListener('resize', closeMenu);
			window.removeEventListener('scroll', closeMenu, true);
			window.removeEventListener('keydown', onEscape);
		};
	}, [senderMenu]);

	useEffect(() => {
		setSenderIsContact(false);
		if (!canRunSenderActions) return;
		let active = true;
		void ipcClient
			.getContacts(accountId, senderEmail, 20)
			.then((contacts) => {
				if (!active) return;
				const exists = contacts.some(
					(contact) =>
						String(contact.email || '')
							.trim()
							.toLowerCase() === senderEmail.toLowerCase(),
				);
				setSenderIsContact(exists);
			})
			.catch(() => {
				if (!active) return;
				setSenderIsContact(false);
			});
		return () => {
			active = false;
		};
	}, [accountId, canRunSenderActions, senderEmail]);

	async function onAddSenderAsContact(): Promise<void> {
		if (!canRunSenderActions || actionBusy) return;
		setActionBusy(true);
		setSenderMenu(null);
		try {
			const existing = await ipcClient.getContacts(accountId, senderEmail, 10);
			const alreadyExists = existing.some(
				(contact) =>
					String(contact.email || '')
						.trim()
						.toLowerCase() === senderEmail.toLowerCase(),
			);
			if (alreadyExists) {
				reportStatus(t('mail_components.header.contact_exists', {email: senderEmail}), 'success');
				return;
			}
			await ipcClient.addContact(accountId, {
				fullName: senderName || null,
				email: senderEmail,
			});
			reportStatus(t('mail_components.header.contact_added', {email: senderEmail}), 'success');
		} catch (error: any) {
			reportStatus(t('mail_components.header.add_contact_failed', {error: error?.message || String(error)}), 'error');
		} finally {
			setActionBusy(false);
		}
	}

	async function onCreateSenderFilter(actionType: 'mark_read' | 'star'): Promise<void> {
		if (!canRunSenderActions || actionBusy) return;
		setActionBusy(true);
		setSenderMenu(null);
		const actionLabel =
			actionType === 'mark_read' ? t('mail_components.header.action_mark_read') : t('mail_components.header.action_star');
		const filterName = t('mail_components.header.filter_name', {email: senderEmail, action: actionLabel});
		try {
			await ipcClient.saveMailFilter(accountId, {
				name: filterName,
				enabled: 1,
				run_on_incoming: 1,
				match_mode: 'all',
				stop_processing: 0,
				conditions: [{field: 'from', operator: 'contains', value: senderEmail}],
				actions: [{type: actionType, value: ''}],
			});
			reportStatus(t('mail_components.header.filter_created', {email: senderEmail, action: actionLabel}), 'success');
		} catch (error: any) {
			reportStatus(t('mail_components.header.create_filter_failed', {error: error?.message || String(error)}), 'error');
		} finally {
			setActionBusy(false);
		}
	}

	function onCreateCustomFilter(): void {
		if (!canRunSenderActions || actionBusy) return;
		setSenderMenu(null);
		if (!onOpenCustomFilter) {
			reportStatus(t('mail_components.header.custom_filter_unavailable'), 'error');
			return;
		}
		onOpenCustomFilter({
			accountId,
			senderEmail,
			senderName: senderName || null,
		});
	}

	function openSenderMenu(): void {
		if (actionBusy) return;
		const anchor = senderButtonRef.current;
		if (!anchor) return;
		const rect = anchor.getBoundingClientRect();
		setSenderMenu({
			x: clampToViewport(Math.round(rect.left), 256, window.innerWidth),
			y: clampToViewport(Math.round(rect.bottom + 6), 180, window.innerHeight),
		});
	}

	return (
		<div className="mail-message-header shrink-0 px-4 py-3">
			<div className="flex items-start justify-between gap-5">
				<div className="min-w-0 flex-1">
					<div className="mb-2 flex flex-wrap items-center gap-1.5">
						<span className="badge-muted inline-flex h-5 items-center rounded-md px-2 text-[11px] font-medium">
							{folderLabel || t('mail_components.header.message')}
						</span>
						{Boolean(message.is_flagged) && (
							<span className="chip-warning inline-flex h-5 items-center gap-1 rounded-md px-2 text-[11px] font-medium">
								<Star size={11} className="fill-current" />
								{t('mail_components.header.starred')}
							</span>
						)}
						<span className="inline-flex h-5 items-center gap-1 rounded-md border ui-border-default ui-surface-card px-2 text-[11px] font-medium ui-text-secondary">
							<MailOpen size={11} />
							{message.is_read ? t('mail_components.header.read') : t('mail_components.header.unread')}
						</span>
						{Boolean(tagLabel) && (
							<span className="chip-info inline-flex h-5 items-center gap-1 rounded-md px-2 text-[11px] font-medium">
								<Tag size={11} />
								{tagLabel}
							</span>
						)}
						{attachmentsCount > 0 && (
							<span className="inline-flex h-5 items-center gap-1 rounded-md border ui-border-default ui-surface-card px-2 text-[11px] font-medium ui-text-secondary">
								<Paperclip size={11} />
								{t('mail_components.header.attachments_count', {count: attachmentsCount})}
							</span>
						)}
						{spoofHints.length > 0 && (
							<span className="chip-warning inline-flex h-5 items-center rounded-md px-2 text-[11px] font-medium">
								{t('mail_components.header.verify_sender')}
							</span>
						)}
					</div>
					<h2 className="ui-text-primary truncate text-xl font-semibold tracking-tight">
						{message.subject || t('mail_components.header.no_subject')}
					</h2>
				</div>
			</div>
			<div className="mt-3 flex flex-wrap items-center justify-between gap-4">
				<div className="flex min-w-0 items-center gap-3">
					<Button
						ref={senderButtonRef}
						type="button"
						variant="unstyled"
						size="none"
						className="hover-card-trigger group relative flex min-w-[17rem] max-w-[24rem] cursor-pointer items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-left focus-visible:outline-none"
						aria-expanded={senderMenu ? 'true' : 'false'}
						aria-haspopup="menu"
						onClick={(event) => {
							if (!canRunSenderActions) return;
							event.stopPropagation();
							if (senderMenu) {
								setSenderMenu(null);
								return;
							}
							openSenderMenu();
						}}
						title={canRunSenderActions ? t('mail_components.header.sender_actions') : undefined}
					>
						<div className="flex min-w-0 flex-1 items-center gap-3">
							{avatarSrc && (
								<img
									src={avatarSrc}
									alt=""
									className="avatar-ring h-9 w-9 shrink-0 rounded-full object-cover"
									aria-hidden="true"
								/>
							)}
							<div className="min-w-0">
								<p className="ui-text-secondary truncate text-sm font-semibold">{senderPrimary}</p>
								{senderSecondary && (
									<p className="ui-text-muted truncate text-xs select-text">{senderSecondary}</p>
								)}
							</div>
						</div>
						{canRunSenderActions && <ChevronDown size={14} className="ui-text-muted shrink-0" />}
					</Button>
				</div>
				<p className="ui-text-secondary shrink-0 text-right text-sm">
					{formatSystemDateTime(message.date, dateLocale)}
				</p>
			</div>
			{inlineStatus && (
				<p className={`mt-2 text-xs ${inlineStatus.tone === 'error' ? 'text-danger' : 'text-success'}`}>
					{inlineStatus.text}
				</p>
			)}
			{senderMenu && (
				<ContextMenu
					size="md"
					layer="1100"
					position={{left: senderMenu.x, top: senderMenu.y}}
					className="min-w-[15rem]"
					onRequestClose={() => setSenderMenu(null)}
					onClick={(event) => event.stopPropagation()}
					onContextMenu={(event) => event.preventDefault()}
				>
					{!senderIsContact && (
						<>
							<ContextMenuItem
								disabled={!canRunSenderActions || actionBusy}
								onClick={() => void onAddSenderAsContact()}
							>
								<UserPlus size={14} />
								<span>{t('mail_components.header.add_contact')}</span>
							</ContextMenuItem>
							<ContextMenuSeparator />
						</>
					)}
					<ContextMenuItem
						disabled={!canRunSenderActions || actionBusy}
						onClick={() => void onCreateSenderFilter('mark_read')}
					>
						<MailCheck size={14} />
						<span>{t('mail_components.header.auto_read_sender')}</span>
					</ContextMenuItem>
					<ContextMenuItem
						disabled={!canRunSenderActions || actionBusy}
						onClick={() => void onCreateSenderFilter('star')}
					>
						<Star size={14} />
						<span>{t('mail_components.header.auto_star_sender')}</span>
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem disabled={!canRunSenderActions || actionBusy} onClick={onCreateCustomFilter}>
						<Filter size={14} />
						<span>{t('mail_components.header.custom_filter')}</span>
					</ContextMenuItem>
				</ContextMenu>
			)}
			<Button
				variant="outline"
				className="mt-2 inline-flex h-7 items-center rounded-md px-2 text-[11px]"
				onClick={onToggleMessageDetails}
			>
				{showMessageDetails
					? t('mail_components.header.hide_message_details')
					: t('mail_components.header.show_message_details')}
			</Button>
			{showMessageDetails && (
				<div className="panel-muted mt-3 rounded-md border ui-border-default p-3 text-xs ui-text-secondary">
					<div>
						<span className="font-medium">{t('mail_components.header.details_from_name')}:</span>{' '}
						{message.from_name || '-'}
					</div>
					<div>
						<span className="font-medium">{t('mail_components.header.details_from_address')}:</span>{' '}
						{message.from_address || '-'}
					</div>
					<div>
						<span className="font-medium">{t('mail_components.header.details_to')}:</span> {message.to_address || '-'}
					</div>
					<div>
						<span className="font-medium">{t('mail_components.header.details_date')}:</span>{' '}
						{formatSystemDateTime(message.date, dateLocale)}
					</div>
					<div>
						<span className="font-medium">{t('mail_components.header.details_message_id')}:</span>{' '}
						{message.message_id || '-'}
					</div>
					<div>
						<span className="font-medium">{t('mail_components.header.details_in_reply_to')}:</span>{' '}
						{message.in_reply_to || '-'}
					</div>
					<div>
						<span className="font-medium">{t('mail_components.header.details_references')}:</span>{' '}
						{message.references_text || '-'}
					</div>
					<div>
						<span className="font-medium">{t('mail_components.header.details_size')}:</span>{' '}
						{message.size
							? t('mail_components.header.details_size_bytes', {size: message.size.toLocaleString()})
							: '-'}
					</div>
					{spoofHints.map((hint) => (
						<div key={hint} className="notice-warning mt-1 rounded border px-2 py-1">
							{hint}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
