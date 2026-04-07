import React from 'react';
import {cn} from '../../lib/utils';

type TableColumnOption<TColumn extends string> = {
    key: TColumn;
    label: string;
};

type TableColumnsMenuProps<TColumn extends string> = {
    options: Array<TableColumnOption<TColumn>>;
    selectedColumns: TColumn[];
    position: { left: number; top: number };
    ready: boolean;
    onToggleColumn: (column: TColumn) => void;
    onResetColumns: () => void;
};

function TableColumnsMenuInner<TColumn extends string>(
    {options, selectedColumns, position, ready, onToggleColumn, onResetColumns}: TableColumnsMenuProps<TColumn>,
    ref: React.ForwardedRef<HTMLDivElement>,
) {
    return (
        <div
            ref={ref}
            className="fixed z-[1015] min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
            style={{
                left: position.left,
                top: position.top,
                visibility: ready ? 'visible' : 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
        >
            <div
                className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Table Columns
            </div>
            {options.map((column) => {
                const checked = selectedColumns.includes(column.key);
                return (
                    <button
                        key={column.key}
                        type="button"
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
                        onClick={() => onToggleColumn(column.key)}
                    >
                        <span>{column.label}</span>
                        <span
                            className={cn(
                                'inline-flex h-4 w-4 items-center justify-center text-xs',
                                checked ? 'text-emerald-600 dark:text-emerald-300' : 'text-transparent',
                            )}
                            aria-hidden={!checked}
                        >
							✓
						</span>
                    </button>
                );
            })}
            <div className="my-1 h-px bg-slate-200 dark:bg-[#3a3d44]"/>
            <button
                type="button"
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
                onClick={onResetColumns}
            >
                Reset Columns
            </button>
        </div>
    );
}

const TableColumnsMenu = React.forwardRef(TableColumnsMenuInner) as <TColumn extends string>(
    props: TableColumnsMenuProps<TColumn> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => React.ReactElement;

export default TableColumnsMenu;
