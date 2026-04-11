import React from 'react';
import {Mail} from 'lucide-react';
import {useDragLayer} from 'react-dnd';
import {DND_ITEM} from '@renderer/lib/dndTypes';

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
        <div className="mail-drag-overlay-layer">
            <div
                className="panel mail-drag-overlay-card"
                style={{
                    transform: `translate(${offset.x + 10}px, ${offset.y + 10}px)`,
                }}
            >
                <div className="flex items-center gap-2">
					<span className="chip-muted mail-drag-overlay-icon">
						<Mail size={14}/>
					</span>
                    <span className="min-w-0 flex-1">
						<span className="ui-text-primary block truncate text-sm font-semibold">{subject}</span>
                        {from && <span className="ui-text-muted block truncate text-[11px]">{from}</span>}
					</span>
                </div>
            </div>
        </div>
    );
}
