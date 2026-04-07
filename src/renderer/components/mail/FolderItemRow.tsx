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
    draggableFolder?: boolean;
    onFolderDragStart?: (event: React.DragEvent<HTMLElement>) => void;
    onFolderDragEnd?: (event: React.DragEvent<HTMLElement>) => void;
    onFolderDragOver?: (event: React.DragEvent<HTMLElement>) => void;
    onFolderDrop?: (event: React.DragEvent<HTMLElement>) => void;
    onClick?: () => void;
    onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
    onDrop?: (event: React.DragEvent<HTMLElement>) => void;
    onDragOver?: (event: React.DragEvent<HTMLElement>) => void;
    onDragEnter?: (event: React.DragEvent<HTMLElement>) => void;
    onDragLeave?: (event: React.DragEvent<HTMLElement>) => void;
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
                                          draggableFolder,
                                          onFolderDragStart,
                                          onFolderDragEnd,
                                          onFolderDragOver,
                                          onFolderDrop,
                                          onClick,
                                          onContextMenu,
                                          onDrop,
                                          onDragOver,
                                          onDragEnter,
                                          onDragLeave,
                                      }: FolderItemRowProps) {
    return (
        <div
            className={cn(
                "group relative ml-3 w-[calc(100%-0.75rem)] before:absolute before:left-[-0.75rem] before:top-1/2 before:h-px before:w-2 before:-translate-y-1/2 before:bg-slate-300/80 before:content-[''] dark:before:bg-[#4a4d55]",
            )}
        >
            <Link
                to={to || '#'}
                className={cn(
                    'relative flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left no-underline transition-all',
                    dropActive &&
                    'bg-slate-200 text-slate-900 ring-1 ring-slate-300 shadow-sm dark:bg-[#404249] dark:text-slate-100 dark:ring-[#5b5e66]',
                    customDragging && 'opacity-45',
                    active
                        ? 'bg-slate-200/80 text-slate-900 ring-1 ring-slate-300/70 dark:bg-[#3d4048] dark:text-slate-100 dark:ring-[#575a62]'
                        : 'text-slate-700 dark:text-slate-200',
                    'hover:bg-slate-200/70 dark:hover:bg-[#3a3d44]',
                )}
                draggable={Boolean(draggableFolder)}
                onDragStart={onFolderDragStart}
                onDragEnd={onFolderDragEnd}
                onDragOver={(event) => {
                    onFolderDragOver?.(event);
                    onDragOver?.(event);
                }}
                onDrop={(event) => {
                    onFolderDrop?.(event);
                    onDrop?.(event);
                }}
                onClick={onClick}
                onContextMenu={onContextMenu}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                style={{color: 'inherit'}}
            >
				<span className="flex min-w-0 items-center gap-2.5">
					<span
                        className={cn(
                            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                            active ? 'bg-white dark:bg-[#2c2f36]' : 'bg-slate-100 dark:bg-[#32353b]',
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
                <button
                    type="button"
                    className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-800 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                    onClick={(event) => {
                        event.stopPropagation();
                        onEditFolder();
                    }}
                    title="Edit folder"
                    aria-label="Edit folder"
                >
                    <Settings size={13}/>
                </button>
            )}
            {customDragActive && (
                <div
                    className="pointer-events-none absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-sky-500/90 dark:bg-sky-400/90"/>
            )}
        </div>
    );
}
