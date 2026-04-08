import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    ChevronRight,
    Cloud,
    File,
    FileArchive,
    FileAudio2,
    Folder,
    FileCode,
    FileImage,
    FileSpreadsheet,
    FileText,
    FileVideo,
    Home,
    Loader2,
    Paperclip,
    PenSquare,
    RefreshCw,
    SendHorizonal,
} from 'lucide-react';
import type {CloudItem, ComposeDraftPayload, ContactItem, PublicAccount, PublicCloudAccount, RecentRecipientItem} from '../../preload/index';
import MarkdownLexicalEditor from '../components/MarkdownLexicalEditor';
import WindowTitleBar from '../components/WindowTitleBar';
import {formatSystemDateTime} from '../lib/dateTime';
import {formatBytes} from '../lib/format';
import {useAppTheme} from '../hooks/useAppTheme';
import {useIpcEvent} from '../hooks/ipc/useIpcEvent';
import {ipcClient} from '../lib/ipcClient';

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
const CLOUD_FOLDER_CACHE_PREFIX = 'lunamail.cloud.folder.cache.v1';
const CONTACT_META_PREFIX = '[LUNAMAIL_CONTACT_META_V1]';

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
        references?: string[] | string | null;
    }>({});
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [showCcBcc, setShowCcBcc] = useState(false);
    const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
    const [showCloudPicker, setShowCloudPicker] = useState(false);
    const [cloudAccounts, setCloudAccounts] = useState<PublicCloudAccount[]>([]);
    const [cloudAccountId, setCloudAccountId] = useState<number | ''>('');
    const [cloudPath, setCloudPath] = useState<string | null>(null);
    const [cloudItems, setCloudItems] = useState<CloudItem[]>([]);
    const [cloudLoading, setCloudLoading] = useState(false);
    const [cloudAttaching, setCloudAttaching] = useState(false);
    const [cloudStatus, setCloudStatus] = useState<string | null>(null);
    const [cloudFilesCache, setCloudFilesCache] = useState<Record<string, CloudItem[]>>({});
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const cloudFilesCacheRef = useRef<Record<string, CloudItem[]>>({});
    const cloudRequestSeqRef = useRef(0);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedSignatureRef = useRef<string>('');
    const draftSessionIdRef = useRef<string>(`draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

    useEffect(() => {
        let active = true;
        ipcClient
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

    const applyDraft = useCallback((draft: ComposeDraftPayload | null | undefined) => {
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
    }, []);

    useEffect(() => {
        ipcClient
            .getComposeDraft()
            .then((draft) => applyDraft(draft))
            .catch(() => undefined);
    }, [applyDraft]);

    useIpcEvent(ipcClient.onComposeDraft, (draft) => {
        applyDraft(draft);
    });

    useEffect(() => {
        cloudFilesCacheRef.current = cloudFilesCache;
    }, [cloudFilesCache]);

    const selectedCloudAccount = useMemo(
        () => (typeof cloudAccountId === 'number' ? cloudAccounts.find((account) => account.id === cloudAccountId) ?? null : null),
        [cloudAccountId, cloudAccounts],
    );
    const selectedCloudProvider = selectedCloudAccount?.provider ?? 'webdav';

    const loadCloudItems = useCallback(async (
        selectedAccountId: number,
        nextPath: string | null,
        options?: { force?: boolean },
    ) => {
        const selectedCloudAccount = cloudAccounts.find((account) => account.id === selectedAccountId);
        const provider = selectedCloudAccount?.provider ?? 'webdav';
        const requestedPath = normalizeRequestedCloudPath(nextPath, provider);
        const folderToken = normalizeCloudFolderToken(requestedPath, provider);
        const cacheKey = `${selectedAccountId}:${folderToken}`;
        const memoryCached = cloudFilesCacheRef.current[cacheKey];
        const persistedCached = memoryCached || readPersistedCloudFolderCache(selectedAccountId, folderToken);
        const forceReload = Boolean(options?.force);
        if (persistedCached && !forceReload) {
            if (!memoryCached) {
                setCloudFilesCache((prev) => ({...prev, [cacheKey]: persistedCached}));
            }
            setCloudPath(requestedPath);
            setCloudItems(sortCloudItemsForPicker(persistedCached));
        } else {
            setCloudPath(requestedPath);
            setCloudItems([]);
        }
        const requestSeq = ++cloudRequestSeqRef.current;
        setCloudLoading(true);
        setCloudStatus(forceReload ? 'Refreshing cloud files...' : null);
        try {
            const response = await ipcClient.listCloudItems(selectedAccountId, requestedPath);
            if (requestSeq !== cloudRequestSeqRef.current) return;
            const resolvedPath = response.path || requestedPath;
            const normalizedResolvedPath = normalizeRequestedCloudPath(resolvedPath, provider);
            setCloudPath(normalizedResolvedPath);
            const resolvedToken = normalizeCloudFolderToken(normalizedResolvedPath, provider);
            const resolvedKey = `${selectedAccountId}:${resolvedToken}`;
            const nextItems = sortCloudItemsForPicker(response.items ?? []);
            setCloudItems(nextItems);
            setCloudFilesCache((prev) => ({...prev, [resolvedKey]: nextItems}));
            writePersistedCloudFolderCache(selectedAccountId, resolvedToken, nextItems);
            setCloudStatus(null);
        } catch (e: any) {
            if (requestSeq !== cloudRequestSeqRef.current) return;
            setCloudStatus(`Cloud browser failed: ${e?.message || String(e)}`);
            if (!persistedCached || forceReload) {
                setCloudItems([]);
            }
        } finally {
            if (requestSeq === cloudRequestSeqRef.current) {
                setCloudLoading(false);
            }
        }
    }, [cloudAccounts]);

    const openCloudAttachmentPicker = useCallback(async () => {
        setCloudStatus(null);
        setShowCloudPicker(true);
        try {
            const rows = await ipcClient.getCloudAccounts();
            setCloudAccounts(rows);
            if (!rows.length) {
                setCloudAccountId('');
                setCloudItems([]);
                setCloudPath(null);
                return;
            }
            const initialAccountId = typeof cloudAccountId === 'number' && rows.some((row) => row.id === cloudAccountId)
                ? cloudAccountId
                : rows[0].id;
            setCloudAccountId(initialAccountId);
            const initialAccount = rows.find((row) => row.id === initialAccountId) ?? null;
            void loadCloudItems(initialAccountId, cloudRootToken(initialAccount?.provider ?? 'webdav'));
        } catch (e: any) {
            setCloudStatus(`Failed to load cloud accounts: ${e?.message || String(e)}`);
            setCloudAccounts([]);
            setCloudAccountId('');
            setCloudItems([]);
            setCloudPath(null);
        }
    }, [cloudAccountId, loadCloudItems]);

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
    }, [
        fromAccountId,
        toList,
        ccList,
        bccList,
        subject,
        body,
        plainBody,
        threadMeta.inReplyTo,
        threadMeta.references,
        attachments,
    ]);

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
            void ipcClient
                .saveDraft(payload)
                .then(() => {
                    lastSavedSignatureRef.current = currentSignature;
                    setStatus((prev) => (prev?.startsWith('Send failed:') ? prev : 'Draft saved'));
                })
                .catch((e: any) => {
                    setStatus((prev) =>
                        prev?.startsWith('Sending') ? prev : `Draft save failed: ${e?.message || String(e)}`,
                    );
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
        const invalidAddresses = [...toList, ...ccList, ...bccList].filter(
            (entry) => !normalizeRecipientAddress(entry),
        );
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
            const res = await ipcClient.sendEmail({
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
            const picked = await ipcClient.pickComposeAttachments();
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

    async function onCloudAccountChange(nextAccountIdRaw: string) {
        const nextAccountId = Number(nextAccountIdRaw);
        if (!Number.isInteger(nextAccountId) || nextAccountId <= 0) {
            setCloudAccountId('');
            setCloudPath(null);
            setCloudItems([]);
            return;
        }
        setCloudAccountId(nextAccountId);
        const selectedCloudAccount = cloudAccounts.find((account) => account.id === nextAccountId) ?? null;
        await loadCloudItems(nextAccountId, cloudRootToken(selectedCloudAccount?.provider ?? 'webdav'));
    }

    async function onOpenCloudFolder(itemPathOrToken: string) {
        if (typeof cloudAccountId !== 'number') return;
        await loadCloudItems(cloudAccountId, itemPathOrToken);
    }

    async function onCloudGoUp() {
        if (typeof cloudAccountId !== 'number') return;
        const provider = selectedCloudProvider;
        const current = normalizeRequestedCloudPath(cloudPath, provider);
        const nextPath = getCloudParentPath(current, provider);
        await loadCloudItems(cloudAccountId, nextPath);
    }

    async function onCloudRefresh() {
        if (typeof cloudAccountId !== 'number') return;
        const provider = selectedCloudProvider;
        await loadCloudItems(cloudAccountId, normalizeRequestedCloudPath(cloudPath, provider), {force: true});
    }

    async function onAttachCloudItem(item: CloudItem) {
        if (typeof cloudAccountId !== 'number') return;
        try {
            setCloudAttaching(true);
            setCloudStatus(null);
            const picked = await ipcClient.pickCloudAttachment(cloudAccountId, item.path || item.id, item.name);
            appendAttachments([
                {
                    id: picked.path,
                    path: picked.path,
                    filename: picked.filename || item.name || 'attachment',
                    contentType: picked.contentType || null,
                    size: item.size ?? null,
                },
            ]);
            setShowCloudPicker(false);
        } catch (e: any) {
            setCloudStatus(`Cloud attachment failed: ${e?.message || String(e)}`);
        } finally {
            setCloudAttaching(false);
        }
    }

    function removeAttachment(id: string) {
        setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
    }

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
            <div className="flex h-full flex-col">
                <WindowTitleBar title="Compose Email" showMaximize/>
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
                            <span className="rounded-full border border-slate-300 px-2 py-0.5 dark:border-[#3a3d44]">
								Draft
							</span>
                        </div>
                    </div>
                </header>

                <div className="min-h-0 flex-1">
                    <div className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-[#313338]">
                        <div className="border-b border-slate-200 px-5 py-4 dark:border-[#3a3d44]">
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr]">
                                <label className="block text-sm">
									<span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
										From
									</span>
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
									<span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
										To
									</span>
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
                                            className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
											Cc
										</span>
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
                                            className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
											Bcc
										</span>
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
									<span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
										Subject
									</span>
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
                                <div className="flex items-center gap-2">
                                    <button
                                        className="inline-flex h-9 w-fit items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
                                        onClick={() => void onPickAttachments()}
                                        type="button"
                                    >
                                        <Paperclip size={14} className="mr-2"/>
                                        Attach
                                    </button>
                                    <button
                                        className="inline-flex h-9 w-fit items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
                                        onClick={() => void openCloudAttachmentPicker()}
                                        type="button"
                                    >
                                        <Cloud size={14} className="mr-2"/>
                                        Add file from cloud
                                    </button>
                                </div>
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
            {showCloudPicker && (
                <CloudAttachmentPickerModal
                    cloudAccounts={cloudAccounts}
                    selectedAccountId={cloudAccountId}
                    selectedProvider={selectedCloudProvider}
                    cloudPath={cloudPath}
                    cloudItems={cloudItems}
                    loading={cloudLoading}
                    busy={cloudLoading || cloudAttaching}
                    status={cloudStatus}
                    onClose={() => setShowCloudPicker(false)}
                    onAccountChange={(nextAccountId) => void onCloudAccountChange(nextAccountId)}
                    onNavigate={(nextPath) => void onOpenCloudFolder(nextPath)}
                    onUp={() => void onCloudGoUp()}
                    onRefresh={() => void onCloudRefresh()}
                    onAttach={(item) => void onAttachCloudItem(item)}
                />
            )}
        </div>
    );
}

export default ComposeEmailPage;

function CloudAttachmentPickerModal({
    cloudAccounts,
    selectedAccountId,
    selectedProvider,
    cloudPath,
    cloudItems,
    loading,
    busy,
    status,
    onClose,
    onAccountChange,
    onNavigate,
    onUp,
    onRefresh,
    onAttach,
}: {
    cloudAccounts: PublicCloudAccount[];
    selectedAccountId: number | '';
    selectedProvider: PublicCloudAccount['provider'];
    cloudPath: string | null;
    cloudItems: CloudItem[];
    loading: boolean;
    busy: boolean;
    status: string | null;
    onClose: () => void;
    onAccountChange: (value: string) => void;
    onNavigate: (path: string) => void;
    onUp: () => void;
    onRefresh: () => void;
    onAttach: (item: CloudItem) => void;
}) {
    const currentPath = normalizeRequestedCloudPath(cloudPath, selectedProvider);
    const rootPath = cloudRootToken(selectedProvider);
    const breadcrumbs = buildCloudBreadcrumbs(currentPath, selectedProvider);
    const isAtRoot = currentPath === rootPath;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-[#3a3d44] dark:bg-[#1f2125]">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-[#3a3d44]">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add file from cloud</h2>
                    <button
                        type="button"
                        className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#2a2d31]"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-2 border-b border-slate-200 px-4 py-3 dark:border-[#3a3d44] md:grid-cols-[280px_1fr_auto_auto_auto]">
                    <select
                        className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#2a2d31] dark:text-slate-100"
                        value={selectedAccountId}
                        onChange={(event) => onAccountChange(event.target.value)}
                    >
                        {cloudAccounts.length === 0 ? <option value="">No cloud accounts</option> : null}
                        {cloudAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                                {account.name}
                            </option>
                        ))}
                    </select>
                    <div className="flex h-9 min-w-0 items-center gap-1 overflow-x-auto rounded-md border border-slate-300 bg-slate-50 px-2 text-xs text-slate-600 dark:border-[#3a3d44] dark:bg-[#2a2d31] dark:text-slate-300">
                        {breadcrumbs.map((crumb, index) => (
                            <React.Fragment key={`${crumb.path}-${index}`}>
                                {index > 0 ? <ChevronRight size={12} className="shrink-0 opacity-70"/> : null}
                                <button
                                    type="button"
                                    className="shrink-0 rounded px-1 py-0.5 hover:bg-slate-200 dark:hover:bg-[#3a3d44]"
                                    title={crumb.path}
                                    onClick={() => onNavigate(crumb.path)}
                                    disabled={busy}
                                >
                                    {crumb.label}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="h-9 rounded-md border border-slate-300 px-3 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-300 dark:hover:bg-[#2a2d31]"
                        onClick={() => onNavigate(rootPath)}
                        disabled={busy || isAtRoot}
                        title="Go to root"
                    >
                        <span className="inline-flex items-center gap-1">
                            <Home size={12}/>
                            Root
                        </span>
                    </button>
                    <button
                        type="button"
                        className="h-9 rounded-md border border-slate-300 px-3 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-300 dark:hover:bg-[#2a2d31]"
                        onClick={onUp}
                        disabled={busy || isAtRoot}
                    >
                        Up
                    </button>
                    <button
                        type="button"
                        className="h-9 rounded-md border border-slate-300 px-3 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-300 dark:hover:bg-[#2a2d31]"
                        onClick={onRefresh}
                        disabled={busy || typeof selectedAccountId !== 'number'}
                    >
                        <span className="inline-flex items-center gap-1">
                            {loading ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>}
                            Refresh
                        </span>
                    </button>
                </div>

                <div className="min-h-[16rem] max-h-[24rem] overflow-y-auto">
                    {loading && cloudItems.length === 0 ? (
                        <div className="flex min-h-[16rem] items-center justify-center gap-2 px-2 py-3 text-sm text-slate-500 dark:text-slate-400">
                            <Loader2 size={16} className="animate-spin"/>
                            <span>Loading cloud files...</span>
                        </div>
                    ) : cloudAccounts.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-slate-500 dark:text-slate-400">
                            Add a cloud account in Cloud to attach files.
                        </p>
                    ) : cloudItems.length === 0 ? (
                        <div className="flex min-h-[16rem] items-center justify-center px-2 py-3 text-sm text-slate-500 dark:text-slate-400">
                            No files in this folder.
                        </div>
                    ) : (
                        <table className="table-fixed border-collapse text-sm" style={{width: '100%'}}>
                            <colgroup>
                                <col style={{width: '42%'}}/>
                                <col style={{width: '12%'}}/>
                                <col style={{width: '12%'}}/>
                                <col style={{width: '17%'}}/>
                                <col style={{width: '17%'}}/>
                                <col style={{width: '88px'}}/>
                            </colgroup>
                            <thead
                                className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:border-[#3a3d44] dark:bg-[#2f3138] dark:text-slate-300">
                            <tr className="text-left">
                                <th className="px-3 py-2">Name</th>
                                <th className="px-3 py-2">Type</th>
                                <th className="px-3 py-2">Size</th>
                                <th className="px-3 py-2">Modified</th>
                                <th className="px-3 py-2">Created</th>
                                <th className="px-2 py-2 text-right">Action</th>
                            </tr>
                            </thead>
                            <tbody>
                            {cloudItems.map((item) => (
                                <tr
                                    key={item.id || item.path}
                                    className="border-b border-slate-100 hover:bg-slate-50/80 dark:border-[#2b2d32] dark:hover:bg-[#25272c]"
                                >
                                    <td className="px-3 py-2">
                                        <button
                                            type="button"
                                            className="flex min-w-0 items-center gap-2 text-left text-slate-800 hover:underline dark:text-slate-100"
                                            onClick={() => (item.isFolder ? onNavigate(item.path || item.id) : onAttach(item))}
                                            disabled={busy}
                                        >
                                            <span className="shrink-0 text-slate-500 dark:text-slate-300">
                                                {renderCloudItemIcon(item)}
                                            </span>
                                            <span className="truncate">{item.name}</span>
                                        </button>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                                        {item.isFolder ? 'Folder' : cloudFileTypeLabel(item)}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                                        {item.isFolder ? '-' : formatBytes(item.size ?? 0)}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                                        {formatSystemDateTime(item.modifiedAt) || '-'}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                                        {formatSystemDateTime(item.createdAt) || '-'}
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                        {!item.isFolder && (
                                            <button
                                                type="button"
                                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                onClick={() => onAttach(item)}
                                                disabled={busy}
                                            >
                                                Attach
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {status && (
                    <div className="border-t border-slate-200 px-4 py-2 text-xs text-amber-600 dark:border-[#3a3d44] dark:text-amber-300">
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
}

function parseRecipients(raw: string): string[] {
    return parseRecipientEntries(raw).valid;
}

function joinRecipients(recipients: string[]): string {
    return recipients.join(', ');
}

function AttachmentCard({attachment, onRemove}: { attachment: ComposeAttachment; onRemove: () => void }) {
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
    if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext))
        return <FileImage size={16}/>;
    if (type.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return <FileVideo size={16}/>;
    if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext))
        return <FileAudio2 size={16}/>;
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return <FileArchive size={16}/>;
    if (['csv', 'xls', 'xlsx', 'ods'].includes(ext)) return <FileSpreadsheet size={16}/>;
    if (['txt', 'md', 'rtf', 'doc', 'docx', 'pdf'].includes(ext) || type.startsWith('text/'))
        return <FileText size={16}/>;
    if (
        ['json', 'xml', 'yml', 'yaml', 'js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h'].includes(
            ext,
        )
    )
        return <FileCode size={16}/>;
    return <File size={16}/>;
}

function renderCloudItemIcon(item: CloudItem): React.ReactNode {
    if (item.isFolder) return <Folder size={16}/>;
    return renderAttachmentTypeIcon(item.name, item.mimeType);
}

function cloudFileTypeLabel(item: CloudItem): string {
    const mimeType = (item.mimeType || '').trim();
    if (mimeType) return mimeType;
    return fileExtensionLabel(item.name);
}

function cloudRootToken(provider: PublicCloudAccount['provider']): string {
    if (provider === 'google-drive') return 'root';
    if (provider === 'onedrive') return 'scope:home';
    return '/';
}

function normalizeRequestedCloudPath(
    path: string | null | undefined,
    provider: PublicCloudAccount['provider'],
): string {
    const value = String(path || '').trim();
    return value || cloudRootToken(provider);
}

function normalizeCloudFolderToken(
    folderPath: string | null | undefined,
    provider: PublicCloudAccount['provider'],
): string {
    return normalizeRequestedCloudPath(folderPath, provider);
}

function getCloudParentPath(currentPath: string, provider: PublicCloudAccount['provider']): string {
    const root = cloudRootToken(provider);
    const normalized = normalizeRequestedCloudPath(currentPath, provider);
    if (normalized === root) return root;
    if (normalized.startsWith('/')) {
        const segments = normalized.split('/').filter(Boolean);
        if (segments.length <= 1) return root;
        return `/${segments.slice(0, -1).join('/')}`;
    }
    return root;
}

function buildCloudBreadcrumbs(
    currentPath: string,
    provider: PublicCloudAccount['provider'],
): Array<{ path: string; label: string }> {
    const root = cloudRootToken(provider);
    const normalized = normalizeRequestedCloudPath(currentPath, provider);
    if (!normalized.startsWith('/')) {
        const label = normalized === root ? 'Root' : normalized;
        return [{path: root, label}];
    }
    const segments = normalized.split('/').filter(Boolean);
    const crumbs: Array<{ path: string; label: string }> = [{path: root, label: 'Root'}];
    for (let index = 0; index < segments.length; index += 1) {
        crumbs.push({
            path: `/${segments.slice(0, index + 1).join('/')}`,
            label: decodeURIComponent(segments[index]),
        });
    }
    return crumbs;
}

function sortCloudItemsForPicker(items: CloudItem[]): CloudItem[] {
    return [...items].sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});
    });
}

function buildCloudFolderCacheStorageKey(accountId: number, folderToken: string): string {
    return `${CLOUD_FOLDER_CACHE_PREFIX}:${accountId}:${folderToken}`;
}

function readPersistedCloudFolderCache(accountId: number, folderToken: string): CloudItem[] | null {
    try {
        const raw = window.localStorage.getItem(buildCloudFolderCacheStorageKey(accountId, folderToken));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { items?: CloudItem[] };
        if (!Array.isArray(parsed.items)) return null;
        return parsed.items;
    } catch {
        return null;
    }
}

function writePersistedCloudFolderCache(accountId: number, folderToken: string, items: CloudItem[]): void {
    try {
        window.localStorage.setItem(
            buildCloudFolderCacheStorageKey(accountId, folderToken),
            JSON.stringify({updatedAt: Date.now(), items: items.slice(0, 500)}),
        );
    } catch {
        // Ignore cache persistence failures.
    }
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
            const recentRecipientsPromise = ipcClient.getRecentRecipients(accountId, query, 12);
            Promise.all([ipcClient.getContacts(accountId, query, 12, null), recentRecipientsPromise])
                .then(([contacts, recentRecipients]) => {
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
                })
                .catch(() => {
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
                    className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-56 w-full overflow-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg dark:border-[#3a3d44] dark:bg-[#1f2125]">
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
                                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                    {contact.email}
                                </div>
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
        const emails = extractContactEmails(contact);
        for (let index = 0; index < emails.length; index += 1) {
            const email = normalizeRecipientAddress(emails[index]);
            if (!email || existingEmails.has(email) || deduped.has(email)) continue;
            deduped.set(email, {
                key: `contact:${contact.id}:${index}`,
                email,
                displayName: contact.full_name || null,
            });
            if (deduped.size >= limit) return Array.from(deduped.values());
        }
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

function extractContactEmails(contact: ContactItem): string[] {
    const fromNote = parseContactMetaEmails(contact.note);
    const combined = [contact.email, ...fromNote].filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of combined) {
        const normalized = normalizeRecipientAddress(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}

function parseContactMetaEmails(note: string | null | undefined): string[] {
    const raw = String(note || '');
    const markerIndex = raw.lastIndexOf(CONTACT_META_PREFIX);
    if (markerIndex < 0) return [];
    const metaRaw = raw.slice(markerIndex + CONTACT_META_PREFIX.length).trim();
    if (!metaRaw) return [];
    try {
        const parsed = JSON.parse(metaRaw) as { emails?: string[] };
        if (!Array.isArray(parsed.emails)) return [];
        return parsed.emails.map((value) => String(value || '').trim()).filter(Boolean);
    } catch {
        return [];
    }
}
