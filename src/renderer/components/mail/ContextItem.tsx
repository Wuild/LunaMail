import React from 'react';
import {cn} from '../../lib/utils';

type ContextItemProps = {
    label: string;
    onClick: () => void;
    danger?: boolean;
    icon?: React.ReactNode;
};

export default function ContextItem({label, onClick, danger, icon}: ContextItemProps) {
    return (
        <button
            className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
                danger
                    ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]',
            )}
            onClick={onClick}
        >
            {icon && <span className="shrink-0">{icon}</span>}
            {label}
        </button>
    );
}
