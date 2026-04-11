import * as React from 'react';
import {cn} from '@renderer/lib/utils';

type ButtonVariant = 'unstyled' | 'default' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'none' | 'default' | 'sm' | 'lg' | 'icon';
type GroupPosition = 'none' | 'first' | 'middle' | 'last';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    groupPosition?: GroupPosition;
}

const variantStyles: Record<ButtonVariant, string> = {
    unstyled: '',
    default: 'button button-primary shadow-sm',
    secondary: 'button button-secondary shadow-sm',
    outline: 'button border ui-border-default ui-surface-card ui-text-primary shadow-sm ui-surface-hover',
    ghost: 'button button-ghost',
    danger: 'button button-danger shadow-sm',
    success: 'button button-success shadow-sm',
};

const sizeStyles: Record<ButtonSize, string> = {
    none: '',
    default: 'h-10 px-4 text-sm',
    sm: 'h-9 px-3 text-sm',
    lg: 'h-11 px-5 text-sm',
    icon: 'h-10 w-10 p-0',
};

const groupStyles: Record<GroupPosition, string> = {
    none: '',
    first: 'rounded-l-lg rounded-r-none',
    middle: 'rounded-none',
    last: 'rounded-l-none rounded-r-lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant = 'unstyled',
            size = 'none',
            leftIcon,
            rightIcon,
            groupPosition = 'none',
            children,
            ...props
        },
        ref
    ) => {
        const classNameText = typeof className === 'string' ? className : '';
        const hasExplicitJustifyClass = /\bjustify-(start|end|center|between|around|evenly)\b/.test(classNameText);
        const wantsLeftAlignedContent = /\btext-left\b/.test(classNameText) && !hasExplicitJustifyClass;
        return (
            <button
                ref={ref}
                className={cn(
                    'focus-ring inline-flex cursor-pointer items-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    wantsLeftAlignedContent ? 'justify-start' : 'justify-center',
                    (leftIcon || rightIcon) && 'gap-2',
                    variantStyles[variant],
                    sizeStyles[size],
                    groupStyles[groupPosition],
                    groupPosition !== 'none' && 'relative first:-ml-px',
                    className
                )}
                {...props}
            >
                {leftIcon ? <span className='shrink-0'>{leftIcon}</span> : null}
                {children}
                {rightIcon ? <span className='shrink-0'>{rightIcon}</span> : null}
            </button>
        );
    }
);

Button.displayName = 'Button';

export function ButtonGroup({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) {
    return <div className={cn('inline-flex items-stretch', className)}>{children}</div>;
}
