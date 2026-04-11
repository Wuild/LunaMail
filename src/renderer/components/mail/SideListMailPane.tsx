import React from 'react';
import {Search, Star} from 'lucide-react';
import {useDrag} from 'react-dnd';
import {getEmptyImage} from 'react-dnd-html5-backend';
import type {MessageItem} from '@/preload';
import {ScrollArea} from '../ui/scroll-area';
import {formatSystemDateTime} from '@renderer/lib/dateTime';
import {cn} from '@renderer/lib/utils';
import {Button} from '../ui/button';
import {FormInput} from '../ui/FormControls';
import {DND_ITEM} from '@renderer/lib/dndTypes';

type MailMessageDragItem = {
    type: typeof DND_ITEM.MAIL_MESSAGE;
    accountId: number;
    messageIds: number[];
    subject?: string;
    from?: string;
};

type SideListMailPaneProps = {
    mailListWidth: number;
    isCompactSideList: boolean;
    selectedMessageIds: number[];
    selectedMessageId: number | null;
    contextMenuMessageId: number | null;
    messages: MessageItem[];
    hasMoreMessages: boolean;
    loadingMoreMessages: boolean;
    dateLocale?: string;
    children: React.ReactNode;
    onOpenSearchModal: () => void;
    onBulkMarkRead: (messageIds: number[], nextRead: number) => void;
    onBulkDelete: (messageIds: number[]) => void;
    onClearMessageSelection: () => void;
    onLoadMoreMessages: () => void;
    onMessageRowClick: (event: React.MouseEvent, message: MessageItem, messageIndex: number) => void;
    onOpenMessageMenu: (message: MessageItem, x: number, y: number) => void;
    onOpenMessageWindow: (messageId: number) => void;
    onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
    getThreadCount: (message: MessageItem) => number;
    formatMessageSender: (message: MessageItem) => string;
    getTagDotClass: (tag: string | null) => string;
    getTagLabel: (tag: string | null) => string;
};

