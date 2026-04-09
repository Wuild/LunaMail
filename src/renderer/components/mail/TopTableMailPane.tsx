import React from 'react';
import {Search, Settings} from 'lucide-react';
import {
    closestCenter,
    DndContext,
    DragOverlay,
    type DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {arrayMove, horizontalListSortingStrategy, SortableContext, useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {useDrag} from 'react-dnd';
import {getEmptyImage} from 'react-dnd-html5-backend';
import type {MessageItem} from '../../../preload';
import {ScrollArea} from '../ui/scroll-area';
import {cn} from '../../lib/utils';
import {Button} from '../ui/button';
import {FormInput} from '../ui/FormControls';
import {DND_ITEM} from '../../lib/dndTypes';

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
type MailMessageDragItem = { type: typeof DND_ITEM.MAIL_MESSAGE; accountId: number; messageIds: number[] };
type MailMessageDragItemPreview = MailMessageDragItem & { subject?: string; from?: string };

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
    children: React.ReactNode;
    onOpenSearchModal: () => void;
    onBulkMarkRead: (messageIds: number[], nextRead: number) => void;
    onBulkDelete: (messageIds: number[]) => void;
    onClearMessageSelection: () => void;
    onLoadMoreMessages: () => void;
    onOpenTableHeadMenuAt: (x: number, y: number) => void;
    onReorderVisibleTableColumns: (orderedVisibleColumns: MailTableColumnKey[]) => void;
    onBeginTableColumnResize: (event: React.MouseEvent, column: MailTableColumnKey) => void;
    onMessageRowClick: (event: React.MouseEvent, message: MessageItem, messageIndex: number) => void;
    onOpenMessageMenu: (message: MessageItem, x: number, y: number) => void;
    onOpenMessageWindow: (messageId: number) => void;
    renderTableCell: (message: MessageItem, column: MailTableColumnKey) => React.ReactNode;
    onTopListResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
};

type SortableHeaderProps = {
    column: MailTableColumnKey;
    index: number;
    visibleColumnCount: number;
    label: string;
    mailTableResizeHandleClass: string;
    onBeginTableColumnResize: (event: React.MouseEvent, column: MailTableColumnKey) => void;
};

function SortableHeaderCell({
    column,
    index,
    visibleColumnCount,
    label,
    mailTableResizeHandleClass,
    onBeginTableColumnResize,
}: SortableHeaderProps) {
    const {attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging} = useSortable({
        id: column,
    });

    return (
        <th
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.2 : 1,
            }}
            className={cn(
                'relative border-b border-slate-200 px-3 py-2 select-none dark:border-[#3a3d44]',
                index < visibleColumnCount - 1 && 'border-r border-r-slate-200 dark:border-r-[#3a3d44]',
            )}
        >
            <div
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                className="truncate cursor-grab active:cursor-grabbing"
            >
                <span className="truncate">{label}</span>
            </div>
            {index < visibleColumnCount - 1 && (
                <div
                    role="separator"
                    aria-orientation="vertical"
                    className={mailTableResizeHandleClass}
                    onMouseDown={(event) => onBeginTableColumnResize(event, column)}
                />
            )}
        </th>
    );
}

