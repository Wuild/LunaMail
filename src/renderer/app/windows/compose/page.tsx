import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    ChevronRight,
    Cloud,
    File,
    FileArchive,
    FileAudio2,
    FileCode,
    FileImage,
    FileSpreadsheet,
    FileText,
    FileVideo,
    Folder,
    Home,
    Loader2,
    Paperclip,
    PenSquare,
    RefreshCw,
    SendHorizonal,
    X,
} from 'lucide-react';
import type {
    CloudItem,
    ComposeDraftPayload,
    ContactItem,
    PublicAccount,
    PublicCloudAccount,
    RecentRecipientItem,
    SaveDraftPayload,
} from '@/preload';
import HtmlLexicalEditor from '@renderer/components/HtmlLexicalEditor';
import AutoComplete, {type AutoCompleteRow} from '@renderer/components/inputs/AutoComplete';
import {FormControlGroup, FormInput, FormSelect, type FormSelectOption} from '@renderer/components/ui/FormControls';
import {Modal} from '@renderer/components/ui/Modal';
import {Button, ButtonGroup} from '@renderer/components/ui/button';
import {formatSystemDateTime} from '@renderer/lib/dateTime';
import {formatBytes} from '@renderer/lib/format';
import {useAppTheme} from '@renderer/hooks/useAppTheme';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {ipcClient} from '@renderer/lib/ipcClient';
import {useApp} from '@renderer/app/AppContext';
import {getAccountAvatarColorsForAccount, getAccountMonogram} from '@renderer/lib/accountAvatar';
import {buildSourceDocCsp, enrichAnchorTitles} from '@renderer/features/mail/remoteContent';
import {buildMessageIframeSrcDoc} from '@renderer/app/main/email/mailPageHelpers';
import {createDefaultAppSettings} from '@/shared/defaults';
import {useComposeWindowGuards} from '@renderer/app/windows/compose/useComposeWindowGuards';
import {useComposeRecipients} from '@renderer/app/windows/compose/useComposeRecipients';
import {useComposeAttachments} from '@renderer/app/windows/compose/useComposeAttachments';
import type {ComposeAttachment, RecipientFieldKey} from '@renderer/app/windows/compose/types';

