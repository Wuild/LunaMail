import {Button} from '@llamamail/ui/button';
import {ContextMenu, ContextMenuItem} from '@llamamail/ui/contextmenu';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {FileText, Forward, Reply, ReplyAll, Trash2} from '@llamamail/ui/icon';
import type {MessageBodyResult, MessageDetails} from '@preload';
import {toErrorMessage} from '@renderer/lib/statusText';
import {
	buildForwardQuoteHtml,
	buildForwardQuoteText,
	buildReferences,
	buildReplyQuoteHtml,
	buildReplyQuoteText,
	countRecipients,
	ensurePrefixedSubject,
	htmlToText,
	inferReplyAddress,
	normalizeMessageId,
} from '@renderer/features/mail/composeDraft';
import {clampToViewport} from '@renderer/lib/format';
import {Modal, ModalHeader} from '@llamamail/ui/modal';
import {MessageHeaderCard} from '@renderer/components/mail/MessageHeaderCard';
import {MessageBodyPane} from '@renderer/components/mail/MessageBodyPane';
import {useAppTheme} from '@renderer/hooks/useAppTheme';
import {
	buildSourceDocCsp,
	enrichAnchorTitles,
	extractEmailAddress,
	isSenderAllowed,
} from '@renderer/features/mail/remoteContent';
import {ipcClient} from '@renderer/lib/ipcClient';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {useAppSettings as useIpcAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {useSystemLocale} from '@renderer/hooks/ipc/useSystemLocale';
import {DEFAULT_APP_SETTINGS} from '@llamamail/app/defaults';
import {buildMessageIframeSrcDoc, formatMessageTagLabel} from '@renderer/app/main/email/mailPageHelpers';
import {useApp} from '@renderer/app/AppContext';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function MessageWindowPage() {
	useAppTheme();
	const {t} = useI18n();
	const {setTitle} = useApp();
	const {systemLocale} = useSystemLocale();
	const [messageId, setMessageId] = useState<number | null>(null);
	const [message, setMessage] = useState<MessageDetails | null>(null);
	const [body, setBody] = useState<MessageBodyResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [attachmentMenu, setAttachmentMenu] = useState<{x: number; y: number; index: number} | null>(null);
	const [showMessageDetails, setShowMessageDetails] = useState(false);
	const [showSourceModal, setShowSourceModal] = useState(false);
	const [messageSource, setMessageSource] = useState('');
	const [senderAvatarSrc, setSenderAvatarSrc] = useState<string | null>(null);
	const [sourceLoading, setSourceLoading] = useState(false);
	const [sourceError, setSourceError] = useState<string | null>(null);
	const sourceRequestSeqRef = useRef(0);
	const senderAvatarRequestSeqRef = useRef(0);
	const [sessionRemoteAllowed, setSessionRemoteAllowed] = useState(false);
	const [hoveredLinkUrl, setHoveredLinkUrl] = useState('');
	const [isPointerOverMessageFrame, setIsPointerOverMessageFrame] = useState(false);
	const {appSettings, setAppSettings} = useIpcAppSettings(DEFAULT_APP_SETTINGS);

	useIpcEvent(ipcClient.onLinkHoverUrl, (url) => {
		setHoveredLinkUrl(url || '');
	});

	useEffect(() => {
		let active = true;
		ipcClient
			.getMessageWindowTarget()
			.then((target) => {
				if (!active) return;
				setMessageId(target);
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, []);

	useIpcEvent(ipcClient.onMessageWindowTarget, (target) => {
		setMessageId(target);
	});

	useEffect(() => {
		if (!messageId) {
			setMessage(null);
			setBody(null);
			setAttachmentMenu(null);
			setShowSourceModal(false);
			setMessageSource('');
			setSourceLoading(false);
			setSourceError(null);
			setSessionRemoteAllowed(false);
			setHoveredLinkUrl('');
			setIsPointerOverMessageFrame(false);
			return;
		}
		let active = true;
		setLoading(true);
		Promise.all([
			ipcClient.getMessage(messageId),
			ipcClient.getMessageBody(messageId, `message-window-${messageId}-${Date.now()}`),
		])
			.then(([meta, content]) => {
				if (!active) return;
				setMessage(meta);
				setBody(content);
			})
			.catch(() => {
				if (!active) return;
				setMessage(null);
				setBody(null);
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [messageId]);

	useEffect(() => {
		setSessionRemoteAllowed(false);
		setHoveredLinkUrl('');
		setIsPointerOverMessageFrame(false);
	}, [messageId]);

	useEffect(() => {
		const fromAddress = message?.from_address ?? null;
		const normalizedAddress = typeof fromAddress === 'string' ? fromAddress.trim() : '';
		const requestSeq = ++senderAvatarRequestSeqRef.current;
		setSenderAvatarSrc(null);
		if (!normalizedAddress) {
			return;
		}
		let active = true;
		void ipcClient
			.getSenderAvatar(normalizedAddress)
			.then((avatarSrc) => {
				if (!active || senderAvatarRequestSeqRef.current !== requestSeq) return;
				setSenderAvatarSrc(avatarSrc || null);
			})
			.catch(() => {
				if (!active || senderAvatarRequestSeqRef.current !== requestSeq) return;
				setSenderAvatarSrc(null);
			});
		return () => {
			active = false;
		};
	}, [message?.from_address, messageId]);

	useEffect(() => {
		if (!messageId || !message || message.is_read) return;
		let active = true;
		void ipcClient
			.markMessageRead(messageId)
			.then((result) => {
				if (!active) return;
				setMessage((prev) => (prev && prev.id === messageId ? {...prev, is_read: result.isRead} : prev));
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, [messageId, message]);

	const senderWhitelisted = isSenderAllowed(message?.from_address, appSettings.remoteContentAllowlist || []);
	const allowRemoteForMessage = !appSettings.blockRemoteContent || senderWhitelisted || sessionRemoteAllowed;
	const warnOnExternalLinksForMessage = Boolean(message) && !senderWhitelisted;

	const iframeSrcDoc = useMemo(() => {
		if (!body?.html) return null;
		return buildMessageIframeSrcDoc(
			body.html,
			allowRemoteForMessage,
			warnOnExternalLinksForMessage,
			enrichAnchorTitles,
			buildSourceDocCsp,
		);
	}, [allowRemoteForMessage, body, warnOnExternalLinksForMessage]);
	const attachments = body?.attachments ?? [];
	const isDraftMessage = /^<draft\./i.test(String(message?.message_id || ''));
	const canReplyAll = useMemo(() => countRecipients(message?.to_address || '') > 1, [message?.to_address]);

	useEffect(() => {
		if (!attachmentMenu) return;
		const close = () => setAttachmentMenu(null);
		window.addEventListener('click', close);
		window.addEventListener('keydown', close);
		return () => {
			window.removeEventListener('click', close);
			window.removeEventListener('keydown', close);
		};
	}, [attachmentMenu]);

	useEffect(() => {
		setShowMessageDetails(false);
	}, [messageId]);

	useEffect(() => {
		setTitle((message?.subject || '').trim() || t('mail_components.header.message'));
	}, [message?.subject, setTitle, t]);

	function composeWithDraft(draft: {
		to?: string | null;
		cc?: string | null;
		subject?: string | null;
		body?: string | null;
		bodyHtml?: string | null;
		bodyText?: string | null;
		quotedBodyHtml?: string | null;
		quotedBodyText?: string | null;
		quotedAllowRemote?: boolean;
		inReplyTo?: string | null;
		references?: string[] | string | null;
	}) {
		void ipcClient.openComposeWindow(draft);
	}

	function onReply(): void {
		if (!message) return;
		const subject = ensurePrefixedSubject(message.subject, t('mail_page.subject_prefix.reply'));
		const quoteText = body?.text ?? htmlToText(body?.html);
		const quoteHtml = buildReplyQuoteHtml(message, body?.html, quoteText, systemLocale);
		const replyTo = inferReplyAddress(message);
		const inReplyTo = normalizeMessageId(message.message_id);
		const references = buildReferences(message.references_text, message.message_id);
		composeWithDraft({
			to: replyTo,
			subject,
			bodyHtml: '',
			bodyText: '',
			quotedBodyHtml: quoteHtml,
			quotedBodyText: `\n\n${buildReplyQuoteText(message, quoteText, systemLocale)}`,
			quotedAllowRemote: allowRemoteForMessage,
			inReplyTo,
			references,
		});
	}

	function onReplyAll(): void {
		if (!message) return;
		const subject = ensurePrefixedSubject(message.subject, t('mail_page.subject_prefix.reply'));
		const quoteText = body?.text ?? htmlToText(body?.html);
		const quoteHtml = buildReplyQuoteHtml(message, body?.html, quoteText, systemLocale);
		const replyTo = inferReplyAddress(message);
		const inReplyTo = normalizeMessageId(message.message_id);
		const references = buildReferences(message.references_text, message.message_id);
		composeWithDraft({
			to: replyTo,
			cc: message.to_address || '',
			subject,
			bodyHtml: '',
			bodyText: '',
			quotedBodyHtml: quoteHtml,
			quotedBodyText: `\n\n${buildReplyQuoteText(message, quoteText, systemLocale)}`,
			quotedAllowRemote: allowRemoteForMessage,
			inReplyTo,
			references,
		});
	}

	function onForward(): void {
		if (!message) return;
		const subject = ensurePrefixedSubject(message.subject, t('mail_page.subject_prefix.forward'));
		const originalText = body?.text ?? htmlToText(body?.html);
		const forwarded = buildForwardQuoteText(message, originalText, systemLocale);

		composeWithDraft({
			to: '',
			cc: '',
			subject,
			bodyHtml: '',
			bodyText: '',
			quotedBodyHtml: buildForwardQuoteHtml(message, body?.html, originalText, systemLocale),
			quotedBodyText: forwarded,
			quotedAllowRemote: allowRemoteForMessage,
		});
	}

	function onDelete(): void {
		if (!message) return;
		const confirmed = window.confirm(
			t('mail_page.confirm.delete_email', {subject: message.subject || t('mail_page.placeholder.no_subject')}),
		);
		if (!confirmed) return;
		window.close();
		void ipcClient.deleteMessage(message.id).catch(() => undefined);
	}

	function allowRemoteContentForSender(): void {
		const sender = extractEmailAddress(message?.from_address);
		if (!sender) return;
		const nextAllowlist = [...new Set([...(appSettings.remoteContentAllowlist || []), sender])];
		setAppSettings((prev) => ({...prev, remoteContentAllowlist: nextAllowlist}));
		void ipcClient.updateAppSettings({remoteContentAllowlist: nextAllowlist}).catch(() => undefined);
	}

	function onViewSource(): void {
		if (!message) return;
		const requestSeq = ++sourceRequestSeqRef.current;
		setShowSourceModal(true);
		setSourceLoading(true);
		setSourceError(null);
		setMessageSource('');
		void ipcClient
			.getMessageSource(message.id)
			.then((result) => {
				if (sourceRequestSeqRef.current !== requestSeq) return;
				setMessageSource(result.source);
			})
			.catch((error: unknown) => {
				if (sourceRequestSeqRef.current !== requestSeq) return;
				setSourceError(toErrorMessage(error));
			})
			.finally(() => {
				if (sourceRequestSeqRef.current !== requestSeq) return;
				setSourceLoading(false);
			});
	}

	return (
		<div className="h-full min-h-0 w-full overflow-hidden">
			<div className="flex h-full min-h-0 flex-col">
				<div
					role="toolbar"
					aria-label={t('mail_page.action.message_actions')}
					className="mail-menubar shrink-0 flex w-full flex-wrap items-center gap-1.5 px-3 py-2"
				>
					{!isDraftMessage && (
						<>
							<Button
								type="button"
								variant="default"
								className="h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
								onClick={onReply}
							>
								<Reply size={14} />
								<span>{t('mail_page.action.reply')}</span>
							</Button>
							{canReplyAll && (
								<Button
									type="button"
									variant="ghost"
									className="h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
									onClick={onReplyAll}
								>
									<ReplyAll size={14} />
									<span>{t('mail_page.action.reply_all')}</span>
								</Button>
							)}
							<Button
								type="button"
								variant="ghost"
								className="h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
								onClick={onForward}
							>
								<Forward size={14} />
								<span>{t('mail_page.action.forward')}</span>
							</Button>
						</>
					)}
					<Button
						type="button"
						variant="ghost"
						className="h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
						onClick={onViewSource}
					>
						<FileText size={14} />
						<span>{t('mail_page.action.view_source')}</span>
					</Button>
					<span className="divider-default mx-1 h-6 w-px" />
					<Button
						type="button"
						variant="danger"
						className="h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
						onClick={onDelete}
					>
						<Trash2 size={14} />
						<span>{t('mail_page.action.delete')}</span>
					</Button>
				</div>
				{message && (
					<MessageHeaderCard
						message={message}
						folderLabel={t('mail_components.header.message')}
						attachmentsCount={attachments.length}
						showMessageDetails={showMessageDetails}
						onToggleMessageDetails={() => setShowMessageDetails((prev) => !prev)}
						dateLocale={systemLocale}
						tagLabel={formatMessageTagLabel(
							(
								message as MessageDetails & {
									tag?: string | null;
								}
							).tag ?? null,
						)}
						avatarSrc={senderAvatarSrc}
						onOpenCustomFilter={({accountId}) => {
							void ipcClient.openRouteWindow(`/settings/account/${accountId}/filters`);
						}}
					/>
				)}

				<MessageBodyPane
					loading={loading}
					loadingLabel={t('mail_page.placeholder.loading_message_body')}
					iframeSrcDoc={iframeSrcDoc}
					plainText={body?.text}
					iframeTitle={`message-window-body-${message?.id || 'unknown'}`}
					showRemoteContentWarning={Boolean(
						iframeSrcDoc && message && appSettings.blockRemoteContent && !allowRemoteForMessage,
					)}
					onLoadRemoteOnce={() => setSessionRemoteAllowed(true)}
					onAllowRemoteForSender={allowRemoteContentForSender}
					onMessageFramePointerEnter={() => setIsPointerOverMessageFrame(true)}
					onMessageFramePointerLeave={() => {
						setIsPointerOverMessageFrame(false);
						setHoveredLinkUrl('');
					}}
					attachments={attachments}
					onOpenAttachmentMenu={(index, x, y) => {
						setAttachmentMenu({x, y, index});
					}}
				/>
				{isPointerOverMessageFrame && Boolean(hoveredLinkUrl) && (
					<div className="pointer-events-none fixed bottom-3 left-3 z-[1210] max-w-[min(60vw,56rem)] rounded-md border ui-border-default bg-[color-mix(in_srgb,var(--surface-card)_95%,transparent)] px-2.5 py-1.5 text-xs ui-text-secondary shadow-md backdrop-blur">
						<span className="block truncate">{hoveredLinkUrl}</span>
					</div>
				)}
				{attachmentMenu && (
					<ContextMenu
						size="sm"
						layer="1100"
						position={{
							left: clampToViewport(attachmentMenu.x, 184, window.innerWidth),
							top: clampToViewport(attachmentMenu.y, 108, window.innerHeight),
						}}
						onRequestClose={() => setAttachmentMenu(null)}
						onClick={(event) => event.stopPropagation()}
					>
						<ContextMenuItem
							onClick={() => {
								if (!message) return;
								void ipcClient
									.openMessageAttachment(message.id, attachmentMenu.index, 'open')
									.catch(() => undefined);
								setAttachmentMenu(null);
							}}
						>
							{t('mail.attachment.open')}
						</ContextMenuItem>
						<ContextMenuItem
							onClick={() => {
								if (!message) return;
								void ipcClient
									.openMessageAttachment(message.id, attachmentMenu.index, 'save')
									.catch(() => undefined);
								setAttachmentMenu(null);
							}}
						>
							{t('mail.attachment.save_as')}
						</ContextMenuItem>
					</ContextMenu>
				)}
				<Modal
					open={showSourceModal}
					onClose={() => setShowSourceModal(false)}
					ariaLabel={t('mail_components.message_source.aria_label')}
					backdropClassName="z-[1200] px-4 py-6"
					contentClassName="overlay flex h-full max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl p-0"
				>
					<ModalHeader className="border-b ui-border-default px-4 py-3">
						<h2 className="ui-text-primary text-sm font-semibold">{t('mail_components.message_source.title')}</h2>
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-2 py-1 text-xs"
							onClick={() => setShowSourceModal(false)}
						>
							{t('mail_components.common.close')}
						</Button>
					</ModalHeader>
					<div className="ui-surface-content min-h-0 flex-1 overflow-auto p-3">
						{sourceLoading && <p className="ui-text-muted text-sm">{t('mail_components.message_source.loading')}</p>}
						{!sourceLoading && sourceError && (
							<p className="text-danger text-sm">{t('mail_components.message_source.failed', {error: sourceError})}</p>
						)}
						{!sourceLoading && !sourceError && (
							<pre className="panel select-text whitespace-pre-wrap break-words rounded-md p-3 font-mono text-xs leading-5 ui-text-primary">
								{messageSource || t('mail_components.message_source.no_source')}
							</pre>
						)}
					</div>
				</Modal>
			</div>
		</div>
	);
}