function DraggableTableRow({
    message,
    messageIndex,
    isCompactTopTable,
    selectedMessageIds,
    onMessageRowClick,
    onOpenMessageWindow,
    onOpenMessageMenu,
    visibleTableColumns,
    renderTableCell,
}: {
    message: MessageItem;
    messageIndex: number;
    isCompactTopTable: boolean;
    selectedMessageIds: number[];
    onMessageRowClick: (event: React.MouseEvent, message: MessageItem, messageIndex: number) => void;
    onOpenMessageWindow: (messageId: number) => void;
    onOpenMessageMenu: (message: MessageItem, x: number, y: number) => void;
    visibleTableColumns: MailTableColumnKey[];
    renderTableCell: (message: MessageItem, column: MailTableColumnKey) => React.ReactNode;
}) {
    const dragIds =
        selectedMessageIds.length > 1 && selectedMessageIds.includes(message.id) ? selectedMessageIds : [message.id];
    const [, dragRef, previewRef] = useDrag<MailMessageDragItemPreview, unknown, {isDragging: boolean}>(
        () => ({
            type: DND_ITEM.MAIL_MESSAGE,
            item: {
                type: DND_ITEM.MAIL_MESSAGE,
                accountId: message.account_id,
                messageIds: dragIds,
                subject: message.subject || '(No subject)',
                from: message.from_name || message.from_address || '',
            },
        }),
        [dragIds, message.account_id, message.from_address, message.from_name, message.subject],
    );
    React.useEffect(() => {
        previewRef(getEmptyImage(), {captureDraggingState: true});
    }, [previewRef]);
    return (
        <tr
            ref={(node) => void dragRef(node)}
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
            onContextMenu={(event) => {
                event.preventDefault();
                onOpenMessageMenu(message, event.clientX, event.clientY);
            }}
        >
            {visibleTableColumns.map((column) => renderTableCell(message, column))}
            <td className="px-1 py-2"/>
        </tr>
    );
}

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
                                             children,
                                             onOpenSearchModal,
                                             onBulkMarkRead,
                                             onBulkDelete,
                                             onClearMessageSelection,
                                             onLoadMoreMessages,
                                             onOpenTableHeadMenuAt,
                                             onReorderVisibleTableColumns,
                                             onBeginTableColumnResize,
                                             onMessageRowClick,
                                             onOpenMessageMenu,
                                             onOpenMessageWindow,
                                             renderTableCell,
                                             onTopListResizeStart,
                                         }: TopTableMailPaneProps) {
    const [draggingColumn, setDraggingColumn] = React.useState<MailTableColumnKey | null>(null);
    const headerSensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}));
    const headerLabelByKey = React.useMemo(
        () =>
            Object.fromEntries(tableColumnOptions.map((item) => [item.key, item.label])) as Record<MailTableColumnKey, string>,
        [tableColumnOptions],
    );

    const onHeaderDragEnd = React.useCallback((event: DragEndEvent) => {
        const active = String(event.active.id) as MailTableColumnKey;
        const over = event.over ? (String(event.over.id) as MailTableColumnKey) : null;
        if (!over || active === over) {
            setDraggingColumn(null);
            return;
        }
        const fromIndex = visibleTableColumns.indexOf(active);
        const toIndex = visibleTableColumns.indexOf(over);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
            setDraggingColumn(null);
            return;
        }
        onReorderVisibleTableColumns(arrayMove(visibleTableColumns, fromIndex, toIndex));
        setDraggingColumn(null);
    }, [onReorderVisibleTableColumns, visibleTableColumns]);

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
                        <DndContext
                            sensors={headerSensors}
                            collisionDetection={closestCenter}
                            onDragStart={(event) => setDraggingColumn(String(event.active.id) as MailTableColumnKey)}
                            onDragEnd={onHeaderDragEnd}
                            onDragCancel={() => setDraggingColumn(null)}
                        >
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
                                    <SortableContext items={visibleTableColumns} strategy={horizontalListSortingStrategy}>
                                        <tr className="group text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                            {visibleTableColumns.map((column, index) => (
                                                <SortableHeaderCell
                                                    key={column}
                                                    column={column}
                                                    index={index}
                                                    visibleColumnCount={visibleTableColumns.length}
                                                    label={headerLabelByKey[column] || column}
                                                    mailTableResizeHandleClass={mailTableResizeHandleClass}
                                                    onBeginTableColumnResize={onBeginTableColumnResize}
                                                />
                                            ))}
                                            <th className="border-b border-slate-200 px-1 py-1 text-right dark:border-[#3a3d44]">
                                                <Button
                                                    type="button"
                                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-[#3a3d44] dark:hover:text-slate-100"
                                                    aria-label="Table column options"
                                                    title="Table column options"
                                                    onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                                                        event.stopPropagation();
                                                        const rect = event.currentTarget.getBoundingClientRect();
                                                        onOpenTableHeadMenuAt(rect.right - 8, rect.bottom + 6);
                                                    }}
                                                >
                                                    <Settings size={13}/>
                                                </Button>
                                            </th>
                                        </tr>
                                    </SortableContext>
                                </thead>
                                <tbody>
                                {messages.map((message, messageIndex) => (
                                    <DraggableTableRow
                                        key={message.id}
                                        message={message}
                                        messageIndex={messageIndex}
                                        isCompactTopTable={isCompactTopTable}
                                        selectedMessageIds={selectedMessageIds}
                                        onMessageRowClick={onMessageRowClick}
                                        onOpenMessageWindow={onOpenMessageWindow}
                                        onOpenMessageMenu={onOpenMessageMenu}
                                        visibleTableColumns={visibleTableColumns}
                                        renderTableCell={renderTableCell}
                                    />
                                ))}
                                </tbody>
                            </table>
                            <DragOverlay dropAnimation={null}>
                                {draggingColumn ? (
                                    <div className="min-w-[120px] rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 opacity-85 shadow-xl dark:border-[#4a4d55] dark:bg-[#2b2d31] dark:text-slate-200">
                                        {headerLabelByKey[draggingColumn] || draggingColumn}
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
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