function DraggableMessageRow({
                                 message,
                                 messageIndex,
                                 selectedMessageIds,
                                 selectedMessageId,
                                 contextMenuMessageId,
                                 onMessageRowClick,
                                 onOpenMessageWindow,
                                 onOpenMessageMenu,
                                 getThreadCount,
                                 formatMessageSender,
                                 getTagDotClass,
                                 getTagLabel,
                                 dateLocale,
}: {
    message: MessageItem;
    messageIndex: number;
    selectedMessageIds: number[];
    selectedMessageId: number | null;
    contextMenuMessageId: number | null;
    onMessageRowClick: (event: React.MouseEvent, message: MessageItem, messageIndex: number) => void;
    onOpenMessageWindow: (messageId: number) => void;
    onOpenMessageMenu: (message: MessageItem, x: number, y: number) => void;
    getThreadCount: (message: MessageItem) => number;
    formatMessageSender: (message: MessageItem) => string;
    getTagDotClass: (tag: string | null) => string;
    getTagLabel: (tag: string | null) => string;
    dateLocale?: string;
}) {
    const senderDisplay = formatMessageSender(message);

    const dragIds =
        selectedMessageIds.length > 1 && selectedMessageIds.includes(message.id) ? selectedMessageIds : [message.id];
    const [, dragRef, previewRef] = useDrag<MailMessageDragItem, unknown, { isDragging: boolean }>(
        () => ({
            type: DND_ITEM.MAIL_MESSAGE,
            item: {
                type: DND_ITEM.MAIL_MESSAGE,
                accountId: message.account_id,
                messageIds: dragIds,
                subject: message.subject || '(No subject)',
                from: formatMessageSender(message),
            },
        }),
        [dragIds, formatMessageSender, message],
    );
    React.useEffect(() => {
        previewRef(getEmptyImage(), {captureDraggingState: true});
    }, [previewRef]);
    return (
        <div
            ref={(node) => void dragRef(node)}
            className={cn(
                'mail-list-row block w-full px-5 py-4 text-left',
                selectedMessageIds.includes(message.id) && 'is-selected',
                selectedMessageId === message.id && 'is-focused',
                contextMenuMessageId === message.id && 'is-menu-open',
            )}
            onClick={(event) => {
                onMessageRowClick(event, message, messageIndex);
            }}
            onDoubleClick={() => {
                onOpenMessageWindow(message.id);
            }}
            onContextMenu={(event) => {
                event.preventDefault();
                onOpenMessageMenu(message, event.clientX, event.clientY);
            }}
        >
            <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0 flex-1">
                    <div
                        className={cn(
                            'flex min-w-0 items-center gap-2 text-sm',
                            message.is_read
                                ? 'mail-list-subject-read font-medium'
                                : 'mail-list-subject-unread font-semibold',
                        )}
                    >
                        {!message.is_read && (
                            <span
                                className="mail-list-unread-dot inline-flex h-2 w-2 shrink-0 rounded-full"
                                title="Unread"
                                aria-label="Unread"
                            />
                        )}
                        <span className="truncate">{message.subject || '(No subject)'}</span>
                        {getThreadCount(message) > 1 && (
                            <span
                                className="mail-list-thread-count inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none">
								{getThreadCount(message)}
							</span>
                        )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <p className="mail-list-sender truncate text-xs">{senderDisplay}</p>
                            {Boolean((message as MessageItem & { tag?: string | null }).tag) && (
                                <span
                                    className="mail-list-tag-chip inline-flex max-w-[10rem] items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]">
									<span
                                        className={cn(
                                            'inline-flex h-1.5 w-1.5 shrink-0 rounded-full',
                                            getTagDotClass(
                                                (
                                                    message as MessageItem & {
                                                        tag?: string | null;
                                                    }
                                                ).tag ?? null,
                                            ),
                                        )}
                                    />
									<span className="truncate">
										{getTagLabel((message as MessageItem & { tag?: string | null }).tag ?? null)}
									</span>
								</span>
                            )}
                        </div>
                        <span
                            className="mail-list-meta ml-3 inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs">
							{Boolean(message.is_flagged) && (
                                <span className="mail-list-starred inline-flex items-center" title="Starred">
									<Star size={12} className="fill-current"/>
								</span>
                            )}
                            <span>{formatSystemDateTime(message.date, dateLocale)}</span>
						</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SideListMailPane({
                                             mailListWidth,
                                             isCompactSideList,
                                             selectedMessageIds,
                                             selectedMessageId,
                                             contextMenuMessageId,
                                             messages,
                                             hasMoreMessages,
                                             loadingMoreMessages,
                                             dateLocale,
                                             children,
                                             onOpenSearchModal,
                                             onBulkMarkRead,
                                             onBulkDelete,
                                             onClearMessageSelection,
                                             onLoadMoreMessages,
                                             onMessageRowClick,
                                             onOpenMessageMenu,
                                             onOpenMessageWindow,
                                             onResizeStart,
                                             getThreadCount,
                                             formatMessageSender,
                                             getTagDotClass,
                                             getTagLabel,
                                         }: SideListMailPaneProps) {
    return (
        <>
            <main
                className={cn(
                    'mail-list-pane relative flex min-h-0 flex-col',
                    isCompactSideList ? 'min-w-0 flex-1' : 'shrink-0',
                )}
                style={isCompactSideList ? undefined : {width: mailListWidth}}
            >
                <div className="mail-list-pane-header p-2">
                    <div className="relative">
                        <FormInput
                            type="text"
                            readOnly
                            value=""
                            placeholder="Search mail"
                            leftIcon={<Search size={14} className="ui-text-muted"/>}
                            className="mail-list-search-input pr-14"
                            onClick={onOpenSearchModal}
                            onFocus={(event) => {
                                onOpenSearchModal();
                                event.currentTarget.blur();
                            }}
                            aria-label="Search mail"
                        />
                        <span
                            className="mail-list-shortcut pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-wide">
							Ctrl+F
						</span>
                    </div>
                </div>
                {selectedMessageIds.length > 1 && (
                    <div className="mail-list-pane-header px-2 py-2">
                        <div className="mail-selection-toolbar flex flex-wrap items-center gap-2 rounded-md p-2">
							<span className="ui-text-secondary text-xs font-medium">
								{selectedMessageIds.length} selected
							</span>
                            <Button
                                type="button"
                                variant="secondary"
                                className="rounded-md px-2 py-1 text-xs"
                                onClick={() => onBulkMarkRead(selectedMessageIds, 1)}
                            >
                                Mark read
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                className="rounded-md px-2 py-1 text-xs"
                                onClick={() => onBulkMarkRead(selectedMessageIds, 0)}
                            >
                                Mark unread
                            </Button>
                            <Button
                                type="button"
                                variant="danger"
                                className="rounded-md px-2 py-1 text-xs"
                                onClick={() => onBulkDelete(selectedMessageIds)}
                            >
                                Delete
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                className="rounded-md px-2 py-1 text-xs"
                                onClick={onClearMessageSelection}
                            >
                                Clear
                            </Button>
                        </div>
                    </div>
                )}
                <ScrollArea
                    className="min-h-0 flex-1 overflow-auto"
                    onScroll={(event) => {
                        if (!hasMoreMessages || loadingMoreMessages) return;
                        const el = event.currentTarget;
                        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 220) {
                            onLoadMoreMessages();
                        }
                    }}
                >
                    {messages.length === 0 && (
                        <div className="mail-list-empty p-5 text-sm">No messages in this folder yet.</div>
                    )}
                    {messages.map((message, messageIndex) => (
                        <DraggableMessageRow
                            key={message.id}
                            message={message}
                            messageIndex={messageIndex}
                            selectedMessageIds={selectedMessageIds}
                            selectedMessageId={selectedMessageId}
                            contextMenuMessageId={contextMenuMessageId}
                            onMessageRowClick={onMessageRowClick}
                            onOpenMessageWindow={onOpenMessageWindow}
                            onOpenMessageMenu={onOpenMessageMenu}
                            getThreadCount={getThreadCount}
                            formatMessageSender={formatMessageSender}
                            getTagDotClass={getTagDotClass}
                            getTagLabel={getTagLabel}
                            dateLocale={dateLocale}
                        />
                    ))}
                    {loadingMoreMessages && messages.length > 0 && (
                        <div className="mail-list-loading px-5 py-3 text-center text-xs">Loading more messages...</div>
                    )}
                    {!hasMoreMessages && messages.length > 0 && (
                        <div className="mail-list-end px-5 py-3 text-center text-xs">End of list</div>
                    )}
                </ScrollArea>
                {!isCompactSideList && (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="mail-resize-hover absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-transparent"
                        onMouseDown={onResizeStart}
                    />
                )}
            </main>
            {!isCompactSideList && (
                <section className="mail-preview-pane flex min-w-0 flex-1 flex-col">{children}</section>
            )}
        </>
    );
}
