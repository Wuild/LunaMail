import React from 'react';
import {Search, Settings} from 'lucide-react';
import type {MessageItem} from '../../../preload';
import {ScrollArea} from '../ui/scroll-area';
import {cn} from '../../lib/utils';

type MailTableColumnKey =
    | 'subject'
    | 'from'
    | 'recipient'
    | 'date'
    | 'read_status'
    | 'flagged'
    | 'tag'
    | 'account'
    | 'location'
    | 'size';

type TableColumnOption = { key: MailTableColumnKey; label: string };

type TopTableMailPaneProps = {
    isCompactTopTable: boolean;
    topListHeight: number;
    selectedMessageIds: number[];
    messages: MessageItem[];
    loadingMoreMessages: boolean;
    hasMoreMessages: boolean;
    visibleTableColumns: MailTableColumnKey[];
    tableColumnOptions: TableColumnOption[];
    effectiveTableColumnWidths: Record<MailTableColumnKey, number>;
    tableMinWidth: number;
    mailTableResizeHandleClass: string;
    draggingColumn: MailTableColumnKey | null;
    dragPlaceholder: { column: MailTableColumnKey; side: 'before' | 'after' } | null;
    children: React.ReactNode;
    onOpenSearchModal: () => void;
    onBulkMarkRead: (messageIds: number[], nextRead: number) => void;
    onBulkDelete: (messageIds: number[]) => void;
    onClearMessageSelection: () => void;
    onLoadMoreMessages: () => void;
    onOpenTableHeadMenuAt: (x: number, y: number) => void;
    onTableHeaderDragStart: (event: React.DragEvent, column: MailTableColumnKey) => void;
    onTableHeaderDragOver: (event: React.DragEvent, column: MailTableColumnKey) => void;
    onTableHeaderDragLeave: (column: MailTableColumnKey) => void;
    onTableHeaderDrop: (event: React.DragEvent, column: MailTableColumnKey) => void;
    onTableHeaderDragEnd: () => void;
    onBeginTableColumnResize: (event: React.MouseEvent, column: MailTableColumnKey) => void;
    onMessageRowClick: (event: React.MouseEvent, message: MessageItem, messageIndex: number) => void;
    onMessageRowDragStart: (event: React.DragEvent, message: MessageItem) => void;
    onResetMessageDragState: () => void;
    onOpenMessageMenu: (message: MessageItem, x: number, y: number) => void;
    onOpenMessageWindow: (messageId: number) => void;
    renderTableCell: (message: MessageItem, column: MailTableColumnKey) => React.ReactNode;
    onTopListResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
};

