import React from 'react';
import {cn} from '../../lib/utils';

export type DynamicSidebarItem = {
    id: string;
    label: string;
    description?: string | null;
    disabled?: boolean;
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
    onSelectItem: (itemId: string) => void;
    className?: string;
};

export default function DynamicSidebar({
                                           sections,
                                           selectedItemId,
                                           onSelectItem,
                                           className,
                                       }: DynamicSidebarProps) {
    return (
        <aside
            className={cn('h-full min-h-0 w-80 shrink-0 border-r border-slate-200 bg-white p-3 dark:border-[#3a3d44] dark:bg-[#2b2d31]', className)}>
            <div className="h-full overflow-y-auto space-y-2">
                {sections.map((section) => (
                    <div key={section.id}
                         className={cn(section.title && 'border-t border-slate-200 pt-2 dark:border-[#3a3d44]')}>
                        {section.title && (
                            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {section.title}
                            </p>
                        )}
                        <div className="space-y-1">
                            {section.items.map((item) => {
                                const active = item.id === selectedItemId;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        disabled={item.disabled}
                                        className={cn(
                                            'w-full rounded-md px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                            active
                                                ? 'bg-sky-100 text-sky-900 dark:bg-[#3d4153] dark:text-slate-100'
                                                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]',
                                        )}
                                        onClick={() => onSelectItem(item.id)}
                                    >
                                        {item.label}
                                        {item.description && (
                                            <span
                                                className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                                {item.description}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                            {section.items.length === 0 && section.emptyLabel && (
                                <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">{section.emptyLabel}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
