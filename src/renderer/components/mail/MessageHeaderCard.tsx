import {ContextMenu, ContextMenuItem, ContextMenuSeparator} from '@renderer/components/ui/ContextMenu';
import {Button} from '@renderer/components/ui/button';
import {formatSystemDateTime} from '@renderer/lib/dateTime';
import {clampToViewport} from '@renderer/lib/format';
import {ipcClient} from '@renderer/lib/ipcClient';
import {ChevronDown, Filter, MailCheck, MailOpen, Paperclip, Star, Tag, UserPlus} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';

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
    onOpenCustomFilter?: (payload: { accountId: number; senderEmail: string; senderName: string | null }) => void;
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
    const senderName = String(message.from_name || '').trim();
    const senderEmail = useMemo(() => {
        const raw = String(message.from_address || '').trim();
        if (!raw) return '';
        const match = raw.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
        return String(match?.[1] || raw).trim();
    }, [message.from_address]);
    const accountId = Number(message.account_id);
    const hasAccountId = Number.isInteger(accountId) && accountId > 0;
    const senderPrimary = senderName || senderEmail || 'Unknown sender';
    const senderSecondary = senderName && senderEmail ? senderEmail : null;
    const [senderMenu, setSenderMenu] = useState<{ x: number; y: number } | null>(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [senderIsContact, setSenderIsContact] = useState<boolean>(false);
    const [inlineStatus, setInlineStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
    const senderButtonRef = useRef<HTMLButtonElement | null>(null);

    const canRunSenderActions = hasAccountId && senderEmail.length > 0;

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
                reportStatus(`Contact already exists for ${senderEmail}.`, 'success');
                return;
            }
            await ipcClient.addContact(accountId, {
                fullName: senderName || null,
                email: senderEmail,
            });
            reportStatus(`Added ${senderEmail} to contacts.`, 'success');
        } catch (error: any) {
            reportStatus(`Failed to add contact: ${error?.message || String(error)}`, 'error');
        } finally {
            setActionBusy(false);
        }
    }

    async function onCreateSenderFilter(actionType: 'mark_read' | 'star'): Promise<void> {
        if (!canRunSenderActions || actionBusy) return;
        setActionBusy(true);
        setSenderMenu(null);
        const actionLabel = actionType === 'mark_read' ? 'mark read' : 'star';
        const filterName = `From ${senderEmail} (${actionLabel})`;
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
            reportStatus(`Created filter for ${senderEmail}: ${actionLabel}.`, 'success');
        } catch (error: any) {
            reportStatus(`Failed to create filter: ${error?.message || String(error)}`, 'error');
        } finally {
            setActionBusy(false);
        }
    }

    function onCreateCustomFilter(): void {
        if (!canRunSenderActions || actionBusy) return;
        setSenderMenu(null);
        if (!onOpenCustomFilter) {
            reportStatus('Custom filter is not available in this view.', 'error');
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
						<span
                            className="badge-muted inline-flex h-5 items-center rounded-md px-2 text-[11px] font-medium">
							{folderLabel || 'Message'}
						</span>
                        {Boolean(message.is_flagged) && (
                            <span
                                className="chip-warning inline-flex h-5 items-center gap-1 rounded-md px-2 text-[11px] font-medium">
								<Star size={11} className="fill-current"/>
								Starred
							</span>
                        )}
                        <span
                            className="inline-flex h-5 items-center gap-1 rounded-md border ui-border-default ui-surface-card px-2 text-[11px] font-medium ui-text-secondary">
							<MailOpen size={11}/>
                            {message.is_read ? 'Read' : 'Unread'}
						</span>
                        {Boolean(tagLabel) && (
                            <span
                                className="chip-info inline-flex h-5 items-center gap-1 rounded-md px-2 text-[11px] font-medium">
								<Tag size={11}/>
                                {tagLabel}
							</span>
                        )}
                        {attachmentsCount > 0 && (
                            <span
                                className="inline-flex h-5 items-center gap-1 rounded-md border ui-border-default ui-surface-card px-2 text-[11px] font-medium ui-text-secondary">
								<Paperclip size={11}/>
                                {attachmentsCount} attachment
                                {attachmentsCount > 1 ? 's' : ''}
							</span>
                        )}
                        {spoofHints.length > 0 && (
                            <span
                                className="chip-warning inline-flex h-5 items-center rounded-md px-2 text-[11px] font-medium">
								Verify sender
							</span>
                        )}
                    </div>
                    <h2 className="ui-text-primary truncate text-xl font-semibold tracking-tight">
                        {message.subject || '(No subject)'}
                    </h2>
                </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <button
                        ref={senderButtonRef}
                        type="button"
                        className="hover-card-trigger group relative flex min-w-[17rem] max-w-[24rem] cursor-pointer items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-left focus-visible:outline-none"
                        aria-expanded={senderMenu ? 'true' : 'false'}
                        aria-haspopup="menu"
                        onClick={(event) => {
                            event.stopPropagation();
                            if (senderMenu) {
                                setSenderMenu(null);
                                return;
                            }
                            openSenderMenu();
                        }}
                        title="Sender actions"
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
                        <ChevronDown size={14} className="ui-text-muted shrink-0"/>
                    </button>
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
                                <UserPlus size={14}/>
                                <span>Add contact</span>
                            </ContextMenuItem>
                            <ContextMenuSeparator/>
                        </>
                    )}
                    <ContextMenuItem
                        disabled={!canRunSenderActions || actionBusy}
                        onClick={() => void onCreateSenderFilter('mark_read')}
                    >
                        <MailCheck size={14}/>
                        <span>Auto-read sender</span>
                    </ContextMenuItem>
                    <ContextMenuItem
                        disabled={!canRunSenderActions || actionBusy}
                        onClick={() => void onCreateSenderFilter('star')}
                    >
                        <Star size={14}/>
                        <span>Auto-star sender</span>
                    </ContextMenuItem>
                    <ContextMenuSeparator/>
                    <ContextMenuItem disabled={!canRunSenderActions || actionBusy} onClick={onCreateCustomFilter}>
                        <Filter size={14}/>
                        <span>Custom filter...</span>
                    </ContextMenuItem>
                </ContextMenu>
            )}
            <Button
                variant="outline"
                className="mt-2 inline-flex h-7 items-center rounded-md px-2 text-[11px]"
                onClick={onToggleMessageDetails}
            >
                {showMessageDetails ? 'Hide message details' : 'Show message details'}
            </Button>
            {showMessageDetails && (
                <div className="panel-muted mt-3 rounded-md border ui-border-default p-3 text-xs ui-text-secondary">
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
                        <span className="font-medium">Date:</span> {formatSystemDateTime(message.date, dateLocale)}
                    </div>
                    <div>
                        <span className="font-medium">Message-ID:</span> {message.message_id || '-'}
                    </div>
                    <div>
                        <span className="font-medium">In-Reply-To:</span> {message.in_reply_to || '-'}
                    </div>
                    <div>
                        <span className="font-medium">References:</span> {message.references_text || '-'}
                    </div>
                    <div>
                        <span className="font-medium">Size:</span>{' '}
                        {message.size ? `${message.size.toLocaleString()} bytes` : '-'}
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
