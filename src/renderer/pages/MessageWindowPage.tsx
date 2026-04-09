import {Button} from '../components/ui/button';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {FileText, Forward, MailOpen, Paperclip, Reply, ReplyAll, Star, Tag, Trash2} from 'lucide-react';
import type {MessageBodyResult, MessageDetails} from '../../preload';
import {formatSystemDateTime} from '../lib/dateTime';
import {toErrorMessage} from '../lib/statusText';
import {
	buildForwardQuoteHtml,
	buildForwardQuoteText,
	buildReferences,
	buildReplyQuoteHtml,
	buildReplyQuoteText,
	ensurePrefixedSubject,
	formatFromDisplay,
	htmlToText,
	inferReplyAddress,
	normalizeMessageId,
} from '../features/mail/composeDraft';
import {clampToViewport, formatBytes} from '../lib/format';
import WindowTitleBar from '../components/WindowTitleBar';
import {useAppTheme} from '../hooks/useAppTheme';
import {
	buildSourceDocCsp,
	enrichAnchorTitles,
	extractEmailAddress,
	isSenderAllowed,
} from '../features/mail/remoteContent';
import {ipcClient} from '../lib/ipcClient';
import {useIpcEvent} from '../hooks/ipc/useIpcEvent';
import {useAppSettings as useIpcAppSettings} from '../hooks/ipc/useAppSettings';
import {DEFAULT_APP_SETTINGS} from '../../shared/defaults';

