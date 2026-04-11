import * as React from 'react';
import {cn} from '@renderer/lib/utils';
import {Button, type ButtonProps} from './button';

type ContextMenuSize = 'sm' | 'md' | 'lg' | 'nav';
type ContextMenuLayer = '50' | '1000' | '1015' | '1100' | '1202';
type ContextMenuItemAlign = 'start' | 'between';

const sizeClassByValue: Record<ContextMenuSize, string> = {
    sm: 'context-menu-popover-sm',
    md: 'context-menu-popover-md',
    lg: 'context-menu-popover-lg',
    nav: 'context-menu-popover-nav',
};

const layerClassByValue: Record<ContextMenuLayer, string> = {
    '50': 'context-menu-layer-50',
    '1000': 'context-menu-layer-1000',
    '1015': 'context-menu-layer-1015',
    '1100': 'context-menu-layer-1100',
    '1202': 'context-menu-layer-1202',
};

export type ContextMenuProps = React.HTMLAttributes<HTMLDivElement> & {
    size?: ContextMenuSize;
    layer?: ContextMenuLayer;
    position?: { left: number; top: number };
    ready?: boolean;
};

export const ContextMenu = React.forwardRef<HTMLDivElement, ContextMenuProps>(
    ({size = 'lg', layer = '1000', position, ready, className, style, ...props}, ref) => {
        const mergedStyle: React.CSSProperties = {
            ...style,
            ...(position ? {left: position.left, top: position.top} : null),
            ...(ready === undefined ? null : {visibility: ready ? 'visible' : 'hidden'}),
        };

        return (
            <div
                ref={ref}
                className={cn(
                    'menu context-menu-popover',
                    sizeClassByValue[size],
                    layerClassByValue[layer],
                    className,
                )}
                style={mergedStyle}
                {...props}
            />
        );
    },
);

ContextMenu.displayName = 'ContextMenu';

export function ContextMenuLabel({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('context-menu-title', className)} {...props} />;
}

export function ContextMenuSeparator({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('divider-default my-1 h-px', className)} {...props} />;
}

export function ContextMenuAnchor({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('context-menu-anchor', className)} {...props} />;
}

export type ContextMenuSubmenuProps = React.HTMLAttributes<HTMLDivElement> & {
    size?: Exclude<ContextMenuSize, 'nav'>;
};

export function ContextMenuSubmenu({size = 'md', className, ...props}: ContextMenuSubmenuProps) {
    return (
        <div
            className={cn(
                'menu context-menu-submenu',
                sizeClassByValue[size],
                className,
            )}
            {...props}
        />
    );
}

export type ContextMenuItemProps = Omit<ButtonProps, 'variant'> & {
    danger?: boolean;
    align?: ContextMenuItemAlign;
};

export const ContextMenuItem = React.forwardRef<HTMLButtonElement, ContextMenuItemProps>(
    ({danger = false, align = 'start', className, children, ...props}, ref) => {
        const normalizedChildren = React.Children.map(children, (child) => {
            if (typeof child === 'string' || typeof child === 'number') {
                return <span className="context-menu-item-label">{child}</span>;
            }
            return child;
        });

        return (
            <Button
                ref={ref}
                variant="ghost"
                className={cn(
                    danger ? 'context-menu-item-danger' : 'menu-item',
                    'context-menu-item',
                    align === 'between' ? 'context-menu-item-between' : 'context-menu-item-start',
                    align === 'between' ? 'justify-between' : 'justify-start',
                    'text-left',
                    className,
                )}
                {...props}
            >
                {normalizedChildren}
            </Button>
        );
    },
);

ContextMenuItem.displayName = 'ContextMenuItem';
