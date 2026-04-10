import React from 'react';
import {Archive, FileText, Inbox, Send, ShieldAlert, Trash2} from 'lucide-react';
import type {FolderItem} from '@/preload';

export function getFolderIcon(folder: FolderItem): React.ReactNode {
    const type = (folder.type ?? '').toLowerCase();
    const path = folder.path.toLowerCase();

    if (type === 'inbox' || path === 'inbox') return <Inbox size={15}/>;
    if (type === 'sent' || path.includes('sent')) return <Send size={15}/>;
    if (type === 'drafts' || path.includes('draft')) return <FileText size={15}/>;
    if (type === 'archive' || path.includes('archive')) return <Archive size={15}/>;
    if (type === 'trash' || path.includes('trash') || path.includes('deleted')) return <Trash2 size={15}/>;
    if (type === 'junk' || path.includes('spam') || path.includes('junk')) return <ShieldAlert size={15}/>;
    return <FilledFolderIcon/>;
}

const FilledFolderIcon: React.FC = () => (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className="shrink-0 fill-current">
        <path
            d="M3 6.5a2.5 2.5 0 0 1 2.5-2.5h4.1c.56 0 1.1.19 1.52.53l1.38 1.13c.18.15.4.23.64.23h5.35A2.5 2.5 0 0 1 21 8.4v8.1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6.5z"/>
    </svg>
);

export function getFolderColorClass(color: string | null | undefined): string | undefined {
    switch ((color || '').toLowerCase()) {
        case 'sky':
            return 'folder-color-sky';
        case 'emerald':
            return 'folder-color-emerald';
        case 'amber':
            return 'folder-color-amber';
        case 'rose':
            return 'folder-color-rose';
        case 'violet':
            return 'folder-color-violet';
        case 'slate':
            return 'folder-color-slate';
        default:
            return undefined;
    }
}

export function getFolderSwatchClass(color: string): string {
    switch ((color || '').toLowerCase()) {
        case 'sky':
            return 'swatch-sky';
        case 'emerald':
            return 'swatch-emerald';
        case 'amber':
            return 'swatch-amber';
        case 'rose':
            return 'swatch-rose';
        case 'violet':
            return 'swatch-violet';
        case 'slate':
            return 'swatch-slate';
        default:
            return 'swatch-none';
    }
}
