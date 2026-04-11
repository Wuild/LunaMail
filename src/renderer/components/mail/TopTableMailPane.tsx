import React from 'react';
import {Search, Settings} from 'lucide-react';
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {arrayMove, horizontalListSortingStrategy, SortableContext, useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {useDrag} from 'react-dnd';
import {getEmptyImage} from 'react-dnd-html5-backend';
import type {MessageItem} from '@/preload';
import {ScrollArea} from '../ui/scroll-area';
import {cn} from '@renderer/lib/utils';
import {Button} from '../ui/button';
import {FormInput} from '../ui/FormControls';
import {DND_ITEM} from '@renderer/lib/dndTypes';

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

type TableColumnOption = {key: MailTableColumnKey; label: string};
type MailMessageDragItem = {type: typeof DND_ITEM.MAIL_MESSAGE; accountId: number; messageIds: number[]};
type MailMessageDragItemPreview = MailMessageDragItem & {subject?: string; from?: string};

type TopTableMailPaneProps = {
	isCompactTopTable: boolean;
	topListHeight: number;
	selectedMessageIds: number[];
	contextMenuMessageId: number | null;
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
	isTableHeadMenuOpen: boolean;
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
				'ui-border-default ui-surface-content relative border-b px-3 py-2 select-none',
				index < visibleColumnCount - 1 && 'ui-border-default border-r',
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
	selectedMessageIds,
	contextMenuMessageId,
	onMessageRowClick,
	onOpenMessageWindow,
	onOpenMessageMenu,
	visibleTableColumns,
	renderTableCell,
}: {
	message: MessageItem;
	messageIndex: number;
	selectedMessageIds: number[];
	contextMenuMessageId: number | null;
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
				'mail-table-row cursor-pointer first:border-t-0',
				selectedMessageIds.includes(message.id) && 'is-selected',
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
			{visibleTableColumns.map((column) => renderTableCell(message, column))}
			<td className="px-1 py-2" />
		</tr>
	);
}

export default function TopTableMailPane({
	isCompactTopTable,
	topListHeight,
	selectedMessageIds,
	contextMenuMessageId,
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
	isTableHeadMenuOpen,
}: TopTableMailPaneProps) {
	const [draggingColumn, setDraggingColumn] = React.useState<MailTableColumnKey | null>(null);
	const headerSensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}));
	const headerLabelByKey = React.useMemo(
		() =>
			Object.fromEntries(tableColumnOptions.map((item) => [item.key, item.label])) as Record<
				MailTableColumnKey,
				string
			>,
		[tableColumnOptions],
	);

	const onHeaderDragEnd = React.useCallback(
		(event: DragEndEvent) => {
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
		},
		[onReorderVisibleTableColumns, visibleTableColumns],
	);

	return (
		<section className="workspace-content flex min-w-0 flex-1 flex-col">
			<div
				className={cn(
					'panel relative flex min-h-0 flex-col border-0 border-b',
					isCompactTopTable ? 'flex-1' : 'shrink-0',
				)}
				style={isCompactTopTable ? undefined : {height: topListHeight}}
			>
				<div className="ui-border-default border-b p-2">
					<div className="flex items-center gap-2">
						<div className="relative flex-1">
							<FormInput
								type="text"
								readOnly
								value=""
								placeholder="Search mail"
								leftIcon={<Search size={14} className="ui-text-muted" />}
								className="mail-list-search-input ui-text-secondary pr-14"
								onClick={onOpenSearchModal}
								onFocus={(event) => {
									onOpenSearchModal();
									event.currentTarget.blur();
								}}
								aria-label="Search mail"
							/>
							<span className="ui-text-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-wide">
								Ctrl+F
							</span>
						</div>
					</div>
				</div>
				{selectedMessageIds.length > 1 && (
					<div className="ui-border-default border-b px-2 py-2">
						<div className="ui-border-default ui-surface-hover flex flex-wrap items-center gap-2 rounded-md border p-2">
							<span className="ui-text-secondary text-xs font-medium">
								{selectedMessageIds.length} selected
							</span>
							<Button
								type="button"
								className="button-secondary rounded-md px-2 py-1 text-xs"
								onClick={() => onBulkMarkRead(selectedMessageIds, 1)}
							>
								Mark read
							</Button>
							<Button
								type="button"
								className="button-secondary rounded-md px-2 py-1 text-xs"
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
								className="button-secondary rounded-md px-2 py-1 text-xs"
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
						<div className="ui-text-muted p-5 text-sm">No messages in this folder yet.</div>
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
										<col key={column} style={{width: `${effectiveTableColumnWidths[column]}px`}} />
									))}
									<col style={{width: '44px'}} />
								</colgroup>
								<thead
									className="ui-border-default ui-surface-content ui-surface-hover sticky top-0 z-10 border-b shadow-[inset_0_-1px_0_0_var(--app-border)]"
									onContextMenu={(event) => {
										event.preventDefault();
										onOpenTableHeadMenuAt(event.clientX, event.clientY);
									}}
								>
									<SortableContext
										items={visibleTableColumns}
										strategy={horizontalListSortingStrategy}
									>
										<tr className="ui-text-secondary group text-left text-xs uppercase tracking-wide">
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
											<th className="ui-border-default ui-surface-content border-b px-1 py-1 text-right">
												<Button
													type="button"
													className="button-ghost inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors"
													aria-label="Table column options"
													title="Table column options"
													aria-haspopup="menu"
													aria-expanded={isTableHeadMenuOpen ? 'true' : 'false'}
													onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
														event.stopPropagation();
														const rect = event.currentTarget.getBoundingClientRect();
														onOpenTableHeadMenuAt(rect.right - 8, rect.bottom + 6);
													}}
												>
													<Settings size={13} />
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
											selectedMessageIds={selectedMessageIds}
											contextMenuMessageId={contextMenuMessageId}
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
									<div className="panel ui-text-secondary min-w-[120px] rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide opacity-85 shadow-xl">
										{headerLabelByKey[draggingColumn] || draggingColumn}
									</div>
								) : null}
							</DragOverlay>
						</DndContext>
					)}
					{loadingMoreMessages && messages.length > 0 && (
						<div className="ui-text-muted px-5 py-3 text-center text-xs">Loading more messages...</div>
					)}
				</ScrollArea>
				{!isCompactTopTable && (
					<div
						role="separator"
						aria-orientation="horizontal"
						className="resize-handle absolute bottom-0 left-0 right-0 z-10 h-1.5 cursor-row-resize bg-transparent"
						onMouseDown={onTopListResizeStart}
					/>
				)}
			</div>
			{!isCompactTopTable && <div className="min-h-0 flex-1">{children}</div>}
		</section>
	);
}
