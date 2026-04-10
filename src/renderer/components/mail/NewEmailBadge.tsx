import React from 'react';
import {cn} from '@renderer/lib/utils';

interface NewEmailBadgeProps {
    count: number;
    className?: string;
    title?: string;
    max?: number;
}

export default function NewEmailBadge({count, className, title, max = 99}: NewEmailBadgeProps) {
    const normalized = Math.max(0, Math.floor(Number(count) || 0));
    if (normalized <= 0) return null;

    const label = normalized > max ? `${max}+` : String(normalized);
    return (
        <span
            className={cn(
                'mail-badge-danger inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold leading-none shadow-sm',
                className,
            )}
            title={title}
            aria-label={`${normalized} unread`}
        >
			{label}
		</span>
    );
}
