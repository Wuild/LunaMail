import {Button} from '@renderer/components/ui/button';
import React from "react";

export default function ToolboxButton({
                                          label,
                                          icon,
                                          onClick,
                                          primary = false,
                                          danger = false,
                                      }: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    primary?: boolean;
    danger?: boolean;
}) {
    const className = primary
        ? "mail-toolbox-primary"
        : danger
            ? "mail-toolbox-danger"
            : "mail-toolbox-default";

    return (
        <Button
            type="button"
            onClick={onClick}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${className}`}
        >
            {icon}
            <span>{label}</span>
        </Button>
    );
}
