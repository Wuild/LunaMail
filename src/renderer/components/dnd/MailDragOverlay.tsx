import React from 'react';
import {Mail} from 'lucide-react';
import {useDragLayer} from 'react-dnd';
import {DND_ITEM} from '../../lib/dndTypes';

type MailDragItem = {
    type: typeof DND_ITEM.MAIL_MESSAGE;
    subject?: string;
    from?: string;
    messageIds?: number[];
};

export default function MailDragOverlay() {
    const {isDragging, itemType, item, offset} = useDragLayer((monitor) => ({
        isDragging: monitor.isDragging(),
        itemType: monitor.getItemType(),
        item: monitor.getItem() as MailDragItem | null,
        offset: monitor.getClientOffset(),
    }));

    if (!isDragging || itemType !== DND_ITEM.MAIL_MESSAGE || !item || !offset) return null;

    const count = Array.isArray(item.messageIds) ? item.messageIds.length : 1;
    const subject = item.subject || (count > 1 ? `Moving ${count} emails` : 'Moving email');
    const from = item.from || null;

    return (
        <div className="pointer-events-none fixed inset-0 z-[2147483647]">
            <div
                className="max-w-[420px] rounded-lg border border-slate-300 bg-white px-3 py-2 opacity-85 shadow-xl dark:border-[var(--lm-border-strong-dark)] dark:bg-[var(--lm-surface-sidebar-dark)]"
                style={{
                    transform: `translate(${offset.x + 10}px, ${offset.y + 10}px)`,
                }}
            >
                <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-[var(--lm-surface-chip-dark)] dark:text-slate-200">
                        <Mail size={14}/>
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {subject}
                        </span>
                        {from && (
                            <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {from}
                            </span>
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
}
