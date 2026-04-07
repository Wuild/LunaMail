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
      #lunamail-frame-content { box-sizing: border-box; padding: 16px; }
    </style>
  </head>
  <body><div id="lunamail-frame-content">${html}</div></body>
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
		<div className="h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
			<div className="flex h-full flex-col">
				<WindowTitleBar title={message?.subject || 'Message'} showMaximize/>
				<div
					role="toolbar"
					aria-label="Message actions"
					className="shrink-0 flex w-full flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2 dark:border-[#3a3d44] dark:bg-[#2b2d31]"
				>
					<button
						type="button"
						className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sky-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
						onClick={onReply}
					>
						<Reply size={14}/>
						<span>Reply</span>
					</button>
					<button
						type="button"
						className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3d44]"
						onClick={onReplyAll}
					>
						<ReplyAll size={14}/>
						<span>Reply all</span>
					</button>
					<button
						type="button"
						className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3d44]"
						onClick={onForward}
					>
						<Forward size={14}/>
						<span>Forward</span>
					</button>
					<button
						type="button"
						className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3d44]"
						onClick={onViewSource}
					>
						<FileText size={14}/>
						<span>View source</span>
					</button>
					<span className="mx-1 h-6 w-px bg-slate-300 dark:bg-[#3a3d44]"/>
					<button
						type="button"
						className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30"
						onClick={onDelete}
					>
						<Trash2 size={14}/>
						<span>Delete</span>
					</button>
				</div>
				<header
					className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50/40 px-4 py-3 dark:border-[#393c41] dark:from-[#34373d] dark:via-[#34373d] dark:to-[#3a3550]">
					{message && (
						<>
							<div className="mb-2 flex flex-wrap items-center gap-1.5">
								<span
									className="inline-flex h-5 items-center rounded-md bg-slate-200/90 px-2 text-[11px] font-medium text-slate-700 dark:bg-[#2a2d31] dark:text-slate-200">
									Message
								</span>
								{Boolean(message.is_flagged) && (
									<span
										className="inline-flex h-5 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 text-[11px] font-medium text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-300">
										<Star size={11} className="fill-current"/>
										Starred
									</span>
								)}
								<span
									className="inline-flex h-5 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 dark:border-[#3a3d44] dark:bg-[#2b2d31] dark:text-slate-200">
									<MailOpen size={11}/>
									{message.is_read ? 'Read' : 'Unread'}
								</span>
								{Boolean((message as MessageDetails & { tag?: string | null }).tag) && (
									<span
										className="inline-flex h-5 items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 text-[11px] font-medium text-sky-800 dark:border-sky-700/70 dark:bg-sky-900/20 dark:text-sky-300">
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
										className="inline-flex h-5 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 dark:border-[#3a3d44] dark:bg-[#2b2d31] dark:text-slate-200">
										<Paperclip size={11}/>
										{attachments.length} attachment{attachments.length > 1 ? 's' : ''}
									</span>
								)}
							</div>
							<h2 className="truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
								{message.subject || '(No subject)'}
							</h2>
							<div className="mt-2 grid gap-1 text-xs text-slate-700 dark:text-slate-200">
								<div className="select-text">
									<span className="font-medium text-slate-500 dark:text-slate-400">From:</span>{' '}
									<span className="select-text">{formatFromDisplay(message)}</span>
								</div>
								<div className="select-text">
									<span className="font-medium text-slate-500 dark:text-slate-400">To:</span>{' '}
									<span className="select-text">{message.to_address || '-'}</span>
								</div>
								<div>
									<span className="font-medium text-slate-500 dark:text-slate-400">Date:</span>{' '}
									{formatSystemDateTime(message.date, systemLocale)}
								</div>
							</div>
							<button
								className="mt-2 inline-flex h-7 items-center rounded-md border border-slate-300 px-2 text-[11px] text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
								onClick={() => setShowMessageDetails((prev) => !prev)}
							>
								{showMessageDetails ? 'Hide message details' : 'Show message details'}
							</button>
							{showMessageDetails && (
								<div
									className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-[#3a3d44] dark:bg-[#2b2d31] dark:text-slate-200">
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

				<main className="min-h-0 flex flex-1 flex-col bg-white">
					{Boolean(iframeSrcDoc && message && appSettings.blockRemoteContent && !allowRemoteForMessage) && (
						<div
							className="w-full shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-300">
							<div className="flex flex-wrap items-center gap-2">
								<span>Remote content blocked for privacy.</span>
								<button
									type="button"
									className="rounded border border-amber-500/60 bg-amber-100 px-2 py-1 text-[11px] font-medium hover:bg-amber-200 dark:border-amber-600/70 dark:bg-amber-900/30 dark:hover:bg-amber-900/45"
									onClick={() => setSessionRemoteAllowed(true)}
								>
									Load once
								</button>
								<button
									type="button"
									className="rounded border border-amber-500/60 bg-amber-100 px-2 py-1 text-[11px] font-medium hover:bg-amber-200 dark:border-amber-600/70 dark:bg-amber-900/30 dark:hover:bg-amber-900/45"
									onClick={allowRemoteContentForSender}
								>
									Always allow sender
								</button>
							</div>
						</div>
					)}
					<div className="min-h-0 flex-1">
						{loading && (
							<div className="flex h-full items-center justify-center text-slate-500 dark:text-slate-400">
								Loading message...
							</div>
						)}
						{!loading && iframeSrcDoc && (
							<iframe
								title={`message-window-body-${message?.id || 'unknown'}`}
								srcDoc={iframeSrcDoc}
								sandbox="allow-popups allow-popups-to-escape-sandbox"
								className="h-full w-full border-0 bg-white"
								onMouseEnter={() => setIsPointerOverMessageFrame(true)}
								onMouseLeave={() => {
									setIsPointerOverMessageFrame(false);
									setHoveredLinkUrl('');
								}}
							/>
						)}
						{!loading && !iframeSrcDoc && (
							<div className="h-full overflow-auto bg-white p-4 text-slate-900">
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
						className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
						<div className="overflow-x-auto overflow-y-hidden">
							<div className="flex min-w-full w-max gap-2 pb-1">
								{attachments.map((attachment, index) => (
									<button
										key={`${attachment.filename || 'attachment'}-${index}`}
										type="button"
										className="group flex w-[17rem] shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white p-2 text-left text-xs text-slate-700 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-200"
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
											className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-slate-100 text-slate-500 dark:border-[#3a3d44] dark:bg-[#2a2d31] dark:text-slate-300">
											<Paperclip size={15}/>
										</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate font-medium">
												{attachment.filename || 'Attachment'}
											</span>
											<span
												className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
												{attachment.contentType || 'FILE'}
												{typeof attachment.size === 'number'
													? ` • ${formatBytes(attachment.size)}`
													: ''}
											</span>
										</span>
									</button>
								))}
							</div>
						</div>
					</div>
				)}
				{isPointerOverMessageFrame && Boolean(hoveredLinkUrl) && (
					<div
						className="pointer-events-none fixed bottom-3 left-3 z-[1210] max-w-[min(60vw,56rem)] rounded-md border border-slate-300 bg-white/95 px-2.5 py-1.5 text-xs text-slate-700 shadow-md backdrop-blur dark:border-[#3a3d44] dark:bg-[#1f2125]/95 dark:text-slate-200">
						<span className="block truncate">{hoveredLinkUrl}</span>
					</div>
				)}
				{attachmentMenu && (
					<div
						className="fixed z-[1100] min-w-44 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
						style={{
							left: clampToViewport(attachmentMenu.x, 184, window.innerWidth),
							top: clampToViewport(attachmentMenu.y, 108, window.innerHeight),
						}}
						onClick={(event) => event.stopPropagation()}
					>
						<button
							className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
							onClick={() => {
								if (!message) return;
								void ipcClient
									.openMessageAttachment(message.id, attachmentMenu.index, 'open')
									.catch(() => undefined);
								setAttachmentMenu(null);
							}}
						>
							Open
						</button>
						<button
							className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
							onClick={() => {
								if (!message) return;
								void ipcClient
									.openMessageAttachment(message.id, attachmentMenu.index, 'save')
									.catch(() => undefined);
								setAttachmentMenu(null);
							}}
						>
							Save As...
						</button>
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
							className="flex h-full max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-[#3a3d44] dark:bg-[#1f2125]"
							onClick={(event) => event.stopPropagation()}
						>
							<div
								className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-[#3a3d44]">
								<h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
									Message source
								</h2>
								<button
									type="button"
									className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
									onClick={() => setShowSourceModal(false)}
								>
									Close
								</button>
							</div>
							<div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-3 dark:bg-[#181a1f]">
								{sourceLoading && (
									<p className="text-sm text-slate-500 dark:text-slate-400">
										Loading message source...
									</p>
								)}
								{!sourceLoading && sourceError && (
									<p className="text-sm text-red-700 dark:text-red-300">
										Failed to load source: {sourceError}
									</p>
								)}
								{!sourceLoading && !sourceError && (
									<pre
										className="select-text whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white p-3 font-mono text-xs leading-5 text-slate-900 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-100">
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