const EMAIL_ADDRESS_REGEX = /^[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[^\s@<>(),;:]+$/;
const CONTACT_META_PREFIX = '[LUNAMAIL_CONTACT_META_V1]';
const CLOUD_FOLDER_CACHE_PREFIX = 'llamamail.cloud.folder.cache.v1';
const DRAFT_AUTOSAVE_INTERVAL_MS = 15000;
type ComposeValidationErrors = {
    from: string | null;
    recipients: string | null;
    subject: string | null;
    body: string | null;
};
const EMPTY_COMPOSE_VALIDATION_ERRORS: ComposeValidationErrors = {
    from: null,
    recipients: null,
    subject: null,
    body: null,
};

function ComposeEmailPage() {
    useAppTheme();
    const {setTitle, setOnRequestClose} = useApp();
    const [accounts, setAccounts] = useState<PublicAccount[]>([]);
    const [fromAccountId, setFromAccountId] = useState<number | ''>('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [plainBody, setPlainBody] = useState('');
    const [quotedBodyHtml, setQuotedBodyHtml] = useState('');
    const [quotedBodyText, setQuotedBodyText] = useState('');
    const [quotedAllowRemote, setQuotedAllowRemote] = useState(false);
    const [showQuotedPreview, setShowQuotedPreview] = useState(false);
    const [blockRemoteContent, setBlockRemoteContent] = useState<boolean>(createDefaultAppSettings().blockRemoteContent);
    const [threadMeta, setThreadMeta] = useState<{
        inReplyTo?: string | null;
        references?: string[] | string | null;
    }>({});
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<ComposeValidationErrors>(EMPTY_COMPOSE_VALIDATION_ERRORS);
    const {
        toList,
        setToList,
        ccList,
        setCcList,
        bccList,
        setBccList,
        showCcBcc,
        setShowCcBcc,
        recipientDrafts,
        setRecipientDrafts,
        recipientRows,
        setRecipientRows,
        recipientInvalidMessages,
        setRecipientInvalidMessages,
        activeRecipientField,
        setActiveRecipientField,
        recipientListsByField,
        blockedRecipientsByField,
        setRecipientsForField,
    } = useComposeRecipients();
    const {
        attachments,
        fileInputRef,
        windowDragActive,
        onDropNonImageFiles,
        onFallbackInputChange,
        onPickAttachments,
        appendAttachments,
        removeAttachment,
        onRootDragEnterCapture,
        onRootDragOverCapture,
        onRootDragLeaveCapture,
        onRootDrop,
    } = useComposeAttachments({setStatus});
    const [showCloudPicker, setShowCloudPicker] = useState(false);
    const [cloudAccounts, setCloudAccounts] = useState<PublicCloudAccount[]>([]);
    const [cloudAccountId, setCloudAccountId] = useState<number | ''>('');
    const [cloudPath, setCloudPath] = useState<string | null>(null);
    const [cloudItems, setCloudItems] = useState<CloudItem[]>([]);
    const [cloudLoading, setCloudLoading] = useState(false);
    const [cloudAttaching, setCloudAttaching] = useState(false);
    const [cloudStatus, setCloudStatus] = useState<string | null>(null);
    const [cloudFilesCache, setCloudFilesCache] = useState<Record<string, CloudItem[]>>({});
    const cloudFilesCacheRef = useRef<Record<string, CloudItem[]>>({});
    const cloudRequestSeqRef = useRef(0);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autosaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastSavedSignatureRef = useRef<string>('');
    const isSavingDraftRef = useRef(false);
    const queuedDraftSaveRef = useRef<{ payload: SaveDraftPayload; signature: string } | null>(null);
    const draftSessionIdRef = useRef<string>(`draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
    const draftMessageIdRef = useRef<number | null>(null);
    const autoSignatureRef = useRef<{ accountId: number; html: string; text: string } | null>(null);
    const recipientSearchSeqRef = useRef(0);

    useEffect(() => {
        setTitle('Compose Email');
    }, [setTitle]);

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

    const selectedFromAccount = useMemo(
        () => (typeof fromAccountId === 'number' ? accounts.find((account) => account.id === fromAccountId) ?? null : null),
        [accounts, fromAccountId],
    );
    const showFromSelector = accounts.length !== 1;
    const fromAccountOptions = useMemo<FormSelectOption[]>(() => {
        if (accounts.length === 0) {
            return [{value: '', label: 'No accounts', description: null, disabled: true}];
        }
        return accounts.map((account) => {
            const label = account.display_name?.trim() || account.email;
            const description = account.display_name?.trim() ? account.email : null;
            const monogram = getAccountMonogram(account);
            const colors = getAccountAvatarColorsForAccount(account);
            return {
                value: String(account.id),
                label,
                description,
                icon: (
                    <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold"
                        style={{backgroundColor: colors.background, color: colors.foreground}}
                    >
                        {monogram}
                    </span>
                ),
            };
        });
    }, [accounts]);

    useEffect(() => {
        if (!selectedFromAccount) return;
        const signatureRaw = (selectedFromAccount.signature_text || '').trim();
        if (!signatureRaw) {
            autoSignatureRef.current = null;
            return;
        }

        const signatureHtml = selectedFromAccount.signature_is_html
            ? signatureRaw
            : signatureRaw.split(/\r?\n/).map((line) => escapeSignatureHtml(line)).join('<br/>');
        const signatureHtmlWithDivider = withSignatureDivider(signatureHtml);
        const signatureText = selectedFromAccount.signature_is_html
            ? htmlToPlainText(signatureRaw)
            : signatureRaw;
        const previousAuto = autoSignatureRef.current;
        const currentBodyTrimmed = body.trim();
        const currentPlainTrimmed = plainBody.trim();

        const isBodyEmpty = !currentBodyTrimmed && !currentPlainTrimmed;
        if (isBodyEmpty) {
            setBody(`<p><br/></p>${signatureHtmlWithDivider}`);
            setPlainBody(signatureText);
            autoSignatureRef.current = {
                accountId: selectedFromAccount.id,
                html: signatureHtmlWithDivider,
                text: signatureText,
            };
            return;
        }

        if (
            previousAuto &&
            previousAuto.accountId !== selectedFromAccount.id &&
            normalizeSignatureCompare(currentBodyTrimmed).includes(normalizeSignatureCompare(previousAuto.html)) &&
            normalizeSignatureCompare(currentPlainTrimmed).includes(normalizeSignatureCompare(previousAuto.text))
        ) {
            const nextBody = currentBodyTrimmed.replace(previousAuto.html, signatureHtmlWithDivider);
            const nextPlain = currentPlainTrimmed.replace(previousAuto.text, signatureText);
            if (nextBody === currentBodyTrimmed && nextPlain === currentPlainTrimmed) return;
            setBody(nextBody);
            setPlainBody(nextPlain);
            autoSignatureRef.current = {
                accountId: selectedFromAccount.id,
                html: signatureHtmlWithDivider,
                text: signatureText,
            };
        }
    }, [selectedFromAccount, body, plainBody]);

    const applyDraft = useCallback((draft: ComposeDraftPayload | null | undefined) => {
        if (!draft) {
            draftMessageIdRef.current = null;
            return;
        }
        if (typeof draft.draftSessionId === 'string' && draft.draftSessionId.trim()) {
            draftSessionIdRef.current = draft.draftSessionId.trim();
        }
        draftMessageIdRef.current = typeof draft.draftMessageId === 'number' ? draft.draftMessageId : null;
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
        setQuotedBodyHtml(typeof draft.quotedBodyHtml === 'string' ? draft.quotedBodyHtml : '');
        setQuotedBodyText(typeof draft.quotedBodyText === 'string' ? draft.quotedBodyText : '');
        setQuotedAllowRemote(Boolean(draft.quotedAllowRemote));
        setThreadMeta({
            inReplyTo: draft.inReplyTo ?? null,
            references: draft.references ?? null,
        });
    }, [setBccList, setBody, setCcList, setFromAccountId, setPlainBody, setQuotedAllowRemote, setQuotedBodyHtml, setQuotedBodyText, setShowCcBcc, setSubject, setThreadMeta, setToList]);

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
        let active = true;
        ipcClient
            .getAppSettings()
            .then((settings) => {
                if (!active) return;
                setBlockRemoteContent(Boolean(settings.blockRemoteContent));
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    useIpcEvent(ipcClient.onAppSettingsUpdated, (settings) => {
        setBlockRemoteContent(Boolean(settings.blockRemoteContent));
    });

    useEffect(() => {
        cloudFilesCacheRef.current = cloudFilesCache;
    }, [cloudFilesCache]);

    useEffect(() => {
        if (!activeRecipientField || typeof fromAccountId !== 'number') {
            return;
        }
        const query = recipientDrafts[activeRecipientField].trim();
        const seq = ++recipientSearchSeqRef.current;
        const timer = setTimeout(() => {
            Promise.all([
                ipcClient.getContacts(fromAccountId, query || null, 12, null),
                ipcClient.getRecentRecipients(fromAccountId, query || null, 12),
            ])
                .then(([contacts, recentRecipients]) => {
                    if (seq !== recipientSearchSeqRef.current) return;
                    const existing = new Set(
                        [...recipientListsByField[activeRecipientField], ...blockedRecipientsByField[activeRecipientField]]
                            .map((entry) => normalizeRecipientAddress(entry))
                            .filter((entry): entry is string => Boolean(entry)),
                    );
                    const nextRows: AutoCompleteRow[] = mergeRecipientSuggestions(contacts, recentRecipients, existing, 12).map(
                        (row) => ({
                            id: row.key,
                            value: row.email,
                            label: row.displayName || row.email,
                            description: row.displayName ? row.email : null,
                        }),
                    );
                    setRecipientRows((prev) => ({...prev, [activeRecipientField]: nextRows}));
                })
                .catch(() => {
                    if (seq !== recipientSearchSeqRef.current) return;
                    setRecipientRows((prev) => ({...prev, [activeRecipientField]: []}));
                });
        }, query.length > 0 ? 120 : 0);

        return () => {
            clearTimeout(timer);
        };
    }, [activeRecipientField, blockedRecipientsByField, fromAccountId, recipientDrafts, recipientListsByField, setRecipientRows]);

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
    const isComposeDirty = useMemo(() => {
        if (toList.length || ccList.length || bccList.length) return true;
        if (subject.trim().length > 0) return true;
        if (attachments.length > 0) return true;
        return hasMeaningfulBodyContent(body, plainBody, autoSignatureRef.current?.text || null);
    }, [attachments.length, bccList.length, body, ccList.length, plainBody, subject, toList.length]);
    const quotedPreviewSrcDoc = useMemo(() => {
        const quotedHtml = quotedBodyHtml.trim();
        if (!quotedHtml) return null;
        const allowRemoteForQuotedPreview = !blockRemoteContent || quotedAllowRemote;
        return buildMessageIframeSrcDoc(
            quotedHtml,
            allowRemoteForQuotedPreview,
            false,
            enrichAnchorTitles,
            buildSourceDocCsp,
        );
    }, [quotedBodyHtml, blockRemoteContent, quotedAllowRemote]);
    const mergedHtmlBody = useMemo(() => mergeComposeHtml(body, quotedBodyHtml), [body, quotedBodyHtml]);
    const mergedPlainBody = useMemo(() => mergeComposeText(plainBody, quotedBodyText), [plainBody, quotedBodyText]);
    const draftPayload = useMemo(() => {
        if (!fromAccountId) return null;
        return {
            accountId: Number(fromAccountId),
            draftMessageId: draftMessageIdRef.current,
            to: toList.length ? joinRecipients(toList) : null,
            cc: ccList.length ? joinRecipients(ccList) : null,
            bcc: bccList.length ? joinRecipients(bccList) : null,
            subject: subject.trim() || null,
            html: mergedHtmlBody,
            text: mergedPlainBody,
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
        mergedHtmlBody,
        mergedPlainBody,
        threadMeta.inReplyTo,
        threadMeta.references,
        attachments,
    ]);

    const flushQueuedDraftSave = useCallback(() => {
        if (isSavingDraftRef.current) return;
        const queued = queuedDraftSaveRef.current;
        if (!queued) return;
        queuedDraftSaveRef.current = null;
        isSavingDraftRef.current = true;
        void ipcClient
            .saveDraft(queued.payload)
            .then((result) => {
                if (result?.draftId) {
                    draftSessionIdRef.current = result.draftId;
                }
                if (typeof result?.draftMessageId === 'number' && Number.isFinite(result.draftMessageId)) {
                    draftMessageIdRef.current = Math.floor(result.draftMessageId);
                }
            })
            .catch((e: any) => {
                if (lastSavedSignatureRef.current === queued.signature) {
                    lastSavedSignatureRef.current = '';
                }
                setStatus((prev) =>
                    prev?.startsWith('Sending') ? prev : `Draft save failed: ${e?.message || String(e)}`,
                );
            })
            .finally(() => {
                isSavingDraftRef.current = false;
                flushQueuedDraftSave();
            });
    }, []);

    const saveDraftPayload = useCallback(
        async (payload: NonNullable<typeof draftPayload>, options?: {
            skipIfUnchanged?: boolean;
            awaitRemote?: boolean
        }) => {
            if (sending) return;
            const signature = JSON.stringify(payload);
            if (options?.skipIfUnchanged !== false && signature === lastSavedSignatureRef.current) return;

            // Optimistic: reflect "saved" immediately and persist in background.
            lastSavedSignatureRef.current = signature;
            setStatus((prev) => (prev?.startsWith('Send failed:') ? prev : 'Draft saved'));
            queuedDraftSaveRef.current = {payload, signature};
            flushQueuedDraftSave();

            if (options?.awaitRemote) {
                const startedAt = Date.now();
                while (isSavingDraftRef.current || queuedDraftSaveRef.current?.signature === signature) {
                    await new Promise<void>((resolve) => {
                        window.setTimeout(resolve, 30);
                    });
                    if (Date.now() - startedAt > 10000) break;
                }
            }
        },
        [flushQueuedDraftSave, sending],
    );

    const trySaveDraft = useCallback(
        (payload: NonNullable<typeof draftPayload>) => {
            void saveDraftPayload(payload, {skipIfUnchanged: true});
        },
        [saveDraftPayload],
    );

    const saveDraftBeforeClose = useCallback(async () => {
        if (!draftPayload) return;
        await saveDraftPayload(draftPayload, {skipIfUnchanged: false, awaitRemote: true});
    }, [draftPayload, saveDraftPayload]);

    useEffect(() => {
        if (!draftPayload) return;
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
        }
        autosaveTimerRef.current = setTimeout(() => {
            trySaveDraft(draftPayload);
        }, 1200);

        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
        };
    }, [draftPayload, trySaveDraft]);

    useEffect(() => {
        if (autosaveIntervalRef.current) {
            clearInterval(autosaveIntervalRef.current);
            autosaveIntervalRef.current = null;
        }
        autosaveIntervalRef.current = setInterval(() => {
            if (!draftPayload) return;
            trySaveDraft(draftPayload);
        }, DRAFT_AUTOSAVE_INTERVAL_MS);

        return () => {
            if (autosaveIntervalRef.current) {
                clearInterval(autosaveIntervalRef.current);
                autosaveIntervalRef.current = null;
            }
        };
    }, [draftPayload, trySaveDraft]);

    useComposeWindowGuards({
        isComposeDirty,
        sending,
        setOnRequestClose,
        saveDraftBeforeClose,
    });

    function clearValidationError(field: keyof ComposeValidationErrors) {
        setValidationErrors((prev) => {
            if (!prev[field]) return prev;
            return {...prev, [field]: null};
        });
    }

    function commitRecipientDraft(field: RecipientFieldKey) {
        const draft = recipientDrafts[field];
        const parsed = parseRecipientEntries(draft);
        const existing = new Set(
            [...recipientListsByField[field], ...blockedRecipientsByField[field]]
                .map((entry) => normalizeRecipientAddress(entry))
                .filter((entry): entry is string => Boolean(entry)),
        );
        const next = [...recipientListsByField[field]];
        for (const item of parsed.valid) {
            if (existing.has(item)) continue;
            next.push(item);
            existing.add(item);
        }
        if (next.length !== recipientListsByField[field].length) {
            setRecipientsForField(field, next);
        }
        setRecipientInvalidMessages((prev) => ({
            ...prev,
            [field]: parsed.invalid.length > 0 ? `Invalid address: ${parsed.invalid[0]}` : null,
        }));
        setRecipientDrafts((prev) => ({...prev, [field]: ''}));
        setRecipientRows((prev) => ({...prev, [field]: []}));
        clearValidationError('recipients');
    }

    function removeRecipient(field: RecipientFieldKey, recipient: string) {
        setRecipientsForField(
            field,
            recipientListsByField[field].filter((entry) => entry !== recipient),
        );
        clearValidationError('recipients');
    }

    function applyRecipientSuggestion(field: RecipientFieldKey, row: AutoCompleteRow) {
        const email = normalizeRecipientAddress(row.value);
        if (!email) return;
        const exists = [...recipientListsByField[field], ...blockedRecipientsByField[field]].some(
            (entry) => normalizeRecipientAddress(entry) === email,
        );
        if (exists) {
            setRecipientDrafts((prev) => ({...prev, [field]: ''}));
            clearValidationError('recipients');
            return;
        }
        setRecipientsForField(field, [...recipientListsByField[field], email]);
        setRecipientInvalidMessages((prev) => ({...prev, [field]: null}));
        setRecipientDrafts((prev) => ({...prev, [field]: ''}));
        setRecipientRows((prev) => ({...prev, [field]: []}));
        clearValidationError('recipients');
    }

    async function onSend() {
        if (sending) return;

        const draftEntries = {
            to: parseRecipientEntries(recipientDrafts.to),
            cc: parseRecipientEntries(recipientDrafts.cc),
            bcc: parseRecipientEntries(recipientDrafts.bcc),
        };

        const nextTo = Array.from(new Set([...toList, ...draftEntries.to.valid]));
        const nextCc = Array.from(new Set([...ccList, ...draftEntries.cc.valid]));
        const nextBcc = Array.from(new Set([...bccList, ...draftEntries.bcc.valid]));
        const draftInvalid = [...draftEntries.to.invalid, ...draftEntries.cc.invalid, ...draftEntries.bcc.invalid];

        setToList(nextTo);
        setCcList(nextCc);
        setBccList(nextBcc);
        setRecipientDrafts({to: '', cc: '', bcc: ''});
        setRecipientRows({to: [], cc: [], bcc: []});
        setRecipientInvalidMessages({
            to: draftEntries.to.invalid[0] ? `Invalid address: ${draftEntries.to.invalid[0]}` : null,
            cc: draftEntries.cc.invalid[0] ? `Invalid address: ${draftEntries.cc.invalid[0]}` : null,
            bcc: draftEntries.bcc.invalid[0] ? `Invalid address: ${draftEntries.bcc.invalid[0]}` : null,
        });

        const invalidAddresses = [...nextTo, ...nextCc, ...nextBcc].filter(
            (entry) => !normalizeRecipientAddress(entry),
        );
        const nextValidationErrors: ComposeValidationErrors = {...EMPTY_COMPOSE_VALIDATION_ERRORS};

        if (!fromAccountId) {
            nextValidationErrors.from = 'Select a sender account first.';
        }
        if (draftInvalid.length > 0) {
            nextValidationErrors.recipients = `Invalid address: ${draftInvalid[0]}`;
        } else if (nextTo.length === 0 && nextCc.length === 0 && nextBcc.length === 0) {
            nextValidationErrors.recipients = 'At least one recipient is required.';
        } else if (invalidAddresses.length > 0) {
            nextValidationErrors.recipients = `Invalid address: ${invalidAddresses[0]}`;
        }
        nextValidationErrors.subject = null;
        nextValidationErrors.body = null;

        setValidationErrors(nextValidationErrors);
        const firstError =
            nextValidationErrors.from ||
            nextValidationErrors.recipients ||
            nextValidationErrors.subject ||
            nextValidationErrors.body;
        if (firstError) {
            setStatus(firstError);
            return;
        }

        setSending(true);
        setStatus('Queueing send...');
        try {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
            await ipcClient.sendEmailBackground({
                accountId: Number(fromAccountId),
                to: joinRecipients(nextTo),
                cc: nextCc.length ? joinRecipients(nextCc) : null,
                bcc: nextBcc.length ? joinRecipients(nextBcc) : null,
                subject: subject || null,
                html: mergedHtmlBody,
                text: mergedPlainBody || '',
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
            window.close();
        } catch (e: any) {
            setSending(false);
            setStatus(`Queue send failed: ${e?.message || String(e)}`);
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
        await loadCloudItems(cloudAccountId, normalizeRequestedCloudPath(cloudPath, selectedCloudProvider), {force: true});
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

    return (
        <div
            className="relative h-full min-h-0 w-full overflow-hidden"
            onDragEnterCapture={onRootDragEnterCapture}
            onDragOverCapture={onRootDragOverCapture}
            onDragLeaveCapture={onRootDragLeaveCapture}
            onDrop={onRootDrop}
        >
            {windowDragActive && (
                <div
                    className="dropzone-info pointer-events-none absolute inset-x-3 bottom-3 top-13 z-90 flex items-center justify-center rounded-xl border-2 border-dashed text-sm font-medium">
                    Drop files to attach. Drop on editor body to insert images inline.
                </div>
            )}
            <div className="flex h-full min-h-0 flex-col">
                <header className="mail-compose-header text-inverse border-b px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div
                                className="compose-hero-icon flex h-9 w-9 items-center justify-center rounded-lg shadow">
                                <PenSquare size={16}/>
                            </div>
                            <div>
                                <h1 className="compose-hero-title text-base font-semibold">Compose</h1>
                                <p className="compose-hero-meta text-xs">{status || 'New message'}</p>
                            </div>
                        </div>
                        <div className="compose-hero-meta flex items-center gap-2 text-xs">
                            <span>{words} words</span>
                            <span className="compose-hero-chip rounded-full px-2 py-0.5">
									Draft
								</span>
                        </div>
                    </div>
                </header>

                <div className="min-h-0 flex-1">
                    <div className="ui-surface-card flex h-full w-full flex-col overflow-hidden">
                        <div className="border-b ui-border-default px-5 py-4">
                            <div
                                className={showFromSelector ? 'grid grid-cols-1 gap-2 md:grid-cols-[300px_1fr]' : 'grid grid-cols-1 gap-2'}>
                                {showFromSelector && (
                                    <label className="block text-sm">
									<span className="ui-text-muted mb-1 block text-xs font-medium">
										From
									</span>
                                    <FormSelect
                                        value={fromAccountId ? String(fromAccountId) : ''}
                                        onChange={(e) => {
                                            setFromAccountId(e.target.value ? Number(e.target.value) : '');
                                            if (validationErrors.from) {
                                                setValidationErrors((prev) => ({...prev, from: null}));
                                            }
                                        }}
                                        className={validationErrors.from ? 'border-danger' : ''}
                                        options={fromAccountOptions}
                                        renderSelectedOption={(option) => {
                                            if (!option) return <span className="truncate">No accounts</span>;
                                            return (
                                                <span className="flex min-w-0 items-center gap-2">
                                                    {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
                                                    <span className="block min-w-0 truncate">
                                                        {option.label}
                                                        {option.description ? (
                                                            <span
                                                                className="ui-text-muted"> · {option.description}</span>
                                                        ) : null}
                                                    </span>
                                                </span>
                                            );
                                        }}
                                    />
                                        {validationErrors.from && (
                                            <p className="text-danger mt-1 text-xs">{validationErrors.from}</p>
                                        )}
                                    </label>
                                )}

                                <label className="block text-sm">
									<span className="ui-text-muted mb-1 block text-xs font-medium">
										To
									</span>
                                    <div className="flex gap-2">
                                        <FormControlGroup className="flex w-full min-w-0 items-stretch">
                                            <RecipientMultiInput
                                                placeholder="recipient@example.com"
                                                recipients={recipientListsByField.to}
                                                draft={recipientDrafts.to}
                                                rows={recipientRows.to}
                                                invalidMessage={recipientInvalidMessages.to}
                                                onDraftChange={(next) => {
                                                    setRecipientDrafts((prev) => ({...prev, to: next}));
                                                    if (recipientInvalidMessages.to) {
                                                        setRecipientInvalidMessages((prev) => ({...prev, to: null}));
                                                    }
                                                    clearValidationError('recipients');
                                                }}
                                                onRemoveRecipient={(recipient) => removeRecipient('to', recipient)}
                                                onPickRow={(row) => applyRecipientSuggestion('to', row)}
                                                onCommit={() => commitRecipientDraft('to')}
                                                onFocus={() => setActiveRecipientField('to')}
                                                onBlur={() => {
                                                    setActiveRecipientField((prev) => (prev === 'to' ? null : prev));
                                                    commitRecipientDraft('to');
                                                }}
                                                onBackspaceEmpty={() => {
                                                    if (recipientListsByField.to.length === 0) return;
                                                    setRecipientsForField('to', recipientListsByField.to.slice(0, -1));
                                                    clearValidationError('recipients');
                                                }}
                                                groupPosition="first"
                                                className={`min-w-0 flex-1 ${validationErrors.recipients ? 'border-danger' : ''}`}
                                            />
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="none"
                                                groupPosition="last"
                                                className="min-h-12 shrink-0 self-stretch px-3 text-xs font-semibold"
                                                onClick={() => setShowCcBcc((prev) => !prev)}
                                            >
                                                {showCcBcc ? 'Hide Cc/Bcc' : 'Cc/Bcc'}
                                            </Button>
                                        </FormControlGroup>
                                    </div>
                                    {validationErrors.recipients && (
                                        <p className="text-danger mt-1 text-xs">{validationErrors.recipients}</p>
                                    )}
                                </label>
                            </div>

                            {showCcBcc && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <label className="block min-w-0 text-sm">
										<span
                                            className="ui-text-muted mb-1 block text-xs font-medium">
											Cc
										</span>
                                        <RecipientMultiInput
                                            placeholder="optional"
                                            recipients={recipientListsByField.cc}
                                            draft={recipientDrafts.cc}
                                            rows={recipientRows.cc}
                                            invalidMessage={recipientInvalidMessages.cc}
                                            onDraftChange={(next) => {
                                                setRecipientDrafts((prev) => ({...prev, cc: next}));
                                                if (recipientInvalidMessages.cc) {
                                                    setRecipientInvalidMessages((prev) => ({...prev, cc: null}));
                                                }
                                                clearValidationError('recipients');
                                            }}
                                            onRemoveRecipient={(recipient) => removeRecipient('cc', recipient)}
                                            onPickRow={(row) => applyRecipientSuggestion('cc', row)}
                                            onCommit={() => commitRecipientDraft('cc')}
                                            onFocus={() => setActiveRecipientField('cc')}
                                            onBlur={() => {
                                                setActiveRecipientField((prev) => (prev === 'cc' ? null : prev));
                                                commitRecipientDraft('cc');
                                            }}
                                            onBackspaceEmpty={() => {
                                                if (recipientListsByField.cc.length === 0) return;
                                                setRecipientsForField('cc', recipientListsByField.cc.slice(0, -1));
                                                clearValidationError('recipients');
                                            }}
                                        />
                                    </label>

                                    <label className="block min-w-0 text-sm">
										<span
                                            className="ui-text-muted mb-1 block text-xs font-medium">
											Bcc
										</span>
                                        <RecipientMultiInput
                                            placeholder="optional"
                                            recipients={recipientListsByField.bcc}
                                            draft={recipientDrafts.bcc}
                                            rows={recipientRows.bcc}
                                            invalidMessage={recipientInvalidMessages.bcc}
                                            onDraftChange={(next) => {
                                                setRecipientDrafts((prev) => ({...prev, bcc: next}));
                                                if (recipientInvalidMessages.bcc) {
                                                    setRecipientInvalidMessages((prev) => ({...prev, bcc: null}));
                                                }
                                                clearValidationError('recipients');
                                            }}
                                            onRemoveRecipient={(recipient) => removeRecipient('bcc', recipient)}
                                            onPickRow={(row) => applyRecipientSuggestion('bcc', row)}
                                            onCommit={() => commitRecipientDraft('bcc')}
                                            onFocus={() => setActiveRecipientField('bcc')}
                                            onBlur={() => {
                                                setActiveRecipientField((prev) => (prev === 'bcc' ? null : prev));
                                                commitRecipientDraft('bcc');
                                            }}
                                            onBackspaceEmpty={() => {
                                                if (recipientListsByField.bcc.length === 0) return;
                                                setRecipientsForField('bcc', recipientListsByField.bcc.slice(0, -1));
                                                clearValidationError('recipients');
                                            }}
                                        />
                                    </label>
                                </div>
                            )}

                            <div className="mt-2">
                                <label className="block text-sm">
									<span className="ui-text-muted mb-1 block text-xs font-medium">
										Subject
									</span>
                                    <FormInput
                                        placeholder="Add a subject"
                                        value={subject}
                                        onChange={(e) => {
                                            setSubject(e.target.value);
                                            if (validationErrors.subject) {
                                                setValidationErrors((prev) => ({...prev, subject: null}));
                                            }
                                        }}
                                        className={validationErrors.subject ? 'border-danger' : ''}
                                    />
                                    {validationErrors.subject && (
                                        <p className="text-danger mt-1 text-xs">{validationErrors.subject}</p>
                                    )}
                                </label>
                            </div>
                            {quotedBodyHtml.trim().length > 0 && (
                                <div
                                    className="surface-muted mt-2 flex items-center justify-between rounded-md border ui-border-default px-3 py-2">
                                    <p className="ui-text-secondary text-xs">Quoted message will be included in this
                                        reply/forward.</p>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-auto px-2 py-1 text-xs"
                                        onClick={() => setShowQuotedPreview(true)}
                                    >
                                        Preview quote
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="min-h-0 flex-1">
                            <div className="flex h-full w-full flex-col">
                                <div
                                    className={`relative min-h-0 flex-1 ${validationErrors.body ? 'border border-danger rounded-md' : ''}`}>
                                <HtmlLexicalEditor
                                    value={body}
                                    placeholder="Write your message..."
                                    onDropNonImageFiles={onDropNonImageFiles}
                                    onChange={(html, plainText) => {
                                        setBody(html);
                                        setPlainBody(plainText);
                                        if (validationErrors.body) {
                                            setValidationErrors((prev) => ({...prev, body: null}));
                                        }
                                    }}
                                />
                                </div>
                                {validationErrors.body && (
                                    <p className="text-danger mt-1 px-5 text-xs">{validationErrors.body}</p>
                                )}
                            </div>
                        </div>

                        <footer className="surface-muted border-t ui-border-default px-5 py-3">
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
                                    <ButtonGroup>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            groupPosition="first"
                                            leftIcon={<Paperclip size={14}/>}
                                            onClick={() => void onPickAttachments()}
                                        >
                                            Attach
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            groupPosition="last"
                                            leftIcon={<Cloud size={14}/>}
                                            onClick={() => void openCloudAttachmentPicker()}
                                        >
                                            Add file from cloud
                                        </Button>
                                    </ButtonGroup>
                                </div>
                                <Button
                                    size="sm"
                                    variant="default"
                                    rightIcon={<SendHorizonal size={14}/>}
                                    onClick={() => void onSend()}
                                    disabled={sending}
                                >
                                    {sending ? 'Sending...' : 'Send'}
                                </Button>
                            </div>
                            <FormInput
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
            {showQuotedPreview && quotedBodyHtml.trim().length > 0 && (
                <Modal
                    open
                    onClose={() => setShowQuotedPreview(false)}
                    ariaLabel="Quoted message preview"
                    backdropClassName="z-50 px-4"
                    contentClassName="overlay flex w-full max-w-4xl flex-col overflow-hidden rounded-xl p-0"
                >
                    <div className="flex items-center justify-between border-b ui-border-default px-4 py-3">
                        <h2 className="ui-text-primary text-sm font-semibold">Quoted message preview</h2>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto px-2 py-1 text-xs"
                            onClick={() => setShowQuotedPreview(false)}
                        >
                            Close
                        </Button>
                    </div>
                    <div className="surface-muted max-h-[70vh] overflow-auto p-4">
                        {quotedPreviewSrcDoc ? (
                            <iframe
                                title="quoted-message-preview"
                                srcDoc={quotedPreviewSrcDoc}
                                sandbox="allow-popups allow-popups-to-escape-sandbox"
                                className="iframe-surface h-[64vh] w-full rounded-md border-0"
                            />
                        ) : (
                            <div className="ui-text-muted text-sm">No quoted content available.</div>
                        )}
                    </div>
                </Modal>
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
        <Modal
            open
            onClose={onClose}
            ariaLabel="Add file from cloud"
            backdropClassName="z-50 px-4"
            contentClassName="overlay flex w-full max-w-3xl flex-col overflow-hidden rounded-xl p-0"
        >
            <div className="flex items-center justify-between border-b ui-border-default px-4 py-3">
                <h2 className="ui-text-primary text-sm font-semibold">Add file from cloud</h2>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto px-2 py-1 text-xs"
                        onClick={onClose}
                    >
                        Close
                    </Button>
                </div>

            <div
                className="grid grid-cols-1 gap-2 border-b ui-border-default px-4 py-3 md:grid-cols-[280px_1fr_auto_auto_auto]">
                    <FormSelect
                        className="h-9"
                        value={selectedAccountId}
                        onChange={(event) => onAccountChange(event.target.value)}
                    >
                        {cloudAccounts.length === 0 ? <option value="">No cloud accounts</option> : null}
                        {cloudAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                                {account.name}
                            </option>
                        ))}
                    </FormSelect>
                <div
                    className="surface-muted flex h-9 min-w-0 items-center gap-1 overflow-x-auto rounded-md border ui-border-default px-2 text-xs ui-text-secondary">
                        {breadcrumbs.map((crumb, index) => (
                            <React.Fragment key={`${crumb.path}-${index}`}>
                                {index > 0 ? <ChevronRight size={12} className="shrink-0 opacity-70"/> : null}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="shrink-0 rounded px-1 py-0.5"
                                    title={crumb.path}
                                    onClick={() => onNavigate(crumb.path)}
                                    disabled={busy}
                                >
                                    {crumb.label}
                                </Button>
                            </React.Fragment>
                        ))}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-md px-3 text-xs disabled:opacity-50"
                        onClick={() => onNavigate(rootPath)}
                        disabled={busy || isAtRoot}
                        title="Go to root"
                    >
                        <span className="inline-flex items-center gap-1">
                            <Home size={12}/>
                            Root
                        </span>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-md px-3 text-xs disabled:opacity-50"
                        onClick={onUp}
                        disabled={busy || isAtRoot}
                    >
                        Up
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-md px-3 text-xs disabled:opacity-50"
                        onClick={onRefresh}
                        disabled={busy || typeof selectedAccountId !== 'number'}
                    >
                        <span className="inline-flex items-center gap-1">
                            {loading ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>}
                            Refresh
                        </span>
                    </Button>
                </div>

            <div className="min-h-64 max-h-96 overflow-y-auto">
                    {loading && cloudItems.length === 0 ? (
                        <div
                            className="ui-text-muted flex min-h-64 items-center justify-center gap-2 px-2 py-3 text-sm">
                            <Loader2 size={16} className="animate-spin"/>
                            <span>Loading cloud files...</span>
                        </div>
                    ) : cloudAccounts.length === 0 ? (
                        <p className="ui-text-muted px-2 py-3 text-sm">
                            Add a cloud account in Cloud to attach files.
                        </p>
                    ) : cloudItems.length === 0 ? (
                        <div className="ui-text-muted flex min-h-64 items-center justify-center px-2 py-3 text-sm">
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
                                className="surface-muted sticky top-0 z-10 border-b ui-border-default text-xs uppercase tracking-wide ui-text-secondary">
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
                                    className="border-b ui-border-default ui-surface-hover"
                                >
                                    <td className="px-3 py-2">
                                        <Button
                                            type="button"
                                            className="ui-text-primary flex min-w-0 items-center gap-2 text-left hover:underline"
                                            onClick={() => (item.isFolder ? onNavigate(item.path || item.id) : onAttach(item))}
                                            disabled={busy}
                                        >
                                            <span className="ui-text-muted shrink-0">
                                                {renderCloudItemIcon(item)}
                                            </span>
                                            <span className="truncate">{item.name}</span>
                                        </Button>
                                    </td>
                                    <td className="ui-text-muted px-3 py-2 text-xs">
                                        {item.isFolder ? 'Folder' : cloudFileTypeLabel(item)}
                                    </td>
                                    <td className="ui-text-muted px-3 py-2 text-xs">
                                        {item.isFolder ? '-' : formatBytes(item.size ?? 0)}
                                    </td>
                                    <td className="ui-text-muted px-3 py-2 text-xs">
                                        {formatSystemDateTime(item.modifiedAt) || '-'}
                                    </td>
                                    <td className="ui-text-muted px-3 py-2 text-xs">
                                        {formatSystemDateTime(item.createdAt) || '-'}
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                        {!item.isFolder && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="rounded-md px-2 py-1 text-xs disabled:opacity-50"
                                                onClick={() => onAttach(item)}
                                                disabled={busy}
                                            >
                                                Attach
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {status && (
                    <div className="notice-warning border-t px-4 py-2 text-xs">
                        {status}
                    </div>
                )}
        </Modal>
    );
}

function RecipientMultiInput({
    recipients,
    draft,
    rows,
    placeholder,
    invalidMessage,
    onDraftChange,
    onRemoveRecipient,
    onPickRow,
    onCommit,
    onFocus,
    onBlur,
    onBackspaceEmpty,
                                 groupPosition = 'none',
    className,
}: {
    recipients: string[];
    draft: string;
    rows: AutoCompleteRow[];
    placeholder?: string;
    invalidMessage: string | null;
    onDraftChange: (next: string) => void;
    onRemoveRecipient: (recipient: string) => void;
    onPickRow: (row: AutoCompleteRow) => void;
    onCommit: () => void;
    onFocus: () => void;
    onBlur: () => void;
    onBackspaceEmpty: () => void;
    groupPosition?: 'none' | 'first' | 'middle' | 'last';
    className?: string;
}) {
    const groupPositionClass =
        groupPosition === 'first'
            ? 'rounded-l-lg rounded-r-none'
            : groupPosition === 'middle'
                ? 'rounded-none -ml-px'
                : groupPosition === 'last'
                    ? 'rounded-l-none rounded-r-lg -ml-px'
                    : 'rounded-lg';

    return (
        <div
            className={`field field-subtle relative flex min-h-12 w-full flex-wrap items-center gap-1.5 px-3 py-1.5 text-sm transition-all ${groupPositionClass} ${className || ''}`}
            onClick={(event) => {
                const container = event.currentTarget;
                const input = container.querySelector('input');
                input?.focus();
            }}
        >
            {recipients.map((recipient) => (
                <span
                    key={recipient}
                    className="chip-border ui-text-primary inline-flex h-7 max-w-full items-center gap-1 rounded-md px-2 text-xs"
                    onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                >
                    <span className="truncate">{recipient}</span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="none"
                        className="ui-hover-text-primary inline-flex h-4 w-4 min-w-0 items-center justify-center rounded-sm p-0 ui-text-muted"
                        onMouseDown={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                        }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onRemoveRecipient(recipient);
                        }}
                        aria-label={`Remove ${recipient}`}
                        title="Remove"
                    >
                        <X size={10}/>
                    </Button>
                </span>
            ))}
            <AutoComplete
                value={draft}
                onChange={onDraftChange}
                rows={rows}
                onPickRow={onPickRow}
                onCommitValue={onCommit}
                onInputKeyDown={(event) => {
                    if (event.key === 'Backspace' && !draft && recipients.length > 0) {
                        event.preventDefault();
                        onBackspaceEmpty();
                    }
                    if (event.key === ' ') {
                        event.preventDefault();
                        onCommit();
                    }
                }}
                placeholder={recipients.length === 0 ? placeholder : ''}
                onFocus={onFocus}
                onBlur={onBlur}
                showRowsOnFocus
                className="min-w-45 flex-1"
                inputClassName="h-8 border-0 bg-transparent px-1.5 py-0 text-sm shadow-none focus:ring-0 focus-visible:shadow-none"
            />
            {invalidMessage ? (
                <div className="text-danger w-full pl-1 text-[11px]">{invalidMessage}</div>
            ) : null}
        </div>
    );
}

function parseRecipients(raw: string): string[] {
    return parseRecipientEntries(raw).valid;
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

function joinRecipients(recipients: string[]): string {
    return recipients.join(', ');
}

function AttachmentCard({attachment, onRemove}: { attachment: ComposeAttachment; onRemove: () => void }) {
    return (
        <div
            className="surface-muted group relative flex w-68 items-center gap-2 rounded-lg border ui-border-default p-2 text-xs ui-text-secondary">
            <div
                className="h-10 w-10 shrink-0 overflow-hidden rounded-md border ui-border-default ui-surface-card">
                <div className="ui-text-muted flex h-full w-full items-center justify-center">
                    {renderAttachmentTypeIcon(attachment.filename, attachment.contentType)}
                </div>
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{attachment.filename}</p>
                <p className="ui-text-muted truncate text-[11px]">
                    {attachment.contentType || fileExtensionLabel(attachment.filename)}
                    {typeof attachment.size === 'number' ? ` • ${formatBytes(attachment.size)}` : ''}
                </p>
            </div>
            <Button
                type="button"
                variant="ghost"
                className="rounded p-1 opacity-80 transition group-hover:opacity-100"
                onClick={onRemove}
                aria-label={`Remove ${attachment.filename}`}
                title="Remove attachment"
            >
                x
            </Button>
        </div>
    );
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

type RecipientSuggestion = {
    key: string;
    email: string;
    displayName: string | null;
};

function mergeRecipientSuggestions(
    contacts: ContactItem[],
    recentRecipients: RecentRecipientItem[],
    existingEmails: Set<string>,
    limit: number,
): RecipientSuggestion[] {
    const deduped = new Map<string, RecipientSuggestion>();

    for (const row of recentRecipients) {
        const email = normalizeRecipientAddress(row.email);
        if (!email || existingEmails.has(email) || deduped.has(email)) continue;
        deduped.set(email, {
            key: `recent:${email}`,
            email,
            displayName: row.display_name || null,
        });
        if (deduped.size >= limit) return Array.from(deduped.values());
    }

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
        const meta = JSON.parse(metaRaw) as { emails?: unknown };
        if (!Array.isArray(meta.emails)) return [];
        return meta.emails.map((entry) => String(entry || '').trim()).filter(Boolean);
    } catch {
        return [];
    }
}

function normalizeRecipientAddress(raw: string | null | undefined): string | null {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    const angleMatch = trimmed.match(/<([^<>]+)>/);
    const candidate = (angleMatch?.[1] || trimmed).trim().replace(/^"+|"+$/g, '');
    const normalized = candidate.toLowerCase();
    return EMAIL_ADDRESS_REGEX.test(normalized) ? normalized : null;
}

function mergeComposeHtml(bodyHtml: string, quotedHtml: string): string | null {
    const editorHtml = String(bodyHtml || '').trim();
    const quoteHtml = String(quotedHtml || '').trim();
    if (editorHtml && quoteHtml) return `${editorHtml}${quoteHtml}`;
    if (editorHtml) return editorHtml;
    if (quoteHtml) return quoteHtml;
    return null;
}

function mergeComposeText(plainBody: string, quotedText: string): string | null {
    const editorText = String(plainBody || '').trim();
    const quoteText = String(quotedText || '').trim();
    if (editorText && quoteText) return `${editorText}\n\n${quoteText}`;
    if (editorText) return editorText;
    if (quoteText) return quoteText;
    return null;
}

function htmlToPlainText(html: string): string {
    return String(html)
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeSignatureCompare(value: string): string {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasMeaningfulBodyContent(bodyHtml: string, plainBody: string, autoSignatureText: string | null): boolean {
    const plainNormalized = normalizeSignatureCompare(plainBody);
    const signatureNormalized = normalizeSignatureCompare(autoSignatureText || '');
    if (plainNormalized) {
        if (!signatureNormalized) return true;
        if (plainNormalized === signatureNormalized) return false;
        const trailingSignaturePattern = new RegExp(`\\s*${escapeRegExp(signatureNormalized)}\\s*$`, 'i');
        const withoutTrailingSignature = plainNormalized.replace(trailingSignaturePattern, '').trim();
        if (withoutTrailingSignature.length > 0) return true;
    }

    const body = String(bodyHtml || '');
    if (/<img[\s>]/i.test(body)) return true;
    if (/<hr[\s>]/i.test(body)) return true;
    const textOnly = body
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return textOnly.length > 0;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withSignatureDivider(signatureHtml: string): string {
    const normalized = String(signatureHtml || '').trim();
    if (!normalized) return normalized;
    if (/<hr[\s/>]/i.test(normalized)) return normalized;
    return `<hr/>${normalized}`;
}

function escapeSignatureHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
