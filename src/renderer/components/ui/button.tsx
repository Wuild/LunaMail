import * as React from 'react';
import {cn} from '../../lib/utils';

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
    default:
        'border border-transparent bg-sky-600 text-white shadow-sm hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]',
    secondary:
        'border border-transparent bg-slate-200 text-slate-900 shadow-sm hover:bg-slate-300 dark:bg-[#3a3d44] dark:text-slate-100 dark:hover:bg-[#454952]',
    outline:
        'border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:hover:bg-[#2a2d31]',
    ghost: 'border border-transparent bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]',
    danger: 'border border-transparent bg-red-600 text-white shadow-sm hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700',
    success:
        'border border-transparent bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700',
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
                    'inline-flex items-center transition-colors focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-[#5865f2]/30',
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
