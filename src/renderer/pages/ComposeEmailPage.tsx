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
import type {AppSettings, ComposeDraftPayload, PublicAccount} from '../../preload/index';
import MarkdownLexicalEditor from '../components/MarkdownLexicalEditor';

type ComposeAttachment = {
    id: string;
    path: string;
    filename: string;
    contentType: string | null;
    size: number | null;
};

function ComposeEmailPage() {
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

    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const applyTheme = (settings?: AppSettings | null) => {
            const theme = settings?.theme ?? 'system';
            const useDark = theme === 'dark' || (theme === 'system' && media.matches);
            document.documentElement.classList.toggle('dark', useDark);
            document.body.classList.toggle('dark', useDark);
        };

        window.electronAPI.getAppSettings().then((settings) => applyTheme(settings)).catch(() => applyTheme(null));
        const off = window.electronAPI.onAppSettingsUpdated?.((settings) => applyTheme(settings));
        const onChange = () => window.electronAPI.getAppSettings().then((settings) => applyTheme(settings)).catch(() => applyTheme(null));
        media.addEventListener('change', onChange);
        return () => {
            if (typeof off === 'function') off();
            media.removeEventListener('change', onChange);
        };
    }, []);

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
            if (typeof draft.subject === 'string') setSubject(draft.subject);
            if (typeof draft.body === 'string') {
                setBody(draft.body);
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
        };
    }, [fromAccountId, toList, ccList, bccList, subject, body, plainBody, threadMeta.inReplyTo, threadMeta.references, attachments]);

    useEffect(() => {
        if (!draftPayload || sending) return;
        const hasContent = Boolean(
            draftPayload.to ||
            draftPayload.cc ||
            draftPayload.bcc ||
            draftPayload.subject ||
            draftPayload.html ||
            draftPayload.text,
        );
        if (!hasContent) return;

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
                                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr]">
                                    <label className="block text-sm">
                                        <span
                                            className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Cc</span>
                                        <RecipientsInput
                                            placeholder="optional"
                                            recipients={ccList}
                                            onChange={setCcList}
                                        />
                                    </label>

                                    <label className="block text-sm">
                                        <span
                                            className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Bcc</span>
                                        <RecipientsInput
                                            placeholder="optional"
                                            recipients={bccList}
                                            onChange={setBccList}
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
                            <div className="relative h-full min-h-[280px]">
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

                        <footer
                            className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-[#3a3d44]">
                            <div className="flex min-w-0 flex-1 flex-col gap-2 pr-3">
                                <button
                                    className="inline-flex h-9 w-fit items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
                                    onClick={() => void onPickAttachments()}
                                    type="button"
                                >
                                    <Paperclip size={14} className="mr-2"/>
                                    Attach
                                </button>
                                {attachments.length > 0 && (
                                    <div className="flex max-h-32 min-w-0 flex-wrap gap-2 overflow-auto pr-1">
                                        {attachments.map((attachment) => (
                                            <AttachmentCard
                                                key={attachment.id}
                                                attachment={attachment}
                                                onRemove={() => removeAttachment(attachment.id)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    className="h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
                                    onClick={() => window.close()}
                                >
                                    Close
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
    return raw
        .split(/[;,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function joinRecipients(recipients: string[]): string {
    return recipients.join(', ');
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
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
                             className = '',
                         }: {
    recipients: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    className?: string;
}) {
    const [draft, setDraft] = useState('');

    const commitDraft = () => {
        const parsed = parseRecipients(draft);
        if (parsed.length === 0) return;
        const existing = new Set(recipients.map((r) => r.toLowerCase()));
        const next = [...recipients];
        for (const item of parsed) {
            const normalized = item.toLowerCase();
            if (!existing.has(normalized)) {
                next.push(item);
                existing.add(normalized);
            }
        }
        onChange(next);
        setDraft('');
    };

    const removeRecipient = (target: string) => {
        onChange(recipients.filter((r) => r !== target));
    };

    return (
        <div
            className={`flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 transition-colors focus-within:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-100 ${className}`}
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
                placeholder={recipients.length === 0 ? placeholder : ''}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={(e) => {
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
        </div>
    );
}
