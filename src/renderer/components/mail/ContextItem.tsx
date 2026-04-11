import React from 'react';
import {ContextMenuItem} from '../ui/ContextMenu';

type ContextItemProps = {
    label: string;
    onClick: () => void;
    danger?: boolean;
    icon?: React.ReactNode;
};

export default function ContextItem({label, onClick, danger, icon}: ContextItemProps) {
    return (
        <ContextMenuItem danger={danger} className="justify-start transition-colors" onClick={onClick}>
            {icon && <span className="shrink-0">{icon}</span>}
            {label}
        </ContextMenuItem>
    );
}