export default function MessageWindowPage() {
	useAppTheme();
	const [systemLocale, setSystemLocale] = useState('en-US');
	const [messageId, setMessageId] = useState<number | null>(null);
	const [message, setMessage] = useState<MessageDetails | null>(null);
	const [body, setBody] = useState<MessageBodyResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [attachmentMenu, setAttachmentMenu] = useState<{ x: number; y: number; index: number } | null>(null);
	const [showMessageDetails, setShowMessageDetails] = useState(false);
	const [showSourceModal, setShowSourceModal] = useState(false);
	const [messageSource, setMessageSource] = useState('');
	const [sourceLoading, setSourceLoading] = useState(false);
	const [sourceError, setSourceError] = useState<string | null>(null);
	const sourceRequestSeqRef = useRef(0);
	const [sessionRemoteAllowed, setSessionRemoteAllowed] = useState(false);
	const [hoveredLinkUrl, setHoveredLinkUrl] = useState('');
	const [isPointerOverMessageFrame, setIsPointerOverMessageFrame] = useState(false);
	const {appSettings, setAppSettings} = useIpcAppSettings(DEFAULT_APP_SETTINGS);

	useEffect(() => {
		ipcClient
			.getSystemLocale()
			.then((locale) => setSystemLocale(locale || 'en-US'))
			.catch(() => undefined);
	}, []);

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

	const iframeSrcDoc = useMemo(() => {
		if (!body?.html) return null;
		const csp = buildSourceDocCsp(allowRemoteForMessage);
		const html = enrichAnchorTitles(body.html);
		return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <base target="_blank" />
    <style>
      html, body { width: 100%; margin: 0; box-sizing: border-box; }
      #llamamail-frame-content { box-sizing: border-box; padding: 16px; }
    </style>
  </head>
  <body><div id="llamamail-frame-content">${html}</div></body>
</html>`;
	}, [allowRemoteForMessage, body]);
	const attachments = body?.attachments ?? [];

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
		if (!showSourceModal) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				setShowSourceModal(false);
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [showSourceModal]);

	function composeWithDraft(draft: {
		to?: string | null;
		cc?: string | null;
		subject?: string | null;
		body?: string | null;
		bodyHtml?: string | null;
		bodyText?: string | null;
		inReplyTo?: string | null;
		references?: string[] | string | null;
	}) {
		void ipcClient.openComposeWindow(draft);
	}

	function onReply(): void {
		if (!message) return;
		const subject = ensurePrefixedSubject(message.subject, 'Re:');
		const quoteText = body?.text ?? htmlToText(body?.html);
		const quoteHtml = buildReplyQuoteHtml(message, body?.html, quoteText, systemLocale);
		const replyTo = inferReplyAddress(message);
		const inReplyTo = normalizeMessageId(message.message_id);
		const references = buildReferences(message.references_text, message.message_id);
		composeWithDraft({
			to: replyTo,
			subject,
			bodyHtml: quoteHtml,
			bodyText: `\n\n${buildReplyQuoteText(message, quoteText, systemLocale)}`,
			inReplyTo,
			references,
		});
	}

	function onReplyAll(): void {
		if (!message) return;
		const subject = ensurePrefixedSubject(message.subject, 'Re:');
		const quoteText = body?.text ?? htmlToText(body?.html);
		const quoteHtml = buildReplyQuoteHtml(message, body?.html, quoteText, systemLocale);
		const replyTo = inferReplyAddress(message);
		const inReplyTo = normalizeMessageId(message.message_id);
		const references = buildReferences(message.references_text, message.message_id);
		composeWithDraft({
			to: replyTo,
			cc: message.to_address || '',
			subject,
			bodyHtml: quoteHtml,
			bodyText: `\n\n${buildReplyQuoteText(message, quoteText, systemLocale)}`,
			inReplyTo,
			references,
		});
	}

	function onForward(): void {
		if (!message) return;
		const subject = ensurePrefixedSubject(message.subject, 'Fwd:');
		const originalText = body?.text ?? htmlToText(body?.html);
		const forwarded = buildForwardQuoteText(message, originalText, systemLocale);

		composeWithDraft({
			to: '',
			cc: '',
			subject,
			bodyHtml: buildForwardQuoteHtml(message, body?.html, originalText, systemLocale),
			bodyText: forwarded,
		});
	}

	function onDelete(): void {
		if (!message) return;
		const confirmed = window.confirm(`Delete email "${message.subject || '(No subject)'}"?`);
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
		<div className="lm-shell h-screen w-screen overflow-hidden">
			<div className="flex h-full flex-col">
				<WindowTitleBar title={message?.subject || 'Message'} showMaximize/>
				<div
					role="toolbar"
					aria-label="Message actions"
					className="lm-menubar shrink-0 flex w-full flex-wrap items-center gap-1.5 px-3 py-2"
				>
					<Button
						type="button"
						variant="default"
						className="h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
						onClick={onReply}
					>
						<Reply size={14}/>
						<span>Reply</span>
					</Button>
					<Button
						type="button"
						variant="ghost"
						className="h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
						onClick={onReplyAll}
					>
						<ReplyAll size={14}/>
						<span>Reply all</span>
					</Button>
					<Button
						type="button"
						variant="ghost"
						className="h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
						onClick={onForward}
					>
						<Forward size={14}/>
						<span>Forward</span>
					</Button>
					<Button
						type="button"
						variant="ghost"
						className="h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
						onClick={onViewSource}
					>
						<FileText size={14}/>
						<span>View source</span>
					</Button>
					<span className="mx-1 h-6 w-px bg-[var(--border-default)]"/>
					<Button
						type="button"
						variant="danger"
						className="h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
						onClick={onDelete}
					>
						<Trash2 size={14}/>
						<span>Delete</span>
					</Button>
				</div>
				<header
					className="lm-message-header shrink-0 px-4 py-3">
					{message && (
						<>
							<div className="mb-2 flex flex-wrap items-center gap-1.5">
								<span
									className="inline-flex h-5 items-center rounded-md bg-[var(--surface-hover)] px-2 text-[11px] font-medium text-[var(--text-secondary)]">
									Message
								</span>
								{Boolean(message.is_flagged) && (
									<span
										className="inline-flex h-5 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 text-[11px] font-medium text-amber-800">
										<Star size={11} className="fill-current"/>
										Starred
									</span>
								)}
								<span
									className="inline-flex h-5 items-center gap-1 rounded-md border lm-border-default lm-bg-card px-2 text-[11px] font-medium lm-text-secondary">
									<MailOpen size={11}/>
									{message.is_read ? 'Read' : 'Unread'}
								</span>
								{Boolean((message as MessageDetails & { tag?: string | null }).tag) && (
									<span
										className="inline-flex h-5 items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 text-[11px] font-medium text-sky-800">
										<Tag size={11}/>
										{formatMessageTagLabel(
											(
												message as MessageDetails & {
													tag?: string | null;
												}
											).tag ?? null,
										)}
									</span>
								)}
								{attachments.length > 0 && (
									<span
										className="inline-flex h-5 items-center gap-1 rounded-md border lm-border-default lm-bg-card px-2 text-[11px] font-medium lm-text-secondary">
										<Paperclip size={11}/>
										{attachments.length} attachment{attachments.length > 1 ? 's' : ''}
									</span>
								)}
							</div>
							<h2 className="lm-text-primary truncate text-xl font-semibold tracking-tight">
								{message.subject || '(No subject)'}
							</h2>
							<div className="lm-text-secondary mt-2 grid gap-1 text-xs">
								<div className="select-text">
									<span className="lm-text-muted font-medium">From:</span>{' '}
									<span className="select-text">{formatFromDisplay(message)}</span>
								</div>
								<div className="select-text">
									<span className="lm-text-muted font-medium">To:</span>{' '}
									<span className="select-text">{message.to_address || '-'}</span>
								</div>
								<div>
									<span className="lm-text-muted font-medium">Date:</span>{' '}
									{formatSystemDateTime(message.date, systemLocale)}
								</div>
							</div>
							<Button
								variant="outline"
								className="mt-2 inline-flex h-7 items-center rounded-md px-2 text-[11px]"
								onClick={() => setShowMessageDetails((prev) => !prev)}
							>
								{showMessageDetails ? 'Hide message details' : 'Show message details'}
							</Button>
							{showMessageDetails && (
								<div
									className="mt-3 rounded-md border lm-border-default bg-[var(--surface-content)] p-3 text-xs lm-text-secondary">
									<div>
										<span className="font-medium">From name:</span> {message.from_name || '-'}
									</div>
									<div>
										<span className="font-medium">From address:</span> {message.from_address || '-'}
									</div>
									<div>
										<span className="font-medium">To:</span> {message.to_address || '-'}
									</div>
									<div>
										<span className="font-medium">Date:</span>{' '}
										{formatSystemDateTime(message.date, systemLocale)}
									</div>
									<div>
										<span className="font-medium">Message-ID:</span> {message.message_id || '-'}
									</div>
									<div>
										<span className="font-medium">In-Reply-To:</span> {message.in_reply_to || '-'}
									</div>
									<div>
										<span className="font-medium">References:</span>{' '}
										{message.references_text || '-'}
									</div>
									<div>
										<span className="font-medium">Size:</span>{' '}
										{message.size ? `${message.size.toLocaleString()} bytes` : '-'}
									</div>
								</div>
							)}
						</>
					)}
				</header>

				<main className="lm-bg-card min-h-0 flex flex-1 flex-col">
					{Boolean(iframeSrcDoc && message && appSettings.blockRemoteContent && !allowRemoteForMessage) && (
						<div
							className="w-full shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
							<div className="flex flex-wrap items-center gap-2">
								<span>Remote content blocked for privacy.</span>
								<Button
									type="button"
									className="rounded border border-amber-500/60 bg-amber-100 px-2 py-1 text-[11px] font-medium hover:bg-amber-200"
									onClick={() => setSessionRemoteAllowed(true)}
								>
									Load once
								</Button>
								<Button
									type="button"
									className="rounded border border-amber-500/60 bg-amber-100 px-2 py-1 text-[11px] font-medium hover:bg-amber-200"
									onClick={allowRemoteContentForSender}
								>
									Always allow sender
								</Button>
							</div>
						</div>
					)}
					<div className="min-h-0 flex-1">
						{loading && (
							<div className="lm-text-muted flex h-full items-center justify-center">
								Loading message...
							</div>
						)}
						{!loading && iframeSrcDoc && (
							<iframe
								title={`message-window-body-${message?.id || 'unknown'}`}
								srcDoc={iframeSrcDoc}
								sandbox="allow-popups allow-popups-to-escape-sandbox"
								className="h-full w-full border-0 bg-[var(--surface-card)]"
								onMouseEnter={() => setIsPointerOverMessageFrame(true)}
								onMouseLeave={() => {
									setIsPointerOverMessageFrame(false);
									setHoveredLinkUrl('');
								}}
							/>
						)}
						{!loading && !iframeSrcDoc && (
							<div className="lm-bg-card h-full overflow-auto p-4 lm-text-primary">
								<pre
									className="select-text whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
									{body?.text || 'No body content available for this message.'}
								</pre>
							</div>
						)}
					</div>
				</main>
				{!loading && attachments.length > 0 && (
					<div
						className="shrink-0 border-t lm-border-default bg-[color-mix(in_srgb,var(--surface-content)_80%,transparent)] px-4 py-3">
						<div className="overflow-x-auto overflow-y-hidden">
							<div className="flex min-w-full w-max gap-2 pb-1">
								{attachments.map((attachment, index) => (
									<Button
										key={`${attachment.filename || 'attachment'}-${index}`}
										type="button"
										variant="outline"
										className="group flex w-[17rem] shrink-0 items-center gap-2 rounded-lg p-2 text-left text-xs"
										title={attachment.filename || 'Attachment'}
										onClick={(event) => {
											event.stopPropagation();
											setAttachmentMenu({x: event.clientX, y: event.clientY, index});
										}}
										onContextMenu={(event) => {
											event.preventDefault();
											event.stopPropagation();
											setAttachmentMenu({x: event.clientX, y: event.clientY, index});
										}}
									>
										<span
											className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border lm-border-default bg-[var(--surface-content)] lm-text-muted">
											<Paperclip size={15}/>
										</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate font-medium">
												{attachment.filename || 'Attachment'}
											</span>
											<span
												className="lm-text-muted block truncate text-[11px]">
												{attachment.contentType || 'FILE'}
												{typeof attachment.size === 'number'
													? ` • ${formatBytes(attachment.size)}`
													: ''}
											</span>
										</span>
									</Button>
								))}
							</div>
						</div>
					</div>
				)}
				{isPointerOverMessageFrame && Boolean(hoveredLinkUrl) && (
					<div
						className="pointer-events-none fixed bottom-3 left-3 z-[1210] max-w-[min(60vw,56rem)] rounded-md border lm-border-default bg-[color-mix(in_srgb,var(--surface-card)_95%,transparent)] px-2.5 py-1.5 text-xs lm-text-secondary shadow-md backdrop-blur">
						<span className="block truncate">{hoveredLinkUrl}</span>
					</div>
				)}
				{attachmentMenu && (
					<div
						className="lm-context-menu fixed z-[1100] min-w-44 rounded-md p-1 shadow-xl"
						style={{
							left: clampToViewport(attachmentMenu.x, 184, window.innerWidth),
							top: clampToViewport(attachmentMenu.y, 108, window.innerHeight),
						}}
						onClick={(event) => event.stopPropagation()}
					>
						<Button
							variant="ghost"
							className="block w-full rounded px-2 py-1.5 text-left text-sm"
							onClick={() => {
								if (!message) return;
								void ipcClient
									.openMessageAttachment(message.id, attachmentMenu.index, 'open')
									.catch(() => undefined);
								setAttachmentMenu(null);
							}}
						>
							Open
						</Button>
						<Button
							variant="ghost"
							className="block w-full rounded px-2 py-1.5 text-left text-sm"
							onClick={() => {
								if (!message) return;
								void ipcClient
									.openMessageAttachment(message.id, attachmentMenu.index, 'save')
									.catch(() => undefined);
								setAttachmentMenu(null);
							}}
						>
							Save As...
						</Button>
					</div>
				)}
				{showSourceModal && (
					<div
						className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/45 px-4 py-6"
						onClick={() => setShowSourceModal(false)}
					>
						<div
							role="dialog"
							aria-modal="true"
							aria-label="Message source"
							className="lm-overlay flex h-full max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl shadow-2xl"
							onClick={(event) => event.stopPropagation()}
						>
							<div
								className="flex items-center justify-between border-b lm-border-default px-4 py-3">
								<h2 className="lm-text-primary text-sm font-semibold">
									Message source
								</h2>
								<Button
									type="button"
									variant="outline"
									className="rounded-md px-2 py-1 text-xs"
									onClick={() => setShowSourceModal(false)}
								>
									Close
								</Button>
							</div>
							<div className="lm-bg-content min-h-0 flex-1 overflow-auto p-3">
								{sourceLoading && (
									<p className="lm-text-muted text-sm">
										Loading message source...
									</p>
								)}
								{!sourceLoading && sourceError && (
									<p className="text-sm text-red-700">
										Failed to load source: {sourceError}
									</p>
								)}
								{!sourceLoading && !sourceError && (
									<pre
										className="lm-card select-text whitespace-pre-wrap break-words rounded-md p-3 font-mono text-xs leading-5 lm-text-primary">
										{messageSource || '(No source available)'}
									</pre>
								)}
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function formatMessageTagLabel(tag: string | null): string {
	const normalized = String(tag || '')
		.trim()
		.toLowerCase();
	if (!normalized) return '';
	if (normalized === 'important') return 'Important';
	if (normalized === 'work') return 'Work';
	if (normalized === 'personal') return 'Personal';
	if (normalized === 'todo') return 'To-do';
	return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
