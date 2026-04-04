import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    File,
    FileArchive,
    FileAudio2,
    FileCode,
    FileImage,
    FileSpreadsheet,
    FileText,
    FileVideo,
    Paperclip,
    PenSquare,
    SendHorizonal
} from 'lucide-react';
import type {ComposeDraftPayload, ContactItem, PublicAccount, RecentRecipientItem} from '../../preload/index';
import MarkdownLexicalEditor from '../components/MarkdownLexicalEditor';
import WindowTitleBar from '../components/WindowTitleBar';
import {formatBytes} from '../lib/format';
import {useAppTheme} from '../hooks/useAppTheme';

type ComposeAttachment = {
    id: string;
    path: string;
    filename: string;
    contentType: string | null;
    size: number | null;
};

type RecipientSuggestion = {
    key: string;
    email: string;
    displayName: string | null;
};

const EMAIL_ADDRESS_REGEX = /^[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[^\s@<>(),;:]+$/;

function ComposeEmailPage() {
    useAppTheme();
    const [accounts, setAccounts] = useState<PublicAccount[]>([]);
    const [fromAccountId, setFromAccountId] = useState<number | ''>('');
    const [toList, setToList] = useState<string[]>([]);
    const [ccList, setCcList] = useState<string[]>([]);
    const [bccList, setBccList] = useState<string[]>([]);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [plainBody, setPlainBody] = useState('');
    const [threadMeta, setThreadMeta] = useState<{
        inReplyTo?: string | null;
        references?: string[] | string | null
    }>({});
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [showCcBcc, setShowCcBcc] = useState(false);
    const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedSignatureRef = useRef<string>('');
    const draftSessionIdRef = useRef<string>(`draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

    useEffect(() => {
        let active = true;
        window.electronAPI
            .getAccounts()
            .then((rows) => {
                if (!active) return;
                setAccounts(rows);
                setFromAccountId((prev) => prev || rows[0]?.id || '');
            })
            .catch(() => {
                if (!active) return;
                setAccounts([]);
                setFromAccountId('');
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const applyDraft = (draft: ComposeDraftPayload | null | undefined) => {
            if (!draft) return;
            if (typeof draft.accountId === 'number') setFromAccountId(draft.accountId);
            if (typeof draft.to === 'string') setToList(parseRecipients(draft.to));
            if (typeof draft.cc === 'string') {
                const parsedCc = parseRecipients(draft.cc);
                setCcList(parsedCc);
                if (draft.cc.trim()) setShowCcBcc(true);
            }
            if (typeof draft.bcc === 'string') {
                const parsedBcc = parseRecipients(draft.bcc);
                setBccList(parsedBcc);
                if (draft.bcc.trim()) setShowCcBcc(true);
            }
            if (typeof draft.subject === 'string') setSubject(draft.subject);
            if (typeof draft.bodyHtml === 'string') {
                setBody(draft.bodyHtml);
            } else if (typeof draft.body === 'string') {
                setBody(draft.body);
            }
            if (typeof draft.bodyText === 'string') {
                setPlainBody(draft.bodyText);
            } else if (typeof draft.body === 'string') {
                setPlainBody(draft.body);
            }
            setThreadMeta({
                inReplyTo: draft.inReplyTo ?? null,
                references: draft.references ?? null,
            });
        };

        window.electronAPI.getComposeDraft?.()
            .then((draft) => applyDraft(draft))
            .catch(() => undefined);
        const off = window.electronAPI.onComposeDraft?.((draft) => applyDraft(draft));
        return () => {
            if (typeof off === 'function') off();
        };
    }, []);

    const words = useMemo(() => plainBody.trim().split(/\s+/).filter(Boolean).length, [plainBody]);
    const draftPayload = useMemo(() => {
        if (!fromAccountId) return null;
        return {
            accountId: Number(fromAccountId),
            to: toList.length ? joinRecipients(toList) : null,
            cc: ccList.length ? joinRecipients(ccList) : null,
            bcc: bccList.length ? joinRecipients(bccList) : null,
            subject: subject.trim() || null,
            html: body.trim() || null,
            text: plainBody.trim() || null,
            inReplyTo: threadMeta.inReplyTo ?? null,
            references: threadMeta.references ?? null,
            attachments: attachments.length
                ? attachments.map((attachment) => ({
                    path: attachment.path,
                    filename: attachment.filename,
                    contentType: attachment.contentType,
                }))
                : null,
            draftSessionId: draftSessionIdRef.current,
        };
    }, [fromAccountId, toList, ccList, bccList, subject, body, plainBody, threadMeta.inReplyTo, threadMeta.references, attachments]);

    useEffect(() => {
        if (!draftPayload || sending) return;
        const hasRecipient = Boolean((draftPayload.to || '').trim());
        const hasBody = Boolean((draftPayload.text || draftPayload.html || '').trim());
        if (!hasRecipient || !hasBody) return;

        const signature = JSON.stringify(draftPayload);
        if (signature === lastSavedSignatureRef.current) return;

        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
        }
        autosaveTimerRef.current = setTimeout(() => {
            const payload = draftPayload;
            const currentSignature = signature;
            void window.electronAPI
                .saveDraft(payload)
                .then(() => {
                    lastSavedSignatureRef.current = currentSignature;
                    setStatus((prev) => (prev?.startsWith('Send failed:') ? prev : 'Draft saved'));
                })
                .catch((e: any) => {
                    setStatus((prev) => (prev?.startsWith('Sending') ? prev : `Draft save failed: ${e?.message || String(e)}`));
                });
        }, 1200);

        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
        };
    }, [draftPayload, sending]);

    async function onSend() {
        if (sending) return;
        if (!fromAccountId) {
            setStatus('Select a sender account first.');
            return;
        }
        if (toList.length === 0) {
            setStatus('Recipient is required.');
            return;
        }
        const invalidAddresses = [...toList, ...ccList, ...bccList].filter((entry) => !normalizeRecipientAddress(entry));
        if (invalidAddresses.length > 0) {
            setStatus(`Invalid address: ${invalidAddresses[0]}`);
            return;
        }

        setSending(true);
        setStatus('Sending...');
        try {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
            const res = await window.electronAPI.sendEmail({
                accountId: Number(fromAccountId),
                to: joinRecipients(toList),
                cc: ccList.length ? joinRecipients(ccList) : null,
                bcc: bccList.length ? joinRecipients(bccList) : null,
                subject: subject || null,
                html: body || null,
                text: plainBody || '',
                inReplyTo: threadMeta.inReplyTo ?? null,
                references: threadMeta.references ?? null,
                attachments: attachments.length
                    ? attachments.map((attachment) => ({
                        path: attachment.path,
                        filename: attachment.filename,
                        contentType: attachment.contentType,
                    }))
                    : null,
                draftSessionId: draftSessionIdRef.current,
            });
            setStatus(`Sent (${res.messageId})`);
            setTimeout(() => {
                window.close();
            }, 600);
        } catch (e: any) {
            setStatus(`Send failed: ${e?.message || String(e)}`);
        } finally {
            setSending(false);
        }
    }

    function appendAttachments(next: ComposeAttachment[]) {
        if (!next.length) return;
        setAttachments((prev) => {
            const seen = new Set(prev.map((attachment) => attachment.id));
            const merged = [...prev];
            for (const row of next) {
                if (seen.has(row.id)) continue;
                merged.push(row);
                seen.add(row.id);
            }
            return merged;
        });
    }

    function onFallbackInputChange(event: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files ?? []);
        const next: ComposeAttachment[] = files
            .map((file) => {
                const filePath = String((file as any).path || '').trim();
                if (!filePath) return null;
                return {
                    id: filePath,
                    path: filePath,
                    filename: file.name || 'attachment',
                    contentType: file.type || null,
                    size: Number.isFinite(file.size) ? file.size : null,
                };
            })
            .filter((item): item is ComposeAttachment => Boolean(item));
        appendAttachments(next);
        event.target.value = '';
    }

    async function onPickAttachments() {
        try {
            if (typeof window.electronAPI.pickComposeAttachments !== 'function') {
                fileInputRef.current?.click();
                return;
            }
            const picked = await window.electronAPI.pickComposeAttachments();
            if (!picked.length) return;
            const next: ComposeAttachment[] = picked.map((item) => ({
                id: item.path,
                path: item.path,
                filename: item.filename || 'attachment',
                contentType: item.contentType || null,
                size: null,
            }));
            appendAttachments(next);
        } catch (e: any) {
            fileInputRef.current?.click();
            setStatus(`Attachment picker failed: ${e?.message || String(e)}`);
        }
    }

    function removeAttachment(id: string) {
        setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
    }

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
            <div className="flex h-full flex-col">
                <WindowTitleBar title="Compose Email"/>
                <header
                    className="border-b border-slate-200 bg-white/90 px-5 py-3 backdrop-blur dark:border-[#3a3d44] dark:bg-[#1f2125]/95">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow">
                                <PenSquare size={16}/>
                            </div>
                            <div>
                                <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Compose</h1>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{status || 'New message'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>{words} words</span>
                            <span
                                className="rounded-full border border-slate-300 px-2 py-0.5 dark:border-[#3a3d44]">Draft</span>
                        </div>
                    </div>
                </header>

                <div className="min-h-0 flex-1">
                    <div className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-[#313338]">
                        <div className="border-b border-slate-200 px-5 py-4 dark:border-[#3a3d44]">
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr]">
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">From</span>
                                    <select
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-100"
                                        value={fromAccountId}
                                        onChange={(e) => setFromAccountId(e.target.value ? Number(e.target.value) : '')}
                                    >
                                        {accounts.length === 0 && <option value="">No accounts</option>}
                                        {accounts.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.email}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">To</span>
                                    <div className="flex gap-2">
                                        <RecipientsInput
                                            placeholder="recipient@example.com"
                                            recipients={toList}
                                            onChange={setToList}
                                            accountId={typeof fromAccountId === 'number' ? fromAccountId : null}
                                            blockedRecipients={[...ccList, ...bccList]}
                                            className="min-h-10 min-w-0 flex-1"
                                        />
                                        <button
                                            type="button"
                                            className="h-10 shrink-0 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-300 dark:hover:bg-[#3a3d44]"
                                            onClick={() => setShowCcBcc((prev) => !prev)}
                                        >
                                            {showCcBcc ? 'Hide Cc/Bcc' : 'Cc/Bcc'}
                                        </button>
                                    </div>
                                </label>
                            </div>

                            {showCcBcc && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <label className="block min-w-0 text-sm">
                                        <span
                                            className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Cc</span>
                                        <RecipientsInput
                                            placeholder="optional"
                                            recipients={ccList}
                                            onChange={setCcList}
                                            accountId={typeof fromAccountId === 'number' ? fromAccountId : null}
                                            blockedRecipients={[...toList, ...bccList]}
                                        />
                                    </label>

                                    <label className="block min-w-0 text-sm">
                                        <span
                                            className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Bcc</span>
                                        <RecipientsInput
                                            placeholder="optional"
                                            recipients={bccList}
                                            onChange={setBccList}
                                            accountId={typeof fromAccountId === 'number' ? fromAccountId : null}
                                            blockedRecipients={[...toList, ...ccList]}
                                        />
                                    </label>
                                </div>
                            )}

                            <div className="mt-2">
                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Subject</span>
                                    <input
                                        placeholder="Add a subject"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-100"
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 p-5">
                            <div className="relative h-full">
                                <MarkdownLexicalEditor
                                    value={body}
                                    placeholder="Write your message..."
                                    onChange={(html, plainText) => {
                                        setBody(html);
                                        setPlainBody(plainText);
                                    }}
                                />
                            </div>
                        </div>

                        <footer className="border-t border-slate-200 px-5 py-3 dark:border-[#3a3d44]">
                            {attachments.length > 0 && (
                                <div className="mb-3 overflow-x-auto overflow-y-hidden pr-1">
                                    <div className="flex min-w-full w-max gap-2 pb-1">
                                        {attachments.map((attachment) => (
                                            <AttachmentCard
                                                key={attachment.id}
                                                attachment={attachment}
                                                onRemove={() => removeAttachment(attachment.id)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-2">
                                <button
                                    className="inline-flex h-9 w-fit items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
                                    onClick={() => void onPickAttachments()}
                                    type="button"
                                >
                                    <Paperclip size={14} className="mr-2"/>
                                    Attach
                                </button>
                                <button
                                    className="inline-flex h-9 items-center rounded-md bg-gradient-to-r from-sky-600 to-indigo-600 px-3 text-sm font-medium text-white transition-all hover:brightness-110 dark:from-[#5865f2] dark:to-[#4f5bd5]"
                                    onClick={() => void onSend()}
                                    disabled={sending}
                                >
                                    <SendHorizonal size={14} className="mr-2"/>
                                    {sending ? 'Sending...' : 'Send'}
                                </button>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={onFallbackInputChange}
                            />
                        </footer>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ComposeEmailPage;

function parseRecipients(raw: string): string[] {
    return parseRecipientEntries(raw).valid;
}

function joinRecipients(recipients: string[]): string {
    return recipients.join(', ');
}

function AttachmentCard({
                            attachment,
                            onRemove,
                        }: {
    attachment: ComposeAttachment;
    onRemove: () => void;
}) {
    const isImage = isImageAttachment(attachment.filename, attachment.contentType);
    const [imageFailed, setImageFailed] = useState(false);

    return (
        <div
            className="group relative flex w-[17rem] items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-700 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-200">
            <div
                className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-300 bg-white dark:border-[#3a3d44] dark:bg-[#2a2d31]">
                {isImage && !imageFailed ? (
                    <img
                        src={toFileUrl(attachment.path)}
                        alt={attachment.filename}
                        className="h-full w-full object-cover"
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-500 dark:text-slate-300">
                        {renderAttachmentTypeIcon(attachment.filename, attachment.contentType)}
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{attachment.filename}</p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {attachment.contentType || fileExtensionLabel(attachment.filename)}
                    {typeof attachment.size === 'number' ? ` • ${formatBytes(attachment.size)}` : ''}
                </p>
            </div>
            <button
                type="button"
                className="rounded p-1 text-slate-500 opacity-80 transition hover:bg-slate-200 hover:text-slate-900 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-[#35373c] dark:hover:text-white"
                onClick={onRemove}
                aria-label={`Remove ${attachment.filename}`}
                title="Remove attachment"
            >
                x
            </button>
        </div>
    );
}

function isImageAttachment(filename: string, contentType: string | null): boolean {
    const type = (contentType || '').toLowerCase();
    if (type.startsWith('image/')) return true;
    const ext = (filename.split('.').pop() || '').toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext);
}

function toFileUrl(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.startsWith('/')) return `file://${encodeURI(normalized)}`;
    return `file:///${encodeURI(normalized)}`;
}

function fileExtensionLabel(filename: string): string {
    const ext = (filename.split('.').pop() || '').toUpperCase();
    return ext || 'FILE';
}

function renderAttachmentTypeIcon(filename: string, contentType: string | null): React.ReactNode {
    const type = (contentType || '').toLowerCase();
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) return <FileImage
        size={16}/>;
    if (type.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return <FileVideo size={16}/>;
    if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return <FileAudio2 size={16}/>;
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return <FileArchive size={16}/>;
    if (['csv', 'xls', 'xlsx', 'ods'].includes(ext)) return <FileSpreadsheet size={16}/>;
    if (['txt', 'md', 'rtf', 'doc', 'docx', 'pdf'].includes(ext) || type.startsWith('text/')) return <FileText
        size={16}/>;
    if (['json', 'xml', 'yml', 'yaml', 'js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h'].includes(ext)) return <FileCode
        size={16}/>;
    return <File size={16}/>;
}

function RecipientsInput({
                             recipients,
                             onChange,
                             placeholder,
                             accountId,
                             blockedRecipients = [],
                             className = '',
                         }: {
    recipients: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    accountId?: number | null;
    blockedRecipients?: string[];
    className?: string;
}) {
    const [draft, setDraft] = useState('');
    const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
    const searchSeqRef = useRef(0);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const query = draft.trim();
        if (!accountId || query.length < 1) {
            setSuggestions([]);
            setShowSuggestions(false);
            setActiveSuggestionIndex(0);
            return;
        }

        const seq = ++searchSeqRef.current;
        const timer = setTimeout(() => {
            const recentRecipientsPromise = typeof window.electronAPI.getRecentRecipients === 'function'
                ? window.electronAPI.getRecentRecipients(accountId, query, 12)
                : Promise.resolve([]);
            Promise.all([
                window.electronAPI.getContacts(accountId, query, 12, null),
                recentRecipientsPromise,
            ]).then(([contacts, recentRecipients]) => {
                if (seq !== searchSeqRef.current) return;
                const existing = new Set(
                    [...recipients, ...blockedRecipients]
                        .map((entry) => normalizeRecipientAddress(entry))
                        .filter((entry): entry is string => Boolean(entry)),
                );
                const merged = mergeRecipientSuggestions(contacts, recentRecipients, existing, 12);
                setSuggestions(merged);
                setShowSuggestions(merged.length > 0);
                setActiveSuggestionIndex(0);
            }).catch(() => {
                if (seq !== searchSeqRef.current) return;
                setSuggestions([]);
                setShowSuggestions(false);
                setActiveSuggestionIndex(0);
            });
        }, 120);

        return () => {
            clearTimeout(timer);
        };
    }, [accountId, blockedRecipients, draft, recipients]);

    const commitDraft = () => {
        const parsed = parseRecipientEntries(draft);
        const existing = new Set(
            [...recipients, ...blockedRecipients]
                .map((entry) => normalizeRecipientAddress(entry))
                .filter((entry): entry is string => Boolean(entry)),
        );
        const next = [...recipients];
        for (const item of parsed.valid) {
            if (!existing.has(item)) {
                next.push(item);
                existing.add(item);
            }
        }
        if (next.length !== recipients.length) {
            onChange(next);
        }
        if (parsed.invalid.length > 0) {
            setInvalidMessage(`Invalid address: ${parsed.invalid[0]}`);
        } else {
            setInvalidMessage(null);
        }
        setDraft('');
        setShowSuggestions(false);
    };

    const removeRecipient = (target: string) => {
        onChange(recipients.filter((r) => r !== target));
    };

    const applySuggestion = (suggestion: RecipientSuggestion) => {
        const email = normalizeRecipientAddress(suggestion.email);
        if (!email) return;
        if ([...recipients, ...blockedRecipients].some((entry) => normalizeRecipientAddress(entry) === email)) {
            setDraft('');
            setShowSuggestions(false);
            return;
        }
        onChange([...recipients, email]);
        setInvalidMessage(null);
        setDraft('');
        setShowSuggestions(false);
        setSuggestions([]);
        setActiveSuggestionIndex(0);
        inputRef.current?.focus();
    };

    return (
        <div
            className={`relative flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 transition-colors focus-within:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-100 ${className}`}
            onClick={(event) => {
                const container = event.currentTarget;
                const input = container.querySelector('input');
                input?.focus();
            }}
        >
            {recipients.map((recipient) => (
                <span
                    key={recipient}
                    className="inline-flex max-w-full items-center gap-1 rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-800 dark:bg-[#35373c] dark:text-slate-100"
                >
          <span className="truncate">{recipient}</span>
          <button
              type="button"
              className="text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              onClick={(e) => {
                  e.stopPropagation();
                  removeRecipient(recipient);
              }}
              aria-label={`Remove ${recipient}`}
              title="Remove"
          >
            x
          </button>
        </span>
            ))}
            <input
                ref={inputRef}
                placeholder={recipients.length === 0 ? placeholder : ''}
                value={draft}
                onChange={(e) => {
                    setDraft(e.target.value);
                    if (invalidMessage) setInvalidMessage(null);
                    if (!showSuggestions) setShowSuggestions(true);
                }}
                onBlur={() => {
                    setTimeout(() => {
                        commitDraft();
                    }, 60);
                }}
                onKeyDown={(e) => {
                    const trimmedDraft = draft.trim();
                    if (showSuggestions && suggestions.length > 0) {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length);
                            return;
                        }
                        if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActiveSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                            return;
                        }
                        if ((e.key === 'Enter' || e.key === 'Tab') && trimmedDraft.length > 0) {
                            e.preventDefault();
                            applySuggestion(suggestions[activeSuggestionIndex] ?? suggestions[0]);
                            return;
                        }
                    }
                    if (e.key === 'Tab' && trimmedDraft.length === 0) {
                        return;
                    }
                    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',' || e.key === ' ') {
                        e.preventDefault();
                        commitDraft();
                        return;
                    }
                    if (e.key === 'Backspace' && !draft && recipients.length > 0) {
                        onChange(recipients.slice(0, -1));
                    }
                }}
                className="h-7 min-w-[180px] flex-1 border-0 bg-transparent px-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {invalidMessage && (
                <div className="w-full pl-1 text-[11px] text-rose-600 dark:text-rose-400">{invalidMessage}</div>
            )}
            {showSuggestions && suggestions.length > 0 && (
                <div
                    className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-56 w-full overflow-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg dark:border-[#3a3d44] dark:bg-[#1f2125]"
                >
                    {suggestions.map((contact, index) => (
                        <button
                            key={contact.key}
                            type="button"
                            className={`block w-full px-2 py-1.5 text-left transition-colors ${
                                index === activeSuggestionIndex
                                    ? 'bg-sky-100 text-slate-900 dark:bg-[#3d4153] dark:text-slate-100'
                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]'
                            }`}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                applySuggestion(contact);
                            }}
                        >
                            <div className="truncate text-sm">{contact.displayName || contact.email}</div>
                            {contact.displayName && (
                                <div
                                    className="truncate text-xs text-slate-500 dark:text-slate-400">{contact.email}</div>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function parseRecipientEntries(raw: string): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];
    const deduped = new Set<string>();
    for (const chunk of raw.split(/[;,]+/)) {
        const normalized = normalizeRecipientAddress(chunk);
        if (!normalized) {
            const trimmed = chunk.trim();
            if (trimmed) invalid.push(trimmed);
            continue;
        }
        if (deduped.has(normalized)) continue;
        deduped.add(normalized);
        valid.push(normalized);
    }
    return {valid, invalid};
}

function normalizeRecipientAddress(raw: string | null | undefined): string | null {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    const angleMatch = trimmed.match(/<([^<>]+)>/);
    const candidate = (angleMatch?.[1] || trimmed).trim().replace(/^"+|"+$/g, '');
    const normalized = candidate.toLowerCase();
    return EMAIL_ADDRESS_REGEX.test(normalized) ? normalized : null;
}

function mergeRecipientSuggestions(
    contacts: ContactItem[],
    recentRecipients: RecentRecipientItem[],
    existingEmails: Set<string>,
    limit: number,
): RecipientSuggestion[] {
    const deduped = new Map<string, RecipientSuggestion>();

    for (const contact of contacts) {
        const email = normalizeRecipientAddress(contact.email);
        if (!email || existingEmails.has(email) || deduped.has(email)) continue;
        deduped.set(email, {
            key: `contact:${contact.id}`,
            email,
            displayName: contact.full_name || null,
        });
        if (deduped.size >= limit) return Array.from(deduped.values());
    }

    for (const row of recentRecipients) {
        const email = normalizeRecipientAddress(row.email);
        if (!email || existingEmails.has(email) || deduped.has(email)) continue;
        deduped.set(email, {
            key: `recent:${email}`,
            email,
            displayName: row.display_name || null,
        });
        if (deduped.size >= limit) break;
    }

    return Array.from(deduped.values());
}
