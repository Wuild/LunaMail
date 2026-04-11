import * as React from "react";
import {cn} from "@renderer/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
}

export function Badge({className, ...props}: BadgeProps) {
    return (
        <div
            className={cn(
                "chip-muted inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                className
            )}
            {...props}
        />
    );
}
