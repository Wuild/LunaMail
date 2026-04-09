import React, {useRef} from "react";
import {useDrag, useDrop} from "react-dnd";
import {ArrowDown, ArrowUp} from "lucide-react";
import {Button} from "../components/ui/button";
import {CLOUD_TABLE_RESIZE_HANDLE_CLASS, type CloudTableColumnKey} from "./cloudFilesHelpers";
import {DND_ITEM} from "../lib/dndTypes";

type CloudTableSortDirection = "asc" | "desc";
type CloudColumnDragItem = {type: typeof DND_ITEM.CLOUD_TABLE_COLUMN; column: CloudTableColumnKey};

type CloudSortableHeaderCellProps = {
	columnKey: CloudTableColumnKey;
	label: string;
	index: number;
	visibleColumnCount: number;
	dragPlaceholder: {column: CloudTableColumnKey; side: "before" | "after"} | null;
	tableSort: {column: CloudTableColumnKey; direction: CloudTableSortDirection};
	onToggleSort: (column: CloudTableColumnKey) => void;
	onColumnResizeStart: (key: CloudTableColumnKey, event: React.MouseEvent) => void;
	onDragStart: (column: CloudTableColumnKey) => void;
	onHover: (column: CloudTableColumnKey, side: "before" | "after", dragged?: CloudTableColumnKey) => void;
	onDrop: (column: CloudTableColumnKey, side: "before" | "after", dragged?: CloudTableColumnKey) => void;
	onDragEnd: () => void;
};

export default function CloudSortableHeaderCell({
	columnKey,
	label,
	index,
	visibleColumnCount,
	dragPlaceholder,
	tableSort,
	onToggleSort,
	onColumnResizeStart,
	onDragStart,
	onHover,
	onDrop,
	onDragEnd,
}: CloudSortableHeaderCellProps) {
	const headerRef = useRef<HTMLTableCellElement | null>(null);
	const [, dragRef] = useDrag<CloudColumnDragItem, unknown, {isDragging: boolean}>(
		() => ({
			type: DND_ITEM.CLOUD_TABLE_COLUMN,
			item: () => {
				onDragStart(columnKey);
				return {type: DND_ITEM.CLOUD_TABLE_COLUMN, column: columnKey};
			},
			end: () => onDragEnd(),
		}),
		[columnKey, onDragEnd, onDragStart],
	);
	const [, dropRef] = useDrop<CloudColumnDragItem>(
		() => ({
			accept: DND_ITEM.CLOUD_TABLE_COLUMN,
			hover: (item, monitor) => {
				if (item.column === columnKey || !headerRef.current) return;
				const rect = headerRef.current.getBoundingClientRect();
				const client = monitor.getClientOffset();
				if (!client) return;
				onHover(columnKey, client.x < rect.left + rect.width / 2 ? "before" : "after", item.column);
			},
			drop: (item, monitor) => {
				if (monitor.didDrop() || !headerRef.current) return;
				const rect = headerRef.current.getBoundingClientRect();
				const client = monitor.getClientOffset();
				const side: "before" | "after" = client && client.x >= rect.left + rect.width / 2 ? "after" : "before";
				onDrop(columnKey, side, item.column);
			},
		}),
		[columnKey, onDrop, onHover],
	);
	dragRef(dropRef(headerRef));

	return (
		<th
			ref={headerRef}
			className={`relative border-b border-slate-200 bg-slate-100 px-3 py-2 select-none dark:border-[#3a3d44] dark:bg-[#32353c] ${
				index < visibleColumnCount - 1 ? "border-r border-r-slate-200 dark:border-r-[#3a3d44]" : ""
			}`}
		>
			{dragPlaceholder?.column === columnKey && dragPlaceholder.side === "before" && (
				<span
					className="pointer-events-none absolute bottom-0 left-0 top-0 w-0.5 bg-sky-600 dark:bg-sky-400"
					aria-hidden="true"
				/>
			)}
			<Button
				type="button"
				className="inline-flex max-w-full items-center gap-1 truncate text-left hover:text-slate-900 dark:hover:text-slate-100"
				onClick={() => onToggleSort(columnKey)}
			>
				<span className="truncate">{label}</span>
				{tableSort.column === columnKey &&
					(tableSort.direction === "asc" ? (
						<ArrowUp size={12} className="shrink-0" />
					) : (
						<ArrowDown size={12} className="shrink-0" />
					))}
			</Button>
			{index < visibleColumnCount - 1 && (
				<div
					role="separator"
					aria-orientation="vertical"
					className={CLOUD_TABLE_RESIZE_HANDLE_CLASS}
					onMouseDown={(event) => onColumnResizeStart(columnKey, event)}
				/>
			)}
			{dragPlaceholder?.column === columnKey && dragPlaceholder.side === "after" && (
				<span
					className="pointer-events-none absolute bottom-0 right-0 top-0 w-0.5 bg-sky-600 dark:bg-sky-400"
					aria-hidden="true"
				/>
			)}
		</th>
	);
}
