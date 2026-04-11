import React from 'react';
import {cn} from '@renderer/lib/utils';
import {ContextMenu, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator} from '../ui/ContextMenu';

type TableColumnOption<TColumn extends string> = {
    key: TColumn;
    label: string;
};

type TableColumnsMenuProps<TColumn extends string> = {
    options: Array<TableColumnOption<TColumn>>;
    selectedColumns: TColumn[];
    position: { left: number; top: number };
    ready: boolean;
    onClose?: () => void;
    onToggleColumn: (column: TColumn) => void;
    onResetColumns: () => void;
};

function TableColumnsMenuInner<TColumn extends string>(
    {
        options,
        selectedColumns,
        position,
        ready,
        onClose,
        onToggleColumn,
        onResetColumns
    }: TableColumnsMenuProps<TColumn>,
    ref: React.ForwardedRef<HTMLDivElement>,
) {
    return (
        <ContextMenu
            ref={ref}
            size="lg"
            layer="1015"
            position={position}
            ready={ready}
            onRequestClose={onClose}
            onClick={(event) => event.stopPropagation()}
        >
            <ContextMenuLabel>Table Columns</ContextMenuLabel>
            {options.map((column) => {
                const checked = selectedColumns.includes(column.key);
                return (
                    <ContextMenuItem
                        key={column.key}
                        type="button"
                        align="between"
                        onClick={() => onToggleColumn(column.key)}
                    >
                        <span>{column.label}</span>
                        <span
                            className={cn(
                                'context-menu-checkmark',
                                checked ? 'text-success' : 'text-transparent',
                            )}
                            aria-hidden={!checked}
                        >
							✓
						</span>
                    </ContextMenuItem>
                );
            })}
            <ContextMenuSeparator/>
            <ContextMenuItem
                type="button"
                onClick={onResetColumns}
            >
                Reset Columns
            </ContextMenuItem>
        </ContextMenu>
    );
}

const TableColumnsMenu = React.forwardRef(TableColumnsMenuInner) as <TColumn extends string>(
    props: TableColumnsMenuProps<TColumn> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => React.ReactElement;

export default TableColumnsMenu;