export default function TopTableMailPane({
                                             isCompactTopTable,
                                             topListHeight,
                                             selectedMessageIds,
                                             messages,
                                             loadingMoreMessages,
                                             hasMoreMessages,
                                             visibleTableColumns,
                                             tableColumnOptions,
                                             effectiveTableColumnWidths,
                                             tableMinWidth,
                                             mailTableResizeHandleClass,
                                             draggingColumn,
                                             dragPlaceholder,
                                             children,
                                             onOpenSearchModal,
                                             onBulkMarkRead,
                                             onBulkDelete,
                                             onClearMessageSelection,
                                             onLoadMoreMessages,
                                             onOpenTableHeadMenuAt,
                                             onTableHeaderDragStart,
                                             onTableHeaderDragOver,
                                             onTableHeaderDragLeave,
                                             onTableHeaderDrop,
                                             onTableHeaderDragEnd,
                                             onBeginTableColumnResize,
                                             onMessageRowClick,
                                             onMessageRowDragStart,
                                             onResetMessageDragState,
                                             onOpenMessageMenu,
                                             onOpenMessageWindow,
                                             renderTableCell,
                                             onTopListResizeStart,
                                         }: TopTableMailPaneProps) {
    return (
        <section className="flex min-w-0 flex-1 flex-col bg-white dark:bg-[#34373d]">
            <div
                className={cn(
                    'relative flex min-h-0 flex-col border-b border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]',
                    isCompactTopTable ? 'flex-1' : 'shrink-0',
                )}
                style={isCompactTopTable ? undefined : {height: topListHeight}}
            >
                <div className="border-b border-slate-200 p-2 dark:border-[#3a3d44]">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search
                                size={14}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                            />
                            <input
                                type="text"
                                readOnly
                                value=""
                                placeholder="Search mail"
                                className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-14 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-500 hover:bg-slate-50 focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:placeholder:text-slate-400 dark:hover:bg-[#25272c] dark:focus:border-[#5865f2]"
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
                </div>
                {selectedMessageIds.length > 1 && (
                    <div className="border-b border-slate-200 px-2 py-2 dark:border-[#3a3d44]">
                        <div
                            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-slate-50 p-2 dark:border-[#3a3d44] dark:bg-[#26292f]">
							<span className="text-xs font-medium text-slate-600 dark:text-slate-300">
								{selectedMessageIds.length} selected
							</span>
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => onBulkMarkRead(selectedMessageIds, 1)}
                            >
                                Mark read
                            </button>
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => onBulkMarkRead(selectedMessageIds, 0)}
                            >
                                Mark unread
                            </button>
                            <button
                                type="button"
                                className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/25"
                                onClick={() => onBulkDelete(selectedMessageIds)}
                            >
                                Delete
                            </button>
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={onClearMessageSelection}
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                )}
                <ScrollArea
                    className="min-h-0 flex-1"
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
                    {messages.length > 0 && (
                        <table
                            key={`mail-table-${visibleTableColumns.join('|')}`}
                            className="table-fixed border-collapse text-sm"
                            style={{width: `max(${tableMinWidth}px, 100%)`, minWidth: '100%'}}
                        >
                            <colgroup>
                                {visibleTableColumns.map((column) => (
                                    <col key={column} style={{width: `${effectiveTableColumnWidths[column]}px`}}/>
                                ))}
                                <col style={{width: '44px'}}/>
                            </colgroup>
                            <thead
                                className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 shadow-[inset_0_-1px_0_0_rgb(226_232_240)] dark:border-[#3a3d44] dark:bg-[#2f3138] dark:shadow-[inset_0_-1px_0_0_#3a3d44]"
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    onOpenTableHeadMenuAt(event.clientX, event.clientY);
                                }}
                            >
                            <tr className="group text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                {visibleTableColumns.map((column, index) => {
                                    const label =
                                        tableColumnOptions.find((item) => item.key === column)?.label || column;
                                    return (
                                        <th
                                            key={column}
                                            className={cn(
                                                'relative border-b border-slate-200 px-3 py-2 select-none dark:border-[#3a3d44]',
                                                index < visibleTableColumns.length - 1 &&
                                                'border-r border-r-slate-200 dark:border-r-[#3a3d44]',
                                                draggingColumn === column && 'opacity-70',
                                                dragPlaceholder?.column === column &&
                                                draggingColumn &&
                                                draggingColumn !== column &&
                                                'bg-sky-100/50 dark:bg-[#3a4f72]/60',
                                            )}
                                            draggable
                                            onDragStart={(event) => onTableHeaderDragStart(event, column)}
                                            onDragOver={(event) => onTableHeaderDragOver(event, column)}
                                            onDragLeave={() => onTableHeaderDragLeave(column)}
                                            onDrop={(event) => onTableHeaderDrop(event, column)}
                                            onDragEnd={onTableHeaderDragEnd}
                                        >
                                            {dragPlaceholder?.column === column &&
                                                dragPlaceholder.side === 'before' && (
                                                    <span
                                                        className="pointer-events-none absolute bottom-0 left-0 top-0 w-0.5 bg-sky-600 dark:bg-sky-400"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            <div className="truncate">
                                                <span className="truncate">{label}</span>
                                            </div>
                                            {dragPlaceholder?.column === column &&
                                                dragPlaceholder.side === 'after' && (
                                                    <span
                                                        className="pointer-events-none absolute bottom-0 right-0 top-0 w-0.5 bg-sky-600 dark:bg-sky-400"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            {index < visibleTableColumns.length - 1 && (
                                                <div
                                                    role="separator"
                                                    aria-orientation="vertical"
                                                    className={mailTableResizeHandleClass}
                                                    onMouseDown={(event) => onBeginTableColumnResize(event, column)}
                                                />
                                            )}
                                        </th>
                                    );
                                })}
                                <th className="border-b border-slate-200 px-1 py-1 text-right dark:border-[#3a3d44]">
                                    <button
                                        type="button"
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-[#3a3d44] dark:hover:text-slate-100"
                                        aria-label="Table column options"
                                        title="Table column options"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            const rect = event.currentTarget.getBoundingClientRect();
                                            onOpenTableHeadMenuAt(rect.right - 8, rect.bottom + 6);
                                        }}
                                    >
                                        <Settings size={13}/>
                                    </button>
                                </th>
                            </tr>
                            </thead>
                            <tbody>
                            {messages.map((message, messageIndex) => (
                                <tr
                                    key={message.id}
                                    className={cn(
                                        'cursor-pointer border-t border-slate-100 first:border-t-0 hover:bg-slate-50 dark:border-[#393c41] dark:hover:bg-[#32353b]',
                                        selectedMessageIds.includes(message.id) && 'bg-sky-50/70 dark:bg-[#3a3e52]',
                                    )}
                                    onClick={(event) => {
                                        onMessageRowClick(event, message, messageIndex);
                                        if (!isCompactTopTable) return;
                                        if (event.shiftKey || event.ctrlKey || event.metaKey) return;
                                        onOpenMessageWindow(message.id);
                                    }}
                                    onDoubleClick={() => {
                                        onOpenMessageWindow(message.id);
                                    }}
                                    draggable
                                    onDragStart={(event) => onMessageRowDragStart(event, message)}
                                    onDragEnd={onResetMessageDragState}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        onOpenMessageMenu(message, event.clientX, event.clientY);
                                    }}
                                >
                                    {visibleTableColumns.map((column) => renderTableCell(message, column))}
                                    <td className="px-1 py-2"/>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                    {loadingMoreMessages && messages.length > 0 && (
                        <div className="px-5 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                            Loading more messages...
                        </div>
                    )}
                </ScrollArea>
                {!isCompactTopTable && (
                    <div
                        role="separator"
                        aria-orientation="horizontal"
                        className="absolute bottom-0 left-0 right-0 z-10 h-1.5 cursor-row-resize bg-transparent hover:bg-slate-300/70 dark:hover:bg-slate-500/70"
                        onMouseDown={onTopListResizeStart}
                    />
                )}
            </div>
            {!isCompactTopTable && <div className="min-h-0 flex-1">{children}</div>}
        </section>
    );
}
