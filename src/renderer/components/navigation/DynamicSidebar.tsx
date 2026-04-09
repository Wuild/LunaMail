import {Button} from '../ui/button';
import React from 'react';
import {NavLink} from 'react-router-dom';
import {cn} from '../../lib/utils';

export type DynamicSidebarItem = {
    id: string;
    label: string;
    description?: string | null;
    disabled?: boolean;
    to?: string;
    icon?: React.ReactNode;
    avatar?: React.ReactNode;
};

export type DynamicSidebarSection = {
    id: string;
    title?: string;
    items: DynamicSidebarItem[];
    emptyLabel?: string;
};

type DynamicSidebarProps = {
    sections: DynamicSidebarSection[];
    selectedItemId: string;
    onSelectItem?: (itemId: string) => void;
    className?: string;
};

export default function DynamicSidebar({sections, selectedItemId, onSelectItem, className}: DynamicSidebarProps) {
    return (
        <aside
            className={cn(
                'lm-sidebar h-full min-h-0 w-full shrink-0 p-3',
                className,
            )}
        >
            <div className="h-full overflow-y-auto space-y-2">
                {sections.map((section) => (
                    <div
                        key={section.id}
                        className={cn(section.title && 'border-t lm-border-default pt-2')}
                    >
                        {section.title && (
                            <p className="lm-text-muted px-2 pb-1 text-xs font-semibold uppercase tracking-wide">
                                {section.title}
                            </p>
                        )}
                        <div className="space-y-1">
                            {section.items.map((item) => {
                                const active = item.id === selectedItemId;
                                const itemClassName = cn(
                                    'block w-full rounded-md px-3 py-2 text-left text-sm no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                    active
                                        ? 'lm-interactive-active lm-text-primary'
                                        : 'lm-menu-item',
                                );

                                if (item.to && !item.disabled) {
                                    return (
                                        <NavLink
                                            key={item.id}
                                            to={item.to}
                                            className={itemClassName}
                                            draggable={false}
                                            onDragStart={(event) => event.preventDefault()}
                                            onClick={() => onSelectItem?.(item.id)}
                                        >
                                            <span className="flex min-w-0 items-center gap-2">
                                                {item.avatar ? (
                                                    <span className="shrink-0">{item.avatar}</span>
                                                ) : item.icon ? (
                                                    <span className="lm-text-muted shrink-0">{item.icon}</span>
                                                ) : null}
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate">{item.label}</span>
                                                    {item.description && (
                                                        <span
                                                            className="lm-text-muted block truncate text-[11px] font-normal">
															{item.description}
														</span>
                                                    )}
                                                </span>
                                            </span>
                                        </NavLink>
                                    );
                                }

                                return (
                                    <Button
                                        key={item.id}
                                        type="button"
                                        disabled={item.disabled}
                                        className={itemClassName}
                                        onClick={() => onSelectItem?.(item.id)}
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            {item.avatar ? (
                                                <span className="shrink-0">{item.avatar}</span>
                                            ) : item.icon ? (
                                                <span className="lm-text-muted shrink-0">{item.icon}</span>
                                            ) : null}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate">{item.label}</span>
                                                {item.description && (
                                                    <span
                                                        className="lm-text-muted block truncate text-[11px] font-normal">
														{item.description}
													</span>
                                                )}
                                            </span>
                                        </span>
                                    </Button>
                                );
                            })}
                            {section.items.length === 0 && section.emptyLabel && (
                                <p className="lm-text-muted px-2 py-2 text-sm">
                                    {section.emptyLabel}
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
