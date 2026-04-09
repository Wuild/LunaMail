import {Button} from '../ui/button';
import React from 'react';
import {Link} from 'react-router-dom';
import {Settings} from 'lucide-react';
import NewEmailBadge from './NewEmailBadge';
import {cn} from '../../lib/utils';

type FolderItemRowProps = {
    to?: string;
    icon: React.ReactNode;
    iconColorClassName?: string;
    label: string;
    active?: boolean;
    dropActive?: boolean;
    customDragActive?: boolean;
    customDragging?: boolean;
    count?: number;
    onEditFolder?: () => void;
    onClick?: () => void;
    onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
};

export default function FolderItemRow({
                                          to,
                                          icon,
                                          iconColorClassName,
                                          label,
                                          active,
                                          dropActive,
                                          customDragActive,
                                          customDragging,
                                          count,
                                          onEditFolder,
                                          onClick,
                                          onContextMenu,
                                      }: FolderItemRowProps) {
    return (
        <div
            className={cn(
                "group relative ml-3 w-[calc(100%-0.75rem)] before:absolute before:left-[-0.75rem] before:top-1/2 before:h-px before:w-2 before:-translate-y-1/2 before:bg-slate-300/80 before:content-[''] dark:before:bg-[var(--lm-border-strong-dark)]",
            )}
        >
            <Link
                to={to || '#'}
                draggable={false}
                className={cn(
                    'relative flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left no-underline transition-all',
                    dropActive &&
                    'bg-slate-200 text-slate-900 ring-1 ring-slate-300 shadow-sm dark:bg-[var(--lm-surface-row-strong-dark)] dark:text-slate-100 dark:ring-[var(--lm-scrollbar-thumb-dark)]',
                    customDragging && 'opacity-45',
                    active
                        ? 'bg-slate-200/80 text-slate-900 ring-1 ring-slate-300/70 dark:bg-[var(--lm-surface-row-active-dark)] dark:text-slate-100 dark:ring-[var(--lm-border-active-dark)]'
                        : 'text-slate-700 dark:text-slate-200',
                    'hover:bg-slate-200/70 dark:hover:bg-[var(--lm-border-default-dark)]',
                )}
                onClick={onClick}
                onContextMenu={onContextMenu}
                style={{color: 'inherit'}}
            >
				<span className="flex min-w-0 items-center gap-2.5">
					<span
                        className={cn(
                            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                            active ? 'bg-white dark:bg-[var(--lm-surface-selected-dark)]' : 'bg-slate-100 dark:bg-[var(--lm-surface-chip-dark)]',
                            iconColorClassName ||
                            (active ? 'text-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'),
                        )}
                    >
						{icon}
					</span>
					<span className={cn('truncate pr-8 text-xs', active ? 'font-semibold' : 'font-medium')}>
						{label}
					</span>
				</span>
                <span className="flex items-center">
					{typeof count === 'number' && count > 0 && (
                        <NewEmailBadge
                            count={count}
                            className={cn(
                                'transition-opacity',
                                onEditFolder && 'group-hover:opacity-0',
                                active && 'border-red-400/90 from-red-500 to-red-700 dark:border-red-400/80',
                            )}
                        />
                    )}
				</span>
            </Link>
            {onEditFolder && (
                <Button
                    type="button"
                    className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-800 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-[var(--lm-surface-icon-hover-dark)] dark:hover:text-slate-100"
                    onClick={(event) => {
                        event.stopPropagation();
                        onEditFolder();
                    }}
                    title="Edit folder"
                    aria-label="Edit folder"
                >
                    <Settings size={13}/>
                </Button>
            )}
            {customDragActive && (
                <div
                    className="pointer-events-none absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-sky-500/90 dark:bg-sky-400/90"/>
            )}
        </div>
    );
}
