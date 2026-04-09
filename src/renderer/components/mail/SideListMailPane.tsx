import React from 'react';
import {Search, Star} from 'lucide-react';
import {useDrag} from 'react-dnd';
import {getEmptyImage} from 'react-dnd-html5-backend';
import type {MessageItem} from '../../../preload';
import {ScrollArea} from '../ui/scroll-area';
import {formatSystemDateTime} from '../../lib/dateTime';
import {cn} from '../../lib/utils';
import {Button} from '../ui/button';
import {FormInput} from '../ui/FormControls';
import {DND_ITEM} from '../../lib/dndTypes';

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
    isCompactSideList,
    selectedMessageIds,
    selectedMessageId,
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
    isCompactSideList: boolean;
    selectedMessageIds: number[];
    selectedMessageId: number | null;
    onMessageRowClick: (event: React.MouseEvent, message: MessageItem, messageIndex: number) => void;
    onOpenMessageWindow: (messageId: number) => void;
    onOpenMessageMenu: (message: MessageItem, x: number, y: number) => void;
    getThreadCount: (message: MessageItem) => number;
    formatMessageSender: (message: MessageItem) => string;
    getTagDotClass: (tag: string | null) => string;
    getTagLabel: (tag: string | null) => string;
    dateLocale?: string;
}) {
    const dragIds =
        selectedMessageIds.length > 1 && selectedMessageIds.includes(message.id) ? selectedMessageIds : [message.id];
    const [, dragRef, previewRef] = useDrag<MailMessageDragItem, unknown, {isDragging: boolean}>(
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
                'block w-full border-b border-slate-100 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:border-[#393c41] dark:hover:bg-[#32353b]',
                selectedMessageIds.includes(message.id) && 'bg-sky-50/70 dark:bg-[#3a3e52]',
                selectedMessageId === message.id && 'border-l-4 border-l-sky-600 dark:border-l-[#5865f2]',
            )}
            onClick={(event) => {
                onMessageRowClick(event, message, messageIndex);
                if (!isCompactSideList) return;
                if (event.shiftKey || event.ctrlKey || event.metaKey) return;
                onOpenMessageWindow(message.id);
            }}
            onDoubleClick={() => {
                onOpenMessageWindow(message.id);
            }}
            onContextMenu={(event) => {
                event.preventDefault();
                onOpenMessageMenu(message, event.clientX, event.clientY);
            }}
        >
            <div
                className={`flex min-w-0 items-center gap-2 text-sm ${message.is_read ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-semibold text-slate-950 dark:text-white'}`}
            >
                {!message.is_read && (
                    <span
                        className="inline-flex h-2 w-2 shrink-0 rounded-full bg-sky-500 dark:bg-[#8ab4ff]"
                        title="Unread"
                        aria-label="Unread"
                    />
                )}
                <span className="truncate">{message.subject || '(No subject)'}</span>
                {getThreadCount(message) > 1 && (
                    <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold leading-none text-slate-700 dark:bg-[#454a55] dark:text-slate-100">
						{getThreadCount(message)}
					</span>
                )}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {formatMessageSender(message)}
                    </p>
                    {Boolean((message as MessageItem & { tag?: string | null }).tag) && (
                        <span
                            className="inline-flex max-w-[10rem] items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-[#4a4d55] dark:text-slate-200">
							<span
                                className={cn(
                                    'inline-flex h-1.5 w-1.5 shrink-0 rounded-full',
                                    getTagDotClass((message as MessageItem & { tag?: string | null }).tag ?? null),
                                )}
                            />
							<span className="truncate">
								{getTagLabel((message as MessageItem & { tag?: string | null }).tag ?? null)}
							</span>
						</span>
                    )}
                </div>
                <span
                    className="ml-3 inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
					{Boolean(message.is_flagged) && (
                        <span
                            className="inline-flex items-center text-amber-500 dark:text-amber-300"
                            title="Starred"
                        >
							<Star size={12} className="fill-current"/>
						</span>
                    )}
                    <span>{formatSystemDateTime(message.date, dateLocale)}</span>
				</span>
            </div>
        </div>
    );
}

export default function SideListMailPane({
                                             mailListWidth,
                                             isCompactSideList,
                                             selectedMessageIds,
                                             selectedMessageId,
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
                    'relative flex min-h-0 flex-col border-r border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]',
                    isCompactSideList ? 'min-w-0 flex-1' : 'shrink-0',
                )}
                style={isCompactSideList ? undefined : {width: mailListWidth}}
            >
                <div className="border-b border-slate-200 p-2 dark:border-[#3a3d44]">
                    <div className="relative">
                        <FormInput
                            type="text"
                            readOnly
                            value=""
                            placeholder="Search mail"
                            leftIcon={<Search size={14} className="text-slate-500 dark:text-slate-400"/>}
                            className="pr-14 text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#25272c]"
                            onClick={onOpenSearchModal}
                            onFocus={(event) => {
                                onOpenSearchModal();
                                event.currentTarget.blur();
                            }}
                            aria-label="Search mail"
                        />
                        <span
                            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
							Ctrl+F
						</span>
                    </div>
                </div>
                {selectedMessageIds.length > 1 && (
                    <div className="border-b border-slate-200 px-2 py-2 dark:border-[#3a3d44]">
                        <div
                            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-slate-50 p-2 dark:border-[#3a3d44] dark:bg-[#26292f]">
							<span className="text-xs font-medium text-slate-600 dark:text-slate-300">
								{selectedMessageIds.length} selected
							</span>
                            <Button
                                type="button"
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => onBulkMarkRead(selectedMessageIds, 1)}
                            >
                                Mark read
                            </Button>
                            <Button
                                type="button"
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => onBulkMarkRead(selectedMessageIds, 0)}
                            >
                                Mark unread
                            </Button>
                            <Button
                                type="button"
                                className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/25"
                                onClick={() => onBulkDelete(selectedMessageIds)}
                            >
                                Delete
                            </Button>
                            <Button
                                type="button"
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
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
                        <div className="p-5 text-sm text-slate-500 dark:text-slate-400">
                            No messages in this folder yet.
                        </div>
                    )}
                    {messages.map((message, messageIndex) => (
                        <DraggableMessageRow
                            key={message.id}
                            message={message}
                            messageIndex={messageIndex}
                            isCompactSideList={isCompactSideList}
                            selectedMessageIds={selectedMessageIds}
                            selectedMessageId={selectedMessageId}
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
                        <div className="px-5 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                            Loading more messages...
                        </div>
                    )}
                    {!hasMoreMessages && messages.length > 0 && (
                        <div className="px-5 py-3 text-center text-xs text-slate-400 dark:text-slate-500">
                            End of list
                        </div>
                    )}
                </ScrollArea>
                {!isCompactSideList && (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300/70 dark:hover:bg-slate-500/70"
                        onMouseDown={onResizeStart}
                    />
                )}
            </main>
            {!isCompactSideList && (
                <section className="flex min-w-0 flex-1 flex-col bg-white dark:bg-[#34373d]">{children}</section>
            )}
        </>
    );
}
