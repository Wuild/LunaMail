import * as React from 'react';
import {cn} from '@renderer/lib/utils';

type ModalAlign = 'center' | 'top';

export type ModalProps = {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    align?: ModalAlign;
    closeOnEscape?: boolean;
    closeOnBackdrop?: boolean;
    lockBodyScroll?: boolean;
    backdropClassName?: string;
    contentClassName?: string;
    ariaLabel?: string;
    ariaLabelledBy?: string;
    ariaDescribedBy?: string;
};

export function Modal({
                          open,
                          onClose,
                          children,
                          align = 'center',
                          closeOnEscape = true,
                          closeOnBackdrop = true,
                          lockBodyScroll = true,
                          backdropClassName,
                          contentClassName,
                          ariaLabel,
                          ariaLabelledBy,
                          ariaDescribedBy,
                      }: ModalProps) {
    React.useEffect(() => {
        if (!open || !closeOnEscape) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [closeOnEscape, onClose, open]);

    React.useEffect(() => {
        if (!open || !lockBodyScroll) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [lockBodyScroll, open]);

    if (!open) return null;

    return (
        <div
            className={cn(
                'panel-overlay-backdrop fixed inset-0 z-1100 flex p-4',
                align === 'top' ? 'items-start justify-center pt-20' : 'items-center justify-center',
                backdropClassName,
            )}
            onMouseDown={(event) => {
                if (!closeOnBackdrop) return;
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                aria-describedby={ariaDescribedBy}
                className={cn('modal-overlay w-full max-w-lg rounded-xl p-5 shadow-2xl', contentClassName)}
            >
                {children}
            </div>
        </div>
    );
}

export function ModalHeader({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('modal-header', className)} {...props} />;
}

export function ModalTitle({className, ...props}: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h3 className={cn('modal-title', className)} {...props} />;
}

export function ModalDescription({className, ...props}: React.HTMLAttributes<HTMLParagraphElement>) {
    return <p className={cn('modal-description', className)} {...props} />;
}

export function ModalBody({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('modal-body', className)} {...props} />;
}

export function ModalFooter({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('modal-footer', className)} {...props} />;
}
