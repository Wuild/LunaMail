import {Button} from '../ui/button';
import React from 'react';
import {Link} from 'react-router-dom';
import {Settings} from 'lucide-react';
import NewEmailBadge from './NewEmailBadge';
import {cn} from '@renderer/lib/utils';

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
                "folder-item-branch group relative ml-3 w-[calc(100%-0.75rem)] before:absolute before:left-[-0.75rem] before:top-1/2 before:h-px before:w-2 before:-translate-y-1/2 before:content-['']",
            )}
        >
            <Link
                to={to || '#'}
                draggable={false}
                className={cn(
                    'folder-item-link relative flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left no-underline transition-all',
                    dropActive && 'is-drop-active shadow-sm',
                    customDragging && 'opacity-45',
                    active && 'is-active',
                )}
                onClick={onClick}
                onContextMenu={onContextMenu}
                style={{color: 'inherit'}}
            >
				<span className="flex min-w-0 items-center gap-2.5">
					<span
                        className={cn(
                            'folder-item-icon inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                            iconColorClassName,
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
                            )}
                        />
                    )}
				</span>
            </Link>
            {onEditFolder && (
                <Button
                    type="button"
                    className="folder-item-edit absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100"
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
                    className="folder-item-drop-indicator pointer-events-none absolute -top-0.5 left-2 right-2 h-0.5 rounded-full"/>
            )}
        </div>
    );
}
